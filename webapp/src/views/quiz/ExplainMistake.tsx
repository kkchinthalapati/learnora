import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import {
  explainMistake,
  type MistakeCheck,
} from "../../api/aiExplainMistake";
import { useRecordMisconceptions } from "../../hooks/useMisconceptions";
import type { QuizQuestion } from "../../lib/aiJson";
import { renderMathText } from "../../lib/markdownToReact";
import { candidatesFromMistakeExplanation } from "../../lib/misconceptions";
import { studentLevel } from "../../lib/studentLevel";
import { ReportProblem } from "../../components/learning/ReportProblem";
import { questionRef } from "../../lib/questionVetting";
import styles from "./quiz.module.css";

/* "Why was I wrong?" under one wrong answer.
 *
 * Nothing happens until the student presses the button: each explanation is a
 * metered AI call (billed to the debugger allowance, see
 * api/aiExplainMistake.ts), so it is never fetched on render or in bulk.
 *
 * A usable diagnosis is also written to the misconception ledger, merged into
 * the row this attempt already opened, so it shows up on the dashboard's
 * ledger card without counting the mistake twice. */

function CheckQuestion({ check }: { check: MistakeCheck }) {
  const [picked, setPicked] = useState<number | null>(null);
  const right = picked === check.correctIndex;

  return (
    <fieldset className={styles.explainCheck}>
      <legend className={styles.explainLabel}>Quick check</legend>
      <p className={styles.explainCheckQuestion}>
        {renderMathText(check.question)}
      </p>
      <div className={styles.choices}>
        {check.choices.map((choice, i) => {
          const classes = [
            styles.choice,
            picked !== null && i === check.correctIndex
              ? styles.correctChoice
              : null,
            picked === i && i !== check.correctIndex ? styles.wrongChoice : null,
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={i}
              type="button"
              className={classes}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
            >
              {renderMathText(choice)}
            </button>
          );
        })}
      </div>
      {picked !== null ? (
        <p role="status" className={styles.explainVerdict}>
          {right
            ? "Right — that's the idea."
            : `Not quite. The answer is “${check.choices[check.correctIndex]}”.`}
        </p>
      ) : null}
    </fieldset>
  );
}

export function ExplainMistake({
  question,
  chosenIndex,
  topic,
  subject,
  materialId,
  attemptId,
}: {
  question: QuizQuestion;
  chosenIndex: number;
  topic?: string;
  subject: string;
  materialId: string | null;
  /** The ledger source for this attempt: its attempt_key, else its id. */
  attemptId: string;
}) {
  const record = useRecordMisconceptions();
  const [logged, setLogged] = useState(false);

  const explain = useMutation({
    mutationFn: async () =>
      explainMistake({
        question: question.question,
        choices: question.choices,
        correctIndex: question.correctIndex,
        chosenIndex,
        topic,
        subject,
        materialId,
        /* Pitched at what the student said they study (onboarding, exams). */
        level: await studentLevel().catch(() => null),
        verified: question.verified,
      }),
    onSuccess: (result) => {
      if (!result.explanation) return;
      const candidates = candidatesFromMistakeExplanation(result.explanation, {
        subject,
        topic,
        attemptId,
        chosen: question.choices[chosenIndex],
        correct: question.choices[question.correctIndex],
      });
      record(candidates);
      setLogged(candidates.length > 0);
    },
  });
  const result = explain.data;

  if (explain.isPending) {
    return (
      <div className={styles.explainPanel} aria-busy="true">
        <Skeleton label="Working out where it went wrong" height={96} />
      </div>
    );
  }

  if (!result) {
    return (
      <div className={styles.askWhyRow}>
        <Button variant="secondary" size="sm" onClick={() => explain.mutate()}>
          <Icon name="sparkles" size={14} /> Why was I wrong?
        </Button>
      </div>
    );
  }

  if (result.degraded) {
    return (
      <div className={styles.explainPanel} role="status">
        <p className={styles.explainBody}>{result.degraded.message}</p>
        {result.degraded.reason === "refused" ? null : (
          <Button size="sm" onClick={() => explain.mutate()}>
            Try again
          </Button>
        )}
      </div>
    );
  }

  const { explanation } = result;
  return (
    <section className={styles.explainPanel} aria-label="Why this answer was wrong">
      <p className={styles.explainLabel}>Likely misconception</p>
      <p className={styles.explainMisconception}>
        {renderMathText(explanation.misconception)}
      </p>
      <p className={styles.explainBody}>
        {renderMathText(explanation.explanation)}
      </p>
      {explanation.check ? <CheckQuestion check={explanation.check} /> : null}
      {logged ? (
        <p className={styles.explainNote}>
          Logged to your misconception ledger.
        </p>
      ) : null}
      <ReportProblem
        questionRef={questionRef(question)}
        questionText={question.question}
        about="explanation"
      />
    </section>
  );
}
