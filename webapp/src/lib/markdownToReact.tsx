import type { ReactNode } from "react";
import { MathNode } from "./Math";
import { hasMathDelimiter, splitMath } from "./mathSyntax";
import styles from "./markdown.module.css";

/* Renders the same markdown subset as `lib/markdown.ts`'s `renderMarkdown`
 * (ported from js/ai.js:138-192) — but to React elements rather than an HTML
 * string.
 *
 * WHY NOT REUSE `renderMarkdown`: the vanilla assigns its output straight to
 * `bubble.innerHTML`. Doing the same here means `dangerouslySetInnerHTML`, and
 * Step 3 established — deliberately — that the React app contains none. The
 * vanilla's version is safe *today* only because it escapes `& < >` before any
 * other transform; that ordering is one careless edit away from being an XSS
 * hole in a surface whose entire input is untrusted model output. Building
 * elements instead makes escaping structural: a `<script>` in a model reply is
 * a text node, and there is no code path where it could be anything else.
 *
 * `renderMarkdown` stays where it is — the notes editor feeds it to Quill's
 * `clipboard.convert()` against a format allowlist, which is a different (and
 * also safe) consumer.
 *
 * Two deliberate divergences from the vanilla's output:
 *
 *  1. **Consecutive list items are wrapped in a real `<ul>`/`<ol>`.** The
 *     vanilla emitted bare `<li>` elements with an inline `list-style-type`
 *     and no list parent — invalid HTML, and a screen reader announces no list
 *     at all, so "3 items" never reaches the student.
 *  2. **Styling moves to a CSS module.** The vanilla wrote an inline `style`
 *     attribute on every element it built, which also hard-coded a dark-theme
 *     palette (`#4AE283`, `rgba(255,255,255,0.1)`) that is wrong in light
 *     mode. The rules are ported to tokens instead.
 */

/** A chunk of the model's reply: either markdown text, or an app-built widget
 *  standing in for an action the app executed. Widgets are React nodes, so
 *  they are never serialised to HTML and re-parsed. */
export type MarkdownSegment =
  { kind: "text"; text: string } | { kind: "node"; node: ReactNode };

let keySeed = 0;
const nextKey = () => `md-${keySeed++}`;

/* ---------- inline ---------- */

/** Split on the first delimiter pair that matches, recursing into the parts.
 *  Applied in the vanilla's order: code, then ***, **, *.
 *
 *  Two departures from the vanilla's `[^*]+` bodies, both because a model that
 *  writes `**a *b* c**` should not put stray asterisks on a student's screen:
 *
 *   1. **Bodies are lazy `.+?`, not "no asterisks allowed".** `[^*]+` cannot
 *      match across a nested `*`, so the outer `**…**` was skipped and the
 *      inner `*…*` matched instead — leaving the outer pair rendered as
 *      literal `*` characters.
 *   2. **Emphasis bodies recurse.** The inner `*b*` in the example is markdown
 *      too, so it is rendered rather than shown raw.
 *
 *  `(?!\s)` on the opener keeps arithmetic out of it: `2 * 3 * 4` has a space
 *  after each `*`, so nothing there opens an emphasis run. (A lookahead, not a
 *  lookbehind on the closer — lookbehind is a parse error in older Safari, and
 *  that would take the whole bundle down rather than one paragraph.) */
