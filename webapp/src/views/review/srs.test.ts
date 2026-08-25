import { describe, expect, it } from "vitest";
import {
  calculateOptimalInterval,
  calculateRetrievability,
  computeFsrsCardState,
  difficultyToEase,
  dueCardsFrom,
  easeToDifficulty,
  initialDifficulty,
  initialStability,
  nextDifficulty,
  nextForgetStability,
  nextRecallStability,
  nextReviewState,
} from "./srs";

const NOW = new Date("2026-07-31T12:00:00.000Z");

function card(overrides: { srs_interval?: number; ease_factor?: number } = {}) {
  return { srs_interval: 0, ease_factor: 2.5, ...overrides };
}

/* Local midnight helper for test expectations */
function localMidnightDaysFrom(from: Date, days: number): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

describe("calculateRetrievability (Forgetting Curve)", () => {
  it("returns 1.0 (100% recall) immediately at t = 0", () => {
    expect(calculateRetrievability(0, 10)).toBe(1.0);
    expect(calculateRetrievability(0, 1)).toBe(1.0);
  });

  it("returns exactly 0.90 (90% recall) when elapsed time equals stability (t = S)", () => {
    // Formula: R(S, S) = (1 + 19/81 * 1)^(-0.5) = (100/81)^(-0.5) = 9/10 = 0.90
    expect(calculateRetrievability(10, 10)).toBeCloseTo(0.9, 5);
    expect(calculateRetrievability(3.5, 3.5)).toBeCloseTo(0.9, 5);
    expect(calculateRetrievability(100, 100)).toBeCloseTo(0.9, 5);
  });

  it("decays monotonically as elapsed time increases", () => {
    const s = 10;
    const r1 = calculateRetrievability(5, s);
    const r2 = calculateRetrievability(10, s);
    const r3 = calculateRetrievability(20, s);
    const r4 = calculateRetrievability(50, s);

    expect(r1).toBeGreaterThan(r2);
    expect(r2).toBeGreaterThan(r3);
    expect(r3).toBeGreaterThan(r4);
    expect(r3).toBeCloseTo(0.825, 2);
  });

  it("handles boundary and edge cases safely (negative elapsed time, tiny stability)", () => {
    expect(calculateRetrievability(-5, 10)).toBe(1.0);
    expect(calculateRetrievability(10, 0)).toBeGreaterThan(0);
    expect(calculateRetrievability(1000, 1)).toBeGreaterThan(0);
    expect(calculateRetrievability(1000, 1)).toBeLessThan(0.1);
  });
});

describe("calculateOptimalInterval", () => {
  it("calculates interval equal to stability for requestRetention = 0.90", () => {
    expect(calculateOptimalInterval(10, 0.9)).toBe(10);
    expect(calculateOptimalInterval(25.4, 0.9)).toBe(25);
    expect(calculateOptimalInterval(1.2, 0.9)).toBe(1);
  });

  it("calculates shorter intervals for higher target retention (e.g. 0.95)", () => {
    const s = 20;
    const interval90 = calculateOptimalInterval(s, 0.9);
    const interval95 = calculateOptimalInterval(s, 0.95);
    expect(interval95).toBeLessThan(interval90);
  });

  it("calculates longer intervals for lower target retention (e.g. 0.80)", () => {
    const s = 20;
    const interval90 = calculateOptimalInterval(s, 0.9);
    const interval80 = calculateOptimalInterval(s, 0.8);
    expect(interval80).toBeGreaterThan(interval90);
  });

  it("enforces minimum interval of 1 day and respects maximum interval cap", () => {
    expect(calculateOptimalInterval(0.05, 0.9)).toBe(1);
    expect(calculateOptimalInterval(100000, 0.9, 365)).toBe(365);
  });
});

describe("Difficulty & Ease Factor Mapping", () => {
  it("maps SM-2 ease factor to FSRS difficulty in [1, 10]", () => {
    expect(easeToDifficulty(2.5)).toBeCloseTo(5.09, 1); // standard ~ 5.0
    expect(easeToDifficulty(1.3)).toBe(10);             // hardest
    expect(easeToDifficulty(3.5)).toBe(1);              // easiest
  });

  it("maps FSRS difficulty back to ease factor in [1.3, 3.5]", () => {
    expect(difficultyToEase(10)).toBe(1.3);
    expect(difficultyToEase(1)).toBe(3.5);
    expect(difficultyToEase(5.09)).toBeCloseTo(2.5, 1);
  });

  it("handles out-of-bounds ease and difficulty safely", () => {
    expect(easeToDifficulty(0)).toBeCloseTo(5.09, 1);
    expect(easeToDifficulty(10)).toBe(1);
    expect(difficultyToEase(0)).toBe(3.5);
    expect(difficultyToEase(20)).toBe(1.3);
  });
});

