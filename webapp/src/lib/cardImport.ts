/* Reading other apps' flashcard exports.
 *
 * A student who already has two years of cards in Quizlet or Anki is not going
 * to retype them, and should not have to spend an AI allowance regenerating
 * worse ones. Both apps can hand over plain text, so that is what this reads:
 *
 *  - Quizlet's Export dialog: term, separator, definition, row separator. The
 *    separators are the student's choice, and nothing is quoted.
 *  - Anki's "Notes in Plain Text (.txt)": `#key:value` header lines, then
 *    delimited rows with CSV-style quoting, usually carrying HTML.
 *  - Any two-column CSV/TSV, which is the Anki reader without the Anki parts.
 *
 * Everything here is pure string work — no DOM, no React, no network — so the
 * whole import can be previewed before a single row is written, and so
 * imported HTML is only ever *read* as text, never handed to a parser that
 * could run it. */

export type ImportSource = "quizlet" | "anki" | "csv";

/** One import is capped so a mis-pasted file can't write an unbounded number
 *  of rows. Well past any real deck; the modal says so when it bites. */
export const MAX_IMPORT_CARDS = 5000;

/** A side longer than this is almost always a parse that went wrong (the wrong
 *  separator swallowing a whole file into one "definition"), not a card. */
export const MAX_CARD_SIDE_CHARS = 10_000;

/** Largest text this will read. A few thousand cards is well under 1 MB. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Same blank the app's own cloze cards use (api/aiInlineActions.ts). */
export const IMPORT_CLOZE_BLANK = "_____";

export interface ImportedCard {
  front: string;
  back: string;
}

export interface CardImportOptions {
  /** Omit (or "auto") to work it out from the text. */
  source?: ImportSource | "auto";
  /** The literal string between front and back. Omit (or "auto") to detect.
   *  An Anki `#separator:` header always wins: the file knows best. */
  fieldSeparator?: string;
  /** Quizlet only: the literal string between cards. Omit (or "auto") to
   *  detect. Anki and CSV rows always end at a line break. */
  rowSeparator?: string;
  /** Used only to tip detection: a `.csv` name means comma-separated. */
  fileName?: string;
}

export interface CardImportResult {
  source: ImportSource;
  fieldSeparator: string;
  rowSeparator: string;
  cards: ImportedCard[];
  /** Rows read, before anything was left out (cloze notes count once). */
  totalRows: number;
  /** Rows left out because the front or the back was empty. */
  skippedBlank: number;
  /** Of `skippedBlank`: rows that were only an image or a sound. */
  skippedMediaOnly: number;
  /** Rows left out because a side was over MAX_CARD_SIDE_CHARS. */
  skippedTooLong: number;
  /** Cards left out because an identical one came earlier in the import. */
  duplicates: number;
  /** Imported cards that lost an image or a sound on the way in. */
  mediaStripped: number;
  /** Anki cloze notes that were turned into fill-the-blank cards. */
  clozeNotes: number;
  /** From Anki's deck column, when the file has one. */
  deckName: string | null;
}

/** Anki's packaged formats: zipped SQLite, not text. */
export function isAnkiPackageName(fileName: string): boolean {
  return /\.(apkg|colpkg)$/i.test(fileName.trim());
}

/** A zip read as text starts "PK\u0003\u0004" — catches a renamed package. */
export function looksLikeZip(text: string): boolean {
  return text.startsWith("PK\u0003\u0004");
}

/** "Biology – cells.txt" -> "Biology – cells". */
export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/^.*[\\/]/, "")
    .replace(/\.[a-z0-9]{1,6}$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
}

/* --- Normalising --------------------------------------------------------- */

/* A BOM would otherwise become the first character of the first card (and
   stop `#separator:` being seen as a header). Line endings are folded to \n
   everywhere, including inside quoted fields, so a card written on Windows
   doesn't carry stray \r into the review screen. */
function normalise(text: string): string {
  return text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
}

/* --- Delimited text with quoting (Anki, CSV) ------------------------------ */

/* RFC 4180-style: a field that *starts* with a double quote runs to the next
   lone double quote, and may contain the separator, line breaks, and quotes
   written twice. A quote anywhere else in a field is just a character — Anki
   and spreadsheets only quote whole fields, and a card like `5" disk` must
   survive. */
