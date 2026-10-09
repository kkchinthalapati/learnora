/* The knowledge model: what a student appears to know, per topic, and how
 * sure we are.
 *
 * Built from answered questions alone (lib/attempts.ts), never from time on
 * the clock. It replaces three habits of the old score fold that made the
 * mastery ladder over-claim (research/current-state-audit.md §3.1):
 *
 *   - one right answer moved a topic to "Recalled", five to "Applied",
 *     whatever the questions asked;
 *   - a four-option guess counted the same as knowing;
 *   - the same question answered twice counted twice.
 *
 * The update is Bayesian knowledge tracing (Corbett & Anderson): a belief
 * p = P(knows it), revised by each answer through the chance of a slip and
 * the chance of a guess, then a small chance of learning from the attempt.
 * Parameters are fixed, not fitted — fitting needs thousands of attempts this
 * app does not have yet — and exported so tests state the behaviour.
 *
 * Between answers the belief fades toward the prior on the same FSRS curve
 * the review scheduler uses, with a stability that grows with each success
 * on a new day. What counts, and how much:
 *
 *   unverified key ............. not at all (it may be marked wrong)
 *   right after a hint ......... not at all (tutorPolicy's no-credit rule)
 *   worked solution shown ...... as a wrong answer
 *   same question again ........ a quarter
 *   right but marked "guess" ... half
 *   right but slow ............. half
 *
 * A status needs evidence as well as a high p: "secure" needs three right
 * answers to different questions, on two different days, at least one of
 * them an application question. A rung needs its own kind of question. */

import type { Attempt } from "./attempts";
import { calculateRetrievability } from "../views/review/srs";

export const KM = Object.freeze({
  /** Belief before any evidence. Matches the forecast's UNMEASURED_MASTERY. */
  prior: 0.25,
  /** P(wrong | knows it). */
  slip: 0.1,
  /** P(learns it | attempted), applied after each counted attempt. */
  learn: 0.12,
  /** Chance of guessing a non-multiple-choice answer. */
  openGuess: 0.05,
  /** Weight of an answer to a question already answered. */
  repeatWeight: 0.25,
  /** Weight of a right answer the student marked as a guess, or a slow one. */
  doubtWeight: 0.5,
  /** Seconds past which a right multiple-choice answer counts as slow. */
  slowSeconds: 90,
  /** Starting memory stability in days, and its growth per success on a new day. */
  startStability: 2,
  stabilityGrowth: 2.5,
  maxStability: 365,
  /** Thresholds. */
  secureP: 0.85,
  recalledP: 0.5,
  appliedP: 0.65,
  /** Evidence older than this is ignored, as in the forecast. */
  horizonDays: 45,
});

export type KnowledgeStatus = "unmeasured" | "learning" | "fragile" | "secure";

export interface TopicKnowledge {
  key: string;
  /** P(knows it) now, after forgetting since the last answer. */
  p: number;
  /** P(knows it) in 7 days if untouched. */
  pInWeek: number;
  status: KnowledgeStatus;
  /** True when `secure` now but not in a week: due for a check. */
  fading: boolean;
  /** 0 not started · 1 Seen · 2 Recalled · 3 Applied (4 Explained is added
   *  by the ladder from its own check). */
  rung: 0 | 1 | 2 | 3;
  stabilityDays: number;
  /** Answers that counted at all. */
  counted: number;
  /** Distinct questions answered right (verified, unhinted). */
  rightItems: number;
  /** Distinct days with a right answer. */
  rightDays: number;
  /** Distinct application questions answered right. */
  rightApply: number;
  lastAt: string | null;
}

const DAY_MS = 86_400_000;

function guessChance(a: Attempt): number {
  if (a.options >= 2) return 1 / a.options;
  return KM.openGuess;
}

/** BKT posterior after one answer, before learning. */
export function bktPosterior(p: number, correct: boolean, guess: number, slip = KM.slip): number {
  const num = correct ? p * (1 - slip) : p * slip;
  const den = correct ? num + (1 - p) * guess : num + (1 - p) * (1 - guess);
  return den > 0 ? num / den : p;
}

/** How much one answer counts, 0-1, given what came before it. */
export function answerWeight(a: Attempt, seenRefs: ReadonlySet<string>): number {
  if (!a.verified) return 0;
  if (a.correct && a.hintRung > 0) return 0;
  let w = 1;
  if (a.ref && seenRefs.has(a.ref)) w *= KM.repeatWeight;
  if (a.correct && a.confidence === "guess") w *= KM.doubtWeight;
  if (a.correct && a.options >= 2 && (a.secondsSpent ?? 0) > KM.slowSeconds) w *= KM.doubtWeight;
  return w;
}

