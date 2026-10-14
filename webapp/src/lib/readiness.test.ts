import { describe, expect, it } from "vitest";
import { limitState, readinessFrom, READINESS_MIN_ANSWERS } from "./readiness";
import { quotaUsage } from "./entitlements";
import type { LearningEvent } from "../api/types";
import type { TrajectoryForecast } from "./trajectory";

const forecast = {
  confidence: { lower: 55, upper: 68, evidence: 0.6 },
  interventions: [{ label: "Enzymes" }],
} as unknown as TrajectoryForecast;

function events(n: number, scored = true): LearningEvent[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `e${i}`,
    user_id: "u",
    topic_key: "t",
    deck_id: null,
    folder_id: null,
    source: "quick_check",
    score: scored ? 1 : null,
    minutes: 0,
    occurred_at: `2026-10-${String(1 + (i % 9)).padStart(2, "0")}T10:00:00Z`,
    payload: {},
    client_id: null,
  }));
}

describe("readiness", () => {
  it("says there's not enough to go on under 20 checked answers, rather than guessing", () => {
    expect(readinessFrom(forecast, events(19))).toEqual({
      insufficient: true,
      answers: 19,
      needed: READINESS_MIN_ANSWERS,
    });
    /* Time-only events are not answers. */
    expect(readinessFrom(forecast, events(40, false))).toMatchObject({
      insufficient: true,
      answers: 0,
    });
    expect(readinessFrom(null, events(40))).toMatchObject({
      insufficient: true,
    });
  });

  it("is a range with a wider possible band, a basis, a date and a best move", () => {
    const r = readinessFrom(forecast, events(25));
    expect(r).toMatchObject({
      insufficient: false,
      likely: [55, 68],
      answers: 25,
      bestMove: "Enzymes",
    });
    if (r.insufficient) throw new Error("unreachable");
    expect(r.possible[0]).toBeLessThan(55);
    expect(r.possible[1]).toBeGreaterThan(68);
    expect(r.updatedAt).toBe("2026-10-09T10:00:00Z");
  });
});

describe("limit heads-up", () => {
  it("stays silent until two goes or fewer are left, and never on an unlimited quota", () => {
    expect(limitState(quotaUsage("free", "debugger", 0))).toBe("low"); // free = 2 a day
    expect(limitState(quotaUsage("plus", "debugger", 0))).toBe("none");
    expect(limitState(quotaUsage("free", "debugger", 1))).toBe("last");
    expect(limitState(quotaUsage("free", "debugger", 2))).toBe("out");
    expect(limitState(quotaUsage("pro", "notebooks", 99))).toBe("none");
    expect(limitState(null)).toBe("none");
  });
});