export function parseDelimited(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  const sepLen = separator.length;
  let row: string[] = [];
  let i = 0;
  const n = text.length;

  while (i <= n) {
    let field = "";
    if (text[i] === '"') {
      i += 1;
      for (;;) {
        const close = text.indexOf('"', i);
        if (close === -1) {
          // Unterminated: take the rest rather than drop the card.
          field += text.slice(i);
          i = n;
          break;
        }
        field += text.slice(i, close);
        if (text[close + 1] === '"') {
          field += '"';
          i = close + 2;
          continue;
        }
        i = close + 1;
        break;
      }
    }
    // The unquoted part (all of it, for an unquoted field).
    const start = i;
    while (i < n && text[i] !== "\n" && !text.startsWith(separator, i)) i += 1;
    field += text.slice(start, i);
    row.push(field);

    if (i < n && text[i] !== "\n") {
      i += sepLen;
      continue;
    }
    rows.push(row);
    row = [];
    i += 1;
  }

  // Blank lines (including the one after a trailing newline) are not rows.
  return rows.filter((r) => r.length > 1 || r[0].trim() !== "");
}

const DELIMITED_CANDIDATES = ["\t", ";", ","];

/* Picks the separator that splits the most of the first lines into two or
   more columns. Tab first on a tie: it is what both apps write by default and
   the least likely to appear inside a card. */
