import Quill from "quill";

/* Learnora's note formats (DESIGN.md 0.8, the exercise book).
 *
 * - `mark`: the three named highlighters. Key idea, Learn this, and I get
 *   this wrong. Class-based (`ln-mark-key`), not a free colour, so a note
 *   reads the same in every theme and the margin can find each kind.
 * - `callout`: a whole line set apart as a key idea, a definition or a
 *   common mistake (`ln-callout-key`). The label is drawn by CSS, so the
 *   stored text is only what the student wrote.
 *
 * Styles live in index.css, global on purpose: the lesson page renders the
 * same saved HTML outside the editor. */

export const MARK_KINDS = ["key", "learn", "wrong"] as const;
export type MarkKind = (typeof MARK_KINDS)[number];
export const CALLOUT_KINDS = ["key", "def", "mistake"] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export const MARK_LABEL: Record<MarkKind, string> = {
  key: "Key idea",
  learn: "Learn this",
  wrong: "I get this wrong",
};

export const CALLOUT_LABEL: Record<CalloutKind, string> = {
  key: "Key idea",
  def: "Definition",
  mistake: "Common mistake",
};

let registered = false;

export function registerNoteFormats(): void {
  if (registered) return;
  registered = true;
  const Parchment = Quill.import("parchment") as {
    ClassAttributor: new (
      attrName: string,
      keyName: string,
      options: { scope: number; whitelist: string[] },
    ) => unknown;
    Scope: { INLINE: number; BLOCK: number };
  };
  const mark = new Parchment.ClassAttributor("mark", "ln-mark", {
    scope: Parchment.Scope.INLINE,
    whitelist: [...MARK_KINDS],
  });
  const callout = new Parchment.ClassAttributor("callout", "ln-callout", {
    scope: Parchment.Scope.BLOCK,
    whitelist: [...CALLOUT_KINDS],
  });
  Quill.register("formats/mark", mark, true);
  Quill.register("formats/callout", callout, true);
}
