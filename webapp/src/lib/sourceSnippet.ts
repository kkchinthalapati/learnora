/* A web result's snippet, trimmed for a source card.
 *
 * The search API hands back raw page extracts: several passages joined by
 * "[...]", Markdown headings ("## Want to join the conversation?"), and on
 * some sites the comment thread under the article. Shown whole, a card was
 * ~600 characters of that. The first passage is the one the search matched
 * on, so it is kept, cleaned, and cut at a word near MAX. */
const MAX = 220;

export function sourceSnippet(raw: string | undefined): string {
  if (!raw) return "";
  const first = raw.split(/\s*\[\.\.\.\]\s*|\s#{1,6}\s/)[0] ?? "";
  const clean = first
    .replace(/#{1,6}\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= MAX) return clean;
  const cut = clean.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > MAX * 0.6 ? lastSpace : MAX).replace(/[,;:.\s]+$/, "")}…`;
}
