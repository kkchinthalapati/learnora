import { describe, expect, it } from "vitest";
import {
  MAX_PDF_CHARS,
  MAX_PDF_PAGES,
  extractPdfText,
  isPdf,
  joinPdfTextItems,
  looksScanned,
  tidyPdfText,
  truncationNote,
  type PdfExtraction,
} from "./pdfText";

/* Builds a real, minimal PDF in memory so the parser is exercised against the
   format rather than against a mock of it. Content streams are left
   uncompressed, which the spec allows, so the fixture stays readable — the
   thing under test is the text layer, not the filter. */
function makePdf(pages: string[][]): File {
  const encoder = new TextEncoder();
  const objects: string[] = [];

  const pageObjNumbers = pages.map((_, i) => 3 + i * 2);
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push(
    `<< /Type /Pages /Kids [${pageObjNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );

  for (const [i, lines] of pages.entries()) {
    const pageNum = pageObjNumbers[i];
    const contentNum = pageNum + 1;
    const fontNum = 3 + pages.length * 2;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${contentNum} 0 R >>`,
    );
    // Each line is its own Tj, moved down the page with Td — the shape real
    // generators emit, and what makes pdf.js report `hasEOL`.
    const ops = lines
      .map((line, n) => {
        const escaped = line.replace(/([()\\])/g, "\\$1");
        return `${n === 0 ? "72 700 Td" : "0 -20 Td"} (${escaped}) Tj`;
      })
      .join(" ");
    const stream = `BT /F1 14 Tf ${ops} ET`;
    objects.push(
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [i, obj] of objects.entries()) {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    out += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return new File([encoder.encode(out)], "fixture.pdf", {
    type: "application/pdf",
  });
}

function extraction(over: Partial<PdfExtraction> = {}): PdfExtraction {
  return {
    text: "x".repeat(2000),
    pageCount: 1,
    pagesRead: 1,
    truncated: false,
    ...over,
  };
}

describe("isPdf", () => {
  it("recognises a PDF by mime type or by extension", () => {
    expect(isPdf({ name: "notes.pdf", type: "application/pdf" })).toBe(true);
    // Browsers leave `type` empty for some files; the name still says what it is.
    expect(isPdf({ name: "notes.pdf", type: "" })).toBe(true);
    expect(isPdf({ name: "NOTES.PDF" })).toBe(true);
  });

  it("does not claim other uploads", () => {
    expect(isPdf({ name: "notes.txt", type: "text/plain" })).toBe(false);
    expect(isPdf({ name: "diagram.png", type: "image/png" })).toBe(false);
    // A name that merely mentions pdf is not one.
    expect(isPdf({ name: "pdf-notes.docx", type: "" })).toBe(false);
  });
});

describe("joinPdfTextItems", () => {
  it("puts a space between runs rather than fusing the words", () => {
    // This is the actual failure mode of joining `str` directly: pdf.js splits
    // a line into positioned runs, so "light energy" arrives as two items.
    expect(
      joinPdfTextItems([{ str: "Photosynthesis converts" }, { str: "light energy" }]),
    ).toBe("Photosynthesis converts light energy");
  });

  it("breaks the line where pdf.js marks one, not where the runs happen to end", () => {
    expect(
      joinPdfTextItems([
        { str: "First line", hasEOL: true },
        { str: "Second line", hasEOL: true },
      ]),
    ).toBe("First line\nSecond line\n");
  });

  it("keeps punctuation tight against the word before it", () => {
    expect(joinPdfTextItems([{ str: "energy" }, { str: ", which" }])).toBe(
      "energy, which",
    );
    expect(joinPdfTextItems([{ str: "glucose" }, { str: "." }])).toBe("glucose.");
  });

  it("does not double a separator that is already there", () => {
    expect(joinPdfTextItems([{ str: "one " }, { str: "two" }])).toBe("one two");
    expect(joinPdfTextItems([{ str: "one" }, { str: " two" }])).toBe("one two");
  });

  it("survives the empty and malformed items pdf.js emits for spacing runs", () => {
    expect(
      joinPdfTextItems([
        { str: "" },
        { str: "real" },
        { str: undefined as unknown as string },
        { str: "text" },
      ]),
    ).toBe("real text");
    expect(joinPdfTextItems([])).toBe("");
  });
});

describe("tidyPdfText", () => {
  it("collapses the layout whitespace that page extraction leaves behind", () => {
    expect(tidyPdfText("A   line   \n\n\n\n  Another")).toBe("A line\n\n Another");
  });

  it("normalises CRLF so the prompt does not carry stray carriage returns", () => {
    expect(tidyPdfText("one\r\ntwo")).toBe("one\ntwo");
  });
});

describe("looksScanned", () => {
  it("is false for a document with a real text layer", () => {
    expect(looksScanned(extraction())).toBe(false);
  });

  it("is true when pages yield almost nothing — an image-only scan", () => {
    // A scanned page usually still carries a page number or a header.
    expect(looksScanned(extraction({ text: "12", pagesRead: 1 }))).toBe(true);
    expect(looksScanned(extraction({ text: "", pagesRead: 3 }))).toBe(true);
  });

  it("is true when nothing was read at all, rather than dividing by zero", () => {
    expect(looksScanned(extraction({ text: "", pagesRead: 0 }))).toBe(true);
  });

  it("judges by text per page, so a long scan is not mistaken for a document", () => {
    // 300 chars over 40 pages is boilerplate, not content.
    expect(looksScanned(extraction({ text: "x".repeat(300), pagesRead: 40 }))).toBe(
      true,
    );
  });
});

describe("truncationNote", () => {
  it("says nothing when the whole document was read", () => {
    expect(truncationNote(extraction())).toBe("");
  });

  it("tells the model how much it is missing, rather than letting it assume it has everything", () => {
    const note = truncationNote(
      extraction({ truncated: true, pageCount: 120, pagesRead: 40 }),
    );
    expect(note).toContain("40");
    expect(note).toContain("120");
  });
});

describe("extractPdfText", () => {
  it("reads the text layer out of a real PDF", async () => {
    const file = makePdf([
      [
        "Photosynthesis converts light energy into chemical energy.",
        "The Calvin cycle fixes carbon dioxide into glucose.",
      ],
    ]);

    const result = await extractPdfText(file);

    expect(result.pageCount).toBe(1);
    expect(result.pagesRead).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.text).toContain("Photosynthesis converts light energy");
    expect(result.text).toContain("Calvin cycle fixes carbon dioxide");
  });

  it("reads every page, so a multi-page upload is not summarised from page one", async () => {
    const file = makePdf([
      ["Chapter one covers cell structure."],
      ["Chapter two covers respiration."],
      ["Chapter three covers genetics."],
    ]);

    const result = await extractPdfText(file);

    expect(result.pageCount).toBe(3);
    expect(result.pagesRead).toBe(3);
    expect(result.text).toContain("cell structure");
    expect(result.text).toContain("respiration");
    expect(result.text).toContain("genetics");
  });

  it("produces text a model can read, not runs fused together", async () => {
    const file = makePdf([["Mitosis produces two identical daughter cells."]]);

    const { text } = await extractPdfText(file);

    // The bug this guards: "Mitosisproducestwo identical…".
    expect(text).toMatch(/Mitosis produces two identical daughter cells/);
  });

  it("stays inside the character ceiling so the prompt fits a free tier", async () => {
    const line = "Cellular respiration releases energy stored in glucose. ".repeat(4);
    // At MAX_PDF_PAGES exactly, so the page cap cannot fire and the character
    // cap is the only thing that can cut this short.
    const pages = Array.from({ length: MAX_PDF_PAGES }, () => Array(20).fill(line));

    const result = await extractPdfText(makePdf(pages));

    expect(result.pageCount).toBe(MAX_PDF_PAGES);
    expect(result.text.length).toBeLessThanOrEqual(MAX_PDF_CHARS);
    expect(result.truncated).toBe(true);
    // Truncated, but still a usable document rather than a fragment.
    expect(result.text.length).toBeGreaterThan(MAX_PDF_CHARS / 2);
  });

  it("stops at the page ceiling rather than parsing a whole textbook", async () => {
    const pages = Array.from({ length: MAX_PDF_PAGES + 5 }, (_, i) => [
      `Page ${i + 1} discusses a topic worth remembering.`,
    ]);

    const result = await extractPdfText(makePdf(pages));

    expect(result.pageCount).toBe(MAX_PDF_PAGES + 5);
    expect(result.pagesRead).toBe(MAX_PDF_PAGES);
    expect(result.truncated).toBe(true);
    expect(result.text).toContain("Page 1 discusses");
    expect(result.text).not.toContain(`Page ${MAX_PDF_PAGES + 5} discusses`);
  });

  it("rejects a file that is not a PDF at all, so the caller can fall back", async () => {
    const notAPdf = new File([new TextEncoder().encode("just some text")], "x.pdf", {
      type: "application/pdf",
    });

    await expect(extractPdfText(notAPdf)).rejects.toThrow();
  });
});
