import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { recordLoopObservation } from "../lib/offlineSync";
import { needsRepair, retestDueAt } from "../lib/mistakeLoop";
import { armFor, experimentTag, RETEST_DELAY, RETEST_DELAY_DAYS } from "../lib/experiments";
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
    (
      row: Row,
      opts: { sourceId: string; checkQuestion?: string; tool?: MisconceptionTool; detail?: string },
    ) => {
      const now = new Date();
      const arm = armFor(RETEST_DELAY, row.id);
      void recordLoopObservation({
        misconceptionId: row.id,
        kind: "repair",
        sourceTool: opts.tool ?? row.originTool,
        /* The repair's own check can never be the "new" retest question. */
        questionKey: opts.checkQuestion ? questionKey(opts.checkQuestion) : null,
        /* One repair per sighting: re-opening the card doesn't restart the
           clock, but a fresh mistake (a new times_observed) needs a new one. */
        idempotencyKey: observationKey("repair", row.id, String(row.timesObserved), opts.sourceId),
        dueAt: retestDueAt(now, row.timesObserved, RETEST_DELAY_DAYS[arm]),
        detail: `${opts.detail ?? "Re-teach and contrast shown."} ${experimentTag(RETEST_DELAY, arm)}`,
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

/**
 * A finished "tell them apart" drill (views/tellapart), written to the rows
 * whose own belief is that confusion (lib/confusionPairs.ts `named`):
 *
 * - two or more mis-sorts: evidence, once per row per drill, quoting the
 *   first statement missed. It is the mix-up happening again, so the loop
 *   reopens the row and voids its repair, the same as a wrong quiz answer.
 * - a clean sort: a correction with no question behind it, so the loop moves
 *   the row to "improving" at most. Sorting six statements is not a new
 *   question days after a re-teach, so it can never mark a row fixed.
 * - one mis-sort: a slip, nothing written.
 *
 * Returns what was written, so the screen says only what happened.
 */
export function useRecordTellApart() {
  const qc = useQueryClient();
  return useCallback(
    async (
      rows: readonly Pick<Misconception, "id">[],
      outcome: "evidence" | "correction" | "none",
      opts: { runId: string; firstMiss?: string },
    ): Promise<boolean> => {
      if (outcome === "none" || rows.length === 0) return false;
      const detail =
        outcome === "evidence"
          ? `Mixed the two up again in a tell-them-apart drill: "${(opts.firstMiss ?? "").slice(0, 200)}".`
          : "Told the two apart in a tell-them-apart drill without a miss.";
      const writes = rows.map((row) =>
        recordLoopObservation({
          misconceptionId: row.id,
          kind: outcome,
          sourceTool: "review",
          questionKey: outcome === "evidence" && opts.firstMiss ? questionKey(opts.firstMiss) : null,
          idempotencyKey: observationKey("tell-apart", row.id, opts.runId, outcome),
          detail,
        }),
      );
      const settled = await Promise.allSettled(writes);
      for (const r of settled) {
        if (r.status === "rejected") console.warn("[mistakeLoop] tell-apart not recorded:", r.reason);
      }
      void qc.invalidateQueries({ queryKey: misconceptionsKeys.all });
      return settled.some((r) => r.status === "fulfilled");
    },
    [qc],
  );
}

/**
 * Past you conceded (views/pastyou). Two writes, and neither says "fixed":
 *
 * - The argument is the re-teach, so a row that hasn't had one since it was
 *   last seen gets a repair, which schedules its check-back. A row already
 *   repaired keeps the check-back it has; a second repair would push a due
 *   date further away.
 * - Explaining it well enough to convince someone is the student showing
 *   they have it right, so a correction. With no question behind it, the
 *   loop's rule moves the row to "improving" at most: only the check-back,
 *   on a new question days later, can resolve it.
 *
 * No evidence is ever written from the argument itself. Arguing naturally
 * restates the other side ("you say heavier things fall faster, but…"),
 * which the catalogue's detector would read as the student stating it.
 *
 * Returns when the check-back is due, for the screen to say so.
 */
export function useRecordPastYou() {
  const qc = useQueryClient();
  const recordRepair = useRecordRepair();
  return useCallback(
    (m: Misconception, opts: { sessionId: string; argument: string }): string | null => {
      const quote = opts.argument.trim().slice(0, 280);
      let checkBackAt = m.retestDueAt ?? null;
      if (needsRepair(m)) {
        recordRepair(m, {
          sourceId: `past-you:${opts.sessionId}`,
          tool: "feynman",
          detail: `Talked past you out of it: "${quote}".`,
        });
        checkBackAt = retestDueAt(new Date(), m.timesObserved, RETEST_DELAY_DAYS[armFor(RETEST_DELAY, m.id)]);
      }
      void recordLoopObservation({
        misconceptionId: m.id,
        kind: "correction",
        sourceTool: "feynman",
        questionKey: null,
        idempotencyKey: observationKey("past-you", m.id, opts.sessionId),
        detail: `Talked past you out of it: "${quote}".`,
      })
        .then(() => qc.invalidateQueries({ queryKey: misconceptionsKeys.all }))
        .catch((err) => console.warn("[mistakeLoop] past-you correction not recorded:", err));
      return checkBackAt;
    },
    [qc, recordRepair],
  );
}
