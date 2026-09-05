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
  MAX_REVIEW_INTERVAL_DAYS,
} from "./srs";

const NOW = new Date("2026-07-31T12:00:00.000Z");

function card(overrides: { srs_interval?: number; ease_factor?: number } = {}) {
  return { srs_interval: 0, ease_factor: 2.5, ...overrides };
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
    /* S0(Good) is ~3.17 days, and the interval is the day retrievability is
       predicted to reach the 90% target — so a new card answered Good comes
       back in about three days, not tomorrow. */
    expect(state.interval).toBe(3);
    expect(state.ease).toBeCloseTo(difficultyToEase(state.difficulty), 2);
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
    /* Ease is derived from difficulty now, and a miss drives difficulty up,
       so ease falls — it just falls by the amount the model says rather than
       a flat 0.2. */
    expect(existingMiss.ease).toBeLessThan(2.5);
    expect(existingMiss.ease).toBeCloseTo(
      difficultyToEase(existingMiss.difficulty),
      2,
    );
  });

  it("progresses stability and interval on repeated successful reviews", () => {
    const round1 = computeFsrsCardState({ quality: 3, now: NOW });

    const round2 = computeFsrsCardState({
      previousInterval: round1.interval,
      stability: round1.stability,
      difficulty: round1.difficulty,
      elapsedDays: round1.interval,
      quality: 3,
      now: NOW,
    });
    expect(round2.stability).toBeGreaterThan(round1.stability);
    expect(round2.interval).toBeGreaterThan(round1.interval);

    const round3 = computeFsrsCardState({
      previousInterval: round2.interval,
      stability: round2.stability,
      difficulty: round2.difficulty,
      elapsedDays: round2.interval,
      quality: 3,
      now: NOW,
    });
    expect(round3.stability).toBeGreaterThan(round2.stability);
    expect(round3.interval).toBeGreaterThan(round2.interval);
  });

  it("derives the interval from stability, not from interval x ease", () => {
    const state = computeFsrsCardState({
      previousInterval: 10,
      stability: 40,
      difficulty: 5,
      elapsedDays: 10,
      quality: 3,
      now: NOW,
    });
    expect(state.interval).toBe(calculateOptimalInterval(state.stability, 0.9));
  });
});

