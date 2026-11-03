/* =========================================================================
   OFFICE DOCUMENT TEXT EXTRACTION (.docx, .pptx)

   Why this exists.

   A Word document used to reach the AI the way a PDF once did: as a base64
   blob attached to the request. No provider in the chain reads that blob —
   Gemini's inline data takes PDFs, images, audio and text, not
   `wordprocessingml` — so an uploaded .docx produced either a provider error
   or notes about nothing. Slides could not be uploaded at all, although a
   lecture deck is one of the most common things a student has.

   Both formats are ZIP archives of XML, so the text can be read in the
   browser with no dependency: `readZip` walks the archive's central
   directory and inflates the few parts needed with the platform's own
   DecompressionStream, and the XML is read with DOMParser. The result takes
   the same path a parsed PDF does (lib/pdfText.ts) — folded into the prompt
   as text, readable by every provider.

   What is kept: headings (as Markdown headings), list items, table rows,
   slide titles, slide order and speaker notes — the structure a student's
   notes should follow. What is not: images, charts and equations stored as
   pictures. A file with no readable text is refused with a reason rather
   than sent on, because a model asked to write notes from nothing writes
   notes from nothing.
   ========================================================================= */

/** Same ceiling as a parsed PDF (lib/pdfText.ts MAX_PDF_CHARS), for the same
 *  reason: comfortably inside the tightest free-tier request limit. */
export const MAX_OFFICE_CHARS = 60_000;

/** Below this much text the document is treated as having none worth
 *  sending — a cover page, a title slide, a file of pictures. */
const MIN_DOCUMENT_CHARS = 50;

/** A part whose declared size is beyond this is not inflated. Real document
 *  XML is well under it; a declared size this large is a malformed or
 *  hostile archive. */
const MAX_PART_BYTES = 25 * 1024 * 1024;

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export type OfficeKind = "docx" | "pptx";

export interface OfficeExtraction {
  kind: OfficeKind;
  text: string;
  /** True when MAX_OFFICE_CHARS cut the text short. */
  truncated: boolean;
  /** Slides in the deck; 0 for a Word document. */
  slideCount: number;
  /** Slides that carried any text, so the note can say how many were read. */
  slidesWithText: number;
}

export class OfficeReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficeReadError";
  }
}

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

export function officeKind(file: { name: string; type?: string }): OfficeKind | null {
  if (/\.docx$/i.test(file.name || "") || file.type === DOCX_TYPE) return "docx";
  if (/\.pptx$/i.test(file.name || "") || file.type === PPTX_TYPE) return "pptx";
  return null;
}

export function isOfficeDoc(file: { name: string; type?: string }): boolean {
  return officeKind(file) !== null;
}

/** The pre-2007 binary formats. They are not ZIP archives and nothing in
 *  the chain reads them, so they are turned away with a way forward. */
export function isLegacyOffice(file: { name: string; type?: string }): boolean {
  return (
    /\.(doc|ppt)$/i.test(file.name || "") ||
    file.type === "application/msword" ||
    file.type === "application/vnd.ms-powerpoint"
  );
}

export function legacyOfficeMessage(name: string): string {
  const slides = /\.ppt$/i.test(name);
  return `"${name}" is an older ${slides ? "PowerPoint" : "Word"} format Learnora can't read. Save it as ${slides ? ".pptx" : ".docx"} or PDF and upload that instead.`;
}

/* --- ZIP --------------------------------------------------------------- */

