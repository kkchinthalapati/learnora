/* =========================================================================
   PDF TEXT EXTRACTION

   Why this exists.

   A PDF used to reach the AI as a base64 blob attached to the request, and
   exactly one provider in the chain — Gemini — can read an attachment inline.
   Every other provider got this instead:

     [The student attached a file named "chapter-4.pdf" … but this response is
      coming from a text-only fallback model that cannot read its contents.]

   So uploading a PDF worked only while Gemini answered. A rate limit, a
   quota, an outage, or an unset GEMINI_API_KEY and the same upload silently
   produced notes about nothing — the model was told a file existed and was
   asked to write study notes from it, with no way to see it. That is the
   "half the time the features are dogshit" case: not an error, a confidently
   empty answer.

   Extracting the text in the browser fixes it at the source. A parsed PDF is
   just text, so it takes the same path a .txt upload already took — folded
   into the prompt — and every provider in the chain can read it. It is also
   far smaller: a 6MB scanned-looking PDF is usually 30-60KB of actual text,
   which is the difference between a request that fits a free tier's limits
   and one that gets rejected for size.

   The binary attachment is still used, but only where it is genuinely the
   better tool: a scanned PDF with no text layer, where Gemini's OCR is the
   only thing that will read it. `planPdfUpload` decides which.
   ========================================================================= */

/** Pages beyond this are not read. A study upload is a chapter or a problem
 *  set; a 400-page textbook parsed in full would block the tab for seconds
 *  and produce a prompt no free-tier provider will accept. */
export const MAX_PDF_PAGES = 40;

/** Character ceiling on the extracted text. ~15k tokens: comfortably inside
 *  every provider's context in the chain, including the free tiers with the
 *  tightest per-request limits, which are the ones most likely to be
 *  answering. */
export const MAX_PDF_CHARS = 60_000;

/** Below this many characters per page, the page is assumed to be an image
 *  rather than text — a scan, a photographed worksheet, a slide deck exported
 *  as pictures. Chosen well under a real page of prose (~1500-3000 chars) but
 *  above the stray header or page number a scanned page often carries. */
const MIN_CHARS_PER_PAGE = 120;

export interface PdfExtraction {
  text: string;
  pageCount: number;
  /** Pages actually read — lower than `pageCount` past MAX_PDF_PAGES. */
  pagesRead: number;
  /** True when MAX_PDF_PAGES or MAX_PDF_CHARS cut the document short. The
   *  caller tells the student, rather than quietly summarising a fraction of
   *  their material as though it were the whole thing. */
  truncated: boolean;
}

/* pdf.js hands back positioned text runs, not lines: `items` is a flat list
   where a line break is marked by `hasEOL` rather than by a newline in
   `str`. Joining the strings directly gives
   "Photosynthesis convertslight energyintochemical energy" — words fused at
   every run boundary. This reassembles them.

   Exported so the joining rules are testable without a PDF: they are the part
   that decides whether the model sees readable prose or a wall of run-on
   text, and they have no business being verified only by eye. */
export interface PdfTextItem {
  str: string;
  hasEOL?: boolean;
}

export function joinPdfTextItems(items: PdfTextItem[]): string {
  let out = "";
  for (const item of items) {
    const str = typeof item?.str === "string" ? item.str : "";
    if (item?.hasEOL) {
      // A run that ends a line contributes its text and then the break.
      out += str + "\n";
      continue;
    }
    if (!str) continue;
    /* Separate runs with a space unless one side already has the separator,
       or the run begins with punctuation that should stay tight against the
       previous word ("energy" + "," → "energy,"). */
    const needsSpace =
      out !== "" &&
      !/\s$/.test(out) &&
      !/^\s/.test(str) &&
      !/^[,.;:!?)\]}%]/.test(str);
    out += (needsSpace ? " " : "") + str;
  }
  return out;
}

/** Collapses the runs of blank lines and trailing spaces that page-by-page
 *  extraction leaves behind, so the prompt carries text rather than layout. */
export function tidyPdfText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when a parse produced too little text to be the document's contents —
 *  a scanned or image-only PDF. Such a file is worth sending to Gemini as an
 *  attachment, because OCR is the only thing that will read it. */
export function looksScanned(extraction: PdfExtraction): boolean {
  if (extraction.pagesRead <= 0) return true;
  return extraction.text.length / extraction.pagesRead < MIN_CHARS_PER_PAGE;
}

