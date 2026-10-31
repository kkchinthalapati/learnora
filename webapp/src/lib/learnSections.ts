/* Learn (views/lesson/LearnPanel) teaches a lesson one section at a time, and
 * the sections are the lesson's own notes: NOTES_INSTRUCTIONS asks for a "##"
 * title and then "###" sections, so those headings are the lesson's outline.
 * Teaching from the notes, not from a search of everything the student has
 * saved, keeps every step about this lesson and nothing else. */

export interface LearnSection {
  /** Stable for the same notes: the position and the heading. */
  key: string;
  title: string;
  body: string;
}

/** More than this and the lesson is a textbook chapter; the rest is merged
 *  into the last section rather than dropped, so nothing goes untaught. */
export const MAX_SECTIONS = 8;

/** What one section may send to the model. Notes sections are short; this
 *  only stops a pasted chapter with no headings becoming one huge prompt. */
const MAX_BODY_CHARS = 3500;

const EMOJI = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu;

function cleanHeading(raw: string): string {
  return raw.replace(EMOJI, "").replace(/[*_=`#]/g, "").replace(/\s+/g, " ").trim();
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "section";
}

/* Headings at `marker` ("###" or "##") split the notes; text before the first
   one is the welcome and is left out. */
function splitAt(markdown: string, marker: "##" | "###"): Array<{ title: string; body: string }> {
  const heading = new RegExp(`^${marker}\\s+(.+)$`, "gm");
  const starts = [...markdown.matchAll(heading)];
  return starts
    .map((match, i) => {
      const from = (match.index ?? 0) + match[0].length;
      const to = starts[i + 1]?.index ?? markdown.length;
      return { title: cleanHeading(match[1]), body: markdown.slice(from, to).trim() };
    })
    .filter((s) => s.title.length > 0 && s.body.replace(/[#\s>*_-]/g, "").length > 20);
}

/** The lesson's outline, from its notes. Empty when there is nothing to teach
 *  from. */
export function learnSections(markdown: string): LearnSection[] {
  const text = markdown.trim();
  if (!text) return [];
  let parts = splitAt(text, "###");
  /* Notes written before the "###" convention, or edited by hand. The first
     "##" is the title, so a single "##" gives no outline. */
  if (parts.length === 0) {
    const level2 = splitAt(text, "##");
    parts = level2.length > 1 ? level2 : [];
  }
  if (parts.length === 0) {
    const body = text.replace(/^#{1,4}\s+.*$/gm, "").trim();
    const title = cleanHeading(/^#{1,4}\s+(.+)$/m.exec(text)?.[1] ?? "") || "The main idea";
    parts = body.length > 20 ? [{ title, body }] : [];
  }
  if (parts.length > MAX_SECTIONS) {
    const kept = parts.slice(0, MAX_SECTIONS - 1);
    const rest = parts.slice(MAX_SECTIONS - 1);
    kept.push({
      title: rest[0].title,
      body: rest.map((p, i) => (i === 0 ? p.body : `### ${p.title}\n${p.body}`)).join("\n\n"),
    });
    parts = kept;
  }
  return parts.map((p, i) => ({
    key: `${i}-${slug(p.title)}`,
    title: p.title,
    body: p.body.slice(0, MAX_BODY_CHARS),
  }));
}
