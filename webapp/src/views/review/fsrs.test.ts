import { describe, expect, it } from "vitest";
import {
  calculateRetrievability,
  calculateTargetInterval,
  computeFsrsNextReview,
  DEFAULT_FSRS_PARAMETERS,
  difficultyToEase,
  easeToDifficulty,
  initialDifficulty,
  initialStability,
  nextDifficulty,
  nextForgetStability,
  nextRecallStability,
} from "./fsrs";

const NOW = new Date("2026-08-01T12:00:00.000Z");

describe("FSRS v4.5 Lite - Math Formulas & Retrievability", () => {
  it("computes R(t, S) = (1 + (19/81) * (t / S))^(-0.5) correctly at boundary points", () => {
    // Immediate recall at t = 0 is 1.0 (100%)
    expect(calculateRetrievability(0, 10)).toBe(1.0);
    expect(calculateRetrievability(0, 1)).toBe(1.0);

    // When elapsed time equals stability (t = S), R(S, S) = (1 + 19/81)^(-0.5) = (100/81)^(-0.5) = 9/10 = 0.90
    expect(calculateRetrievability(10, 10)).toBeCloseTo(0.9, 5);
    expect(calculateRetrievability(5, 5)).toBeCloseTo(0.9, 5);
    expect(calculateRetrievability(100, 100)).toBeCloseTo(0.9, 5);
  });

  it("decays retrievability monotonically over time", () => {
    const stability = 14;
    const r1 = calculateRetrievability(1, stability);
    const r7 = calculateRetrievability(7, stability);
    const r14 = calculateRetrievability(14, stability);
    const r28 = calculateRetrievability(28, stability);

    expect(r1).toBeGreaterThan(r7);
    expect(r7).toBeGreaterThan(r14);
    expect(r14).toBeGreaterThan(r28);
    expect(r14).toBeCloseTo(0.9, 5);
  });

  it("safely handles edge cases like negative elapsed time or near-zero stability", () => {
    expect(calculateRetrievability(-10, 5)).toBe(1.0);
    expect(calculateRetrievability(10, 0)).toBeGreaterThan(0);
    expect(calculateRetrievability(1000, 0.1)).toBeGreaterThan(0);
    expect(calculateRetrievability(1000, 0.1)).toBeLessThan(0.05);
  });
});

describe("FSRS v4.5 Lite - Target Interval Calculation & Retention Targets", () => {
  it("calculates interval equal to stability for targetRetention = 0.90", () => {
    const s = 10;
    // Formula: I(0.9, S) = (S / (19/81)) * (0.9^(-2) - 1) = S
    expect(calculateTargetInterval(s, 0.9)).toBe(10);
    expect(calculateTargetInterval(30, 0.9)).toBe(30);
  });

  it("yields shorter intervals for higher retention target 0.95", () => {
    const s = 20;
    const interval90 = calculateTargetInterval(s, 0.9);
    const interval95 = calculateTargetInterval(s, 0.95);

    expect(interval95).toBeLessThan(interval90);
    // Exact: (20 / (19/81)) * (0.95^(-2) - 1) = (20 * 81 / 19) * ((1/0.9025) - 1) = 85.263 * 0.108033 = ~9.21 => 9
    expect(interval95).toBe(9);
  });

  it("yields longer intervals for lower retention target 0.80", () => {
    const s = 20;
    const interval90 = calculateTargetInterval(s, 0.9);
    const interval80 = calculateTargetInterval(s, 0.8);

    expect(interval80).toBeGreaterThan(interval90);
    // Exact: (20 / (19/81)) * (0.8^(-2) - 1) = 85.263 * (1.5625 - 1) = 85.263 * 0.5625 = ~47.96 => 48
    expect(interval80).toBe(48);
  });

  it("enforces minimum interval of 1 day and respects maximum interval bounds", () => {
    expect(calculateTargetInterval(0.01, 0.95)).toBe(1);
    expect(calculateTargetInterval(100000, 0.9, 365)).toBe(365);
    expect(
      calculateTargetInterval(
        50000,
        0.9,
        DEFAULT_FSRS_PARAMETERS.maximumInterval,
      ),
    ).toBe(DEFAULT_FSRS_PARAMETERS.maximumInterval);
  });
});