function fade(p: number, days: number, stability: number): number {
  if (days <= 0) return p;
  return KM.prior + (p - KM.prior) * calculateRetrievability(days, stability);
}

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Fold one topic's answers, oldest first, into its knowledge. */
export function foldTopic(key: string, attempts: readonly Attempt[], now: Date = new Date()): TopicKnowledge {
  const horizon = now.getTime() - KM.horizonDays * DAY_MS;
  const live = attempts
    .filter((a) => {
      const t = new Date(a.occurredAt).getTime();
      return Number.isFinite(t) && t >= horizon && t <= now.getTime();
    })
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

  let p: number = KM.prior;
  let stability: number = KM.startStability;
  let lastMs: number | null = null;
  let lastAt: string | null = null;
  let counted = 0;
  const seen = new Set<string>();
  const rightRefs = new Set<string>();
  const rightApplyRefs = new Set<string>();
  const rightDays = new Set<string>();
  const successDays = new Set<string>();

  for (const a of live) {
    const t = new Date(a.occurredAt).getTime();
    if (lastMs !== null) p = fade(p, (t - lastMs) / DAY_MS, stability);
    const w = answerWeight(a, seen);
    if (a.ref) seen.add(a.ref);
    if (w <= 0) continue;

    const posterior = bktPosterior(p, a.correct, guessChance(a));
    const learned = posterior + (1 - posterior) * KM.learn;
    p = p + w * (learned - p);
    counted += 1;
    lastMs = t;
    lastAt = a.occurredAt;

    const day = dayOf(a.occurredAt);
    if (a.correct) {
      /* Only a full-weight right answer to a question not seen before is
         evidence of knowing something new. */
      const itemKey = a.ref ?? a.id;
      if (w >= 1 && !rightRefs.has(itemKey)) {
        rightRefs.add(itemKey);
        rightDays.add(day);
        if (a.kind === "apply" || a.kind === "explain") rightApplyRefs.add(itemKey);
      }
      if (!successDays.has(day)) {
        successDays.add(day);
        if (successDays.size > 1) stability = Math.min(KM.maxStability, stability * KM.stabilityGrowth);
      }
    } else {
      stability = Math.max(1, stability * 0.5);
    }
  }

  const pNow = lastMs === null ? KM.prior : fade(p, (now.getTime() - lastMs) / DAY_MS, stability);
  const pInWeek =
    lastMs === null ? KM.prior : fade(p, (now.getTime() - lastMs) / DAY_MS + 7, stability);

  const evidenceMet = rightRefs.size >= 3 && rightDays.size >= 2 && rightApplyRefs.size >= 1;
  let status: KnowledgeStatus;
  if (counted === 0) status = "unmeasured";
  else if (pNow >= KM.secureP) status = evidenceMet ? "secure" : "fragile";
  else status = "learning";

  const counts = { counted, rightItems: rightRefs.size, rightApply: rightApplyRefs.size };
  const rung = rungAt(counts, pNow);

  return {
    key,
    p: pNow,
    pInWeek,
    status,
    fading: rung > 0 && rungAt(counts, pInWeek) < rung,
    rung,
    stabilityDays: stability,
    counted,
    rightItems: rightRefs.size,
    rightDays: rightDays.size,
    rightApply: rightApplyRefs.size,
    lastAt,
  };
}

/** The rung a topic's evidence supports at belief `p`. Each rung needs its
 *  own kind of evidence: Recalled two different questions right, Applied an
 *  application question right. */
export function rungAt(
  k: Pick<TopicKnowledge, "counted" | "rightItems" | "rightApply">,
  p: number,
): TopicKnowledge["rung"] {
  if (k.counted === 0) return 0;
  if (p < KM.recalledP || k.rightItems < 2) return 1;
  if (p < KM.appliedP || k.rightApply < 1) return 2;
  return 3;
}

/** Belief `days` from now if the topic is left alone. */
export function projectP(k: TopicKnowledge, days: number, now: Date = new Date()): number {
  if (!k.lastAt || k.counted === 0) return KM.prior;
  const since = Math.max(0, (now.getTime() - new Date(k.lastAt).getTime()) / DAY_MS);
  const rNow = calculateRetrievability(since, k.stabilityDays);
  const rThen = calculateRetrievability(since + Math.max(0, days), k.stabilityDays);
  return KM.prior + (k.p - KM.prior) * (rNow > 0 ? rThen / rNow : 0);
}

/** Knowledge for every topic the attempts touch, keyed by skill when the
 *  question named one, else by topic key. */
export function buildKnowledge(attempts: readonly Attempt[], now: Date = new Date()): Map<string, TopicKnowledge> {
  const groups = new Map<string, Attempt[]>();
  for (const a of attempts) {
    const key = a.skill ?? a.topicKey;
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(a);
    groups.set(key, list);
  }
  const out = new Map<string, TopicKnowledge>();
  for (const [key, list] of groups) out.set(key, foldTopic(key, list, now));
  return out;
}

/** One line for a person: what the status rests on. */
export function evidenceLine(k: TopicKnowledge): string {
  if (k.status === "unmeasured") return "Not checked yet";
  const q = `${k.rightItems} question${k.rightItems === 1 ? "" : "s"} right`;
  const d = `${k.rightDays} day${k.rightDays === 1 ? "" : "s"}`;
  return `${q} over ${d}`;
}