interface ZipEntry {
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

/** Reads the archive's central directory. Throws OfficeReadError when the
 *  bytes are not a ZIP the reader understands (including ZIP64, which a
 *  file under the upload limit never needs). */
export function readZipDirectory(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  // The end record is 22 bytes plus a comment of at most 65535.
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new OfficeReadError("That file isn't a valid Office document.");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (offset === 0xffffffff || count === 0xffff) {
    throw new OfficeReadError("That file is too large to read here.");
  }

  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
      throw new OfficeReadError("That file isn't a valid Office document.");
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      size: view.getUint32(offset + 24, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readZipPart(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  if (entry.size > MAX_PART_BYTES) {
    throw new OfficeReadError("That file is too large to read here.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.localOffset;
  if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) {
    throw new OfficeReadError("That file isn't a valid Office document.");
  }
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(raw);
  if (entry.method !== 8) {
    throw new OfficeReadError("That file uses a compression Learnora can't read.");
  }
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(raw as Uint8Array<ArrayBuffer>);
      controller.close();
    },
  }).pipeThrough(new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

/* --- XML helpers ------------------------------------------------------- */

function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new OfficeReadError("Part of that document is damaged and couldn't be read.");
  }
  return doc;
}

function childElements(el: Element, localName?: string): Element[] {
  return Array.from(el.children).filter((c) => !localName || c.localName === localName);
}

function firstDescendant(el: Element, ns: string, localName: string): Element | null {
  return el.getElementsByTagNameNS(ns, localName)[0] ?? null;
}

function attr(el: Element | null, ns: string, name: string): string {
  if (!el) return "";
  return el.getAttributeNS(ns, name) ?? el.getAttribute(name) ?? "";
}

/** Text of one paragraph (w:p or a:p) in document order: runs, tabs and
 *  line breaks. Deleted revisions (w:del) are skipped — they are not part
 *  of the document the student sees. */
function paragraphText(p: Element): string {
  let out = "";
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      switch (child.localName) {
        case "t":
          out += child.textContent ?? "";
          break;
        case "tab":
          out += "\t";
          break;
        case "br":
        case "cr":
          out += "\n";
          break;
        case "del":
        case "instrText":
          break;
        default:
          walk(child);
      }
    }
  };
  walk(p);
  return out.replace(/[ \t]+/g, (m) => (m.includes("\t") ? "\t" : " ")).trim();
}

/* --- .docx ------------------------------------------------------------- */

function headingLevel(p: Element): number {
  const pPr = childElements(p, "pPr")[0];
  const style = pPr ? childElements(pPr, "pStyle")[0] : undefined;
  const id = attr(style ?? null, W_NS, "val");
  if (/^title$/i.test(id)) return 1;
  const match = /heading\s*([1-6])/i.exec(id);
  return match ? Number(match[1]) : 0;
}

function isListItem(p: Element): boolean {
  const pPr = childElements(p, "pPr")[0];
  return Boolean(pPr && childElements(pPr, "numPr").length > 0);
}

/** Pure: the Markdown for a parsed `word/document.xml`. */
export function docxToMarkdown(doc: Document): string {
  const body = firstDescendant(doc.documentElement, W_NS, "body");
  if (!body) return "";
  const blocks: string[] = [];

  const visit = (container: Element) => {
    for (const el of childElements(container)) {
      if (el.localName === "p") {
        const text = paragraphText(el);
        if (!text) continue;
        const level = headingLevel(el);
        if (level) blocks.push(`${"#".repeat(Math.min(level + 1, 6))} ${text}`);
        else if (isListItem(el)) blocks.push(`- ${text}`);
        else blocks.push(text);
      } else if (el.localName === "tbl") {
        for (const row of childElements(el, "tr")) {
          const cells = childElements(row, "tc").map((cell) =>
            childElements(cell, "p").map(paragraphText).filter(Boolean).join(" "),
          );
          if (cells.some(Boolean)) blocks.push(`| ${cells.join(" | ")} |`);
        }
      } else if (el.localName === "sdt") {
        // Content controls wrap ordinary paragraphs in templates and forms.
        const content = childElements(el, "sdtContent")[0];
        if (content) visit(content);
      }
    }
  };
  visit(body);

  // Consecutive list items and table rows stay together; everything else is
  // its own Markdown paragraph.
  return blocks
    .map((block, i) => {
      if (i === 0) return block;
      const prev = blocks[i - 1];
      const tight =
        (block.startsWith("- ") && prev.startsWith("- ")) ||
        (block.startsWith("| ") && prev.startsWith("| "));
      return (tight ? "\n" : "\n\n") + block;
    })
    .join("");
}

