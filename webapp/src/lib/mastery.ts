/* Mastery ladder — the four rungs a topic climbs: Seen → Recalled → Applied
 * → Explained.
 *
 * A single percentage told a student nothing about what to do next; a rung
 * does ("you can recall it, now apply it"). Each rung is earned from a check,
 * never from time on page, so this reads only evidence the app already holds:
 * trajectory's per-topic `mastery` (quiz + FSRS memory state, see
 * lib/trajectory.ts) and whether the student has passed an explain-it check.
 *
 * `masteryLevel()` in trajectory.ts stays as it is (low / building / solid is
 * what the Trajectory view prints); the thresholds here are the same two cut
 * points, so the ladder and that word never disagree. */

import {
  decayOneDay,
  masteryLevel,
  type TopicState,
} from "./trajectory";

export type MasteryRung = 0 | 1 | 2 | 3 | 4;

export const RUNG_LABELS = ["Seen", "Recalled", "Applied", "Explained"] as const;

export interface TopicMastery {
  rung: MasteryRung;
  /** The rung reached but slipping: it will not survive a week untouched. */
  fading: boolean;
}

/** Days ahead the fading test looks. A week is the horizon the plan works in. */
export const FADING_HORIZON_DAYS = 7;

/** Evidence below this is "we have barely looked at this topic" — the rung is
 *  not claimed, however the unmeasured prior scores it. */
const MIN_EVIDENCE = 0.05;

function rungFor(mastery: number, evidence: number): MasteryRung {
  if (evidence < MIN_EVIDENCE) return 0;
  const level = masteryLevel(mastery);
  if (level === "low") return 1;
  if (level === "building") return 2;
  return 3;
}

/** Map one trajectory topic onto the ladder. `explained` is the fourth rung's
 *  own evidence — a passed Teach / explain check — which no quiz can supply. */
export function topicMastery(
  topic: Pick<
    TopicState,
    "mastery" | "evidence" | "stabilityDays" | "measuredMastery" | "measuredEvidence"
  >,
  { explained = false }: { explained?: boolean } = {},
): TopicMastery {
  /* Checks only. Forty-five minutes on the timer with no check moved a topic
     from "Not started" to "Recalled", right under the line "each step needs
     evidence from a check, not time spent". */
  const measured = {
    mastery: topic.measuredMastery ?? topic.mastery,
    evidence: topic.measuredEvidence ?? topic.evidence,
  };
  let rung = rungFor(measured.mastery, measured.evidence);
  if (explained && rung === 3) rung = 4;
  if (rung === 0) return { rung, fading: false };

  let future = measured.mastery;
  for (let day = 0; day < FADING_HORIZON_DAYS; day++) {
    future = decayOneDay(future, topic.stabilityDays);
  }
  const futureRung = rungFor(future, measured.evidence);
  /* The explained rung sits on top of "applied"; it fades with it. */
  const fading = futureRung < Math.min(rung, 3);
  return { rung, fading };
}

/** "Applied · fading", "Not started". */
export function masteryLabel({ rung, fading }: TopicMastery): string {
  if (rung === 0) return "Not started";
  const name = RUNG_LABELS[rung - 1];
  return fading ? `${name} · fading` : name;
}

/** Days until a topic's rung would slip untouched (capped at `max`), or null
 *  when it has no rung to lose. Drives "Next due: X, in about N days". */
export function daysUntilFading(
  topic: Pick<
    TopicState,
    "mastery" | "evidence" | "stabilityDays" | "measuredMastery" | "measuredEvidence"
  >,
  max = 60,
): number | null {
  const evidence = topic.measuredEvidence ?? topic.evidence;
  const now = rungFor(topic.measuredMastery ?? topic.mastery, evidence);
  if (now === 0) return null;
  let m = topic.measuredMastery ?? topic.mastery;
  for (let day = 1; day <= max; day++) {
    m = decayOneDay(m, topic.stabilityDays);
    if (rungFor(m, evidence) < now) return day;
  }
  return null;
}
