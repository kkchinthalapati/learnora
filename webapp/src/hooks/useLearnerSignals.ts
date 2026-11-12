import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { learnerSignalsApi, learnerSignalsKey, type RecordSignalInput } from "../api/learnerSignals";
import { suggestStyle, type LearnerSignal } from "../lib/learnerSignals";
import type { LearnerProfile } from "../lib/learnerProfile";

/** The student's recent signals, the style they point to, and a way to add
 *  one. `record` never throws and refreshes this query when it lands. */
export function useLearnerSignals(learner?: Pick<LearnerProfile, "style" | "prefs">) {
  const query = useQuery({
    queryKey: learnerSignalsKey,
    queryFn: () => learnerSignalsApi.fetchState(),
    staleTime: 60_000,
  });
  const signals: LearnerSignal[] = useMemo(() => query.data?.signals ?? [], [query.data]);
  const style = learner?.style ?? null;
  const prefs = learner?.prefs;
  const suggestion = useMemo(
    () => suggestStyle(signals, style, Date.now(), prefs ?? []),
    [signals, style, prefs],
  );
  return {
    signals,
    suggestion,
    isPending: query.isPending,
    /** Only once the read says the table exists. */
    available: query.data?.available ?? false,
    record: (input: RecordSignalInput) => learnerSignalsApi.record(input),
  };
}
