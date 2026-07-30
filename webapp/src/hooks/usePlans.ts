import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { plansApi } from "../api/plans";
import { generateWeeklyPlan } from "../api/aiPlan";
import { useSettings } from "../context/settings";

export const plansKeys = {
  forWeek: (weekStartISO: string) => ["plans", weekStartISO] as const,
};

export function usePlanForWeek(weekStartISO: string) {
  return useQuery({
    queryKey: plansKeys.forWeek(weekStartISO),
    queryFn: () => plansApi.fetchForWeek(weekStartISO),
    enabled: !!weekStartISO,
  });
}

export function useUpsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      weekStartISO,
      planJson,
    }: {
      weekStartISO: string;
      planJson: unknown;
    }) => plansApi.upsert(weekStartISO, planJson),
    onSuccess: (_data, { weekStartISO }) =>
      qc.invalidateQueries({ queryKey: plansKeys.forWeek(weekStartISO) }),
  });
}

/* The AI generation round trip. `plansApi.upsert` runs inside
 * `generateWeeklyPlan`, so the row this resolves with is the saved one, read
 * back from the database — writing it into the cache is enough, and there is
 * nothing an invalidation could learn that this row doesn't already say. Both
 * entry points (the /plan view and the dashboard card) subscribe to the same
 * key, so both repaint from one write.
 *
 * Settings are read here rather than inside the api module so the request
 * carries whatever `SettingsProvider` currently holds, including edits the
 * user hasn't saved yet — the same thing the vanilla's `UI.loadSettings()`
 * read off its live in-memory object. */
export function useGenerateWeeklyPlan() {
  const qc = useQueryClient();
  const { settings } = useSettings();
  return useMutation({
    mutationFn: () => generateWeeklyPlan(settings),
    onSuccess: (plan) =>
      qc.setQueryData(plansKeys.forWeek(plan.week_start), plan),
  });
}
