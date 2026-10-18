import Quill from "quill";
import DOMPurify from "dompurify";

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
  /* Quill's own typings don't describe embed blots, so this one is typed
     loosely at the registration boundary and nowhere else. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BlockEmbed: any = Quill.import("blots/block/embed");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  class DiagramBlot extends BlockEmbed {
    static blotName = "diagram";
    static tagName = "figure";
    static className = "ln-diagram";
    static create(value: string): HTMLElement {
      const node: HTMLElement = super.create(value);
      node.innerHTML = sanitizeDiagram(String(value));
      return node;
    }
    static value(node: HTMLElement): string {
      return node.querySelector("svg")?.outerHTML ?? "";
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Quill.register(DiagramBlot as any, true);
  Quill.register("formats/callout", callout, true);
}

/* A drawing in the note: an SVG the tutor drew for this section, kept as
 * markup. It is sanitised both when it is drawn and whenever the note is read
 * back, so a stored note can't bring a script or a link in with it. */
const DIAGRAM_PURIFY = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["style", "script", "foreignObject", "image", "use", "a"],
  FORBID_ATTR: ["href", "xlink:href"],
};

export function sanitizeDiagram(svg: string): string {
  return String(DOMPurify.sanitize(svg, DIAGRAM_PURIFY));
}

/** Turns the markdown the notes arrive in into the classes the editor knows:
 *  "> **Key idea:** …" blockquotes become callouts, and "==words==" becomes a
 *  key-idea highlight. Anything else passes through untouched. */
export function richenNoteHtml(html: string): string {
  const kindOf = (label: string): CalloutKind | null => {
    const l = label.toLowerCase();
    if (l.startsWith("key idea")) return "key";
    if (l.startsWith("definition") || l.startsWith("formula")) return "def";
    if (l.startsWith("common mistake")) return "mistake";
    return null;
  };
  return html
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g, (whole, inner: string) => {
      const m = /^\s*<strong>\s*([^<]+?)\s*:?\s*<\/strong>\s*[:—-]?\s*/i.exec(inner);
      const kind = m ? kindOf(m[1]) : null;
      if (!m || !kind) return whole;
      return `<p class="ln-callout-${kind}">${inner.slice(m[0].length)}</p>`;
    })
    .replace(/==([^=<>\n]+)==/g, '<span class="ln-mark-key">$1</span>');
}
