import { describe, expect, it } from "vitest";
import { DEFAULT_EASE, MIN_EASE, isDue, scheduleCard } from "./srs";

const NOW = new Date("2026-07-31T09:00:00.000Z");

/** Whole days between `now` and a scheduled ISO date. */
const daysUntil = (iso: string) =>
  Math.round((new Date(iso).getTime() - NOW.getTime()) / 86_400_000);

describe("scheduleCard", () => {
  describe("a passing score (Good / Easy)", () => {
    it("gives a brand-new card one day", () => {
      const next = scheduleCard({
        interval: 0,
        ease: null,
        quality: 3,
        now: NOW,
      });
      expect(next.interval).toBe(1);
      expect(daysUntil(next.nextReviewDate)).toBe(1);
    });

    it("steps 1 day to 3 rather than multiplying", () => {
      expect(
        scheduleCard({ interval: 1, ease: DEFAULT_EASE, quality: 3, now: NOW })
          .interval,
      ).toBe(3);
    });

    it("multiplies by ease from the third pass on, rounded", () => {
      /* 3 * 2.5 = 7.5 → 8. */
      expect(
        scheduleCard({ interval: 3, ease: 2.5, quality: 4, now: NOW }).interval,
      ).toBe(8);
      /* 8 * 2.6 = 20.8 → 21. */
      expect(
        scheduleCard({ interval: 8, ease: 2.6, quality: 4, now: NOW }).interval,
      ).toBe(21);
    });

    it("rewards a pass with more ease", () => {
      expect(
        scheduleCard({ interval: 3, ease: 2.5, quality: 3, now: NOW }).ease,
      ).toBeCloseTo(2.6);
    });
  });

  describe("a failing score (Again / Hard)", () => {
    /* interval 0 means `next_review_date` is *now*, so the card is due
       immediately — it comes back next visit, not later in this session. */
    it("resets the interval to zero and schedules the card for now", () => {
      const next = scheduleCard({
        interval: 21,
        ease: 2.8,
        quality: 1,
        now: NOW,
      });
      expect(next.interval).toBe(0);
      expect(next.nextReviewDate).toBe(NOW.toISOString());
      expect(isDue(next.nextReviewDate, NOW)).toBe(true);
    });

    it("penalises ease", () => {
      expect(
        scheduleCard({ interval: 3, ease: 2.5, quality: 2, now: NOW }).ease,
      ).toBeCloseTo(2.3);
    });

    it("never lets ease fall below the floor", () => {
      const next = scheduleCard({
        interval: 3,
        ease: 1.35,
        quality: 1,
        now: NOW,
      });
      expect(next.ease).toBe(MIN_EASE);
    });

    it("treats Hard (2) as a failure, like the vanilla's `quality < 3`", () => {
      expect(
        scheduleCard({ interval: 10, ease: 2.5, quality: 2, now: NOW })
          .interval,
      ).toBe(0);
    });
  });

  describe("cards with no prior schedule", () => {
    it("falls back to the default ease for null, undefined and 0", () => {
      for (const ease of [null, undefined, 0]) {
        expect(
          scheduleCard({ interval: 0, ease, quality: 3, now: NOW }).ease,
        ).toBeCloseTo(DEFAULT_EASE + 0.1);
      }
    });

    it("treats a null interval as zero", () => {
      expect(
        scheduleCard({ interval: null, ease: 2.5, quality: 3, now: NOW })
          .interval,
      ).toBe(1);
    });
  });

  /* Documented, not a bug introduced here: the vanilla has no ease ceiling
     where real SM-2 does, so a long-running card accelerates. Pinned so the
     day someone adds a cap it is a deliberate change with a failing test, not
     a silent reschedule of every deck in the database. */
  it("has no upper bound on ease", () => {
    let ease = DEFAULT_EASE;
    for (let i = 0; i < 20; i++) {
      ease = scheduleCard({ interval: 5, ease, quality: 4, now: NOW }).ease;
    }
    expect(ease).toBeGreaterThan(4);
  });
});

describe("isDue", () => {
  /* The NULL case is the bug `fetchDueCount` documents: `.lte()` alone
     excludes never-reviewed cards, so a brand-new deck reported "0 due" while
     the review screen happily served the same cards. */
  it("treats a never-reviewed card as due", () => {
    expect(isDue(null, NOW)).toBe(true);
    expect(isDue(undefined, NOW)).toBe(true);
  });

  it("is due once the scheduled moment has passed", () => {
    expect(isDue("2026-07-30T09:00:00.000Z", NOW)).toBe(true);
    expect(isDue(NOW.toISOString(), NOW)).toBe(true);
  });

  it("is not due while the schedule is still in the future", () => {
    expect(isDue("2026-08-05T09:00:00.000Z", NOW)).toBe(false);
  });
});