describe("Initial Stability & Initial Difficulty (S0, D0)", () => {
  it("initializes stability monotonically: S0(1) < S0(2) < S0(3) < S0(4)", () => {
    const s1 = initialStability(1);
    const s2 = initialStability(2);
    const s3 = initialStability(3);
    const s4 = initialStability(4);

    expect(s1).toBeLessThan(s2);
    expect(s2).toBeLessThan(s3);
    expect(s3).toBeLessThan(s4);
  });

  it("initializes difficulty inversely: D0(1) > D0(2) > D0(3) > D0(4)", () => {
    const d1 = initialDifficulty(1);
    const d2 = initialDifficulty(2);
    const d3 = initialDifficulty(3);
    const d4 = initialDifficulty(4);

    expect(d1).toBeGreaterThan(d2);
    expect(d2).toBeGreaterThan(d3);
    expect(d3).toBeGreaterThan(d4);
    expect(d1).toBeLessThanOrEqual(10);
    expect(d4).toBeGreaterThanOrEqual(1);
  });
});

describe("Difficulty Transitions (nextDifficulty)", () => {
  const currentD = 5.0;

  it("increases difficulty on Again (1) and Hard (2)", () => {
    const dAgain = nextDifficulty(currentD, 1);
    const dHard = nextDifficulty(currentD, 2);

    expect(dAgain).toBeGreaterThan(currentD);
    expect(dHard).toBeGreaterThan(currentD);
    expect(dAgain).toBeGreaterThan(dHard);
  });

  it("keeps difficulty steady on Good (3)", () => {
    const dGood = nextDifficulty(currentD, 3);
    expect(dGood).toBeCloseTo(currentD, 0.1);
  });

  it("decreases difficulty on Easy (4)", () => {
    const dEasy = nextDifficulty(currentD, 4);
    expect(dEasy).toBeLessThan(currentD);
  });

  it("clamps difficulty strictly between 1 and 10", () => {
    let d = 9.5;
    for (let i = 0; i < 5; i++) {
      d = nextDifficulty(d, 1);
    }
    expect(d).toBeLessThanOrEqual(10);

    let easyD = 2.0;
    for (let i = 0; i < 5; i++) {
      easyD = nextDifficulty(easyD, 4);
    }
    expect(easyD).toBeGreaterThanOrEqual(1);
  });
});

describe("Stability Transitions (Recall vs Lapse)", () => {
  const s = 10;
  const d = 5;
  const r = 0.9;

  it("increases stability on successful recall (ratings 2, 3, 4)", () => {
    const sHard = nextRecallStability(d, s, r, 2);
    const sGood = nextRecallStability(d, s, r, 3);
    const sEasy = nextRecallStability(d, s, r, 4);

    expect(sHard).toBeGreaterThanOrEqual(s);
    expect(sGood).toBeGreaterThan(sHard);
    expect(sEasy).toBeGreaterThan(sGood);
  });

  it("awards higher stability boost when recalled at lower retrievability (desirable difficulty)", () => {
    const sHighR = nextRecallStability(d, s, 0.95, 3);
    const sLowR = nextRecallStability(d, s, 0.75, 3);

    // Remembering a harder/delayed card boosts stability more
    expect(sLowR).toBeGreaterThan(sHighR);
  });

  it("reduces stability significantly on lapse (Again, rating 1)", () => {
    const sPostLapse = nextForgetStability(d, s, r);
    expect(sPostLapse).toBeLessThan(s);
    expect(sPostLapse).toBeGreaterThanOrEqual(0.1);
  });
});

describe("computeFsrsCardState", () => {
  it("initializes a brand new card with FSRS parameters", () => {
    const state = computeFsrsCardState({ quality: 3, now: NOW });
    expect(state.retrievability).toBe(1.0);
    expect(state.stability).toBeGreaterThan(0);
    expect(state.difficulty).toBeGreaterThan(0);
    expect(state.interval).toBe(1);
    expect(state.ease).toBeCloseTo(2.6);
  });

  it("resets interval to 0 on a miss for both new and existing cards", () => {
    const newMiss = computeFsrsCardState({ quality: 1, now: NOW });
    expect(newMiss.interval).toBe(0);
    expect(newMiss.nextReviewDate).toBe(NOW.toISOString());

    const existingMiss = computeFsrsCardState({
      previousInterval: 14,
      easeFactor: 2.5,
      quality: 1,
      now: NOW,
    });
    expect(existingMiss.interval).toBe(0);
    expect(existingMiss.nextReviewDate).toBe(NOW.toISOString());
    expect(existingMiss.ease).toBeCloseTo(2.3);
  });

  it("progresses stability and interval on repeated successful reviews", () => {
    const round1 = computeFsrsCardState({ quality: 3, now: NOW });
    expect(round1.interval).toBe(1);

    const round2 = computeFsrsCardState({
      previousInterval: round1.interval,
      easeFactor: round1.ease,
      quality: 3,
      now: NOW,
    });
    expect(round2.interval).toBe(3);

    const round3 = computeFsrsCardState({
      previousInterval: round2.interval,
      easeFactor: round2.ease,
      quality: 3,
      now: NOW,
    });
    expect(round3.interval).toBeGreaterThanOrEqual(7);
  });
});

