import type { Flashcard } from "../../api/types";

/**
 * FSRS (Free Spaced Repetition Scheduler) v4.5 Lite Algorithm
 *
 * Core memory variables:
 * - Stability (S): Duration (in days) for memory retrievability (R)
 *   to decline from 100% to the target request retention (e.g. 90%).
 * - Difficulty (D): Inherent difficulty of the flashcard on a 1-10 scale
 *   (1 = easiest, 10 = hardest).
 * - Retrievability (R): Probability of successfully recalling the card after
 *   elapsed time t (in days) since the last review.
 *
 * Mathematical formulas:
 * - Retrievability: R(t, S) = (1 + (19/81) * (t / S))^(-0.5)
 * - Target interval: I(r_target, S) = (S / (19/81)) * (r_target^(-2) - 1)
 */

export interface FsrsParameters {
  /** 17 default parameter weights for FSRS-4.5 */
  w: readonly [
    number,
    number,
    number,
    number, // w0-w3: Initial stability for ratings 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
    number,
    number, // w4-w5: Initial difficulty params
    number,
    number, // w6-w7: Difficulty transition params
    number,
    number,
    number, // w8-w10: Stability after recall params
    number,
    number,
    number,
    number, // w11-w14: Stability after lapse params
    number,
    number, // w15-w16: Hard & Easy stability multipliers
  ];
  /** Target retrievability at review time (default 0.90 / 90%) */
  requestRetention: number;
  /** Maximum allowable review interval in days (default 36500 = 100 years) */
  maximumInterval: number;
}

export const DEFAULT_FSRS_PARAMETERS: FsrsParameters = {
  w: [
    0.40255,
    1.18385,
    3.173,
    15.69105, // w0-w3: S0(1..4)
    7.1949,
    0.5345, // w4-w5: D0 params
    1.4604,
    0.0046, // w6-w7: D transition & mean reversion
    1.54575,
    0.1192,
    1.01925, // w8-w10: S recall params
    1.9395,
    0.11,
    0.29605,
    2.2698, // w11-w14: S lapse params
    0.2315,
    2.9898, // w15-w16: Grade modifiers (Hard & Easy)
  ],
  requestRetention: 0.9,
  maximumInterval: 36500,
};

export const R_FACTOR = 19 / 81; // ~0.2345679 ensures R(S, S) = 0.90
export const R_DECAY = 0.5;

export type FsrsGrade = 1 | 2 | 3 | 4;

export interface FsrsReviewResult {
  nextReviewDate: string;
  interval: number;
  ease: number;
  stability: number;
  difficulty: number;
  retrievability: number;
}

/**
 * Calculates retrievability (probability of recall) after elapsed time t (in days)
 * given memory stability S (in days).
 *
 * Formula: R(t, S) = (1 + (19/81) * (t / S))^(-0.5)
 * At t = 0: R = 1.0 (100%)
 * At t = S: R = 0.90 (90%)
 */
export function calculateRetrievability(
  elapsedDays: number,
  stability: number,
): number {
  const t = Math.max(0, elapsedDays);
  const s = Math.max(0.01, stability);
  if (t === 0) return 1.0;
  const r = Math.pow(1 + R_FACTOR * (t / s), -R_DECAY);
  return Math.min(1.0, Math.max(0.0, r));
}

/**
 * Calculates the optimal review interval (in days) for a given stability S
 * and target retention rate r (default 0.90).
 *
 * Formula: I(r_target, S) = (S / (19/81)) * (r_target^(-2) - 1)
 */
export function calculateTargetInterval(
  stability: number,
  targetRetention = DEFAULT_FSRS_PARAMETERS.requestRetention,
  maxInterval = DEFAULT_FSRS_PARAMETERS.maximumInterval,
): number {
  const s = Math.max(0.01, stability);
  const r = Math.min(0.99, Math.max(0.7, targetRetention));
  const interval = (s / R_FACTOR) * (Math.pow(r, -2) - 1);
  const rounded = Math.round(interval);
  return Math.min(maxInterval, Math.max(1, rounded));
}

/** Alias for backward compatibility */
export const calculateOptimalInterval = calculateTargetInterval;

/**
 * Maps ease factor (SM-2 scale 1.3..3.5+) to FSRS difficulty D (1..10 scale).
 * Ease 1.3 -> D 10.0 (Hardest)
 * Ease 2.5 -> D 5.09 (Average)
 * Ease 3.5 -> D 1.0 (Easiest)
 */
export function easeToDifficulty(ease: number): number {
  const validEase =
    typeof ease === "number" && !isNaN(ease) && ease > 0 ? ease : 2.5;
  const d = 1 + (3.5 - validEase) * (9 / 2.2);
  return Math.min(10, Math.max(1, Math.round(d * 100) / 100));
}

/**
 * Maps FSRS difficulty D (1..10 scale) to ease factor (SM-2 scale 1.3..3.5+).
 */
export function difficultyToEase(difficulty: number): number {
  const d = Math.min(
    10,
    Math.max(
      1,
      typeof difficulty === "number" && !isNaN(difficulty) ? difficulty : 5,
    ),
  );
  const ease = 3.5 - (d - 1) * (2.2 / 9);
  return Math.max(1.3, Math.round(ease * 100) / 100);
}

/**
 * Computes initial stability S0 for a first-time review of rating G (1..4).
 */
export function initialStability(
  grade: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const clampedGrade = Math.min(4, Math.max(1, Math.round(grade)));
  return w[clampedGrade - 1];
}