function renderInline(text: string): ReactNode[] {
  /* Maths comes out first: a TeX body is full of characters this pass would
     otherwise claim: the stars in `$a^*b^*$` would be read as emphasis and
     eaten. Splitting first means the markdown pass only ever sees prose. */
  if (hasMathDelimiter(text)) {
    const parts = splitMath(text);
    if (parts.some((p) => p.kind === "math")) {
      const out: ReactNode[] = [];
      for (const part of parts) {
        if (part.kind === "math") {
          out.push(
            <MathNode
              key={nextKey()}
              tex={part.value}
              display={part.display === true}
            />,
          );
        } else {
          out.push(...renderInlineMarkdown(part.value));
        }
      }
      return out;
    }
  }
  return renderInlineMarkdown(text);
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  /* One pass, longest-delimiter-first, matching renderMarkdown's ordering. */
  const pattern =
    /(`[^`\n]+`)|(\*\*\*(?!\s).+?\*\*\*)|(\*\*(?!\s).+?\*\*)|(\*(?!\s).+?\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      /* Code spans are literal by definition — no recursion. */
      out.push(
        <code key={nextKey()} className={styles.code}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("***")) {
      out.push(
        <strong key={nextKey()}>
          <em>{renderInline(token.slice(3, -3))}</em>
        </strong>,
      );
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={nextKey()}>{renderInline(token.slice(2, -2))}</strong>,
      );
    } else {
      out.push(<em key={nextKey()}>{renderInline(token.slice(1, -1))}</em>);
    }
    last = match.index + token.length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

/* ---------- block ---------- */

interface ListRun {
  ordered: boolean;
  items: string[];
}

function flushList(run: ListRun | null, out: ReactNode[]): null {
  if (!run) return null;
  const items = run.items.map((item) => (
    <li key={nextKey()}>{renderInline(item)}</li>
  ));
  out.push(
    run.ordered ? (
      <ol key={nextKey()} className={styles.list}>
        {items}
      </ol>
    ) : (
      <ul key={nextKey()} className={styles.list}>
        {items}
      </ul>
    ),
  );
  return null;
}

/** Paragraph text, with the vanilla's newline→<br/> behaviour preserved. */
function renderParagraph(lines: string[], out: ReactNode[]): void {
  if (lines.length === 0) return;
  const nodes: ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) nodes.push(<br key={nextKey()} />);
    nodes.push(...renderInline(line));
  });
  out.push(
    <p key={nextKey()} className={styles.paragraph}>
      {nodes}
    </p>,
  );
  lines.length = 0;
}

const HEADING_LEVELS = [
  { prefix: "#### ", tag: "h4" },
  { prefix: "### ", tag: "h3" },
  { prefix: "## ", tag: "h2" },
  { prefix: "# ", tag: "h1" },
] as const;

function renderTextBlock(markdown: string): ReactNode[] {
  const out: ReactNode[] = [];
  /* Fenced code is taken out first — everything inside is literal, which is
     the whole point of a fence. */
  const parts = markdown.split(/```(\w*)\n([\s\S]*?)```/g);

  for (let i = 0; i < parts.length; i += 3) {
    const prose = parts[i];
    if (prose) out.push(...renderProse(prose));

    const code = parts[i + 2];
    if (code !== undefined) {
      out.push(
        <pre key={nextKey()} className={styles.pre}>
          <code>{code.trim()}</code>
        </pre>,
      );
    }
  }

  return out;
}

function renderProse(prose: string): ReactNode[] {
  const out: ReactNode[] = [];
  const paragraph: string[] = [];
  let list: ListRun | null = null;

  const closeBlocks = () => {
    renderParagraph(paragraph, out);
    list = flushList(list, out);
  };

  const lines = prose.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();

    if (line.trim() === "") {
      closeBlocks();
      continue;
    }

    /* A display equation opened on its own line and closed on a later one.
       The paragraph path cannot handle it: renderProse works line by line, so
       a bare `$$` would close as its own paragraph and the equation would
       render as prose between two rows of dollar signs. Single-line `$$…$$`
       needs none of this — splitMath catches it inside the paragraph. */
    const fenceOpen = line.trim() === "$$" ? "$$" : line.trim() === "\\[" ? "\\]" : null;
    if (fenceOpen) {
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && lines[j].trim() !== fenceOpen) {
        body.push(lines[j]);
        j++;
      }
      /* Only treat it as a fence if it actually closes. An unmatched `$$`
         falls through to the normal paragraph path rather than swallowing
         the rest of the reply. */
      if (j < lines.length && body.join("\n").trim()) {
        closeBlocks();
        out.push(
          <MathNode key={nextKey()} tex={body.join("\n").trim()} display />,
        );
        i = j;
        continue;
      }
    }

    const heading = HEADING_LEVELS.find((h) => line.startsWith(h.prefix));
    if (heading) {
      closeBlocks();
      const Tag = heading.tag;
      out.push(
        <Tag key={nextKey()} className={styles[heading.tag]}>
          {renderInline(line.slice(heading.prefix.length))}
        </Tag>,
      );
      continue;
    }

    if (line === "---") {
      closeBlocks();
      out.push(<hr key={nextKey()} className={styles.hr} />);
      continue;
    }

    if (line.startsWith("> ")) {
      closeBlocks();
      out.push(
        <blockquote key={nextKey()} className={styles.blockquote}>
          {renderInline(line.slice(2))}
        </blockquote>,
      );
      continue;
    }

    const bullet = /^- (.*)$/.exec(line);
    /* Models number lists both ways — `1.` and `1)`. The second used to
       fall through to a paragraph, so the items lost their list. */
    const numbered = /^\d+[.)] (.*)$/.exec(line);
    if (bullet || numbered) {
      renderParagraph(paragraph, out);
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) list = flushList(list, out);
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    list = flushList(list, out);
    /* The raw line, not the trimmed one: a text run that stops mid-sentence
       because a widget follows it must keep the space before the widget. */
    paragraph.push(rawLine);
  }

  closeBlocks();
  return out;
}

/** Render a model reply — markdown text interleaved with app-built widgets —
 *  as React nodes. */
export function renderMarkdownSegments(
  segments: MarkdownSegment[],
): ReactNode[] {
  const out: ReactNode[] = [];
  for (const segment of segments) {
    if (segment.kind === "node") out.push(segment.node);
    else out.push(...renderTextBlock(segment.text));
  }
  return out;
}

/** Convenience for plain markdown with no widgets in it. */
export function renderMarkdownNodes(markdown: string): ReactNode[] {
  return renderTextBlock(markdown);
}
