/* Readiness, as the student and a parent read it (2026-10 revamp, design_handoff
 * → Screens "Progress"). Never a bare percentage: a range with a basis, when
 * it was last updated, and the best next move. Under ~20 checked answers
 * there is not enough to go on, and it says so instead of guessing.
 *
 * Built only from what the forecast already computes (trajectory.ts
 * `confidence.lower/upper`, `todayScore`) and the evidence stream. The
 * "likely" band is the forecast's own confidence interval; "possible" widens
 * it by half again each side, so the outer band never claims more than the
 * inner one. Scores are out of 100 — Learnora has no board-specific grade
 * boundaries, so it does not invent a grade. */

import type { LearningEvent } from "../api/types";
import type { TrajectoryForecast } from "./trajectory";
import type { AiToolId, QuotaUsage } from "./entitlements";
import type { SessionMode } from "./sessionModes";

export const READINESS_MIN_ANSWERS = 20;

export type Readiness =
  | {
      insufficient: false;
      likely: [number, number];
      possible: [number, number];
      answers: number;
      updatedAt: string | null;
      bestMove: string | null;
    }
  | { insufficient: true; answers: number; needed: number };

/** Checked answers in the evidence window: anything with an outcome. */
export function checkedAnswers(
  events: readonly LearningEvent[],
): LearningEvent[] {
  return events.filter((e) => e.score !== null);
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function readinessFrom(
  forecast: TrajectoryForecast | null,
  events: readonly LearningEvent[],
): Readiness {
  const answered = checkedAnswers(events);
  if (!forecast || answered.length < READINESS_MIN_ANSWERS) {
    return {
      insufficient: true,
      answers: answered.length,
      needed: READINESS_MIN_ANSWERS,
    };
  }
  const lo = clamp(forecast.confidence.lower);
  const hi = Math.max(lo, clamp(forecast.confidence.upper));
  const spread = Math.max(4, (hi - lo) / 2);
  const updatedAt =
    answered
      .map((e) => e.occurred_at)
      .sort()
      .at(-1) ?? null;
  return {
    insufficient: false,
    likely: [lo, hi],
    possible: [clamp(lo - spread), clamp(hi + spread)],
    answers: answered.length,
    updatedAt,
    bestMove: forecast.interventions[0]?.label ?? null,
  };
}

/* ---- Limits ------------------------------------------------------------ */

/** Which daily allowance a session mode draws on, for a pre-start heads-up.
 *  Recall is cards (free). Practice is left out on purpose: it starts from
 *  the question bank and only calls the AI when the bank can't cover the
 *  topic, so "uses 1 tutor go" would often be untrue. */
export const MODE_TOOL: Partial<Record<SessionMode, AiToolId>> = {
  explain: "debugger",
  socratic: "sparring",
  teach: "feynman",
};

/** Heads-up only from two goes left down, and only before a session starts. */
export const LIMIT_WARN_AT = 2;

export type LimitState = "none" | "low" | "last" | "out";

export function limitState(u: QuotaUsage | null): LimitState {
  if (!u || u.unlimited) return "none";
  if (u.remaining <= 0) return "out";
  if (u.remaining === 1) return "last";
  return u.remaining <= LIMIT_WARN_AT ? "low" : "none";
}
