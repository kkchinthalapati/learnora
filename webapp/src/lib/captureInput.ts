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

/* "i want to learn photosynthesis" became the lesson's title, and was then
   quoted back in tutor chips ("Explain the main idea of 'i want to learn
   photosynthesis'"), audit F-08. The request's lead-in is not the topic. */
const TOPIC_LEAD_IN =
  /^(?:(?:hi|hey|hello|please|pls|ok|okay)[,!.]?\s+)*(?:(?:i\s+(?:want|need|would\s+like|'d\s+like)\s+to\s+(?:learn|know|understand|study|revise|review)|(?:can|could)\s+you\s+(?:teach|explain|help)(?:\s+me)?|teach\s+me|explain|help\s+me\s+(?:with|understand|learn|study|revise)|learn|study|revise|tell\s+me)(?:\s+(?:about|on))?\s+)?(?:the\s+(?:basics|topic)\s+of\s+)?/i;

/** A lesson title for a typed topic: the request's lead-in and trailing
 *  punctuation dropped, the first letter capitalised. Falls back to the
 *  topic as typed when nothing would be left. */
export function topicTitle(topic: string): string {
  const typed = topic.trim().replace(/\s+/g, " ");
  const core = typed.replace(TOPIC_LEAD_IN, "").replace(/[\s.?!,;:]+$/, "").trim();
  const title = core || typed;
  return title.charAt(0).toUpperCase() + title.slice(1);
}

const NOTES_TITLE_MAX = 60;

/** A lesson title for pasted notes that came with none: their first line,
 *  heading and list markers dropped, cut at the first sentence or, failing
 *  that, at a word. Pasted notes were filed as "Web Link" (the link
 *  source's default) and so was every card set made from them. */
export function notesTitle(text: string): string {
  const firstLine =
    text
      .split("\n")
      .map((line) => line.replace(/^[\s#>*\-–•\d.)]+/, "").trim())
      .find((line) => /[\p{L}\p{N}]/u.test(line)) ?? "";
  let title = firstLine.replace(/\s+/g, " ").replace(/[*_`]+/g, "");
  if (title.length > NOTES_TITLE_MAX) {
    const sentence = title.slice(0, NOTES_TITLE_MAX + 1).match(/^(.{12,}?)[.?!:](?:\s|$)/);
    if (sentence) title = sentence[1];
    else {
      const cut = title.slice(0, NOTES_TITLE_MAX);
      const lastSpace = cut.lastIndexOf(" ");
      title = `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:–-]+$/, "")}…`;
    }
  }
  title = title.replace(/[\s.,;:]+$/, "").trim();
  if (!title) return "Pasted notes";
  return title.charAt(0).toUpperCase() + title.slice(1);
}
