/* How much of today's AI allowance the student has actually spent.
 *
 * The allowance itself is enforced server-side, in the edge function
 * (supabase/functions/learnora-ai/index.ts) — it counts this user's rows in
 * `ai_request_log` since midnight UTC and answers 429 past the limit. That is
 * the boundary, and nothing here is part of it: a number in the browser is not
 * a limit, and this module must never be mistaken for one.
 *
 * What was missing is the other half. The edge function computes the count,
 * uses it, and throws it away, so the first a student ever heard about the
 * allowance was the request that got refused — mid-task, with no warning that
 * it was coming. This reads the same rows the limiter reads, through the same
 * owner-only RLS policy, purely so the app can show the budget before it runs
 * out.
 *
 * Reading rather than mirroring is the point: there is one source of truth,
 * and the meter is a view of it. A locally-incremented counter would drift the
 * moment a request failed, a second tab was open, or the student came back on
 * their phone.
 */

import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";

export const aiUsageKeys = {
  today: ["ai-usage", "today"] as const,
};

export interface DailyAiUsage {
  /** Accepted AI requests since midnight UTC. */
  used: number;
  /** When the allowance resets, as an ISO timestamp. */
  resetsAt: string;
}

/** Start of the current UTC day — the boundary the edge function counts from
 *  (`midnight.setUTCHours(0, 0, 0, 0)`). UTC rather than the student's own
 *  timezone because that is what the server enforces; showing a reset time
 *  derived from anything else would be showing them the wrong deadline. */
export function utcDayStart(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/** The next UTC midnight — when the count returns to zero. */
export function nextUtcDayStart(now: Date = new Date()): Date {
  const next = utcDayStart(now);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export async function fetchDailyAiUsage(): Promise<DailyAiUsage> {
  const userId = await requireUserId();
  const now = new Date();

  /* `head: true` — the rows themselves are never wanted, only how many there
     are, and the log grows by one row per accepted request all day. */
  const { count, error } = await supabase
    .from("ai_request_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", utcDayStart(now).toISOString());

  if (error) throw new Error(error.message);

  return {
    used: count ?? 0,
    resetsAt: nextUtcDayStart(now).toISOString(),
  };
}
