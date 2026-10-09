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

import { newSessionHref } from "./sessionModes";
import { KM, type TopicKnowledge } from "./knowledgeModel";

/** Below this, `mastery` is a guess rather than a measurement — the honest
 *  next step is the one that produces evidence, not one that acts on it. */
export const LOW_EVIDENCE = 0.35;
/** Below this nothing has been checked at all — the mastery ladder's own
 *  "Not started" line (lib/mastery MIN_EVIDENCE). */
export const NO_EVIDENCE = 0.05;
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
  /** What answered questions say (lib/knowledgeModel.ts). When present it
   *  decides the method; the card-and-score figures are the fallback. */
  knowledge?: TopicKnowledge | null;
  /** The topic's first syllabus prerequisite, with what is known of it. */
  prerequisite?: { label: string; knowledge?: TopicKnowledge | null } | null;
}

/** Below this belief in a prerequisite, practising what builds on it is
 *  practising on sand (research/learning-engine-architecture.md §E). */
export const SHAKY_PREREQUISITE = 0.5;

/** The method when answered questions are the evidence: by the knowledge
 *  model's status, with a shaky prerequisite taking precedence. Null when
 *  there is nothing answered to go on. */
function fromKnowledge(
  label: string,
  knowledge: TopicKnowledge | null | undefined,
  prerequisite: NextStepInput["prerequisite"],
): NextStep | null {
  const pre = prerequisite?.knowledge;
  if (prerequisite && pre && pre.counted > 0 && pre.p < SHAKY_PREREQUISITE && !(knowledge && knowledge.p >= SOLID_MASTERY)) {
    return {
      method: "solve",
      action: `Shore up ${prerequisite.label} first`,
      why: `${label} builds on ${prerequisite.label}, and your answers there show it isn't secure yet. Fixing the foundation first makes ${label} quicker to learn.`,
      to: newSessionHref("explain", { topic: prerequisite.label }),
    };
  }
  if (!knowledge || knowledge.counted === 0) return null;

  if (knowledge.status === "learning" && knowledge.p < 0.4) {
    return {
      method: "solve",
      action: `Learn ${label} step by step`,
      why: `Your answers on ${label} so far show it isn't there yet. A worked explanation, then guided problems, does more now than more questions on their own.`,
      to: newSessionHref("explain", { topic: label }),
    };
  }
  if (knowledge.status === "learning") {
    const n = knowledge.rightItems;
    return {
      method: "block",
      action: `Practise ${label}`,
      why: `${label} is half-built: ${n} different question${n === 1 ? "" : "s"} right so far. More checked problems, each a new one, are what move it.`,
      to: newSessionHref("practice", { topic: label }),
    };
  }
  if (knowledge.status === "fragile") {
    return knowledge.rightApply === 0
      ? {
          method: "block",
          action: `Apply ${label} to new problems`,
          why: `You can recall ${label}, but nothing has checked you can use it on a problem you haven't seen. That is what the exam asks.`,
          to: newSessionHref("practice", { topic: label }),
        }
      : {
          method: "review",
          action: `Check ${label} again on another day`,
          why: `It went well, but all on one day. A right answer after a gap is what shows it has stuck.`,
          to: newSessionHref("recall", { topic: label }),
        };
  }
  if (knowledge.fading || knowledge.p < KM.secureP) {
    return {
      method: "review",
      action: `Quick check on ${label}`,
      why: `You had ${label} secure, and it is starting to slip. A short check now holds it far longer than relearning it later.`,
      to: newSessionHref("recall", { topic: label }),
    };
  }
  return {
    method: "teach",
    action: `Explain ${label} in your own words`,
    why: `${label} is secure: right on different questions, on different days, including applying it. Explaining it is what exposes anything left.`,
    to: newSessionHref("teach", { topic: label }),
  };
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
  knowledge,
  prerequisite,
}: NextStepInput): NextStep {
  const fromAnswers = fromKnowledge(label, knowledge, prerequisite);
  if (fromAnswers) return fromAnswers;

  if (evidence < LOW_EVIDENCE) {
    /* Two cases the old line merged: nothing at all, and a little. It said
       "Nothing has measured Enzymes yet" beside a Progress ladder showing
       Enzymes measured, because the ladder counts any check and this
       threshold is higher. */
    const nothing = evidence < NO_EVIDENCE;
    return {
      method: "block",
      action: `Practise ${label}`,
      why: nothing
        ? `Nothing has measured ${label} yet. A few checked problems will show where you are, so the next step is based on what you actually know.`
        : `Only a little has measured ${label} so far. A few more checked problems will make the next step much surer.`,
      to: newSessionHref("practice", { topic: label }),
    };
  }

  if (mastery < SHAKY_MASTERY) {
    return {
      method: "solve",
      action: `Find what's missing in ${label}`,
      why: `You are getting ${label} wrong rather than forgetting it, so more cards would just rehearse the same mistake. An Explain session works back to the step you are missing.`,
      to: newSessionHref("explain", { topic: label }),
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
      to: newSessionHref("teach", { topic: label }),
    };
  }

  /* This used to start a 45-minute timer and nothing else: the student
     landed on the timer page with a clock running and no material, and Today
     offered the same block again afterwards because time alone measured
     nothing. A Practice session is problems on the topic, each one a check
     that the forecast reads. The timed block stays one click away on Today. */
  return {
    method: "block",
    action: `Practise ${label}`,
    why: `${label} is half-built and nothing is due on it, so the useful thing is working problems on it — each one checked, so the next step is based on what you actually know.`,
    to: newSessionHref("practice", { topic: label }),
  };
}
