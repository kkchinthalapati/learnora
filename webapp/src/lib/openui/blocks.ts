/* The OPENUI CARDS prompt section. Separate from fence.ts because it needs
 * the component library, and with it the renderer and Zod; callers load this
 * file only when the `openUi` flag is on. */

import { askLibrary, guideLibrary } from "./library";

const EXAMPLE = `root = Stack([k, w, t, q, f])
k = Callout("key", "A catalyst speeds up a reaction without changing where equilibrium sits.")
w = WorkedExample("Find the rate when k = 0.5 and [A] = 4 for a first-order reaction.", ["First order means rate = k[A].", "Substitute: rate = 0.5 × 4."], "rate = 2 mol dm$^{-3}$ s$^{-1}$")
t = KeyTerms("Words to know", [["Activation energy", "The minimum energy needed for a collision to react."], ["Catalyst", "Speeds a reaction up and is not used up."]])
q = MiniQuiz("What does a catalyst change?", ["The equilibrium position", "How fast equilibrium is reached", "The enthalpy change"], 1, "It speeds up both directions equally, so equilibrium arrives sooner but does not move.")
f = FollowUps(["Quiz me on this", "Show a harder example"])`;

const GUIDE_EXAMPLE = `root = Stack([t, k, w, c])
t = KeyTerms("Words to know", [["Activation energy", "The minimum energy needed for a collision to react."], ["Catalyst", "Speeds a reaction up and is not used up."]])
k = Callout("key", "A catalyst speeds up a reaction without changing where equilibrium sits.")
w = WorkedExample("Find the rate when k = 0.5 and [A] = 4 for a first-order reaction.", ["First order means rate = k[A].", "Substitute: rate = 0.5 × 4."], "rate = 2")
c = CompareTable(["", "Without catalyst", "With catalyst"], [["Activation energy", "High", "Lower"], ["Rate", "Slow", "Faster"]])`;

function referenceFor(library: typeof askLibrary, example: string): string {
  const body = library.prompt({
    preamble:
      "OpenUI Lang describes a small interface built from the components below.",
    additionalRules: [
      "Use the fewest components that help; one or two is typical.",
      "Text fields are plain text; TeX goes in $…$. No Markdown or HTML inside them.",
    ],
    examples: [example],
  });
  return `Everything between the dashes below describes the language and the components available.
-----
${body}
-----`;
}

/** The language and component reference alone, for callers that set their
 *  own rules about when and how cards are used. Built once; the library is a
 *  module constant. */
let reference: string | null = null;
export function openUiReference(): string {
  return (reference ??= referenceFor(askLibrary, EXAMPLE));
}

/** The reference for a note's study guide: no quiz, flashcard or follow-up
 *  components, which are not part of the notes process. */
let guideReference: string | null = null;
export function studyGuideReference(): string {
  return (guideReference ??= referenceFor(guideLibrary, GUIDE_EXAMPLE));
}

/** The section that lets generated notes carry cards. Notes stay Markdown
 *  (the editor's source of truth); a card sits inside a section as a fenced
 *  openui block and the notes editor draws it (lib/noteFormats.ts). */
let notesCached: string | null = null;
export function notesCardSection(): string {
  return (notesCached ??= `CARDS IN NOTES:
- The notes stay Markdown, written exactly as asked above. Inside a section, after its prose, you may add ONE fenced code block whose language is openui (three backticks, the word openui, the OpenUI Lang program, three backticks). The app draws it as a card in the student's notes.
- Use a card only where structure teaches better than prose: KeyTerms for the vocabulary a section introduces, WorkedExample for a calculation or a method with numbers, Steps for a process, Timeline for a sequence of events, CompareTable for ideas that are easily confused, BarChart only for numbers the material itself gives, Accordion for optional extra depth.
- Do not use Callout cards in notes: keep using the "> **Key idea:**" / "> **Definition:**" / "> **Common mistake:**" lines for those.
- Aim for two to five cards across the whole note, never more than one per section. A very short note needs none.
- Diagrams: where a process, a cycle, a sequence or a labelled structure is clearer as a picture, add ONE fenced code block whose language is svg after that section's prose: a single <svg viewBox="0 0 640 420" xmlns="http://www.w3.org/2000/svg"> element with a <title>, stroke and fill set to currentColor, labels at font-size 15 or larger, and only these elements: g, defs, title, desc, path, line, polyline, polygon, rect, circle, ellipse, text, tspan, marker. Use at most one diagram per note section and two per note, and skip diagrams for simple lists or facts.
- The prose must stand on its own: never put a fact only in a card. Use only what the material says.
- No quiz questions, flashcards or follow-up chips. Quizzes and flashcards are made elsewhere in the app.

${studyGuideReference()}`);
}

/** The full section for conversational replies: when to use cards, then the
 *  reference. */
let cached: string | null = null;
export function openUiPromptSection(): string {
  if (cached) return cached;
  cached = `ANSWER STYLE (how to write replies in this app):
- Write like an excellent tutor in a clean, modern interface: the answer first, then structure that makes it easy to learn from. Open with the direct answer in one to three sentences of Markdown. Never open with a greeting, a restatement of the question or "Great question".
- When the student is learning something (an explanation, a method, a comparison, a worked problem, revision, "what is / why / how"), follow the opening with ONE fenced code block whose language is openui (three backticks, the word openui, the OpenUI Lang program, three backticks). The app draws it as cards. For a chatty line, a quick factual answer, an app action (tasks, timers, exams), or when the student asks for something plain, reply in Markdown alone.
- Cards are how you teach, not decoration. Pick the cards that fit THIS answer:
  - a definition or the one idea to remember: Callout; a trap students fall into: Callout "mistake"
  - a calculation or problem: WorkedExample with every step and its reason; the final answer stated with units
  - several terms: KeyTerms; a process in order: Steps; a sequence over time: Timeline
  - two or more things contrasted: CompareTable; real numbers you know: BarChart
  - optional extra depth: Accordion
  - to test understanding: one MiniQuiz (a single-best-answer question whose wrong options are the real misconceptions); to revise: Flashcards
  - finish with FollowUps (2–3 natural next steps, written as the student would say them) when there is one.
- Use as many cards as the answer needs and no more: usually two to five. A short answer might be one Callout; a big topic can use six.
- Accuracy and reasoning come first. Cards never replace thinking: say why, not just what; show the working; name the misconception when you know it; admit uncertainty plainly. Never invent a number, source or fact to fill a card. If the student set a short answer length, keep the opening to one sentence and use one or two cards.
- Keep the Markdown around the block brief and non-repetitive: do not say again in prose what a card already shows. Never put action tags inside the block, and never mention the block, cards or the word "openui" to the student.

${openUiReference()}`;
  return cached;
}
