/* What a wrong answer most likely means — and how sure we can be.
 *
 * A false "you believe X" is worse than saying nothing (see the catalogue's
 * own header), so this reads every signal an answer carries before the
 * mistake loop writes anything to the ledger:
 *
 *   signal                                         reading            ledger
 *   ───────────────────────────────────────────────────────────────────────────
 *   named belief + "certain"                       misconception       critical
 *   named belief + "fairly" / not rated            misconception       moderate
 *   named belief + "guess"                         weak misconception  minor
 *   no named belief, topic secure, quick,          possible slip       nothing
 *     not a guess
 *   no named belief, 2nd miss on this topic        prerequisite gap    moderate,
 *     in one sitting, topic has prerequisites                          + check basics
 *   anything else                                  gap                 moderate
 *
 * "Named belief" is a mapped distractor, a catalogue cue or a provisional AI
 * label (lib/mistakeLoop.ts matchWrongAnswer). Confidence comes from the
 * picker beside each question; high-confidence errors are the ones feedback
 * fixes best (the hypercorrection effect, research/learning-science.md §6),
 * so they rank first. A slip is never diagnosed from one answer alone: the
 * knowledge model still counts the miss, and if it was not a slip the next
 * miss will say so.
 *
 * Pure, so the rules are tested on their own. */

import type { Confidence } from "../components/learning/options";
import type { MisconceptionSeverity } from "./misconceptions";

export type Reading =
  | "misconception"
  | "weak-misconception"
  | "possible-slip"
  | "prerequisite-gap"
  | "gap";

export interface WrongAnswerSignals {
  /** The mistake loop found a named belief for the chosen option. */
  namedBelief: boolean;
  confidence: Confidence | null | undefined;
  secondsSpent: number | null | undefined;
  /** The knowledge model had this topic as secure before this sitting. */
  topicSecure: boolean;
  /** Earlier misses on the same topic in this sitting (not counting this). */
  earlierMissesThisSitting: number;
  /** The topic has syllabus prerequisites to check. */
  hasPrerequisites: boolean;
  /** The worked solution was used: a gap by definition, never a slip. */
  workedSolution?: boolean;
}

/** Answers faster than this on a secure topic look like a slip, not a gap. */
export const SLIP_MAX_SECONDS = 25;

export interface Diagnosis {
  reading: Reading;
  /** Null: write nothing to the ledger. */
  severity: MisconceptionSeverity | null;
  /** Point the student at the topic's prerequisite before more practice. */
  checkPrerequisite: boolean;
}

export function diagnoseWrongAnswer(s: WrongAnswerSignals): Diagnosis {
  if (s.namedBelief && !s.workedSolution) {
    if (s.confidence === "certain") return { reading: "misconception", severity: "critical", checkPrerequisite: false };
    if (s.confidence === "guess") return { reading: "weak-misconception", severity: "minor", checkPrerequisite: false };
    return { reading: "misconception", severity: "moderate", checkPrerequisite: false };
  }
  if (
    !s.workedSolution &&
    s.topicSecure &&
    s.earlierMissesThisSitting === 0 &&
    s.confidence !== "guess" &&
    typeof s.secondsSpent === "number" &&
    s.secondsSpent <= SLIP_MAX_SECONDS
  ) {
    return { reading: "possible-slip", severity: null, checkPrerequisite: false };
  }
  if (s.earlierMissesThisSitting >= 1 && s.hasPrerequisites) {
    return { reading: "prerequisite-gap", severity: "moderate", checkPrerequisite: true };
  }
  return { reading: "gap", severity: "moderate", checkPrerequisite: false };
}

/** Sort key for open beliefs: confident errors first (they repair best). */
export function confidenceWeight(confidence: Confidence | null | undefined): number {
  if (confidence === "certain") return 1.5;
  if (confidence === "guess") return 0.5;
  return 1;
}
