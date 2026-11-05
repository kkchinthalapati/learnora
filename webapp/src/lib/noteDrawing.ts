/* A drawing for a generated note that came back without one.
 *
 * The notes prompt asks for a diagram wherever a section describes a process,
 * a cycle, a structure or a graph, and models mostly don't: on 2026-11-04,
 * 3 of the last 23 production notes had one. When a note has none, notes
 * generation asks once for a drawing of the section that most needs it,
 * through the same request "Draw this section" makes, grounded in that
 * section's own text. This file is the pure half: which section, and where
 * the drawing goes. */

export interface DrawableSection {
  heading: string;
  /** The section's own text, for the drawing request to work from. */
  body: string;
  /** Line index the drawing is inserted before (the next heading, or the end). */
  insertAt: number;
}

/** Words that say a section is a shape or a sequence rather than a list of
 *  facts: what a labelled diagram teaches best. */
const DRAWABLE =
  /\b(process|cycle|stages?|steps?|structure|parts?|layers?|diagram|circuits?|graphs?|axes|pathway|flow|system|cell|organ|anatomy|reactions?|apparatus|set-?up|model|forces?|waves?|orbits?|map|timeline|sequence|life ?cycle|how .{0,30} works?)\b/i;

/** Notes shorter than this are a quick summary; a drawing would crowd them. */
const MIN_NOTE_CHARS = 800;

export function hasDrawing(markdown: string): boolean {
  return /```(?:svg|mermaid)\b/i.test(markdown);
}

/** The ### or #### section a drawing would help most, or null when the note is
 *  short, already has a drawing, or has no section that reads as drawable. */
export function pickDrawableSection(markdown: string): DrawableSection | null {
  if (markdown.length < MIN_NOTE_CHARS || hasDrawing(markdown)) return null;
  const lines = markdown.split("\n");
  const sections: (DrawableSection & { score: number })[] = [];
  let inFence = false;
  let current: { heading: string; start: number } | null = null;

  const close = (end: number) => {
    if (!current) return;
    const body = lines.slice(current.start + 1, end).join("\n").trim();
    const headingHit = DRAWABLE.test(current.heading) ? 2 : 0;
    const bodyHits = (body.match(new RegExp(DRAWABLE.source, "gi")) ?? []).length;
    const score = headingHit + Math.min(bodyHits, 3);
    if (body.length > 120 && score > 0) {
      // Before trailing blank lines, so the drawing sits under the prose.
      let insertAt = end;
      while (insertAt > current.start + 1 && lines[insertAt - 1].trim() === "") insertAt--;
      sections.push({ heading: current.heading, body, insertAt, score });
    }
    current = null;
  };

  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    if (inFence) return;
    const heading = /^#{3,4}\s+(.+)$/.exec(line);
    if (heading) {
      close(i);
      current = {
        heading: heading[1].replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "").replace(/[*_`]/g, "").trim(),
        start: i,
      };
    } else if (/^##\s/.test(line)) {
      close(i);
    }
  });
  close(lines.length);

  if (!sections.length) return null;
  const best = sections.reduce((a, b) => (b.score > a.score ? b : a));
  return { heading: best.heading, body: best.body, insertAt: best.insertAt };
}

/** The note with the drawing placed at the end of its section's prose. */
export function insertDrawing(markdown: string, section: DrawableSection, svg: string): string {
  const lines = markdown.split("\n");
  lines.splice(section.insertAt, 0, "", "```svg", svg.trim(), "```");
  return lines.join("\n");
}
