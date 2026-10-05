import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { recordLoopObservation } from "../lib/offlineSync";
import { retestDueAt } from "../lib/mistakeLoop";
import { observationKey, questionKey } from "../lib/questionKey";
import type { Misconception, MisconceptionTool } from "../lib/misconceptions";
import { misconceptionsKeys } from "./useMisconceptions";

/* The two writes of the repair loop that happen on a ledger row the student
 * is looking at: the repair being shown, and a retest being answered. Both
 * go through the offline queue and are idempotent (lib/offlineSync.ts
 * `recordLoopObservation`), and neither ever surfaces an error into the
 * student's flow — like every other ledger write. */

type Row = Pick<Misconception, "id" | "timesObserved" | "originTool">;

export function useRecordRepair() {
  const qc = useQueryClient();
  return useCallback(
    (row: Row, opts: { sourceId: string; checkQuestion?: string; tool?: MisconceptionTool }) => {
      const now = new Date();
      void recordLoopObservation({
        misconceptionId: row.id,
        kind: "repair",
        sourceTool: opts.tool ?? row.originTool,
        /* The repair's own check can never be the "new" retest question. */
        questionKey: opts.checkQuestion ? questionKey(opts.checkQuestion) : null,
        /* One repair per sighting: re-opening the card doesn't restart the
           clock, but a fresh mistake (a new times_observed) needs a new one. */
        idempotencyKey: observationKey("repair", row.id, String(row.timesObserved), opts.sourceId),
        dueAt: retestDueAt(now, row.timesObserved),
        detail: "Re-teach and contrast shown.",
      })
        .then(() => qc.invalidateQueries({ queryKey: misconceptionsKeys.all }))
        .catch((err) => console.warn("[mistakeLoop] repair not recorded:", err));
    },
    [qc],
  );
}

export function useRecordRetest() {
  const qc = useQueryClient();
  return useCallback(
    (row: Row, question: string, correct: boolean) => {
      const qk = questionKey(question);
      return recordLoopObservation({
        misconceptionId: row.id,
        kind: correct ? "correction" : "evidence",
        sourceTool: "quiz",
        questionKey: qk,
        idempotencyKey: observationKey("retest", row.id, qk),
        detail: correct ? `Retest passed: "${question}"` : `Retest missed: "${question}"`,
      })
        .then((r) => {
          void qc.invalidateQueries({ queryKey: misconceptionsKeys.all });
          return r;
        })
        .catch((err) => {
          console.warn("[mistakeLoop] retest not recorded:", err);
          return { queued: false };
        });
    },
    [qc],
  );
}
