import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { useExams } from "../../hooks/useExams";
import { useFlashcardsDueCount } from "../../hooks/useFlashcards";
import { useFolders } from "../../hooks/useFolders";
import { useMisconceptions } from "../../hooks/useMisconceptions";
import {
  activityHref,
  advanceRun,
  examContext,
  loadRun,
  pickNextActivity,
  saveRun,
  type SessionRun,
} from "../../lib/adaptiveSession";
import styles from "./session.module.css";

/* The strip under the top bar when this Session is one activity of Study's
 * adaptive session (lib/adaptiveSession). It says where the student is and
 * picks the next activity from the ledger as it is now — so a mistake the
 * quick check just recorded is what gets taught back. Moving on never
 * waits for the activity to end; it is filled in once it has. */
export function SessionRunBar({
  runId,
  sessionId,
  activityDone,
  onBeforeNext,
}: {
  runId: string;
  sessionId: string;
  activityDone: boolean;
  /** Close this activity's Session before the next one opens. */
  onBeforeNext: () => void;
}) {
  const navigate = useNavigate();
  const { ranked, isPending } = useMisconceptions();
  const exams = useExams();
  const folders = useFolders();
  const due = useFlashcardsDueCount();
  const [run, setRun] = useState<SessionRun | null>(() => loadRun(runId));

  /* The first Session to open for the current activity is the one running
     it; an older one reopened from history is not. */
  useEffect(() => {
    if (run?.current && !run.current.sessionId) {
      const claimed = { ...run, current: { ...run.current, sessionId } };
      saveRun(claimed);
      setRun(claimed);
    }
  }, [run, sessionId]);

  const current = run?.current;
  const loading = isPending || exams.isPending || due.isPending;
  const next = useMemo(() => {
    if (!run || !current || loading) return undefined;
    return pickNextActivity({
      focus: run.focus,
      ranked,
      dueCards: due.data ?? 0,
      exam: examContext(exams.data, folders.data),
      done: [...run.done, current.kind],
      taught:
        current.kind === "teach" && current.misconceptionId
          ? [...run.taught, current.misconceptionId]
          : run.taught,
      startedAt: run.startedAt,
    });
  }, [run, current, loading, ranked, due.data, exams.data, folders.data]);

  if (
    !run ||
    !current ||
    (current.sessionId && current.sessionId !== sessionId)
  ) {
    return null;
  }

  const goNext = () => {
    if (next === undefined) return;
    onBeforeNext();
    const advanced = advanceRun(run, next);
    void navigate(
      next ? activityHref(next, advanced.id) : `/study?finished=${advanced.id}`,
    );
  };

  return (
    <div className={styles.runBar} role="region" aria-label="Your session">
      <p className={styles.runNow}>
        <span className={styles.runStep}>Step {run.done.length + 1}</span>{" "}
        <strong>{current.title}</strong>
        <span className={styles.runWhy}> · {current.why}</span>
      </p>
      <Button
        variant={activityDone ? "primary" : "ghost"}
        size="sm"
        disabled={next === undefined}
        onClick={goNext}
      >
        {next === undefined
          ? "Picking what's next…"
          : next
            ? `${activityDone ? "Next" : "Skip to"}: ${next.title}`
            : "Finish session"}
      </Button>
    </div>
  );
}
