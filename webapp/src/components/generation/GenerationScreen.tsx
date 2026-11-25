import { useEffect, useRef, useState } from "react";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { learnerStyleOption, type LearnerStyle } from "../../lib/learnerStyle";
import type { GenerationJob } from "../../context/generation";
import styles from "./GenerationScreen.module.css";

/* The screen a student sees while a study set is made: what is being made,
   which step is in flight (the pipeline's own words, not a cycling script),
   how long it has taken, and a way to keep working meanwhile. Before the
   first set it asks how they learn best, since that shapes the notes. */

const STEP_LABEL: Record<GenerationJob["steps"][number], string> = {
  read: "Reading your material",
  notes: "Writing your notes",
  cards: "Making flashcards",
  quiz: "Writing a quiz",
};

function useElapsed(since: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return Math.max(0, Math.floor((now - since) / 1000));
}

function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m ? `${m}:${String(s).padStart(2, "0")}` : `${s}s`;
}

export interface GenerationScreenProps {
  job: GenerationJob;
  style: LearnerStyle | null;
  onMinimize: () => void;
  onRestore: () => void;
  onRetry: () => void;
  onClose: () => void;
  onOpen: () => void;
}

export function GenerationScreen(props: GenerationScreenProps) {
  const { job } = props;
  if (job.minimized) return <MinimizedPill {...props} />;
  return <FullScreen {...props} />;
}

function FullScreen({
  job,
  style,
  onMinimize,
  onRetry,
  onClose,
}: GenerationScreenProps) {
  const ref = useRef<HTMLDivElement>(null);
  const running = job.stage !== "failed" && job.stage !== "done";
  const elapsed = useElapsed(job.startedAt, running);
  useFocusTrap(ref, true);

  useEffect(() => {
    const first = ref.current?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
  }, [job.stage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (running) onMinimize();
      else if (job.stage === "failed") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [running, job.stage, onMinimize, onClose]);

  const activeIndex = job.steps.indexOf(
    job.stage as GenerationJob["steps"][number],
  );

  return (
    <div className={styles.backdrop}>
      <div
        ref={ref}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="generation-title"
        aria-describedby="generation-status"
      >
        {job.stage === "failed" ? (
          <>
            <span
              className={styles.badge}
              data-tone="danger"
              aria-hidden="true"
            >
              <Icon name="alert-triangle" size={22} />
            </span>
            <h2 id="generation-title" className={styles.title}>
              That didn't work this time
            </h2>
            <p id="generation-status" className={styles.lead} role="alert">
              {job.error}
            </p>
            <div className={styles.actions}>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button variant="primary" data-autofocus onClick={onRetry}>
                Try again
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.orb} aria-hidden="true">
              <span className={styles.orbRing} />
              <Icon name="sparkles" size={28} />
            </div>
            <p className={styles.eyebrow}>Building your lesson</p>
            <h2 id="generation-title" className={styles.title}>
              {job.label}
            </h2>
            <p
              id="generation-status"
              className={styles.status}
              aria-live="polite"
            >
              {job.message}
            </p>
            <ol className={styles.steps} aria-label="Steps">
              {job.steps.map((step, i) => {
                const state =
                  i < activeIndex
                    ? "done"
                    : i === activeIndex
                      ? "active"
                      : "todo";
                return (
                  <li key={step} className={styles.step} data-state={state}>
                    <span className={styles.stepMark} aria-hidden="true">
                      {state === "done" ? (
                        <Icon name="check" size={14} />
                      ) : null}
                    </span>
                    <span>
                      {STEP_LABEL[step]}
                      <span className={styles.srOnly}>
                        {state === "done"
                          ? " (done)"
                          : state === "active"
                            ? " (in progress)"
                            : ""}
                      </span>
                    </span>
                  </li>
                );
              })}
              <li className={styles.step} data-state="todo">
                <span className={styles.stepMark} aria-hidden="true" />
                <span>Opening your lesson</span>
              </li>
            </ol>
            <p className={styles.meta}>
              <span>{formatElapsed(elapsed)}</span>
              <span aria-hidden="true"> · </span>
              <span>This can take a minute or two. Keep this tab open.</span>
              {style ? (
                <>
                  <br />
                  <span>
                    Shaped for: {learnerStyleOption(style).label.toLowerCase()}
                  </span>
                </>
              ) : null}
            </p>
            <div className={styles.actions}>
              <Button variant="secondary" data-autofocus onClick={onMinimize}>
                Keep working, tell me when it's ready
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MinimizedPill({
  job,
  onRestore,
  onOpen,
  onClose,
}: GenerationScreenProps) {
  if (job.stage === "done") {
    return (
      <div className={styles.pill} role="status">
        <Icon name="check-circle" size={18} />
        <span className={styles.pillText}>"{job.label}" is ready</span>
        <Button size="sm" variant="primary" onClick={onOpen}>
          Open
        </Button>
        <button
          type="button"
          className={styles.pillClose}
          onClick={onClose}
          aria-label="Dismiss"
        >
          <Icon name="x" size={16} />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={`${styles.pill} ${styles.pillButton}`}
      onClick={onRestore}
    >
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.pillText}>
        <strong>{job.label}</strong>
        <span className={styles.pillMessage} aria-live="polite">
          {job.message}
        </span>
      </span>
      <span className={styles.srOnly}>Show progress</span>
    </button>
  );
}