describe("nextReviewState (SM-2 & FSRS Backward Compatibility)", () => {
  it("resets the interval to zero on a miss (quality < 3)", () => {
    const result = nextReviewState(card({ srs_interval: 8 }), 1, NOW);
    expect(result.interval).toBe(0);
    expect(result.nextReviewDate).toBe(NOW.toISOString());
  });

  it("softens the ease factor on a miss, floored at 1.3", () => {
    expect(
      nextReviewState(card({ ease_factor: 1.4 }), 2, NOW).ease,
    ).toBeCloseTo(1.3);
    expect(nextReviewState(card({ ease_factor: 1.35 }), 1, NOW).ease).toBe(1.3);
  });

  it("schedules a brand-new card for tomorrow on the first good answer", () => {
    const result = nextReviewState(card(), 3, NOW);
    expect(result.interval).toBe(1);
    expect(new Date(result.nextReviewDate).getTime()).toBe(
      localMidnightDaysFrom(NOW, 1).getTime(),
    );
  });

  it("schedules to the start of the due day, not the hour of review", () => {
    const evening = new Date(NOW);
    evening.setHours(20, 30, 0, 0);

    const scheduled = new Date(
      nextReviewState(card(), 3, evening).nextReviewDate,
    );

    expect(scheduled.getHours()).toBe(0);
    expect(scheduled.getMinutes()).toBe(0);
    expect(scheduled.getSeconds()).toBe(0);
    expect(scheduled.getMilliseconds()).toBe(0);
  });

  it("is due for an earlier session on the following day", () => {
    const reviewedAt = new Date(NOW);
    reviewedAt.setHours(20, 0, 0, 0);

    const { nextReviewDate } = nextReviewState(card(), 3, reviewedAt);

    const nextEvening = new Date(reviewedAt);
    nextEvening.setDate(nextEvening.getDate() + 1);
    nextEvening.setHours(19, 0, 0, 0);

    expect(new Date(nextReviewDate) <= nextEvening).toBe(true);
  });

  it("keeps a missed card due in the same sitting", () => {
    const reviewedAt = new Date(NOW);
    reviewedAt.setHours(20, 0, 0, 0);

    const { interval, nextReviewDate } = nextReviewState(
      card({ srs_interval: 8 }),
      1,
      reviewedAt,
    );

    expect(interval).toBe(0);
    expect(nextReviewDate).toBe(reviewedAt.toISOString());
  });

  it("schedules a once-reviewed card for 3 days on the next good answer", () => {
    const result = nextReviewState(card({ srs_interval: 1 }), 3, NOW);
    expect(result.interval).toBe(3);
  });

  it("multiplies interval by ease and rounds once the interval exceeds 1", () => {
    const result = nextReviewState(
      card({ srs_interval: 3, ease_factor: 2.5 }),
      4,
      NOW,
    );
    expect(result.interval).toBe(Math.round(3 * 2.5));
  });

  it("increases the ease factor on a good or easy answer", () => {
    expect(
      nextReviewState(card({ ease_factor: 2.5 }), 3, NOW).ease,
    ).toBeCloseTo(2.6);
    expect(
      nextReviewState(card({ ease_factor: 2.5 }), 4, NOW).ease,
    ).toBeCloseTo(2.6);
  });

  it("defaults a never-reviewed card's ease factor to 2.5", () => {
    const result = nextReviewState({ srs_interval: 0, ease_factor: 0 }, 3, NOW);
    expect(result.ease).toBeCloseTo(2.6);
  });

  it("returns FSRS stability, difficulty, and retrievability metadata", () => {
    const result = nextReviewState(card({ srs_interval: 5, ease_factor: 2.5 }), 3, NOW);
    expect(result.stability).toBeDefined();
    expect(result.difficulty).toBeDefined();
    expect(result.retrievability).toBeDefined();
    expect(result.retrievability).toBeGreaterThan(0);
    expect(result.retrievability).toBeLessThanOrEqual(1.0);
  });
});

describe("dueCardsFrom", () => {
  function flashcard(nextReviewDate: string | null) {
    return {
      id: "c1",
      user_id: "u1",
      deck_id: "d1",
      front: "Q",
      back: "A",
      next_review_date: nextReviewDate,
      srs_interval: 0,
      ease_factor: 2.5,
      created_at: "2026-01-01T00:00:00.000Z",
    };
  }

  it("includes a never-reviewed card (NULL next_review_date)", () => {
    expect(dueCardsFrom([flashcard(null)], NOW)).toHaveLength(1);
  });

  it("includes a card due today or earlier", () => {
    const due = flashcard("2026-07-31T00:00:00.000Z");
    const overdue = flashcard("2026-01-01T00:00:00.000Z");
    expect(dueCardsFrom([due, overdue], NOW)).toHaveLength(2);
  });

  it("excludes a card not due until later", () => {
    expect(dueCardsFrom([flashcard("2026-08-15T00:00:00.000Z")], NOW)).toEqual(
      [],
    );
  });
});
