import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  MAX_OFFICE_CHARS,
  extractOfficeText,
  isLegacyOffice,
  officeExtractionNote,
  officeKind,
  planOfficeUpload,
  readZipDirectory,
} from "./officeText";

/* Builds a real ZIP in memory — the same container Word and PowerPoint
   write — so the reader is exercised against the format, not a mock of it.
   Parts are deflated (method 8), as Office saves them, unless `stored`. */
function makeZip(parts: Record<string, string>, { stored = false } = {}): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(parts)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(content);
    const data = stored ? raw : new Uint8Array(deflateRawSync(raw));
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, stored ? 0 : 8, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, stored ? 0 : 8, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + cdSize + 22);
  let at = 0;
  for (const chunk of [...locals, ...centrals, eocd]) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const P =
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

const wp = (text: string, pPr = "") => `<w:p>${pPr}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const heading = (level: number, text: string) =>
  wp(text, `<w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr>`);
const bullet = (text: string) => wp(text, `<w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr>`);

function docx(body: string, name = "notes.docx"): File {
  const zip = makeZip({
    "[Content_Types].xml": "<Types/>",
    "word/document.xml": `<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`,
  });
  return new File([zip as Uint8Array<ArrayBuffer>], name);
}

const shape = (ph: string, ...paras: string[]) =>
  `<p:sp><p:nvSpPr><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ""}</p:nvPr></p:nvSpPr><p:txBody>${paras
    .map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`)
    .join("")}</p:txBody></p:sp>`;
const slide = (...shapes: string[]) =>
  `<?xml version="1.0"?><p:sld ${P}><p:cSld><p:spTree>${shapes.join("")}</p:spTree></p:cSld></p:sld>`;

function pptx(slides: string[], { order, notes }: { order?: number[]; notes?: Record<number, string> } = {}): File {
  const ids = order ?? slides.map((_, i) => i + 1);
  const parts: Record<string, string> = {
    "ppt/presentation.xml": `<?xml version="1.0"?><p:presentation ${P}><p:sldIdLst>${ids
      .map((n) => `<p:sldId id="${255 + n}" r:id="rId${n}"/>`)
      .join("")}</p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `<?xml version="1.0"?><Relationships>${slides
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="x/slide" Target="slides/slide${i + 1}.xml"/>`)
      .join("")}</Relationships>`,
  };
  slides.forEach((xml, i) => {
    parts[`ppt/slides/slide${i + 1}.xml`] = xml;
  });
  for (const [n, text] of Object.entries(notes ?? {})) {
    parts[`ppt/slides/_rels/slide${n}.xml.rels`] =
      `<?xml version="1.0"?><Relationships><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${n}.xml"/></Relationships>`;
    parts[`ppt/notesSlides/notesSlide${n}.xml`] =
      `<?xml version="1.0"?><p:notes ${P}><p:cSld><p:spTree>${shape("sldImg")}${shape("body", text)}${shape("sldNum", n)}</p:spTree></p:cSld></p:notes>`;
  }
  return new File([makeZip(parts) as Uint8Array<ArrayBuffer>], "lecture.pptx");
}

describe("officeKind", () => {
  it("recognises Word and PowerPoint by extension or type", () => {
    expect(officeKind({ name: "a.DOCX" })).toBe("docx");
    expect(officeKind({ name: "deck.pptx" })).toBe("pptx");
    expect(
      officeKind({
        name: "from-drive",
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    ).toBe("pptx");
    expect(officeKind({ name: "a.pdf" })).toBeNull();
  });

  it("flags the legacy binary formats separately", () => {
    expect(isLegacyOffice({ name: "old.doc" })).toBe(true);
    expect(isLegacyOffice({ name: "old.ppt" })).toBe(true);
    expect(isLegacyOffice({ name: "new.docx" })).toBe(false);
  });
});

describe("readZipDirectory", () => {
  it("lists stored and deflated parts", () => {
    expect([...readZipDirectory(makeZip({ a: "1", b: "2" }, { stored: true })).keys()]).toEqual(["a", "b"]);
  });

  it("rejects bytes that are not a ZIP", () => {
    expect(() => readZipDirectory(new TextEncoder().encode("not a zip at all, just some text"))).toThrow(
      /valid Office document/,
    );
  });
});

describe("extractOfficeText — docx", () => {
  it("keeps headings, lists, tables and paragraph order", async () => {
    const file = docx(
      heading(1, "Photosynthesis") +
        wp("Plants make glucose from light.") +
        bullet("Needs carbon dioxide") +
        bullet("Needs water") +
        `<w:tbl><w:tr><w:tc>${wp("Stage")}</w:tc><w:tc>${wp("Where")}</w:tc></w:tr><w:tr><w:tc>${wp(
          "Light-dependent",
        )}</w:tc><w:tc>${wp("Thylakoid")}</w:tc></w:tr></w:tbl>` +
        heading(2, "Limiting factors"),
    );
    const result = await extractOfficeText(file);
    expect(result.text).toBe(
      [
        "## Photosynthesis",
        "Plants make glucose from light.",
        "- Needs carbon dioxide\n- Needs water",
        "| Stage | Where |\n| Light-dependent | Thylakoid |",
        "### Limiting factors",
      ].join("\n\n"),
    );
    expect(result.truncated).toBe(false);
  });

  it("treats Word's list styles as list items", async () => {
    // What Word itself saves for the bullet button: the style, no numPr.
    const styled = (text: string) => wp(text, `<w:pPr><w:pStyle w:val="ListBullet"/></w:pPr>`);
    const file = docx(styled("Carbon dioxide") + styled("Water"));
    expect((await extractOfficeText(file)).text).toBe("- Carbon dioxide\n- Water");
  });

  it("drops deleted tracked changes and joins split runs", async () => {
    const file = docx(
      `<w:p><w:r><w:t>Mito</w:t></w:r><w:r><w:t>chondria</w:t></w:r><w:del><w:r><w:t>WRONG</w:t></w:r></w:del></w:p>`,
    );
    expect((await extractOfficeText(file)).text).toBe("Mitochondria");
  });

  it("truncates a very long document at a paragraph boundary", async () => {
    const para = "x".repeat(990);
    const file = docx(Array.from({ length: 80 }, () => wp(para)).join(""));
    const result = await extractOfficeText(file);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(MAX_OFFICE_CHARS);
    expect(result.text.endsWith("x")).toBe(true);
    expect(officeExtractionNote(result)).toMatch(/first part of this document/);
  });
});

describe("extractOfficeText — pptx", () => {
  it("reads slides in presentation order with titles and speaker notes", async () => {
    const file = pptx(
      [
        slide(shape("title", "Cell division"), shape("body", "Mitosis makes two identical cells")),
        slide(shape("ctrTitle", "Meiosis"), shape("", "Four cells, half the chromosomes"), shape("sldNum", "2")),
      ],
      { order: [2, 1], notes: { 2: "Stress that meiosis makes gametes." } },
    );
    const result = await extractOfficeText(file);
    expect(result.text).toBe(
      [
        "## Slide 1: Meiosis\n- Four cells, half the chromosomes\n\nSpeaker notes: Stress that meiosis makes gametes.",
        "## Slide 2: Cell division\n- Mitosis makes two identical cells",
      ].join("\n\n"),
    );
    expect(result.slideCount).toBe(2);
    expect(result.slidesWithText).toBe(2);
    expect(officeExtractionNote(result)).toBe("");
  });

  it("says how many slides had no text", async () => {
    const file = pptx([
      slide(shape("title", "Enzymes"), shape("body", "Lock and key: the active site fits one substrate")),
      slide(),
    ]);
    const result = await extractOfficeText(file);
    expect(officeExtractionNote(result)).toMatch(/1 of 2 slides had no text/);
  });
});

describe("planOfficeUpload", () => {
  it("inlines a readable document", async () => {
    const plan = await planOfficeUpload(docx(wp("Osmosis is the diffusion of water across a partially permeable membrane.")));
    expect(plan.kind).toBe("inline");
  });

  it("refuses a deck of pictures with a way forward", async () => {
    const plan = await planOfficeUpload(pptx([slide(shape("title", "Intro")), slide()]));
    expect(plan).toEqual({ kind: "unreadable", message: expect.stringMatching(/Export the deck as a PDF/) });
  });

  it("refuses a damaged file instead of sending it on", async () => {
    const plan = await planOfficeUpload(new File(["garbage"], "broken.docx"));
    expect(plan).toEqual({ kind: "unreadable", message: expect.stringMatching(/valid Office document/) });
  });
});
