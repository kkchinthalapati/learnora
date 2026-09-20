/* Which *kind* of practice the next hour should be.
 *
 * `trajectory.ts` already answers "which topic is the next hour worth the
 * most on". It says nothing about what to do with that hour, and Today acted
 * on the gap by handing the student a stopwatch: "Study Hydrolysis next",
 * then a 45-minute timer and no further instruction. A Grade 9 student who
 * did not know how to revise hydrolysis before pressing Start does not know
 * after it either, and the block gets spent rereading.
 *
 * So this maps a topic's state onto one of the tools the app already has.
 * The ordering is the point: it walks from "we have not measured this" up to
 * "they know it well enough to teach it", and each rung has one reason.
 *
 * Deliberately pure and URL-only. Every destination it can name reads its
 * topic off the query string, so nothing here has to touch CognitiveBridge
 * or the timer, and the whole thing is testable without a router. */

import { INTERVENTION_BLOCK_MINS } from "./trajectory";

/** Below this, `mastery` is a guess rather than a measurement — the honest
 *  next step is the one that produces evidence, not one that acts on it. */
export const LOW_EVIDENCE = 0.35;
/** Below this, the student is getting the topic wrong, not merely rusty.
 *  Drilling cards at that point rehearses the misunderstanding. */
export const SHAKY_MASTERY = 0.45;
/** At or above this, the remaining doubt is usually in the explanation
 *  rather than the recall. */
export const SOLID_MASTERY = 0.65;

export type StudyMethod = "block" | "solve" | "review" | "teach";

export interface NextStepInput {
  /** The topic's display name, e.g. "Hydrolysis". */
  label: string;
  /** The deck behind the topic — `Intervention.topicId`. */
  topicId: string;
  /** 0-1, what we believe they know. */
  mastery: number;
  /** 0-1, how much we trust `mastery`. */
  evidence: number;
  /** Cards in this topic's deck that SRS says are due now. */
  dueCards: number;
}

export interface NextStep {
  method: StudyMethod;
  /** The primary action's words. Imperative, and it names the topic. */
  action: string;
  /** Why this method and not another, in one sentence the student can argue
   *  with. Shown under the action. */
  why: string;
  /** Where the action goes, or `null` for the timed block — that one seeds
   *  the timer rather than navigating, which only the caller can do. */
  to: string | null;
}

export function chooseNextStep({
  label,
  topicId,
  mastery,
  evidence,
  dueCards,
}: NextStepInput): NextStep {
  const topic = encodeURIComponent(label);

  if (evidence < LOW_EVIDENCE) {
    return {
      method: "block",
      action: `Start ${INTERVENTION_BLOCK_MINS} min on ${label}`,
      why: `Nothing has measured ${label} yet. The block ends with a four-question check, so the next step after it is based on what you actually know.`,
      to: null,
    };
  }

  if (mastery < SHAKY_MASTERY) {
    return {
      method: "solve",
      action: `Find what's missing in ${label}`,
      why: `You are getting ${label} wrong rather than forgetting it, so more cards would just rehearse the same mistake. The Solver works backwards to the step you are missing.`,
      to: `/solver?topic=${topic}`,
    };
  }

  if (dueCards > 0) {
    return {
      method: "review",
      action: `Review ${dueCards} due ${dueCards === 1 ? "card" : "cards"} in ${label}`,
      why: `You know ${label}; it is the recall that slips. Pulling the answers back out of memory holds them far longer than rereading them.`,
      to: `/review/${encodeURIComponent(topicId)}`,
    };
  }

  if (mastery >= SOLID_MASTERY) {
    return {
      method: "teach",
      action: `Explain ${label} in your own words`,
      why: `${label} is solid enough that recall is no longer the test. Explaining it to someone who keeps asking "but why" is what exposes the parts you have not really got.`,
      to: `/feynman?topic=${topic}`,
    };
  }

  return {
    method: "block",
    action: `Start ${INTERVENTION_BLOCK_MINS} min on ${label}`,
    why: `${label} is half-built and nothing is due on it, so the useful thing is time on the material — with a check at the end to see what moved.`,
    to: null,
  };
}
