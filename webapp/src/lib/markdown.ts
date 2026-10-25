/* Ports `renderMarkdown` out of js/ai.js:138-192 — early, ahead of the rest
 * of that file (ledger step 14), because it is a pure string transform with
 * no network call and no AI dependency, and the notes editor genuinely needs
 * it today: any note whose `html_content` hasn't been generated yet (still
 * processing, or created before the `html_content` column existed — see
 * supabase/migrations/20260727020000) falls back to rendering its
 * `markdown_content`. Step 14 should import this rather than reimplement it
 * when it ports the rest of `ai.js`.
 *
 * Dropped from the port: the vanilla's comment about a widget-token
 * un-escape step that used to exist and was removed as a security fix
 * (js/ai.js:183-190, "restoreWidgets"). That machinery belongs to the AI
 * chat's action-tag system, which doesn't exist here yet — nothing calls
 * this function with reserved widget tokens today, so there is nothing to
 * preserve compatibility with. */

import DOMPurify from "dompurify";
import { hasMathDelimiter, splitMath } from "./mathSyntax";
import { hasOpenUiBlock, splitOpenUiBlocks } from "./openui/fence";
import { cardifyNotes } from "./openui/cardify";
import { isFlagOn } from "./flags";

/* Maths is lifted out before the prose pipeline runs and put back after.
 *
 * It cannot simply be rendered segment by segment: the block rules below are
 * line-anchored (`^## (.*?)$`), so splitting "## Area of $x$" into three
 * pieces would leave the heading rule matching only "## Area of " and drop the
 * equation outside the closing </h2>. A placeholder keeps each line intact.
 *
 * The placeholder is wrapped in NUL bytes, and NUL is stripped from the input
 * first — so no document, however hostile, can contain a token that survives
 * to the swap-back step. That is the failure the vanilla's removed
 * `restoreWidgets` had (see the file header), and the reason this is a
 * stripped sentinel rather than a clever string.
 *
 * The output is a Quill formula blot: `clipboard.convert()` matches it by
 * class and rebuilds it from `data-value`, so the TeX survives an edit-save
 * round trip. See lib/quillMath.ts for the blot itself. */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MATH_TOKEN = (index: number) => `\u0000MATH${index}\u0000`;
const CARD_TOKEN = (index: number) => `\u0000CARD${index}\u0000`;
const FIGURE_TOKEN = (index: number) => `\u0000FIGURE${index}\u0000`;

/* The profile the notes editor uses for a drawing (lib/noteFormats.ts,
   sanitizeDiagram). A model's SVG is untrusted, so nothing that runs or links
   survives. */
const FIGURE_PURIFY = {
  USE_PROFILES: { svg: true, svgFilters: true },
  FORBID_TAGS: ["style", "script", "foreignObject", "image", "use", "a"],
  FORBID_ATTR: ["href", "xlink:href"],
};

