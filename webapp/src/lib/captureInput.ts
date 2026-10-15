/* The capture bar has one field. What a student types or pastes into it is
 * read here: a link becomes a link source, a paragraph or more becomes pasted
 * notes, and anything shorter is a topic to learn. Pure, so the rules are
 * testable without rendering the bar. */

export type CaptureGuess =
  | { kind: "empty" }
  | { kind: "link"; url: string }
  | { kind: "text"; text: string }
  | { kind: "topic"; topic: string };

/* The Create panel refuses pasted text under 50 characters as too short to
   study from; past this length a line is notes, not a topic. */
export const NOTES_MIN_CHARS = 50;
const TOPIC_MAX_CHARS = 140;

function asLink(raw: string): string | null {
  if (/\s/.test(raw)) return null;
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function guessCapture(input: string): CaptureGuess {
  const raw = input.trim();
  if (!raw) return { kind: "empty" };

  const url = asLink(raw);
  if (url) return { kind: "link", url };

  const multiLine = raw.includes("\n");
  if (
    raw.length > TOPIC_MAX_CHARS ||
    (multiLine && raw.length >= NOTES_MIN_CHARS)
  ) {
    return { kind: "text", text: raw };
  }
  return { kind: "topic", topic: raw.replace(/\s+/g, " ") };
}
