import { useEffect, useRef, useState } from "react";
import type { KnownMisconception } from "../../lib/misconceptionCatalogue";
import type { Misconception, MisconceptionTool } from "../../lib/misconceptions";
import { useRecordMisconceptions } from "../../hooks/useMisconceptions";
import { useRecordRepair } from "../../hooks/useMistakeLoop";
import { misconceptionsApi } from "../../api/misconceptions";
import { observationKey, questionKey } from "../../lib/questionKey";
import styles from "./repair.module.css";

/* A named misconception, repaired on the spot.
 *
 * Shown when a wrong answer (or a diagnosis) matches the catalogue: name the
 * belief, say in two sentences why it is wrong, re-teach it a different way,
 * then check it with one question. The outcome goes to the ledger — the
 * belief as evidence the moment it is shown, the repair itself (which starts
 * the retest clock, lib/mistakeLoop.ts), and a correction when the check is
 * passed. Passing the check moves the row to "improving" only: it is the
 * question just taught, so it proves recall, not repair. "Fixed" waits for a
 * different question at least two days later. */

export function MisconceptionRepair({
  entry,
  sourceId,
  tool,
  detail,
  recordEvidence = true,
  ledgerRow,
  failedQuestion,
}: {
  entry: KnownMisconception;
  /** Stable id of what triggered this (an attempt + question), so a re-render
   *  or a revisit never counts the same mistake twice. */
  sourceId: string;
  tool: MisconceptionTool;
  /** What happened, in the student's own terms, for the ledger trail. */
  detail: string;
  /** False when the mistake is already on record (opened from the ledger). */
  recordEvidence?: boolean;
  /** Write to this existing ledger row instead of the catalogue's concept. */
  ledgerRow?: Pick<Misconception, "subject" | "concept" | "summary"> &
    Partial<Pick<Misconception, "id" | "timesObserved" | "originTool">>;
  /** The question that was got wrong, so it can't later count as a retest. */
  failedQuestion?: string;
}) {
  const record = useRecordMisconceptions();
  const recordRepair = useRecordRepair();
  const [picked, setPicked] = useState<number | null>(null);
  const recorded = useRef(false);

  const base = {
    subject: ledgerRow?.subject ?? entry.subject,
    concept: ledgerRow?.concept ?? entry.concept,
    summary: ledgerRow?.summary ?? entry.belief,
    severity: "moderate" as const,
    tool,
  };

  useEffect(() => {
    if (recorded.current) return;
    recorded.current = true;
    const repairOf = (row: Pick<Misconception, "id" | "timesObserved" | "originTool">) =>
      recordRepair(row, { sourceId, checkQuestion: entry.check.question, tool });
    if (!recordEvidence) {
      /* Already on record: the card is the repair. */
      if (ledgerRow?.id) {
        repairOf({
          id: ledgerRow.id,
          timesObserved: ledgerRow.timesObserved ?? 1,
          originTool: ledgerRow.originTool ?? tool,
        });
      }
      return;
    }
    const failedKey = failedQuestion ? questionKey(failedQuestion) : undefined;
    void misconceptionsApi
      .record([
        {
          ...base,
          kind: "evidence",
          sourceId,
          detail,
          skipIfSourceRecorded: true,
          catalogueId: entry.id,
          repairText: entry.remediation,
          contrastText: `Not: "${entry.belief}" ${entry.whyWrong}`,
          ...(failedKey
            ? { questionKey: failedKey, idempotencyKey: observationKey("repaircard", sourceId, failedKey) }
            : {}),
        },
      ])
      .then(([row]) => {
        if (row) repairOf(row);
      })
      .catch((err) => console.warn("[misconceptions] repair card write failed:", err));
    // Once per mount: the evidence is what triggered this card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function answer(index: number) {
    if (picked !== null) return;
    setPicked(index);
    if (index === entry.check.correctIndex) {
      record([
        {
          ...base,
          kind: "correction",
          sourceId: `${sourceId}:check`,
          detail: `Answered the check correctly: "${entry.check.question}"`,
          skipIfSourceRecorded: true,
          questionKey: questionKey(entry.check.question),
          idempotencyKey: observationKey("check", sourceId, questionKey(entry.check.question)),
        },
      ]);
    }
  }

  const correct = picked !== null && picked === entry.check.correctIndex;

  return (
    <section className={styles.repair} aria-label="Common mix-up">
      <p className={styles.label}>Common mix-up</p>
      <p className={styles.belief}>
        It looks like you might think: <strong>{entry.belief}</strong>
      </p>
      <p>
        <span className={styles.sub}>Why that's not quite right. </span>
        {entry.whyWrong}
      </p>
      <p>
        <span className={styles.sub}>Try it this way. </span>
        {entry.remediation}
      </p>

      <div className={styles.check} role="group" aria-label="Check question">
        <p className={styles.checkQuestion}>{entry.check.question}</p>
        <div className={styles.choices}>
          {entry.check.choices.map((choice, i) => {
            const state =
              picked === null
                ? ""
                : i === entry.check.correctIndex
                  ? styles.right
                  : i === picked
                    ? styles.wrong
                    : "";
            return (
              <button
                key={choice}
                type="button"
                className={`${styles.choice} ${state}`}
                disabled={picked !== null}
                onClick={() => answer(i)}
              >
                {choice}
              </button>
            );
          })}
        </div>
        {picked !== null && (
          <p className={styles.outcome} role="status">
            <strong>{correct ? "That's it." : "Not quite."}</strong> {entry.check.explanation}
            {correct
              ? " That's a start. We'll check it again with a different question in a couple of days, and it counts as fixed if you get that one too."
              : " It's worth another look before the exam."}
          </p>
        )}
      </div>
    </section>
  );
}