function detectDelimiter(body: string, fileName?: string): string {
  const sample = body.split("\n", 60).filter((line) => line.trim() !== "");
  let best = /\.csv$/i.test(fileName ?? "") ? "," : "\t";
  let bestScore = 0;
  for (const candidate of DELIMITED_CANDIDATES) {
    const score = sample.filter((line) => line.includes(candidate)).length;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/* --- Anki headers -------------------------------------------------------- */

interface AnkiHeader {
  separator: string | null;
  html: boolean | null;
  /** 1-based columns that are not card text: tags, deck, notetype, guid. */
  metaColumns: Set<number>;
  deckColumn: number | null;
  body: string;
}

const ANKI_SEPARATOR_NAMES: Record<string, string> = {
  tab: "\t",
  comma: ",",
  semicolon: ";",
  space: " ",
  pipe: "|",
  colon: ":",
};

const ANKI_HEADER = /^#([a-z][a-z ]*):(.*)$/i;

/* Anki writes its settings as `#key:value` lines before the first note. Only
   the leading run is read as headers: a later line starting with # is a card
   ("#include <stdio.h>" is a perfectly good front). */
function readAnkiHeader(text: string): AnkiHeader {
  const header: AnkiHeader = {
    separator: null,
    html: null,
    metaColumns: new Set(),
    deckColumn: null,
    body: text,
  };
  let offset = 0;
  for (;;) {
    const end = text.indexOf("\n", offset);
    const line = text.slice(offset, end === -1 ? text.length : end);
    const match = ANKI_HEADER.exec(line);
    if (!match) break;
    const key = match[1].trim().toLowerCase();
    const value = match[2];
    const column = Number.parseInt(value.trim(), 10);
    if (key === "separator") {
      header.separator =
        ANKI_SEPARATOR_NAMES[value.trim().toLowerCase()] ?? (value || null);
    } else if (key === "html") {
      header.html = value.trim().toLowerCase() === "true";
    } else if (/ column$/.test(key) && Number.isFinite(column)) {
      header.metaColumns.add(column);
      if (key === "deck column") header.deckColumn = column;
    }
    if (end === -1) {
      offset = text.length;
      break;
    }
    offset = end + 1;
  }
  header.body = text.slice(offset);
  return header;
}

/* --- HTML to plain text --------------------------------------------------- */

/* Only real element names are stripped. Anything else in angle brackets is
   left alone, because in a maths or code deck `a<b` and `vector<int>` are the
   card, not markup. */
const HTML_TAGS =
  "a|abbr|address|article|aside|audio|b|bdi|bdo|big|blockquote|body|br|button|caption|center|cite|code|col|colgroup|dd|del|details|dfn|div|dl|dt|em|embed|figcaption|figure|font|footer|form|h[1-6]|head|header|hr|html|i|iframe|img|input|ins|kbd|label|li|link|main|mark|meta|nav|object|ol|p|picture|pre|q|rp|rt|ruby|s|samp|section|small|source|span|strike|strong|sub|summary|sup|table|tbody|td|tfoot|th|thead|tr|track|tt|u|ul|var|video|wbr";

const ANY_TAG = new RegExp(`</?(?:${HTML_TAGS})(?:\\s[^<>]*)?/?>`, "gi");
const HAS_TAG = new RegExp(`</?(?:${HTML_TAGS})(?:\\s[^<>]*)?/?>`, "i");
// Dropped with their contents: none of it is card text.
const DROPPED_BLOCKS =
  /<(script|style|head|iframe|object|audio|video)\b[^<>]*>[\s\S]*?<\/\1\s*>/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const IMG_TAG = /<img\b[^<>]*>/gi;
const MEDIA_BLOCK = /<(audio|video|object)\b[^<>]*>[\s\S]*?<\/\1\s*>/gi;
const SOUND_REF = /\[sound:[^\]\n]*\]/gi;
const LINE_BREAK = /<br\s*\/?>/gi;
const LIST_ITEM = /<li(?:\s[^<>]*)?>/gi;
// Opening and closing both break the line; a run of them is folded into one
// afterwards. Anki writes a second line as `a<div>b</div>`.
const BLOCK_EDGE =
  /<\/?(?:div|p|li|ul|ol|tr|table|h[1-6]|blockquote|pre|hr|dd|dt|dl|section|article)(?:\s[^<>]*)?\/?>/gi;
const CELL_EDGE = /<\/t[dh]\s*>/gi;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", bull: "•", middot: "·",
  deg: "°", times: "×", divide: "÷", plusmn: "±", minus: "−", micro: "µ",
  frac12: "½", frac14: "¼", frac34: "¾", sup2: "²", sup3: "³",
  larr: "←", rarr: "→", harr: "↔", rArr: "⇒", hArr: "⇔",
  le: "≤", ge: "≥", ne: "≠", asymp: "≈", equiv: "≡", infin: "∞",
  radic: "√", sum: "∑", prod: "∏", int: "∫", part: "∂", nabla: "∇",
  isin: "∈", notin: "∉", sub: "⊂", sup: "⊃", cap: "∩", cup: "∪",
  forall: "∀", exist: "∃", empty: "∅", prop: "∝", ang: "∠", perp: "⊥",
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ",
  nu: "ν", xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigma: "σ",
  tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥",
  cent: "¢", sect: "§", para: "¶", iexcl: "¡", iquest: "¿",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", aacute: "á",
  agrave: "à", acirc: "â", auml: "ä", aring: "å", atilde: "ã",
  iacute: "í", igrave: "ì", icirc: "î", iuml: "ï", oacute: "ó",
  ograve: "ò", ocirc: "ô", ouml: "ö", otilde: "õ", oslash: "ø",
  uacute: "ú", ugrave: "ù", ucirc: "û", uuml: "ü", ntilde: "ñ",
  ccedil: "ç", szlig: "ß", aelig: "æ", oelig: "œ",
  Eacute: "É", Aacute: "Á", Agrave: "À", Auml: "Ä", Aring: "Å",
  Ouml: "Ö", Oslash: "Ø", Uuml: "Ü", Ntilde: "Ñ", Ccedil: "Ç",
};

const ENTITY = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,10});/gi;

/* One pass, so `&amp;lt;` comes out as the text "&lt;" rather than being
   decoded twice into "<". An entity this doesn't know is left as written. */