/* --- .pptx ------------------------------------------------------------- */

function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = baseDir.split("/").filter(Boolean);
  for (const segment of target.split("/")) {
    if (segment === "..") parts.pop();
    else if (segment !== ".") parts.push(segment);
  }
  return parts.join("/");
}

function relationships(doc: Document): Array<{ id: string; type: string; target: string }> {
  return Array.from(doc.getElementsByTagName("Relationship")).map((r) => ({
    id: r.getAttribute("Id") ?? "",
    type: r.getAttribute("Type") ?? "",
    target: r.getAttribute("Target") ?? "",
  }));
}

function placeholderType(shape: Element): string {
  const ph = shape.getElementsByTagNameNS(shape.namespaceURI ?? "", "ph")[0];
  return ph?.getAttribute("type") ?? "";
}

/** Pure: a slide's title and remaining lines from a parsed slide part. */
export function slideText(doc: Document): { title: string; lines: string[] } {
  let title = "";
  const lines: string[] = [];
  const shapes = Array.from(doc.getElementsByTagName("*")).filter(
    (el) => el.localName === "sp" || el.localName === "graphicFrame",
  );
  for (const shape of shapes) {
    const kind = placeholderType(shape);
    if (kind === "sldNum" || kind === "dt" || kind === "ftr") continue;
    const paragraphs = Array.from(shape.getElementsByTagNameNS(A_NS, "p"))
      .map(paragraphText)
      .filter(Boolean);
    if (!paragraphs.length) continue;
    if (!title && (kind === "title" || kind === "ctrTitle")) {
      title = paragraphs.join(" ");
      continue;
    }
    lines.push(...paragraphs);
  }
  return { title, lines };
}

/** Pure: speaker-notes text from a parsed notes-slide part. */
export function notesText(doc: Document): string {
  const shapes = Array.from(doc.getElementsByTagName("*")).filter((el) => el.localName === "sp");
  return shapes
    .filter((shape) => placeholderType(shape) === "body")
    .flatMap((shape) => Array.from(shape.getElementsByTagNameNS(A_NS, "p")).map(paragraphText))
    .filter(Boolean)
    .join(" ");
}

async function pptxToMarkdown(
  bytes: Uint8Array,
  entries: Map<string, ZipEntry>,
): Promise<{ markdown: string; slideCount: number; slidesWithText: number }> {
  const read = async (path: string) => {
    const entry = entries.get(path);
    return entry ? parseXml(await readZipPart(bytes, entry)) : null;
  };

  // Slide order is the presentation's list, not the part names: a deck that
  // has been reordered keeps slide7.xml in position 2.
  let slidePaths: string[] = [];
  const presentation = await read("ppt/presentation.xml");
  const presentationRels = await read("ppt/_rels/presentation.xml.rels");
  if (presentation && presentationRels) {
    const targets = new Map(relationships(presentationRels).map((r) => [r.id, r.target]));
    slidePaths = Array.from(presentation.getElementsByTagName("*"))
      .filter((el) => el.localName === "sldId")
      .map((el) => targets.get(attr(el, R_NS, "id")) ?? "")
      .filter(Boolean)
      .map((target) => resolvePart("ppt", target));
  }
  if (!slidePaths.length) {
    slidePaths = Array.from(entries.keys())
      .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
      .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  }

  const sections: string[] = [];
  let slidesWithText = 0;
  for (const [index, path] of slidePaths.entries()) {
    const slide = await read(path);
    if (!slide) continue;
    const { title, lines } = slideText(slide);

    const name = path.split("/").pop()!;
    const rels = await read(path.replace(name, `_rels/${name}.rels`));
    const notesTarget = rels
      ? relationships(rels).find((r) => r.type.endsWith("/notesSlide"))?.target
      : undefined;
    const notesDoc = notesTarget ? await read(resolvePart("ppt/slides", notesTarget)) : null;
    const notes = notesDoc ? notesText(notesDoc) : "";

    if (!title && !lines.length && !notes) continue;
    slidesWithText++;
    let section = `## Slide ${index + 1}${title ? `: ${title}` : ""}`;
    if (lines.length) section += `\n${lines.map((line) => `- ${line}`).join("\n")}`;
    if (notes) section += `\n\nSpeaker notes: ${notes}`;
    sections.push(section);
  }
  return { markdown: sections.join("\n\n"), slideCount: slidePaths.length, slidesWithText };
}

