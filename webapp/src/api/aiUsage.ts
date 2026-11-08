/* How much of today's AI allowance the student has actually spent, per tool.
 *
 * The allowance itself is enforced server-side, in the edge function
 * (supabase/functions/learnora-ai/index.ts) — it counts this user's rows in
 * `ai_request_log`, filtered to the tool being called, since midnight UTC, and
 * answers 429 past that tool's limit. That is the boundary, and nothing here
 * is part of it: a number in the browser is not a limit, and this module must
 * never be mistaken for one.
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
 *
 * One query, not ten: this fetches every row from today (a handful even for a
 * Pro account hammering every tool) and buckets them client-side, rather than
 * issuing a separate `count` request per tool. */

import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { AiToolId } from "../lib/entitlements";

export const aiUsageKeys = {
  today: ["ai-usage", "today"] as const,
};

export interface DailyAiUsage {
  /** Accepted AI requests since midnight UTC, keyed by tool. A tool with no
   *  rows today is simply absent — callers read this with `?? 0`. */
  usedByTool: Partial<Record<AiToolId, number>>;
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

/** Today's spend per tool, in the same units the edge function bills in
 *  (`billingDecision` in supabase/functions/_shared/sessionBilling.js): every
 *  call that carries a session key counts once per distinct key, so a whole
 *  Learn lesson — its overview, each part and the recap — is one unit; a call
 *  with no key is one unit of its own. Counting rows instead made a three-part
 *  lesson read as "3 of 3 used" while the server had spent one. Kept by hand
 *  in step with that function, the same way entitlements.ts mirrors QUOTAS. */
export function unitsByTool(
  rows: { tool: string | null; session_key: string | null }[],
): Partial<Record<AiToolId, number>> {
  const keysByTool = new Map<AiToolId, Set<string>>();
  const unkeyedByTool = new Map<AiToolId, number>();
  for (const row of rows) {
    /* A row logged before the `tool` column existed, or by a caller not yet
       migrated to send one, is billed to "chat" (DEFAULT_TOOL). */
    const tool = (row.tool as AiToolId | null) ?? "chat";
    if (row.session_key) {
      const keys = keysByTool.get(tool) ?? new Set<string>();
      keys.add(row.session_key);
      keysByTool.set(tool, keys);
    } else {
      unkeyedByTool.set(tool, (unkeyedByTool.get(tool) ?? 0) + 1);
    }
  }
  const usedByTool: Partial<Record<AiToolId, number>> = {};
  for (const tool of new Set([...keysByTool.keys(), ...unkeyedByTool.keys()])) {
    usedByTool[tool] = (keysByTool.get(tool)?.size ?? 0) + (unkeyedByTool.get(tool) ?? 0);
  }
  return usedByTool;
}

export async function fetchDailyAiUsage(): Promise<DailyAiUsage> {
  const userId = await requireUserId();
  const now = new Date();

  const { data, error } = await supabase
    .from("ai_request_log")
    .select("tool, session_key")
    .eq("user_id", userId)
    /* A request no provider answered is kept but marked refunded, and the
       limiter skips it; so must the meter. */
    .eq("refunded", false)
    .gte("created_at", utcDayStart(now).toISOString());

  if (error) throw new Error(error.message);

  /* A row logged before the `tool` column existed, or by a caller not yet
     migrated to send one, has `tool: null` — billed to "chat" server-side
     (see DEFAULT_TOOL in the edge function), so it is counted the same way
     here rather than silently dropped from every meter. */
  const usedByTool = unitsByTool(data ?? []);

  return {
    usedByTool,
    resetsAt: nextUtcDayStart(now).toISOString(),
  };
}
