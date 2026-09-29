import { crc32, deflateSync } from "node:zlib";
import { test, expect, loginAs } from "./support/fixtures";

/* Create ▸ Upload — the path a student takes with their own notes, and the
 * one the audit never exercised. Covers the file reaching storage, the row
 * that points at it, what gets generated from it, and the size limit. */

const NOTES = [
  "Enzymes are biological catalysts. They speed up reactions by lowering",
  "activation energy. Each enzyme has an active site with a specific shape that",
  "fits its substrate. High temperatures or extreme pH change the shape of the",
  "active site, which denatures the enzyme so the substrate no longer fits.",
];

/** A minimal, valid one-page PDF with a real text layer — enough for
 *  pdf.js to extract, which is what a typed-up revision sheet looks like. */
function makePdf(lines: string[]): Buffer {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = [
    "BT /F1 12 Tf 50 750 Td 14 TL",
    ...lines.map((l) => `(${esc(l)}) '`),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

/** A real PNG, larger than the 2048px ceiling on both edges, so the browser
 *  has to decode and re-encode it — the part jsdom can only pretend to do. */
function makePng(width: number, height: number): Buffer {
  const row = Buffer.alloc(1 + width * 3);
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) {
    row[0] = 0;
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = x % 256;
      row[2 + x * 3] = y % 256;
      row[3 + x * 3] = (x + y) % 256;
    }
    row.copy(raw, y * row.length);
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(jpeg: Buffer): { width: number; height: number } {
  let i = 2;
  while (i < jpeg.length) {
    const marker = jpeg[i + 1];
    const length = jpeg.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: jpeg.readUInt16BE(i + 5), width: jpeg.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  throw new Error("no SOF marker found");
}

async function openUpload(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /create/i }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("tab", { name: /Upload/ })).toBeVisible();
  return dialog;
}

async function chooseBiology(dialog: import("@playwright/test").Locator) {
  const subject = dialog.getByLabel(/subject/i);
  if (await subject.isVisible()) await subject.selectOption({ label: "Biology" });
}

test.beforeEach(({ backend }) => {
  backend.seed("folders", [
    { id: "f-bio", user_id: backend.user.id, name: "Biology", color: "#4ade80" },
  ]);
});

test("uploads a text file and builds flashcards from it", async ({ page, backend }) => {
  await loginAs(page);
  const dialog = await openUpload(page);

  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: "enzymes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(NOTES.join("\n")),
  });
  await expect(dialog.getByText("enzymes.txt")).toBeVisible();
  await chooseBiology(dialog);
  await dialog.getByRole("button", { name: "Generate Study Resources" }).click();

  /* The file reached storage and a material row points at it. */
  await expect.poll(() => backend.storage.size).toBe(1);
  const [key, object] = [...backend.storage.entries()][0];
  expect(key).toMatch(/^materials\/.+\.txt$/);
  expect(object.bytes).toBeGreaterThan(100);
  await expect.poll(() => backend.table("materials").length).toBe(1);
  expect(backend.table("materials")[0]).toMatchObject({
    title: "enzymes.txt",
    folder_id: "f-bio",
  });

  /* Flashcards (the one default output) were generated and saved. */
  await expect.poll(() => backend.table("flashcard_decks").length).toBe(1);
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20_000 });
});

test("uploads a PDF and sends its words to the AI", async ({ page, backend }) => {
  await loginAs(page);
  const dialog = await openUpload(page);

  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: "enzymes.pdf",
    mimeType: "application/pdf",
    buffer: makePdf(NOTES),
  });
  await chooseBiology(dialog);
  await dialog.getByRole("button", { name: "Generate Study Resources" }).click();

  await expect.poll(() => backend.storage.size).toBe(1);
  await expect
    .poll(() => backend.callsTo("/functions/v1/learnora-ai").length)
    .toBeGreaterThan(0);
  /* The words on the page reached the AI request: extraction worked. */
  const sent = JSON.stringify(
    backend.callsTo("/functions/v1/learnora-ai").map((c) => c.body),
  );
  expect(sent).toContain("biological catalysts");
});

test("refuses a file over 10MB before uploading anything", async ({ page, backend }) => {
  await loginAs(page);
  const dialog = await openUpload(page);

  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: "huge.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(11 * 1024 * 1024, 1),
  });
  await dialog.getByRole("button", { name: "Generate Study Resources" }).click();

  await expect(dialog.getByRole("alert")).toContainText("The limit is 10MB");
  expect(backend.storage.size).toBe(0);
});

test("shrinks a photo in the browser and sends it to the image model for notes", async ({ page, backend }) => {
  await loginAs(page);
  const dialog = await openUpload(page);

  await dialog.getByLabel("Take a photo").setInputFiles({
    name: "whiteboard.png",
    mimeType: "image/png",
    buffer: makePng(3200, 2400),
  });
  await expect(dialog.getByText("Resized so it uploads faster.")).toBeVisible();
  await expect(dialog.getByText("whiteboard.jpg")).toBeVisible();
  await chooseBiology(dialog);
  await dialog.getByRole("button", { name: "Generate Study Resources" }).click();

  /* The shrunk JPEG, not the original PNG, is what reached storage. */
  await expect.poll(() => backend.storage.size).toBe(1);
  const [key] = [...backend.storage.keys()];
  expect(key).toMatch(/^materials\/.+\.jpg$/);

  /* And the notes request carried it as an image the model can read, at the
     2048px ceiling with the aspect ratio kept. */
  await expect
    .poll(() => backend.callsTo("/functions/v1/learnora-ai").length)
    .toBeGreaterThan(0);
  const notesCall = backend
    .callsTo("/functions/v1/learnora-ai")
    .map((c) => c.body as { mode?: string; file?: { mimeType: string; data: string } })
    .find((b) => b.mode === "notes");
  expect(notesCall?.file?.mimeType).toBe("image/jpeg");
  expect(jpegSize(Buffer.from(notesCall!.file!.data, "base64"))).toEqual({
    width: 2048,
    height: 1536,
  });
  await expect.poll(() => backend.table("flashcard_decks").length).toBe(1);
});
