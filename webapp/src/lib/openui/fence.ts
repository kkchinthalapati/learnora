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

/* Some models wrap the program in XML-style tags instead of a fence
   (audit F-02: a literal <openui> showed in a tutor reply). Read them as a
   fence, closing tag optional like the fence's. */
const TAG_OPEN = /<openui(?:[-_ ]?lang)?>[ \t]*\r?\n?/gi;
const TAG_CLOSE = /\r?\n?[ \t]*<\/openui(?:[-_ ]?lang)?>/gi;

/* A top-level assignment: one that starts at the margin. Arguments that
   wrap onto later lines are indented or start with a bracket. */
const TOP_LEVEL = /^([A-Za-z_]\w*)[ \t]*=/gm;
const IDENT = /[A-Za-z_]\w*/g;

function assignedNames(code: string): string[] {
  return [...code.matchAll(TOP_LEVEL)].map((m) => m[1]);
}

/* Models often split ONE program across several fences: each card in its
   own block next to its prose, and `root = Stack([...])` in a block of its
   own (audit F-03: "couldn't be drawn" twice in one set of notes). Alone,
   each block has no root, or a root naming cards it does not hold, so none
   could be drawn. Give a rootless block a root over its own cards, and drop
   a root-only block whose cards are all drawn by the other blocks. */
function completePrograms(segments: ReplySegment[]): ReplySegment[] {
  const blocks = segments.filter((s) => s.kind === "openui");
  const elsewhere = new Set<string>();
  for (const b of blocks) {
    for (const n of assignedNames(b.code)) if (n !== "root") elsewhere.add(n);
  }
  return segments.flatMap((s): ReplySegment[] => {
    if (s.kind !== "openui") return [s];
    const names = assignedNames(s.code);
    if (names.length === 0) return [s];
    if (!names.includes("root")) {
      /* Only the cards nothing else in the block already holds. */
      const used = (n: string) => (s.code.match(new RegExp(`\\b${n}\\b`, "g")) ?? []).length > 1;
      const top = names.filter((n) => !used(n));
      return [{ kind: "openui", code: `root = Stack([${(top.length ? top : names).join(", ")}])\n${s.code}` }];
    }
    if (names.length === 1) {
      const refs = [...s.code.matchAll(IDENT)]
        .map((m) => m[0])
        .filter((n) => n !== "root" && n !== "Stack");
      if (refs.length > 0 && refs.every((n) => elsewhere.has(n))) return [];
    }
    return [s];
  });
}

/** Splits a reply into Markdown runs and OpenUI Lang blocks, in order. */
export function splitOpenUiBlocks(raw: string): ReplySegment[] {
  const text = raw.replace(TAG_OPEN, "\n```openui\n").replace(TAG_CLOSE, "\n```");
  const out: ReplySegment[] = [];
  let last = 0;
  for (const match of text.matchAll(FENCE)) {
    const start = match.index ?? 0;
    if (start > last) out.push(...splitBare(text.slice(last, start)));
    out.push({ kind: "openui", code: match[1].trim() });
    last = start + match[0].length;
  }
  if (last < text.length) out.push(...splitBare(text.slice(last)));
  return completePrograms(
    out.filter((s) => (s.kind === "openui" ? s.code.length > 0 : s.text.trim().length > 0)),
  );
}

export function hasOpenUiBlock(text: string): boolean {
  return splitOpenUiBlocks(text).some((s) => s.kind === "openui");
}
