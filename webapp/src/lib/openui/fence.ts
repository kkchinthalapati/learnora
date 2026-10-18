/* How OpenUI Lang rides inside an ordinary chat reply (fence handling only —
 * kept apart from the library so importing it does not pull in the renderer).
 *
 * The Ask drawer's reply is Markdown with action tags and fenced mermaid/svg
 * blocks. Rather than replace that with an all-OpenUI reply (which would put
 * the action tags, flashcard detection and history replay at risk), the model
 * may add ```openui fenced blocks for structured content — the same
 * convention DIAGRAMS already uses. Everything outside a block stays
 * Markdown, and a block that fails to parse falls back to a visible notice,
 * never to silence (see components/chat/OpenUiBlock). */

export type ReplySegment =
  | { kind: "text"; text: string }
  | { kind: "openui"; code: string };

const FENCE = /```openui[ \t]*\r?\n([\s\S]*?)```/g;

/** Splits a reply into Markdown runs and OpenUI Lang blocks, in order. An
 *  unterminated fence is left as text: the reply is complete by the time it
 *  is displayed, so a fence that never closes is a malformed reply, not a
 *  stream in progress. */
export function splitOpenUiBlocks(text: string): ReplySegment[] {
  const out: ReplySegment[] = [];
  let last = 0;
  for (const match of text.matchAll(FENCE)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    out.push({ kind: "openui", code: match[1].trim() });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

export function hasOpenUiBlock(text: string): boolean {
  return /```openui[ \t]*\r?\n/.test(text);
}
