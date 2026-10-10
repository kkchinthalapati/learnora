import { useId, useState, type FormEvent } from "react";
import { Button } from "../Button";
import { gradeNumeric, numericFeedback, type NumericKey, type NumericVerdict } from "../../lib/numericAnswer";
import styles from "./NumericAnswerInput.module.css";

/* The answer box for a typed-in numeric question (lib/numericAnswer.ts).
 *
 * An unreadable entry is not an answer: the student is told what the box
 * accepts and can try again, so a typo never counts as a wrong answer.
 * Everything else is final once checked, like picking an option. */

export function NumericAnswerInput({
  numeric,
  disabled = false,
  submitLabel = "Check",
  onAnswer,
}: {
  numeric: NumericKey;
  disabled?: boolean;
  submitLabel?: string;
  /** Called once with what was typed and how it was marked. */
  onAnswer: (response: string, verdict: NumericVerdict) => void;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [hint, setHint] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (disabled) return;
    const verdict = gradeNumeric(value, numeric);
    if (verdict.reason === "empty" || verdict.reason === "unparseable") {
      setHint(numericFeedback(verdict, numeric));
      return;
    }
    setHint(null);
    onAnswer(value.trim(), verdict);
  };

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor={id} className={styles.label}>
        Your answer{numeric.unit ? ` (in ${numeric.unit})` : ""}
      </label>
      <div className={styles.row}>
        <input
          id={id}
          className={styles.input}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 2.25 × 10^8, 1/3 or 47"
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
        <Button type="submit" variant="primary" disabled={disabled || !value.trim()}>
          {submitLabel}
        </Button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className={styles.hint} role="status">
          {hint}
        </p>
      ) : null}
    </form>
  );
}