/**
 * Computes initial difficulty D0 for a first-time review of rating G (1..4).
 */
export function initialDifficulty(
  grade: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const clampedGrade = Math.min(4, Math.max(1, Math.round(grade)));
  const d = w[4] - Math.exp(w[5] * (clampedGrade - 1)) + 1;
  return Math.min(10, Math.max(1, d));
}

/**
 * Computes updated difficulty D' on subsequent review.
 * Rating 1 (Again): D increases
 * Rating 2 (Hard): D increases moderately
 * Rating 3 (Good): D stays near steady (with mean reversion to D0(Good))
 * Rating 4 (Easy): D decreases
 */
export function nextDifficulty(
  currentDifficulty: number,
  grade: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const clampedGrade = Math.min(4, Math.max(1, Math.round(grade)));
  const d0Good = initialDifficulty(3, w);
  const deltaD = -w[6] * (clampedGrade - 3);
  const rawD = currentDifficulty + deltaD;
  const meanReverted = w[7] * d0Good + (1 - w[7]) * rawD;
  return Math.min(10, Math.max(1, meanReverted));
}

/**
 * Computes next stability S' upon successful recall (rating >= 2).
 */
export function nextRecallStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  grade: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const clampedGrade = Math.min(4, Math.max(2, Math.round(grade)));
  const hardModifier = clampedGrade === 2 ? w[15] : 1;
  const easyModifier = clampedGrade === 4 ? w[16] : 1;
  const gradeMultiplier = hardModifier * easyModifier;

  const boost =
    Math.exp(w[8]) *
    (11 - difficulty) *
    Math.pow(stability, -w[9]) *
    (Math.exp(w[10] * (1 - retrievability)) - 1) *
    gradeMultiplier;

  return Math.max(stability, stability * (1 + boost));
}

/**
 * Computes next stability S' upon lapse / forgetting (rating = 1, Again).
 */
export function nextForgetStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const postLapse =
    w[11] *
    Math.pow(difficulty, -w[12]) *
    (Math.pow(stability + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - retrievability));

  return Math.min(stability, Math.max(0.1, postLapse));
}

export type FsrsCardInput = Pick<Flashcard, "srs_interval" | "ease_factor"> &
  Partial<Pick<Flashcard, "next_review_date" | "created_at">> & {
    stability?: number;
    difficulty?: number;
    elapsed_days?: number;
  };

/**
 * Computes the next review state using FSRS v4.5 algorithm.
 *
 * @param card Flashcard record or card parameters
 * @param grade Student rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
 * @param targetRetention Desired retention target between 0.70 and 0.99 (default 0.90)
 * @param now Current evaluation date
 */
export function computeFsrsNextReview(
  card: FsrsCardInput,
  grade: number,
  targetRetention = DEFAULT_FSRS_PARAMETERS.requestRetention,
  now = new Date(),
): FsrsReviewResult {
  const clampedGrade = Math.min(4, Math.max(1, Math.round(grade)));
  const previousInterval = card.srs_interval || 0;
  const currentEase =
    typeof card.ease_factor === "number" &&
    !isNaN(card.ease_factor) &&
    card.ease_factor > 0
      ? card.ease_factor
      : 2.5;

  const isNewCard =
    previousInterval === 0 &&
    !card.stability &&
    !card.difficulty &&
    !card.next_review_date;

  let stability: number;
  let difficulty: number;
  let retrievability: number;
  let interval: number;

  if (isNewCard) {
    stability = initialStability(clampedGrade);
    difficulty = initialDifficulty(clampedGrade);
    retrievability = 1.0;

    if (clampedGrade === 1) {
      interval = 0;
    } else {
      interval = calculateTargetInterval(stability, targetRetention);
    }
  } else {
    const currentStability =
      card.stability || previousInterval || initialStability(3);
    const currentDifficulty = card.difficulty || easeToDifficulty(currentEase);

    let elapsedDays = previousInterval;
    if (card.elapsed_days !== undefined) {
      elapsedDays = card.elapsed_days;
    } else if (card.next_review_date) {
      const scheduledDate = new Date(card.next_review_date);
      const msDiff = now.getTime() - scheduledDate.getTime();
      const overdueDays = msDiff / (1000 * 60 * 60 * 24);
      elapsedDays = Math.max(0, previousInterval + overdueDays);
    }

    retrievability = calculateRetrievability(elapsedDays, currentStability);
    difficulty = nextDifficulty(currentDifficulty, clampedGrade);

    if (clampedGrade === 1) {
      stability = nextForgetStability(
        difficulty,
        currentStability,
        retrievability,
      );
      interval = 0;
    } else {
      stability = nextRecallStability(
        difficulty,
        currentStability,
        retrievability,
        clampedGrade,
      );
      interval = calculateTargetInterval(stability, targetRetention);
    }
  }

  const ease = difficultyToEase(difficulty);

  const nextDate = new Date(now);
  if (interval > 0) {
    nextDate.setHours(0, 0, 0, 0);
    nextDate.setDate(nextDate.getDate() + interval);
  }

  return {
    nextReviewDate: nextDate.toISOString(),
    interval,
    ease: Math.round(ease * 100) / 100,
    stability: Math.round(stability * 1000) / 1000,
    difficulty: Math.round(difficulty * 1000) / 1000,
    retrievability: Math.round(retrievability * 1000) / 1000,
  };
}
