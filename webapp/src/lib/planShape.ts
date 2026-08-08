/* Shape-checking for a stored weekly plan.
 *
 * `weekly_plans.plan_json` is free-form JSON written by whatever the model
 * returned, so nothing about it is guaranteed once it is back out of the
 * database — an older row, a hand-edited one, or a provider that drifted can
 * all put a string where a number belongs. The vanilla read it optimistically
 * (`d.blocks || []`, `String(b.durationMins)`) and rendered "undefinedm" when
 * it was wrong. These narrow it once, at the boundary, so callers can be
 * written against real types.
 *
 * Lives in lib/, not views/plan/ (moved here alongside planAdherence.ts):
 * api/aiPlan.ts needs to parse a previously-stored plan too, to compare it
 * against what actually got studied when building the next week's prompt,
 * and api/ doesn't reach into views/ for that the way PlanView.tsx does. */

import type { PlanBlock, PlanDay, WeeklyPlanJson } from "./aiJson";

/** The vanilla's fallback when a block carries no duration
 *  (js/router.js:1129 `data-plan-duration="${b.durationMins || 25}"`). */
export const DEFAULT_BLOCK_MINUTES = 25;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toBlock(value: unknown): PlanBlock | null {
  if (!isRecord(value) || typeof value.subject !== "string") return null;
  const mins = Number(value.durationMins);
  return {
    subject: value.subject,
    durationMins:
      Number.isFinite(mins) && mins > 0
        ? Math.round(mins)
        : DEFAULT_BLOCK_MINUTES,
    startHint:
      typeof value.startHint === "string" ? value.startHint : undefined,
    reason: typeof value.reason === "string" ? value.reason : undefined,
  };
}

function toDay(value: unknown): PlanDay | null {
  if (!isRecord(value) || typeof value.date !== "string") return null;
  const blocks = Array.isArray(value.blocks)
    ? value.blocks.map(toBlock).filter((b): b is PlanBlock => b !== null)
    : [];
  return { date: value.date, blocks };
}

/** Narrow a stored `plan_json` to the days the grid can actually render.
 *  Returns `null` for anything unrecognisable, which the view treats the same
 *  as having no plan at all. */
export function parseStoredPlan(planJson: unknown): WeeklyPlanJson | null {
  if (!isRecord(planJson) || !Array.isArray(planJson.days)) return null;
  const days = planJson.days.map(toDay).filter((d): d is PlanDay => d !== null);
  return {
    summary:
      typeof planJson.summary === "string" ? planJson.summary : undefined,
    days,
    isTriage: planJson.isTriage === true ? true : undefined,
  };
}