export function decodeEntities(text: string): string {
  return text.replace(ENTITY, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      // U+00A0 as a plain space: a non-breaking one is invisible noise here.
      return code === 0xa0 ? " " : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/* Tags are removed before entities are decoded, so an escaped `&lt;b&gt;` in
   a card about HTML ends up as the visible text "<b>" — and that text is only
   ever rendered as text. Nothing here builds a DOM. */
export function htmlToPlainText(html: string): string {
  const text = html
    .replace(HTML_COMMENT, "")
    .replace(DROPPED_BLOCKS, "")
    .replace(LINE_BREAK, "\n")
    .replace(LIST_ITEM, "\uE000- ")
    .replace(CELL_EDGE, " ")
    /* Without these `x<sup>2</sup>` would import as "x2" and `H<sub>2</sub>O`
       as "H2O" — a different, wrong card. */
    .replace(/<sup(?:\s[^<>]*)?>/gi, "^")
    .replace(/<sub(?:\s[^<>]*)?>/gi, "_")
    .replace(BLOCK_EDGE, "\uE000")
    .replace(ANY_TAG, "")
    /* Block edges are marked with a private-use character, then a run of them
       becomes one line break: `<div>a</div><div>b</div>` is two lines, not
       two lines with a blank between, and Anki's `<div>a<br></div>` adds no
       blank either. A deliberate blank line (`<br><br>`) is kept. */
    .replace(/\s*\uE000[\s\uE000]*/g, (run) =>
      (run.match(/\n/g)?.length ?? 0) >= 2 ? "\n\n" : "\n",
    );
  return tidy(decodeEntities(text));
}

function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Takes out what can't come across: `[sound:…]`, `<img>`, embedded players. */
function stripMedia(text: string): { text: string; removed: boolean } {
  let removed = false;
  const mark = () => {
    removed = true;
    return "";
  };
  const out = text
    .replace(SOUND_REF, mark)
    .replace(IMG_TAG, mark)
    .replace(MEDIA_BLOCK, mark);
  return { text: out, removed };
}

/* --- Cloze --------------------------------------------------------------- */

interface ClozeSpan {
  start: number;
  end: number;
  index: number;
  content: string;
  hint: string | null;
}

const CLOZE_OPEN = /\{\{c(\d+)::/g;

/* Finds the top-level `{{cN::text::hint}}` spans. The end is found by
   counting braces rather than by the next `}}`, so a cloze around TeX —
   `{{c1::\frac{a}{b}}}` — closes where it should. */
function clozeSpans(text: string): ClozeSpan[] {
  const spans: ClozeSpan[] = [];
  CLOZE_OPEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CLOZE_OPEN.exec(text))) {
    const bodyStart = match.index + match[0].length;
    let depth = 0;
    let i = bodyStart;
    let hintAt = -1;
    let end = -1;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        if (depth === 0 && text[i + 1] === "}") {
          end = i;
          break;
        }
        if (depth > 0) depth -= 1;
      } else if (ch === ":" && text[i + 1] === ":" && depth === 0 && hintAt < 0) {
        hintAt = i;
      }
      i += 1;
    }
    if (end === -1) break; // unclosed: leave the rest as written
    spans.push({
      start: match.index,
      end: end + 2,
      index: Number(match[1]),
      content: text.slice(bodyStart, hintAt >= 0 ? hintAt : end),
      hint: hintAt >= 0 ? text.slice(hintAt + 2, end) : null,
    });
    CLOZE_OPEN.lastIndex = end + 2;
  }
  return spans;
}

function clozeIndexes(text: string, into = new Set<number>()): Set<number> {
  for (const span of clozeSpans(text)) {
    into.add(span.index);
    clozeIndexes(span.content, into);
  }
  return into;
}

/* The note as one card sees it: the active deletion blanked (or showing its
   hint), every other deletion filled in. `active` of null fills them all. */