export function isPdf(file: { name: string; type?: string }): boolean {
  return (
    file.type === "application/pdf" || /\.pdf$/i.test(file.name || "")
  );
}

/* pdf.js is ~400KB and only ever needed when someone actually picks a PDF, so
   it is imported on demand rather than bundled into the initial load. Both
   branches below are their own lazy chunk; a browser only ever fetches the
   first.

   The two builds are not interchangeable. The default build assumes a browser
   realm — in jsdom it dies on `Promise.try is not a function` before parsing
   anything — while the `legacy` build runs anywhere and parses on the calling
   thread. Which one is right is decided by whether Web Workers exist, which is
   also exactly the thing that decides whether the off-thread path is even
   available. */
async function loadPdfjs() {
  if (typeof Worker === "undefined") {
    /* No workers: a non-browser runtime (the test environment, SSR). The
       legacy build parses inline, which is slower but correct. */
    return await import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  const pdfjs = await import("pdfjs-dist");
  /* The worker is what keeps parsing off the main thread — without it a
     40-page document freezes the tab while it parses. Vite resolves the
     `?url` import to the emitted worker asset. */
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url"))
    .default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjs;
}

/** Parses a PDF's text layer in the browser. Rejects only when the file
 *  cannot be opened at all (encrypted, corrupt, not really a PDF); a PDF with
 *  no text layer resolves with empty text and is caught by `looksScanned`. */
export async function extractPdfText(file: File): Promise<PdfExtraction> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());

  /* Learnora never renders the PDF, only reads its text, so the parser is
     kept off the network: an uploaded file is untrusted input and has no
     business fetching fonts or CMaps. The missing standard-font data makes
     pdf.js warn; it does not affect the extracted text. */
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: false,
    useWorkerFetch: false,
  });
  const doc = await loadingTask.promise;

  const pageCount = doc.numPages;
  const pagesRead = Math.min(pageCount, MAX_PDF_PAGES);
  const pages: string[] = [];
  let chars = 0;
  let hitCharCap = false;

  for (let n = 1; n <= pagesRead; n += 1) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const pageText = joinPdfTextItems(content.items as PdfTextItem[]);
    pages.push(pageText);
    chars += pageText.length;
    /* Stop at the ceiling rather than parsing pages whose text will be
       thrown away — on a long document that is most of the work. */
    if (chars >= MAX_PDF_CHARS) {
      hitCharCap = true;
      break;
    }
  }
  /* Releases the worker; without it every upload leaks one. `destroy` is on
     the loading task, not the document proxy. */
  await loadingTask.destroy().catch(() => {});

  const tidied = tidyPdfText(pages.join("\n\n"));
  const text =
    tidied.length > MAX_PDF_CHARS ? tidied.slice(0, MAX_PDF_CHARS) : tidied;

  return {
    text,
    pageCount,
    pagesRead: pages.length,
    truncated: pageCount > pagesRead || hitCharCap || tidied.length > MAX_PDF_CHARS,
  };
}

/** What to do with a picked PDF.
 *
 *  `inline` — the text was extracted and should be folded into the prompt,
 *  which every provider in the chain can read.
 *
 *  `attach` — no usable text layer, or the parse failed. Send the binary as
 *  before, so Gemini can still OCR it, and carry `reason` so the caller can
 *  say why rather than leaving the student guessing. */
export type PdfPlan =
  | { kind: "inline"; text: string; extraction: PdfExtraction }
  | { kind: "attach"; reason: "scanned" | "unreadable" };

export async function planPdfUpload(file: File): Promise<PdfPlan> {
  let extraction: PdfExtraction;
  try {
    extraction = await extractPdfText(file);
  } catch (err) {
    console.warn("[pdfText] Could not parse the PDF; falling back to attaching it.", err);
    return { kind: "attach", reason: "unreadable" };
  }

  if (looksScanned(extraction)) {
    return { kind: "attach", reason: "scanned" };
  }
  return { kind: "inline", text: extraction.text, extraction };
}

/** The one-line note appended to the prompt when a document was cut short.
 *  Empty when it wasn't — the model should not be told about a limit that
 *  did not apply. */
export function truncationNote(extraction: PdfExtraction): string {
  if (!extraction.truncated) return "";
  return `\n\n[Only the first ${extraction.pagesRead} of ${extraction.pageCount} pages of this PDF were read. Say so if the material appears to stop mid-topic.]`;
}