describe("nextReviewState (FSRS scheduling)", () => {
  it("resets the interval to zero on a miss (Again)", () => {
    const result = nextReviewState(card({ srs_interval: 8 }), 1, NOW);
    expect(result.interval).toBe(0);
    expect(result.nextReviewDate).toBe(NOW.toISOString());
  });

  /* The defect this file exists to pin down. "Hard" is a successful (if
     effortful) recall, but the scheduler graded every quality < 3 as a lapse,
     so pressing Hard on a mature card wiped its interval to 0 exactly as
     Again did. The two buttons were indistinguishable in effect. */
  it("treats Hard as a recall, not a lapse", () => {
    const mature = card({ srs_interval: 30, ease_factor: 2.5 });
    const hard = nextReviewState(mature, 2, NOW);
    const again = nextReviewState(mature, 1, NOW);

    expect(again.interval).toBe(0);
    expect(hard.interval).toBeGreaterThan(0);
    expect(hard.interval).toBeGreaterThan(again.interval);
  });

  /* The second half of the same defect: Good and Easy both fell through to
     `previousInterval * ease`, which reads neither grade, so the two buttons
     produced byte-identical schedules. */
  it("orders intervals by grade: Again < Hard < Good < Easy", () => {
    const mature = card({ srs_interval: 30, ease_factor: 2.5 });
    const [again, hard, good, easy] = [1, 2, 3, 4].map(
      (q) => nextReviewState(mature, q, NOW).interval,
    );

    expect(again).toBe(0);
    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it("softens the ease factor on a miss, floored at 1.3", () => {
    const reviewed = {
      srs_interval: 10,
      ease_factor: 1.4,
      stability: 10,
      difficulty: easeToDifficulty(1.4),
    };
    const missed = nextReviewState(reviewed, 1, NOW);
    expect(missed.ease).toBeLessThanOrEqual(1.4);
    expect(missed.ease).toBeGreaterThanOrEqual(1.3);
    expect(
      nextReviewState({ ...reviewed, ease_factor: 1.35 }, 1, NOW).ease,
    ).toBeGreaterThanOrEqual(1.3);
  });

  it("keeps the ease factor inside the SM-2 band however long the streak", () => {
    /* Ease used to gain a flat +0.1 on every success with no ceiling, and the
       interval was `previousInterval * ease` — so the two compounded. Ten
       Good answers in a row scheduled a card 21,362 days (58 years) out, and
       `fetchWeakDecks`, which reads `ease_factor < 2.1`, was reading a number
       that had drifted off its own scale. */
    let state = { srs_interval: 0, ease_factor: 2.5 } as Parameters<
      typeof nextReviewState
    >[0];
    let at = new Date(NOW);
    let interval = 0;

    for (let i = 0; i < 15; i++) {
      const result = nextReviewState(state, 3, at);
      expect(result.ease).toBeGreaterThanOrEqual(1.3);
      expect(result.ease).toBeLessThanOrEqual(3.5);
      interval = result.interval;
      state = {
        srs_interval: result.interval,
        ease_factor: result.ease,
        next_review_date: result.nextReviewDate,
        stability: result.stability,
        difficulty: result.difficulty,
      };
      at = new Date(result.nextReviewDate);
    }

    /* A long unbroken streak now tops out at the app's own ceiling rather
       than FSRS's 36,500-day spec default. */
    expect(interval).toBeLessThanOrEqual(MAX_REVIEW_INTERVAL_DAYS);
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

  it("is due for an earlier session on the due day itself", () => {
    const reviewedAt = new Date(NOW);
    reviewedAt.setHours(20, 0, 0, 0);

    const { interval, nextReviewDate } = nextReviewState(card(), 3, reviewedAt);

    const dueEvening = new Date(reviewedAt);
    dueEvening.setDate(dueEvening.getDate() + interval);
    dueEvening.setHours(19, 0, 0, 0);

    expect(new Date(nextReviewDate) <= dueEvening).toBe(true);
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

  it("collapses stability on a lapse so the card is re-learned, not re-scheduled far out", () => {
    const mature = {
      srs_interval: 60,
      ease_factor: 2.5,
      stability: 60,
      difficulty: 5,
    };
    const lapsed = nextReviewState(mature, 1, NOW);
    expect(lapsed.interval).toBe(0);
    expect(lapsed.stability!).toBeLessThan(60);

    /* Answering Good after the lapse must not jump straight back to two
       months — the collapsed stability is what keeps the next step short. */
    const recovered = nextReviewState(
      {
        srs_interval: 0,
        ease_factor: lapsed.ease,
        stability: lapsed.stability,
        difficulty: lapsed.difficulty,
      },
      3,
      NOW,
    );
    expect(recovered.interval).toBeLessThan(60);
  });

  it("carries persisted memory state instead of re-deriving it each review", () => {
    const withState = nextReviewState(
      {
        srs_interval: 10,
        ease_factor: 2.5,
        stability: 100,
        difficulty: 3,
      },
      3,
      NOW,
    );
    const withoutState = nextReviewState(
      card({ srs_interval: 10, ease_factor: 2.5 }),
      3,
      NOW,
    );

    /* A card the model knows to be very stable is scheduled far further out
       than the same card read only through its legacy interval/ease pair. */
    expect(withState.interval).toBeGreaterThan(withoutState.interval);
  });

  it("falls back to interval and ease for a card with no stored memory state", () => {
    const legacy = nextReviewState(
      card({ srs_interval: 10, ease_factor: 2.5 }),
      3,
      NOW,
    );
    expect(legacy.interval).toBeGreaterThan(0);
    expect(legacy.stability).toBeGreaterThan(0);
    expect(legacy.difficulty).toBeGreaterThan(0);
  });

  it("defaults a never-reviewed card's ease factor to the average band", () => {
    const result = nextReviewState({ srs_interval: 0, ease_factor: 0 }, 3, NOW);
    expect(result.ease).toBeGreaterThanOrEqual(1.3);
    expect(result.ease).toBeLessThanOrEqual(3.5);
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
