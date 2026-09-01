/* What counts as maths in a model reply, and where it starts and stops.
 *
 * Lives on its own because two different renderers need the identical answer:
 * `markdownToReact.tsx` builds React elements for chat and the review drawer,
 * and `markdown.ts` builds an HTML string for the Quill notes editor. If the
 * two disagreed about where an equation ends, the same note would parse one
 * way on screen and another way in the editor.
 */

/* Models write maths in four delimiters and switch between them freely, so all
 * four are recognised: `$…$` and `\(…\)` inline, `$$…$$` and `\[…\]` display.
 *
 * `$` is the awkward one, because it is also a currency symbol. Two rules keep
 * "it costs $5 and $10 for two" out of the maths path: the opening `$` may not
 * be followed by a space, and the closing `$` may not be preceded by one. In
 * that sentence the only candidate body is "5 and ", which ends in a space and
 * is rejected — so the text falls through and renders as written. A single
 * unpaired `$` never matches at all. `\$` is an escaped dollar and is emitted
 * as a literal.
 *
 * (Rejection is tested by trailing character, not by a lookbehind: lookbehind
 * is a parse error in older Safari, and that takes the whole bundle down
 * rather than one paragraph. Same reason renderInline avoids it.) */

export interface MathPart {
  kind: "text" | "math";
  value: string;
  display?: boolean;
}

/** True when `index` is escaped by an odd number of preceding backslashes. */
function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) slashes++;
  return slashes % 2 === 1;
}

/** A `$…$` body is maths only if it is non-empty, stays on one line, and is
 *  padded by neither a leading nor a trailing space. */
function isPlausibleInlineMath(body: string): boolean {
  if (body.length === 0) return false;
  if (body.includes("\n")) return false;
  return !/^\s/.test(body) && !/\s$/.test(body);
}

export function splitMath(text: string): MathPart[] {
  const parts: MathPart[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) parts.push({ kind: "text", value: buffer });
    buffer = "";
  };

  const pushMath = (value: string, display: boolean) => {
    flush();
    parts.push({ kind: "math", value: value.trim(), display });
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);

    /* An escaped dollar is a literal one, and must be consumed before the
       delimiter checks below get a chance at it. */
    if (rest.startsWith("\\$")) {
      buffer += "$";
      i += 2;
      continue;
    }

    /* \[ … \] and \( … \) */
    const tex = rest.startsWith("\\[")
      ? { open: "\\[", close: "\\]", display: true }
      : rest.startsWith("\\(")
        ? { open: "\\(", close: "\\)", display: false }
        : null;
    if (tex) {
      const end = text.indexOf(tex.close, i + 2);
      const body = end === -1 ? "" : text.slice(i + 2, end);
      if (end !== -1 && body.trim()) {
        pushMath(body, tex.display);
        i = end + 2;
        continue;
      }
    }

    /* $$ … $$ — checked before `$` so the longer delimiter wins. */
    if (rest.startsWith("$$")) {
      const end = text.indexOf("$$", i + 2);
      const body = end === -1 ? "" : text.slice(i + 2, end);
      if (end !== -1 && body.trim()) {
        pushMath(body, true);
        i = end + 2;
        continue;
      }
    }

    if (text[i] === "$") {
      /* Nearest unescaped `$` that still leaves a plausible body. */
      let end = text.indexOf("$", i + 1);
      while (end !== -1 && isEscaped(text, end)) {
        end = text.indexOf("$", end + 1);
      }
      if (end !== -1) {
        const body = text.slice(i + 1, end);
        if (isPlausibleInlineMath(body)) {
          pushMath(body, false);
          i = end + 1;
          continue;
        }
      }
    }

    buffer += text[i];
    i++;
  }

  flush();
  return parts;
}

/** Does this text contain anything the maths scanner would pull out? Lets the
 *  common no-maths case skip the scan entirely. */
export function hasMathDelimiter(text: string): boolean {
  return text.includes("$") || text.includes("\\(") || text.includes("\\[");
}
