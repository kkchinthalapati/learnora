import { useQuery } from "@tanstack/react-query";
import { aiUsageKeys, fetchDailyAiUsage } from "../api/aiUsage";
import { useEntitlements } from "./useSubscription";
import type { QuotaUsage } from "../lib/entitlements";

/* Today's AI allowance, joined to the plan that sets it.
 *
 * Two halves that live apart: how many generations have been spent (a count in
 * `ai_request_log`) and how many are allowed (a number that depends on the
 * plan). `useEntitlements().usage` already knows how to combine them, so this
 * hook is the fetch plus that call.
 *
 * `staleTime: 0` is deliberate against the app's 60s default. Everything else
 * cached here describes the student's own library, which only they change from
 * this tab; this describes a budget the server decrements on every AI call,
 * including calls made from another tab or another device. A meter that is a
 * minute stale is a meter that says "8 left" to someone who has none, which is
 * worse than no meter. `api/ai.ts` invalidates the key on every answered
 * request, so in practice this refetches when the number has actually moved.
 */
export interface AiUsageResult {
  usage: QuotaUsage;
  /** ISO timestamp of the next reset (midnight UTC), null until loaded. */
  resetsAt: string | null;
  /** True while either half is still loading. Callers must not render a
   *  number during this: "0 used" and "unknown" look identical and only one
   *  of them is true. */
  isPending: boolean;
  isError: boolean;
}

export function useAiUsage(): AiUsageResult {
  const { usage, isPending: planPending } = useEntitlements();
  const query = useQuery({
    queryKey: aiUsageKeys.today,
    queryFn: fetchDailyAiUsage,
    staleTime: 0,
  });

  return {
    usage: usage("aiGenerationsPerDay", query.data?.used ?? 0),
    resetsAt: query.data?.resetsAt ?? null,
    isPending: planPending || query.isPending,
    isError: query.isError,
  };
}