describe("FSRS v4.5 Lite - Difficulty Transitions & Bounds", () => {
  it("initializes D0 inversely: D0(1) > D0(2) > D0(3) > D0(4) within [1, 10]", () => {
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

  it("updates difficulty based on grade with mean reversion", () => {
    const initialD = 5.0;
    const dAgain = nextDifficulty(initialD, 1);
    const dHard = nextDifficulty(initialD, 2);
    const dGood = nextDifficulty(initialD, 3);
    const dEasy = nextDifficulty(initialD, 4);

    expect(dAgain).toBeGreaterThan(initialD);
    expect(dHard).toBeGreaterThan(initialD);
    expect(dAgain).toBeGreaterThan(dHard);
    expect(dGood).toBeCloseTo(initialD, 0.1);
    expect(dEasy).toBeLessThan(initialD);
  });

  it("strictly clamps difficulty between 1 and 10 across repeated updates", () => {
    let dHigh = 9.8;
    for (let i = 0; i < 10; i++) {
      dHigh = nextDifficulty(dHigh, 1);
    }
    expect(dHigh).toBeLessThanOrEqual(10);

    let dLow = 1.2;
    for (let i = 0; i < 10; i++) {
      dLow = nextDifficulty(dLow, 4);
    }
    expect(dLow).toBeGreaterThanOrEqual(1);
  });

  it("maps difficulty to ease factor and vice-versa", () => {
    expect(difficultyToEase(10)).toBe(1.3);
    expect(difficultyToEase(1)).toBe(3.5);
    expect(easeToDifficulty(1.3)).toBe(10);
    expect(easeToDifficulty(3.5)).toBe(1);
  });
});

describe("FSRS v4.5 Lite - Stability Updates (Recall & Lapse)", () => {
  const s = 10;
  const d = 5;
  const r = 0.9;

  it("initializes stability monotonically: S0(1) < S0(2) < S0(3) < S0(4)", () => {
    const s1 = initialStability(1);
    const s2 = initialStability(2);
    const s3 = initialStability(3);
    const s4 = initialStability(4);

    expect(s1).toBeLessThan(s2);
    expect(s2).toBeLessThan(s3);
    expect(s3).toBeLessThan(s4);
  });

  it("increases stability on successful recall (grades 2, 3, 4)", () => {
    const sHard = nextRecallStability(d, s, r, 2);
    const sGood = nextRecallStability(d, s, r, 3);
    const sEasy = nextRecallStability(d, s, r, 4);

    expect(sHard).toBeGreaterThanOrEqual(s);
    expect(sGood).toBeGreaterThan(sHard);
    expect(sEasy).toBeGreaterThan(sGood);
  });

  it("produces higher stability boost when recalled at lower retrievability", () => {
    const sRecallHighR = nextRecallStability(d, s, 0.95, 3);
    const sRecallLowR = nextRecallStability(d, s, 0.7, 3);

    expect(sRecallLowR).toBeGreaterThan(sRecallHighR);
  });

  it("drops stability substantially on lapse (Again, grade 1)", () => {
    const sPostLapse = nextForgetStability(d, s, r);
    expect(sPostLapse).toBeLessThan(s);
    expect(sPostLapse).toBeGreaterThanOrEqual(0.1);
  });
});

describe("computeFsrsNextReview", () => {
  it("initializes review for a brand new card on Good (3)", () => {
    const result = computeFsrsNextReview(
      { srs_interval: 0, ease_factor: 2.5 },
      3,
      0.9,
      NOW,
    );

    expect(result.interval).toBeGreaterThanOrEqual(1);
    expect(result.stability).toBeGreaterThan(0);
    expect(result.difficulty).toBeGreaterThan(0);
    expect(result.retrievability).toBe(1.0);
    expect(new Date(result.nextReviewDate).getTime()).toBeGreaterThan(
      NOW.getTime(),
    );
  });

  it("resets interval to 0 and schedules immediately on Again (1)", () => {
    const newMiss = computeFsrsNextReview(
      { srs_interval: 0, ease_factor: 2.5 },
      1,
      0.9,
      NOW,
    );
    expect(newMiss.interval).toBe(0);
    expect(newMiss.nextReviewDate).toBe(NOW.toISOString());

    const existingMiss = computeFsrsNextReview(
      { srs_interval: 15, ease_factor: 2.5, stability: 15, difficulty: 5 },
      1,
      0.9,
      NOW,
    );
    expect(existingMiss.interval).toBe(0);
    expect(existingMiss.nextReviewDate).toBe(NOW.toISOString());
    expect(existingMiss.stability).toBeLessThan(15);
  });

  it("adapts interval to target retention (0.80, 0.90, 0.95)", () => {
    const card = {
      srs_interval: 10,
      ease_factor: 2.5,
      stability: 10,
      difficulty: 5,
    };

    const r80 = computeFsrsNextReview(card, 3, 0.8, NOW);
    const r90 = computeFsrsNextReview(card, 3, 0.9, NOW);
    const r95 = computeFsrsNextReview(card, 3, 0.95, NOW);

    expect(r95.interval).toBeLessThan(r90.interval);
    expect(r90.interval).toBeLessThan(r80.interval);
  });

  it("sets next review date to local midnight for interval > 0", () => {
    const result = computeFsrsNextReview(
      { srs_interval: 5, ease_factor: 2.5, stability: 5 },
      3,
      0.9,
      NOW,
    );

    const scheduled = new Date(result.nextReviewDate);
    expect(scheduled.getHours()).toBe(0);
    expect(scheduled.getMinutes()).toBe(0);
    expect(scheduled.getSeconds()).toBe(0);
    expect(scheduled.getMilliseconds()).toBe(0);
  });
});
