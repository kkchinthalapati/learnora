import { fenceUntrusted } from "../../lib/actionTags";
import type { Flashcard } from "../../api/types";

/** Ports the AI-grading prompt from js/router.js:723-734, verbatim apart from
 *  the fencing: a card's front and back are model-generated text the app is
 *  about to interpolate into its own prompt, so a deck carrying
 *  `<ADD_TASK>…</ADD_TASK>` on a card must not be able to steer the reply.
 *  The student's own answer is fenced for the same reason.
 *
 *  In its own module rather than beside the component so the review view can
 *  stay a components-only file (fast refresh) and so the prompt is testable
 *  without rendering anything. */
export function buildGradingPrompt(card: Flashcard, answer: string): string {
  return `Grade my flashcard answer.
Front: ${fenceUntrusted(card.front)}
Correct Back: ${fenceUntrusted(card.back)}
My Answer: ${fenceUntrusted(answer)}

Based on how close I am, issue a <GRADE_FLASHCARD>X</GRADE_FLASHCARD> command where X is:
1 = Again (completely wrong)
2 = Hard (partially right)
3 = Good (mostly right)
4 = Easy (perfect)
Also provide a short 1-sentence feedback.`;
}
