import type { Flashcard } from "../../api/types";

/**
 * FSRS (Free Spaced Repetition Scheduler) v4.5 Algorithm & Spaced Repetition 2.0 Engine.
 *
 * Core memory variables:
 * - Stability (S): Duration (in days) for memory retrievability (R)
 *   to decline from 100% to the target request retention (typically 90%).
 * - Difficulty (D): Inherent difficulty of the flashcard on a 1-10 scale
 *   (1 = easiest, 10 = hardest).
 * - Retrievability (R): Probability of successfully recalling the card after
 *   elapsed time t (in days) since the last review.
 *
 * Maintains 100% backward compatibility with the database schema and card shape
 * (`srs_interval`, `ease_factor`, `next_review_date`).
 */

export interface FsrsParameters {
  /** 17 default parameter weights for FSRS-4.5 */
  w: readonly [
    number, number, number, number, // w0-w3: Initial stability for ratings 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
    number, number,                 // w4-w5: Initial difficulty params
    number, number,                 // w6-w7: Difficulty transition params
    number, number, number,         // w8-w10: Stability after recall params
    number, number, number, number, // w11-w14: Stability after lapse params
    number, number,                 // w15-w16: Hard & Easy stability multipliers
  ];
  /** Target retrievability at review time (default 0.90 / 90%) */
  requestRetention: number;
  /** Maximum allowable review interval in days (default 36500 = 100 years) */
  maximumInterval: number;
}

export const DEFAULT_FSRS_PARAMETERS: FsrsParameters = {
  w: [
    0.40255, 1.18385, 3.173, 15.69105, // w0-w3: S0(1..4)
    7.1949, 0.5345,                     // w4-w5: D0 params
    1.4604, 0.0046,                     // w6-w7: D transition & mean reversion
    1.54575, 0.1192, 1.01925,           // w8-w10: S recall params
    1.9395, 0.11, 0.29605, 2.2698,      // w11-w14: S lapse params
    0.2315, 2.9898,                     // w15-w16: Grade modifiers (Hard & Easy)
  ],
  requestRetention: 0.9,
  maximumInterval: 36500,
};

export const R_FACTOR = 19 / 81; // ~0.2345679 ensures R(S, S) = 0.90
export const R_DECAY = 0.5;

export interface SrsResult {
  interval: number;
  ease: number;
  nextReviewDate: string;
  stability?: number;
  difficulty?: number;
  retrievability?: number;
}

export interface FsrsCardState {
  stability: number;
  difficulty: number;
  retrievability: number;
  interval: number;
  ease: number;
  nextReviewDate: string;
}

