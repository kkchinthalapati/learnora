/* =========================================================================
   SECTION-BALANCED SOURCE EXCERPTS

   Decks and quizzes are written from a material's notes, cut to a budget so
   the request fits the tightest free-tier provider. The cut used to be
   `notes.substring(0, budget)`: the first 6,000 characters. On a long
   chapter that is the first few sections, so every card and every question
   came from the opening of the material and the rest was never tested — a
   student revising a whole topic got a quiz on its introduction.

   `sectionExcerpt` keeps the same budget but spends it across the whole
   document. Notes are split at their headings (or, with none, into runs of
   paragraphs); a section shorter than its fair share is kept whole and the
   saving goes to the longer ones, which are each cut at a sentence or
   paragraph boundary. Every heading survives, so the model can see the
   shape of the whole material, and a bracketed line tells it the text was
   shortened and to spread its questions across all of it.

   Pure and synchronous: no extra model call, no change in request size.
   ========================================================================= */

interface Section {
  heading: string;
  body: string;
}

/** Below this a section's share is too small to carry a usable sentence, so
 *  the excerpt falls back to the first sections that fit whole. */
const MIN_SHARE = 160;

/** Paragraph runs used as sections when the notes have no headings. */
const PARAGRAPH_GROUP_CHARS = 1200;

const SHORTENED_NOTE =
  "[This material was shortened to fit. Every section is kept, the longer ones in part. Spread the cards or questions across all of the sections, not just the first.]";

export function splitSections(
  markdown: string,
  groupChars = PARAGRAPH_GROUP_CHARS,
): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let current: Section = { heading: "", body: "" };
  for (const line of lines) {
    if (/^#{1,4}\s/.test(line)) {
      if (current.heading || current.body.trim()) sections.push(current);
      current = { heading: line, body: "" };
    } else {
      current.body += (current.body ? "\n" : "") + line;
    }
  }
  if (current.heading || current.body.trim()) sections.push(current);

  if (sections.length > 1) return sections.map((s) => ({ ...s, body: s.body.trim() }));

  // No headings: group paragraphs so the budget still spans the document.
  const paragraphs = markdown.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const groups: Section[] = [];
  let body = "";
  for (const paragraph of paragraphs) {
    if (body && body.length + paragraph.length > groupChars) {
      groups.push({ heading: "", body });
      body = "";
    }
    body += (body ? "\n\n" : "") + paragraph;
  }
  if (body) groups.push({ heading: "", body });
  return groups;
}

/** Cuts `text` to at most `max` characters at the last paragraph, sentence
 *  or word boundary, marking the cut with an ellipsis. */
export function cutAtBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = Math.max(0, max - 1);
  // One character past the room, so a sentence ending exactly there counts.
  const head = text.slice(0, room + 1);
  const floor = room * 0.5;

  const paragraph = head.lastIndexOf("\n\n", room);
  if (paragraph >= floor) return head.slice(0, paragraph).trimEnd() + "…";

  let sentence = -1;
  for (const match of head.matchAll(/[.!?](?=\s)/g)) {
    if (match.index < room) sentence = match.index;
  }
  if (sentence >= floor) return head.slice(0, sentence + 1) + "…";

  const word = head.lastIndexOf(" ", room);
  if (word >= floor) return head.slice(0, word).trimEnd() + "…";
  return text.slice(0, room).trimEnd() + "…";
}

function render(section: Section, body: string): string {
  return [section.heading, body].filter(Boolean).join("\n");
}

/** The notes cut to `max` characters with every section represented. Text
 *  already within budget is returned untouched. */
export function sectionExcerpt(markdown: string, max: number): string {
  if (markdown.length <= max) return markdown;

  const budget = max - SHORTENED_NOTE.length - 2;
  let sections = splitSections(markdown);
  /* Without headings the grouping is ours to choose, so choose few enough
     runs that each gets a usable share rather than falling back to the
     head of the document. */
  if (sections.every((s) => !s.heading)) {
    const groups = Math.max(2, Math.floor(budget / (MIN_SHARE * 2.5)));
    sections = splitSections(markdown, Math.max(PARAGRAPH_GROUP_CHARS, Math.ceil(markdown.length / groups)));
  }
  // Headings and the blank lines between sections are paid for first.
  const fixed = sections.reduce((n, s) => n + (s.heading ? s.heading.length + 1 : 0), 0) +
    (sections.length - 1) * 2;
  let remaining = budget - fixed;

  if (sections.length < 2 || remaining / sections.length < MIN_SHARE) {
    // Too many sections to give each a sentence: keep whole sections in
    // order, then the headings of the rest so the model knows they exist.
    const kept: string[] = [];
    let used = 0;
    let index = 0;
    for (; index < sections.length; index++) {
      const block = render(sections[index], sections[index].body);
      if (used + block.length + 2 > budget * 0.8) break;
      kept.push(block);
      used += block.length + 2;
    }
    const rest = sections.slice(index).map((s) => s.heading).filter(Boolean);
    let tail = rest.length ? `Also covered (not shown in full):\n${rest.join("\n")}` : "";
    tail = cutAtBoundary(tail, Math.max(0, budget - used - 2));
    if (!kept.length) kept.push(cutAtBoundary(markdown, budget - tail.length - 2));
    return [SHORTENED_NOTE, ...kept, tail].filter(Boolean).join("\n\n").slice(0, max);
  }

  // Water-filling: short sections are kept whole, the rest share what's left.
  const allowance = new Array<number>(sections.length).fill(0);
  let open = sections.map((_, i) => i);
  while (open.length) {
    const share = Math.floor(remaining / open.length);
    const fits = open.filter((i) => sections[i].body.length <= share);
    if (!fits.length) {
      for (const i of open) allowance[i] = share;
      break;
    }
    for (const i of fits) {
      allowance[i] = sections[i].body.length;
      remaining -= sections[i].body.length;
    }
    open = open.filter((i) => !fits.includes(i));
  }

  const blocks = sections.map((s, i) => render(s, cutAtBoundary(s.body, allowance[i])));
  return [SHORTENED_NOTE, ...blocks].join("\n\n").slice(0, max);
}
