import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionsApi, type LogSessionInput } from "../api/sessions";

export const sessionsKeys = {
  since: (daysBack: number) => ["sessions", daysBack] as const,
};

export function useSessionsSince(daysBack = 90) {
  return useQuery({
    queryKey: sessionsKeys.since(daysBack),
    queryFn: () => sessionsApi.fetchSince(daysBack),
  });
}

export function useLogSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LogSessionInput) => sessionsApi.log(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions"] }),
  });
}