function renderCloze(text: string, active: number | null, answers: string[]): string {
  const spans = clozeSpans(text);
  if (spans.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const span of spans) {
    out += text.slice(cursor, span.start);
    if (span.index === active) {
      answers.push(renderCloze(span.content, null, []));
      out += span.hint ? `[${span.hint}]` : IMPORT_CLOZE_BLANK;
    } else {
      out += renderCloze(span.content, active, answers);
    }
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

/* One Anki cloze note makes one card per number, as it does in Anki: c1 and
   c2 in the same sentence are two cards, and two c1s are blanked together.
   Returns null when the text has no cloze in it. */
export function clozeToCards(text: string, extra = ""): ImportedCard[] | null {
  const indexes = [...clozeIndexes(text)].sort((a, b) => a - b);
  if (indexes.length === 0) return null;
  return indexes.map((index) => {
    const answers: string[] = [];
    const front = renderCloze(text, index, answers);
    const answer = [...new Set(answers.map((a) => a.trim()).filter(Boolean))].join(", ");
    return {
      front,
      back: extra.trim() ? `${answer}\n\n${extra.trim()}` : answer,
    };
  });
}

/* --- Quizlet ------------------------------------------------------------- */

interface RawRow {
  front: string;
  back: string;
}

function countRowsWith(rows: string[], separator: string): number {
  let count = 0;
  for (const row of rows) if (row.includes(separator)) count += 1;
  return count;
}

/* Quizlet's menu offers tab or comma (or custom) between term and definition,
   and a new line or semicolon (or custom) between cards. A tab anywhere means
   tab: it is the default, and real card text almost never has one. For the
   rows, the choice that yields more term/definition pairs wins, and a tie
   goes to the new line — a semicolon inside a definition must not split it. */
function detectQuizletSeparators(
  text: string,
  field: string | undefined,
  row: string | undefined,
): { field: string; row: string } {
  const f = field ?? (text.includes("\t") ? "\t" : ",");
  if (row) return { field: f, row };
  let best = "\n";
  let bestScore = -1;
  for (const r of ["\n", ";"]) {
    const score = countRowsWith(text.split(r), f);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return { field: f, row: best };
}

function parseQuizlet(text: string, field: string, row: string): RawRow[] {
  const out: RawRow[] = [];
  /* With a line break between cards, a definition that itself has line breaks
     is indistinguishable from several rows — except that its later lines have
     no term separator in them. Such a line is folded into the card above. Only
     a card that really did split is extended, so the wrong separator shows up
     as skipped rows rather than as one enormous card. */
  const foldContinuations = row === "\n";
  let lastSplit: RawRow | null = null;
  for (const part of text.split(row)) {
    const at = part.indexOf(field);
    if (at === -1) {
      if (foldContinuations && lastSplit) {
        lastSplit.back += `\n${part}`;
        continue;
      }
      if (part.trim() === "") continue;
      out.push({ front: part, back: "" });
      continue;
    }
    lastSplit = { front: part.slice(0, at), back: part.slice(at + field.length) };
    out.push(lastSplit);
  }
  return out;
}

/* --- Detection ----------------------------------------------------------- */

/* Quoting is only worth turning on when the text needs it: a quoted field
   that spans lines, or a doubled quote inside one. A Quizlet term that merely
   starts with a quotation mark keeps it. */
function needsQuoteParsing(text: string): boolean {
  return /(^|[\t,;\n])"(?:[^"\n]|"")*(\n|"")/.test(text);
}

function detectSource(text: string, fileName?: string): ImportSource {
  if (ANKI_HEADER.test(text.slice(0, text.indexOf("\n") + 1 || text.length).trim())) {
    return "anki";
  }
  if (/\[sound:[^\]\n]*\]|\{\{c\d+::|<br\s*\/?>|<\/div>/i.test(text)) return "anki";
  if (/\.(csv|tsv)$/i.test(fileName ?? "")) return "csv";
  if (text.includes("\t")) return needsQuoteParsing(text) ? "csv" : "quizlet";
  // No tabs: quoted commas mean a spreadsheet, anything else is a Quizlet
  // export with the comma (or a custom) separator chosen.
  if (/(^|,|\n)"[^"\n]*"(,|\n|$)/.test(text)) return "csv";
  return "quizlet";
}

const HEADER_ROW = /^(front|term|question|word|prompt)$/i;
const HEADER_ROW_BACK = /^(back|definition|answer|meaning|response)$/i;

/* --- The import ---------------------------------------------------------- */

function auto(value: string | undefined): string | undefined {
  return value === undefined || value === "" || value === "auto" ? undefined : value;
}

export function parseCardImport(
  input: string,
  options: CardImportOptions = {},
): CardImportResult {
  const text = normalise(input);
  const source =
    options.source && options.source !== "auto"
      ? options.source
      : detectSource(text, options.fileName);
  const wantedField = auto(options.fieldSeparator);
  const wantedRow = auto(options.rowSeparator);

  const result: CardImportResult = {
    source,
    fieldSeparator: "\t",
    rowSeparator: "\n",
    cards: [],
    totalRows: 0,
    skippedBlank: 0,
    skippedMediaOnly: 0,
    skippedTooLong: 0,
    duplicates: 0,
    mediaStripped: 0,
    clozeNotes: 0,
    deckName: null,
  };

  const seen = new Set<string>();
  const accept = (front: string, back: string, mediaRemoved: boolean) => {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) {
      result.skippedBlank += 1;
      if (mediaRemoved) result.skippedMediaOnly += 1;
      return;
    }
    if (f.length > MAX_CARD_SIDE_CHARS || b.length > MAX_CARD_SIDE_CHARS) {
      result.skippedTooLong += 1;
      return;
    }
    // \u0000 can't appear in either side, so the pair is unambiguous.
    const key = `${f}\u0000${b}`;
    if (seen.has(key)) {
      result.duplicates += 1;
      return;
    }
    seen.add(key);
    if (mediaRemoved) result.mediaStripped += 1;
    result.cards.push({ front: f, back: b });
  };

  if (source === "quizlet") {
    const { field, row } = detectQuizletSeparators(text, wantedField, wantedRow);
    result.fieldSeparator = field;
    result.rowSeparator = row;
    const rows = parseQuizlet(text, field, row);
    result.totalRows = rows.length;
    // Quizlet exports are plain text: a definition containing "<b>" is a card
    // about HTML, so nothing is stripped or decoded.
    for (const r of rows) accept(r.front, r.back, false);
    return result;
  }

  const header =
    source === "anki"
      ? readAnkiHeader(text)
      : { separator: null, html: null, metaColumns: new Set<number>(), deckColumn: null, body: text };
  const separator =
    header.separator ?? wantedField ?? detectDelimiter(header.body, options.fileName);
  result.fieldSeparator = separator;

  let rows = parseDelimited(header.body, separator);
  if (
    source === "csv" &&
    rows.length > 1 &&
    HEADER_ROW.test((rows[0][0] ?? "").trim()) &&
    HEADER_ROW_BACK.test((rows[0][1] ?? "").trim())
  ) {
    rows = rows.slice(1);
  }
  result.totalRows = rows.length;

  const deckNames = new Map<string, number>();
  for (const row of rows) {
    if (header.deckColumn !== null) {
      const name = (row[header.deckColumn - 1] ?? "").trim();
      if (name) deckNames.set(name, (deckNames.get(name) ?? 0) + 1);
    }
    // Front and back are the first two columns that aren't tags, deck,
    // notetype or guid; anything after them is extra fields and ignored.
    const fields: string[] = [];
    for (let c = 0; c < row.length && fields.length < 2; c += 1) {
      if (!header.metaColumns.has(c + 1)) fields.push(row[c]);
    }
    let front = fields[0] ?? "";
    let back = fields[1] ?? "";
    let mediaRemoved = false;

    if (source === "anki") {
      const f = stripMedia(front);
      const b = stripMedia(back);
      mediaRemoved = f.removed || b.removed;
      /* `#html:true` is Anki saying the fields are HTML. Without the header
         (older exports, or a paste that lost it) it is HTML only if it looks
         like it; `#html:false` means angle brackets are the student's own. */
      const asHtml = (value: string) =>
        header.html ?? (HAS_TAG.test(value) || /&(?:nbsp|lt|gt|amp|quot|#\d+);/i.test(value));
      front = asHtml(f.text) ? htmlToPlainText(f.text) : tidy(f.text);
      back = asHtml(b.text) ? htmlToPlainText(b.text) : tidy(b.text);

      const clozeCards = clozeToCards(front, back);
      if (clozeCards) {
        result.clozeNotes += 1;
        for (const card of clozeCards) accept(card.front, card.back, mediaRemoved);
        continue;
      }
    }
    accept(front, back, mediaRemoved);
  }

  if (deckNames.size > 0) {
    const [name] = [...deckNames.entries()].sort((a, b) => b[1] - a[1])[0];
    // Anki nests decks as "Parent::Child".
    result.deckName = name.split("::").map((part) => part.trim()).join(" / ");
  }
  return result;
}

/** The cards not already in a set, so importing the same file twice (or
 *  retrying after a failure part-way) doesn't double the set. */
export function withoutExisting(
  cards: ImportedCard[],
  existing: { front: string; back: string }[],
): ImportedCard[] {
  if (existing.length === 0) return cards;
  const have = new Set(existing.map((c) => `${c.front.trim()}\u0000${c.back.trim()}`));
  return cards.filter((c) => !have.has(`${c.front}\u0000${c.back}`));
}
