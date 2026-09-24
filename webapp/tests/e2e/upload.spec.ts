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