/* --- entry points ------------------------------------------------------ */

export async function extractOfficeText(file: File): Promise<OfficeExtraction> {
  const kind = officeKind(file);
  if (!kind) throw new OfficeReadError(`"${file.name}" isn't a Word or PowerPoint file.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readZipDirectory(bytes);

  let text: string;
  let slideCount = 0;
  let slidesWithText = 0;
  if (kind === "docx") {
    const entry = entries.get("word/document.xml");
    if (!entry) throw new OfficeReadError("That file isn't a valid Word document.");
    text = docxToMarkdown(parseXml(await readZipPart(bytes, entry)));
  } else {
    if (!entries.has("ppt/presentation.xml")) {
      throw new OfficeReadError("That file isn't a valid PowerPoint deck.");
    }
    ({ markdown: text, slideCount, slidesWithText } = await pptxToMarkdown(bytes, entries));
  }

  const truncated = text.length > MAX_OFFICE_CHARS;
  if (truncated) {
    // Cut at a paragraph boundary so the last block isn't half a sentence.
    const cut = text.lastIndexOf("\n\n", MAX_OFFICE_CHARS);
    text = text.slice(0, cut > MAX_OFFICE_CHARS / 2 ? cut : MAX_OFFICE_CHARS);
  }
  return { kind, text, truncated, slideCount, slidesWithText };
}

export type OfficePlan =
  | { kind: "inline"; text: string; extraction: OfficeExtraction }
  | { kind: "unreadable"; message: string };

/** Decides what an Office upload becomes. Unlike a scanned PDF there is no
 *  attachment fallback — no provider reads the binary — so a file without
 *  readable text is refused with what to do instead. */
export async function planOfficeUpload(file: File): Promise<OfficePlan> {
  let extraction: OfficeExtraction;
  try {
    extraction = await extractOfficeText(file);
  } catch (err) {
    console.warn("[officeText] Could not read the document.", err);
    return {
      kind: "unreadable",
      message:
        err instanceof OfficeReadError
          ? err.message
          : `Learnora couldn't open "${file.name}". Try exporting it as a PDF.`,
    };
  }
  if (extraction.text.replace(/\s+/g, "").length < MIN_DOCUMENT_CHARS) {
    return {
      kind: "unreadable",
      message:
        extraction.kind === "pptx"
          ? `"${file.name}" has almost no text on its slides — they may be pictures. Export the deck as a PDF so it can be read as images.`
          : `"${file.name}" has almost no text in it. If it's mostly pictures or scans, export it as a PDF so it can be read as images.`,
    };
  }
  return { kind: "inline", text: extraction.text, extraction };
}

/** Appended to the prompt so the model knows what it was and wasn't shown. */
export function officeExtractionNote(extraction: OfficeExtraction): string {
  const notes: string[] = [];
  if (extraction.truncated) {
    notes.push(
      `Only the first part of this ${extraction.kind === "pptx" ? "deck" : "document"} was read because it is long. Say so if the material appears to stop mid-topic.`,
    );
  }
  if (extraction.kind === "pptx" && extraction.slidesWithText < extraction.slideCount) {
    notes.push(
      `${extraction.slideCount - extraction.slidesWithText} of ${extraction.slideCount} slides had no text (likely pictures or diagrams) and were not read. Do not invent their content.`,
    );
  }
  return notes.length ? `\n\n[${notes.join(" ")}]` : "";
}
