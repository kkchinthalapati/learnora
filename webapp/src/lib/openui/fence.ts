/* How OpenUI Lang rides inside an ordinary AI reply (fence handling only —
 * kept apart from the library so importing it does not pull in the renderer).
 *
 * Replies are Markdown with, sometimes, action tags and fenced mermaid/svg
 * blocks. Rather than replace that with an all-OpenUI reply (which would put
 * the action tags, flashcard detection and history replay at risk), the model
 * may add ```openui fenced blocks for structured content — the same
 * convention DIAGRAMS already uses. Everything outside a block stays
 * Markdown, and a block that cannot be fully drawn says so (see
 * components/chat/OpenUiBlock), never falling back to silence.
 *
 * Models are not exact about this, so the reader is forgiving about form but
 * not about content: it accepts ```openui-lang and friends, a fence that was
 * cut off before it closed, and a bare program with no fence at all. Whether
 * the program itself is valid is the parser's call, not this file's. */

export type ReplySegment =
  | { kind: "text"; text: string }
  | { kind: "openui"; code: string };

/* The fence, with its closing fence optional so a reply cut off mid-block
   still surfaces its card rather than a screen of source. */
const FENCE = /```[ \t]*(?:openui(?:[-_ ]?lang)?)[ \t]*\r?\n([\s\S]*?)(?:```|$)/gi;

const ROOT_LINE = /^[ \t]*root[ \t]*=[ \t]*Stack\(/;
const ASSIGNMENT = /^[ \t]*[A-Za-z_]\w*[ \t]*=[ \t]*\S/;

/** Finds an OpenUI program written without a fence: a `root = Stack(` line
 *  and the run of `name = …` lines after it. */
function splitBare(text: string): ReplySegment[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => ROOT_LINE.test(l));
  if (start === -1) return [{ kind: "text", text }];
  let end = start + 1;
  while (end < lines.length && ASSIGNMENT.test(lines[end])) end++;
  const out: ReplySegment[] = [];
  const before = lines.slice(0, start).join("\n");
  const after = lines.slice(end).join("\n");
  if (before.trim()) out.push({ kind: "text", text: before });
  out.push({ kind: "openui", code: lines.slice(start, end).join("\n").trim() });
  if (after.trim()) out.push({ kind: "text", text: after });
  return out;
}

/** Splits a reply into Markdown runs and OpenUI Lang blocks, in order. */
export function splitOpenUiBlocks(text: string): ReplySegment[] {
  const out: ReplySegment[] = [];
  let last = 0;
  for (const match of text.matchAll(FENCE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(...splitBare(text.slice(last, start)));
    out.push({ kind: "openui", code: match[1].trim() });
    last = start + match[0].length;
  }
  if (last < text.length) out.push(...splitBare(text.slice(last)));
  return out.filter((s) => s.kind === "openui" ? s.code.length > 0 : s.text.trim().length > 0);
}

export function hasOpenUiBlock(text: string): boolean {
  return splitOpenUiBlocks(text).some((s) => s.kind === "openui");
}
