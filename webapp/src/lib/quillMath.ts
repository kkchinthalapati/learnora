import Quill from "quill";

/* Maths in the notes editor.
 *
 * Quill ships a `formula` blot and the editor already lists it in both
 * TOOLBAR_CONFIG and ALLOWED_FORMATS — but it was never usable, because
 * Quill's implementation opens with:
 *
 *     if (window.katex == null) throw new Error('Formula module requires KaTeX.');
 *
 * and nothing ever set `window.katex`. So the toolbar's formula button threw,
 * and — worse — any stored note containing a `ql-formula` span would throw
 * during `clipboard.convert()` and take the whole document down with it. That
 * is a latent crash, not just a missing feature.
 *
 * Quill's blot is unusable here for a second reason anyway: it calls
 * `katex.render` with default options, which produces HTML whose geometry
 * lives in inline `style` attributes. The app's CSP (`style-src 'self' …`,
 * no 'unsafe-inline') drops those, so the equation would render with every
 * strut collapsed. See Math.tsx for the same reasoning on the chat side.
 *
 * The blot below replaces Quill's, and differs in three ways:
 *
 *  1. **MathML output**, so no inline styles and no CSP change.
 *  2. **No `window.katex`.** KaTeX is held in a module variable, so nothing
 *     depends on a global that may or may not have been assigned.
 *  3. **It never throws.** Before KaTeX has loaded — and permanently if the
 *     chunk fails — the node holds the raw TeX as text. A student sees
 *     `\sqrt{12}` rather than losing the document.
 *
 * Registration happens at import, synchronously, so the blot is in place
 * before any editor mounts. `loadMathTypesetter()` then swaps in the real
 * renderer; `RichTextEditor` awaits it before constructing Quill so a note
 * opens already typeset rather than visibly re-rendering a moment later.
 */

type KatexModule = typeof import("katex");

let katex: KatexModule["default"] | null = null;
let loadPromise: Promise<void> | null = null;

/** Renders `tex` into `node`, or leaves the raw TeX as text if KaTeX is not
 *  loaded yet. Never throws: one malformed equation must not cost a note. */
function typeset(node: HTMLElement, tex: string): void {
  if (!katex) {
    node.textContent = tex;
    return;
  }
  try {
    katex.render(tex, node, {
      output: "mathml",
      throwOnError: false,
      /* Never raise this — it is what stops \html*, \url and \href turning
         model-authored TeX into markup. Same rule as Math.tsx. */
      trust: false,
      strict: false,
    });
  } catch {
    node.textContent = tex;
  }
}

/* Quill's `import()` is typed as returning `unknown`, and a class cannot
   extend a base whose instance type is `unknown`. The shape below is only as
   much of Embed as this blot actually relies on. */
interface EmbedBlot {
  domNode: HTMLElement;
}

const Embed = Quill.import("blots/embed") as unknown as {
  new (...args: unknown[]): EmbedBlot;
  create(value: unknown): HTMLElement;
};

class MathFormula extends Embed {
  static blotName = "formula";
  static className = "ql-formula";
  static tagName = "SPAN";

  static create(value: string): HTMLElement {
    const node = super.create(value);
    if (typeof value === "string") {
      typeset(node, value);
      /* The TeX source, not the rendered output, is what round-trips: on
         reload Quill reads this attribute and re-renders from it. */
      node.setAttribute("data-value", value);
    }
    return node;
  }

  static value(domNode: HTMLElement): string | null {
    return domNode.getAttribute("data-value");
  }
}

/* `true` suppresses Quill's "overwriting existing format" warning — replacing
   its formula blot is the entire point. */
Quill.register(
  MathFormula as unknown as Parameters<typeof Quill.register>[0],
  true,
);

/** Loads KaTeX and re-typesets anything already on the page. Safe to call
 *  repeatedly: the import is shared and the work happens once. */
export function loadMathTypesetter(): Promise<void> {
  loadPromise ??= import("katex")
    .then((mod) => {
      katex = mod.default;
      /* Any formula rendered as raw TeX while the chunk was in flight — an
         editor that mounted early, or a second editor on the page — is
         upgraded in place rather than left as text. */
      for (const node of document.querySelectorAll<HTMLElement>(
        "span.ql-formula[data-value]",
      )) {
        typeset(node, node.getAttribute("data-value") ?? "");
      }
    })
    .catch(() => {
      /* Offline or chunk failure. Every formula keeps its TeX fallback, so
         the document is still readable and still saves correctly. */
    });
  return loadPromise;
}
