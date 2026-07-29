import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { plansApi } from "../api/plans";

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
