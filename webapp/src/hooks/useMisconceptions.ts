import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { misconceptionsApi } from "../api/misconceptions";
import {
  misconceptionsForSubject,
  rankMisconceptions,
  recurringMisconceptions,
  type Misconception,
  type MisconceptionCandidate,
} from "../lib/misconceptions";

/* The misconception ledger, for React surfaces.
 *
 * See supabase/migrations/20260907000000_add_misconception_ledger.sql,
 * api/misconceptions.ts for persistence, lib/misconceptions.ts for the ranking
 * and the per-tool extractors.
 *
 * One query for the whole ledger rather than a query per view. A student
 * accumulates tens of rows, not thousands, and nearly every consumer wants a
 * different slice of the same set — the dashboard wants the top few overall,
 * a subject page wants one subject, the debugger wants recurrence. Fetching
 * once and slicing in memory keeps those consistent with each other and means
 * opening a second surface costs nothing. */

export const misconceptionsKeys = {
  all: ["misconceptions"] as const,
  observations: (id: string) => ["misconceptions", id, "observations"] as const,
};

export function useMisconceptions() {
  const { data, isPending, isError } = useQuery({
    queryKey: misconceptionsKeys.all,
    queryFn: misconceptionsApi.fetchAll,
  });

  const all = useMemo(() => data ?? [], [data]);

  /* `now` is captured once per render rather than per selector so the three
     lists below cannot disagree about recency and reorder relative to each
     other within a single paint. */
  const ranked = useMemo(() => rankMisconceptions(all, new Date()), [all]);
  const recurring = useMemo(() => recurringMisconceptions(all, new Date()), [all]);

  const forSubject = useCallback(
    (subject: string) => misconceptionsForSubject(all, subject, new Date()),
    [all],
  );

  return {
    /** Every row, including resolved ones. */
    all,
    /** Unresolved rows, most urgent first. The default list to show. */
    ranked,
    /** Rows observed more than once — evidence rather than one model's guess. */
    recurring,
    forSubject,
    isPending,
    isError,
  };
}

/**
 * Record diagnoses against the ledger.
 *
 * Fire-and-forget by contract: every caller invokes this as a side effect of
 * something the student actually asked for, so the mutation never surfaces an
 * error into their flow (`api/misconceptions.ts` already swallows per-row
 * failures). Callers should `void record(...)` and carry on.
 */
export function useRecordMisconceptions() {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (candidates: MisconceptionCandidate[]) =>
      misconceptionsApi.record(candidates),
    onSuccess: (written) => {
      /* Only invalidate when something was actually written. Most calls in a
         session produce nothing — a clean quiz, a turn with no confusion —
         and refetching the ledger after each would be pure noise. */
      if (written.length > 0) {
        void qc.invalidateQueries({ queryKey: misconceptionsKeys.all });
      }
    },
  });

  return useCallback(
    (candidates: MisconceptionCandidate[]) => {
      if (candidates.length === 0) return;
      mutation.mutate(candidates);
    },
    [mutation],
  );
}

/** The evidence trail behind one row. Loaded on demand — it is only ever shown
 *  when a student expands a ledger entry to ask "how do you know?". */
export function useMisconceptionObservations(id: string | null) {
  return useQuery({
    queryKey: misconceptionsKeys.observations(id ?? ""),
    queryFn: () => misconceptionsApi.fetchObservations(id as string),
    enabled: Boolean(id),
  });
}

export function useDismissMisconception() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => misconceptionsApi.dismiss(id),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: misconceptionsKeys.all }),
  });
}

export type { Misconception };
