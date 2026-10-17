import type { MarkKind } from "./noteFormats";

/* Pure readers over a note's Quill Delta, so the margin, the bookmarks and
 * blank-page recall can work from what is actually on the page — and so they
 * can be tested without a live editor. */

export interface DeltaOp {
  insert?: unknown;
  attributes?: Record<string, unknown>;
}

export interface MarkedPhrase {
  kind: MarkKind;
  text: string;
  /** Index of the phrase's first character in the document. */
  index: number;
  /** The sentence it sits in, for cloze cards. */
  sentence: string;
}

/** The document's plain text, with each embed counted as one character the
 *  way Quill counts it, so indexes line up with Quill's own. */
export function plainText(ops: DeltaOp[]): string {
  return ops
    .map((op) => (typeof op.insert === "string" ? op.insert : "\uFFFC"))
    .join("");
}

/** The sentence around `index` in `text`: the line it is on, cut down to the
 *  sentence that contains the position. */
export function sentenceAt(text: string, index: number, length = 0): string {
  const lineStart = text.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const lineEndRaw = text.indexOf("\n", index);
  const lineEnd = lineEndRaw < 0 ? text.length : lineEndRaw;
  const line = text.slice(lineStart, lineEnd);
  const offset = index - lineStart;
  const parts = line.split(/(?<=[.!?])\s+/);
  let pos = 0;
  for (const part of parts) {
    const start = line.indexOf(part, pos);
    const end = start + part.length;
    if (offset >= start && offset + length <= end + 1) return part.replace(/\uFFFC/g, "").trim();
    pos = end;
  }
  return line.replace(/\uFFFC/g, "").trim();
}

/** Every highlighted phrase, with neighbouring runs of the same mark joined
 *  (Quill splits a run wherever another format, such as bold, starts). */
export function markedPhrases(ops: DeltaOp[], kind?: MarkKind): MarkedPhrase[] {
  const text = plainText(ops);
  const out: MarkedPhrase[] = [];
  let index = 0;
  for (const op of ops) {
    const len = typeof op.insert === "string" ? op.insert.length : 1;
    const mark = op.attributes?.mark as MarkKind | undefined;
    if (mark && typeof op.insert === "string" && (!kind || mark === kind)) {
      const last = out[out.length - 1];
      if (last && last.kind === mark && last.index + last.text.length === index) {
        last.text += op.insert;
      } else {
        out.push({ kind: mark, text: op.insert, index, sentence: "" });
      }
    }
    index += len;
  }
  return out
    .map((p) => ({ ...p, text: p.text.replace(/\s+/g, " ").trim() }))
    .filter((p) => p.text.length > 0)
    .map((p) => ({ ...p, sentence: sentenceAt(text, p.index, p.text.length) }));
}

export interface NoteHeading {
  text: string;
  level: number;
  /** Index of the heading's first character. */
  index: number;
}

/** Headings in document order. A line's format sits on its closing "\n". */
export function headingsOf(ops: DeltaOp[]): NoteHeading[] {
  const out: NoteHeading[] = [];
  let index = 0;
  let lineStart = 0;
  let lineText = "";
  for (const op of ops) {
    if (typeof op.insert !== "string") {
      index += 1;
      lineText += " ";
      continue;
    }
    const pieces = op.insert.split("\n");
    pieces.forEach((piece, i) => {
      lineText += piece;
      index += piece.length;
      if (i < pieces.length - 1) {
        const level = Number(op.attributes?.header ?? 0);
        if (level > 0 && lineText.trim()) {
          out.push({ text: lineText.trim(), level, index: lineStart });
        }
        index += 1;
        lineStart = index;
        lineText = "";
      }
    });
  }
  return out;
}

export function wordCount(text: string): number {
  return (text.replace(/\uFFFC/g, " ").match(/\S+/g) ?? []).length;
}

/** Blank-page recall: which ideas the student's own writing covers. An idea
 *  counts as recalled when at least half of its meaningful words (four
 *  letters or more, matched on their first five letters so "denatures"
 *  finds "denature") appear in what they wrote. A short idea with no long
 *  words needs its whole text. It is a rough check, and the screen says so. */
export function recalledIdeas(
  ideas: string[],
  written: string,
): { recalled: string[]; missed: string[] } {
  const hay = written.toLowerCase();
  const recalled: string[] = [];
  const missed: string[] = [];
  for (const idea of ideas) {
    const words = idea.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
    const hit = words.length
      ? words.filter((w) => hay.includes(w.slice(0, 5))).length >= Math.ceil(words.length / 2)
      : hay.includes(idea.toLowerCase().trim());
    (hit ? recalled : missed).push(idea);
  }
  return { recalled, missed };
}