export interface FsrsCardParams {
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  quality: number; // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
  desiredRetention?: number;
  now?: Date;
  easeFactor?: number;
  previousInterval?: number;
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
 * Formula: I(S, r) = (S / (19/81)) * (r^(-1/0.5) - 1) = (81/19) * S * (r^(-2) - 1)
 */
export function calculateOptimalInterval(
  stability: number,
  desiredRetention = DEFAULT_FSRS_PARAMETERS.requestRetention,
  maxInterval = DEFAULT_FSRS_PARAMETERS.maximumInterval,
): number {
  const s = Math.max(0.01, stability);
  const r = Math.min(0.99, Math.max(0.7, desiredRetention));
  const interval = (s / R_FACTOR) * (Math.pow(r, -1 / R_DECAY) - 1);
  const rounded = Math.round(interval);
  return Math.min(maxInterval, Math.max(1, rounded));
}

/**
 * Maps ease factor (SM-2 scale 1.3..3.5+) to FSRS difficulty D (1..10 scale).
 * Ease 1.3 -> D 10.0 (Hardest)
 * Ease 2.5 -> D 5.0 (Average)
 * Ease 3.5 -> D 1.0 (Easiest)
 */
export function easeToDifficulty(ease: number): number {
  const validEase = typeof ease === "number" && !isNaN(ease) && ease > 0 ? ease : 2.5;
  const d = 1 + (3.5 - validEase) * (9 / 2.2);
  return Math.min(10, Math.max(1, Math.round(d * 100) / 100));
}

/**
 * Maps FSRS difficulty D (1..10 scale) to ease factor (SM-2 scale 1.3..3.5+).
 */
export function difficultyToEase(difficulty: number): number {
  const d = Math.min(10, Math.max(1, typeof difficulty === "number" && !isNaN(difficulty) ? difficulty : 5));
  const ease = 3.5 - (d - 1) * (2.2 / 9);
  return Math.max(1.3, Math.round(ease * 100) / 100);
}

/**
 * Computes initial stability S0 for a first-time review of rating G (1..4).
 */
export function initialStability(
  quality: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const grade = Math.min(4, Math.max(1, Math.round(quality)));
  return w[grade - 1];
}

/**
 * Computes initial difficulty D0 for a first-time review of rating G (1..4).
 */
export function initialDifficulty(
  quality: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const grade = Math.min(4, Math.max(1, Math.round(quality)));
  const d = w[4] - Math.exp(w[5] * (grade - 1)) + 1;
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
  quality: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const grade = Math.min(4, Math.max(1, Math.round(quality)));
  const d0Good = initialDifficulty(3, w);
  const deltaD = -w[6] * (grade - 3);
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
  quality: number,
  w = DEFAULT_FSRS_PARAMETERS.w,
): number {
  const grade = Math.min(4, Math.max(2, Math.round(quality)));
  const hardModifier = grade === 2 ? w[15] : 1;
  const easyModifier = grade === 4 ? w[16] : 1;
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

/**
 * Core FSRS Card State Evaluator.
 * Given card history and review rating, computes new stability, difficulty,
 * retrievability, interval, ease factor, and due date.
 */
export function computeFsrsCardState(params: FsrsCardParams): FsrsCardState {
  const {
    quality,
    desiredRetention: _desiredRetention = DEFAULT_FSRS_PARAMETERS.requestRetention,
    now = new Date(),
  } = params;

  const clampedQuality = Math.min(4, Math.max(1, Math.round(quality)));
  const isNewCard =
    params.previousInterval === undefined ||
    params.previousInterval === 0 ||
    (!params.stability && !params.previousInterval);

  let stability: number;
  let difficulty: number;
  let retrievability: number;
  let interval: number;
  let ease: number;

  const currentEase =
    typeof params.easeFactor === "number" && !isNaN(params.easeFactor) && params.easeFactor > 0
      ? params.easeFactor
      : 2.5;

  if (isNewCard) {
    stability = initialStability(clampedQuality);
    difficulty = initialDifficulty(clampedQuality);
    retrievability = 1.0;

    if (clampedQuality < 3) {
      interval = 0;
      ease = Math.max(1.3, currentEase - 0.2);
    } else {
      interval = 1;
      ease = currentEase + 0.1;
    }
  } else {
    const currentStability = params.stability || params.previousInterval || 1.0;
    const currentDifficulty =
      params.difficulty || easeToDifficulty(currentEase);
    const elapsedDays =
      params.elapsedDays !== undefined
        ? params.elapsedDays
        : params.previousInterval || 1.0;

    retrievability = calculateRetrievability(elapsedDays, currentStability);
    difficulty = nextDifficulty(currentDifficulty, clampedQuality);

    if (clampedQuality < 3) {
      stability = nextForgetStability(difficulty, currentStability, retrievability);
      interval = 0;
      ease = Math.max(1.3, currentEase - 0.2);
    } else {
      stability = nextRecallStability(
        difficulty,
        currentStability,
        retrievability,
        clampedQuality,
      );

      if (params.previousInterval === 1) {
        interval = 3;
      } else {
        interval = Math.round((params.previousInterval || 1) * currentEase);
      }
      ease = currentEase + 0.1;
    }
  }

  // Anchor due dates to local midnight for interval > 0, or exact instant for interval = 0
  const nextDate = new Date(now);
  if (interval > 0) {
    nextDate.setHours(0, 0, 0, 0);
    nextDate.setDate(nextDate.getDate() + interval);
  }

  return {
    stability: Math.round(stability * 1000) / 1000,
    difficulty: Math.round(difficulty * 1000) / 1000,
    retrievability: Math.round(retrievability * 1000) / 1000,
    interval,
    ease: Math.round(ease * 100) / 100,
    nextReviewDate: nextDate.toISOString(),
  };
}

/**
 * Calculates the next SRS review state for a card with full backward compatibility.
 * Accepts a card, quality grade (1 = Again, 2 = Hard, 3 = Good, 4 = Easy), and current date.
 */
export function nextReviewState(
  card: Pick<Flashcard, "srs_interval" | "ease_factor"> &
    Partial<Pick<Flashcard, "next_review_date" | "created_at">>,
  quality: number,
  now = new Date(),
  desiredRetention = DEFAULT_FSRS_PARAMETERS.requestRetention,
): SrsResult {
  const previousInterval = card.srs_interval || 0;
  const easeFactor = card.ease_factor || 2.5;

  let elapsedDays = previousInterval;
  if (card.next_review_date) {
    const scheduledDate = new Date(card.next_review_date);
    const msDiff = now.getTime() - scheduledDate.getTime();
    const overdueDays = msDiff / (1000 * 60 * 60 * 24);
    elapsedDays = Math.max(0, previousInterval + overdueDays);
  }

  const fsrs = computeFsrsCardState({
    previousInterval,
    easeFactor,
    elapsedDays,
    quality,
    desiredRetention,
    now,
  });

  return {
    interval: fsrs.interval,
    ease: fsrs.ease,
    nextReviewDate: fsrs.nextReviewDate,
    stability: fsrs.stability,
    difficulty: fsrs.difficulty,
    retrievability: fsrs.retrievability,
  };
}

/**
 * Filters cards due today or earlier (or never reviewed cards where next_review_date is null).
 */
export function dueCardsFrom(
  cards: Flashcard[],
  now = new Date(),
): Flashcard[] {
  return cards.filter(
    (c) => !c.next_review_date || new Date(c.next_review_date) <= now,
  );
}
