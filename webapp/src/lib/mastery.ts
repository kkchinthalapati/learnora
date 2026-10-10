/* Mastery ladder — the four rungs a topic climbs: Seen → Recalled → Applied
 * → Explained.
 *
 * A single percentage told a student nothing about what to do next; a rung
 * does ("you can recall it, now apply it"). Each rung is earned from a check,
 * never from time on page, and — since 2026-10-09 — from a check *of its
 * kind*:
 *
 *   Seen       anything answered that counted
 *   Recalled   two different questions right, belief ≥ 0.5
 *   Applied    an application question right too, belief ≥ 0.65
 *   Explained  Applied, plus a passed Teach / explain check
 *
 * Answered questions come from the knowledge model (lib/knowledgeModel.ts),
 * attached to each topic as `knowledge`. A topic known only through
 * flashcards can reach Recalled at most: reviewing a card is recall, and it
 * says nothing about applying the idea. Before this, five right answers to
 * recall questions read as "Applied" (research/current-state-audit.md §3.1).
 *
 * `masteryLevel()` in trajectory.ts (low / building / solid) is the
 * forecast's word for a mastery number and is unchanged. */

import {
  decayDays,
  decayOneDay,
  masteryLevel,
  type TopicState,
} from "./trajectory";
import { projectP, rungAt, type TopicKnowledge } from "./knowledgeModel";

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

/** The highest rung flashcards alone can show. */
const CARD_ONLY_MAX_RUNG: MasteryRung = 2;

type LadderTopic = Pick<
  TopicState,
  "mastery" | "evidence" | "stabilityDays" | "measuredMastery" | "measuredEvidence"
> & { knowledge?: TopicKnowledge | null };

/** Rung from the card-and-score figure, for topics with no answered questions. */
function cardRung(mastery: number, evidence: number): MasteryRung {
  if (evidence < MIN_EVIDENCE) return 0;
  const level = masteryLevel(mastery);
  if (level === "low") return 1;
  return CARD_ONLY_MAX_RUNG;
}

function hasAnswers(topic: LadderTopic): topic is LadderTopic & { knowledge: TopicKnowledge } {
  return Boolean(topic.knowledge && topic.knowledge.counted > 0);
}

/** Map one trajectory topic onto the ladder. `explained` is the fourth rung's
 *  own evidence — a passed Teach / explain check — which no quiz can supply. */
export function topicMastery(
  topic: LadderTopic,
  { explained = false, now = new Date() }: { explained?: boolean; now?: Date } = {},
): TopicMastery {
  if (hasAnswers(topic)) {
    const k = topic.knowledge;
    let rung: MasteryRung = k.rung;
    if (explained && rung === 3) rung = 4;
    if (rung === 0) return { rung, fading: false };
    const future = rungAt(k, projectP(k, FADING_HORIZON_DAYS, now));
    return { rung, fading: future < Math.min(rung, 3) };
  }

  /* Checks only. Forty-five minutes on the timer with no check moved a topic
     from "Not started" to "Recalled", right under the line "each step needs
     evidence from a check, not time spent". */
  const measured = {
    mastery: topic.measuredMastery ?? topic.mastery,
    evidence: topic.measuredEvidence ?? topic.evidence,
  };
  const rung = cardRung(measured.mastery, measured.evidence);
  if (rung === 0) return { rung, fading: false };
  const future = decayDays(measured.mastery, topic.stabilityDays, FADING_HORIZON_DAYS);
  return { rung, fading: cardRung(future, measured.evidence) < rung };
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
  topic: LadderTopic,
  max = 60,
  now: Date = new Date(),
): number | null {
  if (hasAnswers(topic)) {
    const k = topic.knowledge;
    if (k.rung === 0) return null;
    for (let day = 1; day <= max; day++) {
      if (rungAt(k, projectP(k, day, now)) < k.rung) return day;
    }
    return null;
  }
  const evidence = topic.measuredEvidence ?? topic.evidence;
  const current = cardRung(topic.measuredMastery ?? topic.mastery, evidence);
  if (current === 0) return null;
  let m = topic.measuredMastery ?? topic.mastery;
  for (let day = 1; day <= max; day++) {
    m = decayOneDay(m, topic.stabilityDays, day - 1);
    if (cardRung(m, evidence) < current) return day;
  }
  return null;
}
