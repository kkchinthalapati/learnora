import { useId, useState } from "react";
import { Button } from "../Button";
import { questionReportsApi, REPORT_REASONS, type ReportReason } from "../../api/questionReports";
import styles from "./reportProblem.module.css";

/* "Report a problem" under a question or an explanation.
 *
 * A reason from a short list and an optional note. What's stored is the
 * question's ref, the reason, the note and the wording the student saw; the
 * database adds their user id and nothing else. One report per question,
 * 20 a day, and enough reports pull the question from circulation
 * (api/questionReports.ts). */

const MESSAGES: Record<string, string> = {
  sent: "Thanks — we'll check it.",
  already: "You've already reported this one. Thanks.",
  limit: "You've sent a lot of reports today. Try again tomorrow.",
  unavailable: "Reporting isn't available right now.",
  error: "Couldn't send that. Try again in a moment.",
};

export function ReportProblem({
  questionRef,
  questionText,
  about = "question",
}: {
  questionRef: string;
  questionText: string;
  /** What the student is reporting; changes the default reason. */
  about?: "question" | "explanation";
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>(about === "explanation" ? "explanation_wrong" : "wrong_answer");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | keyof typeof MESSAGES>("idle");
  const id = useId();

  if (state !== "idle" && state !== "sending" && state !== "error") {
    return (
      <p className={styles.done} role="status">
        {MESSAGES[state]}
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" className={styles.link} onClick={() => setOpen(true)}>
        Report a problem{about === "explanation" ? " with this explanation" : ""}
      </button>
    );
  }

  const send = async () => {
    setState("sending");
    try {
      setState(await questionReportsApi.report({ ref: questionRef, reason, note, questionText }));
    } catch {
      setState("error");
    }
  };

  return (
    <form
      className={styles.form}
      aria-label="Report a problem"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <fieldset className={styles.reasons}>
        <legend className={styles.legend}>What's wrong?</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r.id} className={styles.reason}>
            <input
              type="radio"
              name={`${id}-reason`}
              value={r.id}
              checked={reason === r.id}
              onChange={() => setReason(r.id)}
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label className={styles.noteLabel}>
        Anything else? <span className={styles.optional}>optional</span>
        <textarea
          className={styles.note}
          maxLength={280}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Please don't include names or personal details."
        />
      </label>
      {state === "error" ? <p className={styles.done}>{MESSAGES.error}</p> : null}
      <div className={styles.actions}>
        <Button type="submit" variant="secondary" size="sm" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send report"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