export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";

  const equations: string[] = [];
  /* Strip NUL so the sentinel below cannot be forged. Written as a Unicode
     escape rather than \0 for the same reason the swap-back regex is. */
  // oxlint-disable-next-line no-control-regex
  let source = md.replace(/\u0000/g, "");
  /* Labelled lines (Definition:, Key idea:, …) are boxed as cards, the same
     way a model-written card would be. See lib/openui/cardify.ts. */
  if (isFlagOn("openUi")) source = cardifyNotes(source);

  /* SVG diagrams (a ```svg fence holding one <svg>) become the editor's
     diagram figure, the same markup "Draw this section" stores. Lifted out
     first, so an SVG's attributes are never read as Markdown. */
  const figures: string[] = [];
  source = source.replace(/```(?:svg|diagram)[ \t]*\r?\n([\s\S]*?)```/g, (whole, body: string) => {
    const svg = body.trim();
    if (!/^<svg[\s>]/i.test(svg)) return whole;
    figures.push(String(DOMPurify.sanitize(svg, FIGURE_PURIFY)));
    return `\n${FIGURE_TOKEN(figures.length - 1)}\n`;
  });

  /* OpenUI cards come out before the maths, so TeX inside a card's text is
     not lifted as an equation. Each becomes the notes editor's card embed
     (lib/noteFormats.ts), its source kept whole in data-code. */
  const cards: string[] = [];
  if (hasOpenUiBlock(source)) {
    source = splitOpenUiBlocks(source)
      .map((segment) => {
        if (segment.kind === "text") return segment.text;
        cards.push(segment.code);
        return `\n${CARD_TOKEN(cards.length - 1)}\n`;
      })
      .join("");
  }

  if (hasMathDelimiter(source)) {
    source = splitMath(source)
      .map((part) => {
        if (part.kind !== "math") return part.value;
        equations.push(part.value);
        return MATH_TOKEN(equations.length - 1);
      })
      .join("");
  }

  let html = source;

  // Escape HTML first.
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks: ```lang\n...\n```
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, _lang: string, code: string) => {
      return `<pre class="glass-panel" style="padding:16px; margin:16px 0; overflow-x:auto; background:rgba(0,0,0,0.4); border-radius:var(--r-md);"><code style="font-family:'Fira Code',monospace; color:#4AE283; font-size:0.9rem; line-height:1.5;">${code.trim()}</code></pre>`;
    },
  );

  // Inline code.
  html = html.replace(
    /`([^`\n]+)`/g,
    '<code style="font-family:monospace; background:rgba(255,255,255,0.1); padding:2px 6px; border-radius:4px; color:var(--primary);">$1</code>',
  );

  // Headers (longest first, to avoid conflicts).
  html = html.replace(
    /^#### (.*?)$/gm,
    '<h4 style="font-size:1.15rem; margin:20px 0 8px; color:var(--text); font-weight:600;">$1</h4>',
  );
  html = html.replace(
    /^### (.*?)$/gm,
    '<h3 style="font-size:1.3rem; margin:24px 0 10px; color:var(--text); font-weight:600;">$1</h3>',
  );
  html = html.replace(
    /^## (.*?)$/gm,
    '<h2 style="font-size:1.6rem; margin:28px 0 12px; color:var(--primary); font-weight:700;">$1</h2>',
  );
  html = html.replace(
    /^# (.*?)$/gm,
    '<h1 style="font-size:2rem; margin:32px 0 16px; color:var(--primary); font-weight:800;">$1</h1>',
  );

  // Bold and italic.
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Blockquotes.
  html = html.replace(
    /^&gt; (.*?)$/gm,
    '<blockquote style="border-left:3px solid var(--primary); padding:8px 16px; margin:12px 0; opacity:0.85; font-style:italic;">$1</blockquote>',
  );

  // Unordered lists.
  html = html.replace(
    /^- (.*?)$/gm,
    '<li style="margin-left:20px; margin-bottom:6px; list-style-type:disc;">$1</li>',
  );

  // Numbered lists.
  html = html.replace(
    /^\d+\. (.*?)$/gm,
    '<li style="margin-left:20px; margin-bottom:6px; list-style-type:decimal;">$1</li>',
  );

  // Horizontal rules.
  html = html.replace(
    /^---$/gm,
    '<hr style="border:none; border-top:1px solid rgba(255,255,255,0.15); margin:24px 0;">',
  );

  // Newlines to <br> (not inside code blocks — already handled above).
  html = html.replace(/\n/g, "<br/>");

  /* Equations back in, now that every line-anchored rule has run. */
  if (equations.length > 0) {
    /* The control character is the point: it is a sentinel that cannot
       survive from user input, because NUL is stripped above. */
    // oxlint-disable-next-line no-control-regex
    html = html.replace(/\u0000MATH(\d+)\u0000/g, (whole, index: string) => {
      const tex = equations[Number(index)];
      if (tex === undefined) return whole;
      return `<span class="ql-formula" data-value="${escapeAttribute(tex)}"></span>`;
    });
  }

  if (figures.length > 0) {
    // oxlint-disable-next-line no-control-regex
    html = html.replace(/(?:<br\/>)*\u0000FIGURE(\d+)\u0000(?:<br\/>)*/g, (whole, index: string) => {
      const svg = figures[Number(index)];
      if (svg === undefined) return whole;
      return `<figure class="ln-diagram">${svg}</figure>`;
    });
  }

  if (cards.length > 0) {
    // oxlint-disable-next-line no-control-regex
    html = html.replace(/(?:<br\/>)*\u0000CARD(\d+)\u0000(?:<br\/>)*/g, (whole, index: string) => {
      const code = cards[Number(index)];
      if (code === undefined) return whole;
      return `<div class="ln-openui" data-code="${escapeAttribute(code)}"></div>`;
    });
  }

  return html;
}
