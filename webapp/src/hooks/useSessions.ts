import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionsApi, type LogSessionInput } from "../api/sessions";
import { logSession as logSessionOffline } from "../lib/offlineSync";

export const sessionsKeys = {
  since: (daysBack: number) => ["sessions", daysBack] as const,
};

export function useSessionsSince(daysBack = 90) {
  return useQuery({
    queryKey: sessionsKeys.since(daysBack),
    queryFn: () => sessionsApi.fetchSince(daysBack),
  });
}

/* Routed through the offline queue's helper so a session finished with no
 * connection is queued and replayed on reconnect rather than dropped (the
 * local-first copy in TimerProvider already survives the gap; this preserves
 * the Supabase copy too). No invalidation while queued — the server doesn't
 * have the session yet, and the queue invalidates after each replay. */
export function useLogSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LogSessionInput) => logSessionOffline(input),
    onSuccess: ({ queued }) => {
      if (queued) return;
      qc.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
