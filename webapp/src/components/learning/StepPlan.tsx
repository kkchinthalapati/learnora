import type { ReactNode } from "react";
import { Icon } from "../Icon";
import styles from "./learning.module.css";

export type StepStatus = "done" | "current" | "upcoming";

export interface PlanStep {
  id: string;
  label: string;
  detail?: ReactNode;
  /** Overrides the status derived from `current` (e.g. a pipeline where two
   *  stages run at once). */
  status?: StepStatus;
}

const STATUS_TEXT: Record<StepStatus, string> = {
  done: "Done",
  current: "Current step",
  upcoming: "Not started",
};

/* A vertical plan: done steps carry a tick, the current one a ring and a
   wash, upcoming ones an empty ring. Each state is also announced in words. */
export function StepPlan({
  steps,
  current,
  label,
}: {
  steps: PlanStep[];
  /** Index of the current step. Steps before it are done. */
  current: number;
  label: string;
}) {
  return (
    <ol className={styles.plan} aria-label={label}>
      {steps.map((step, i) => {
        const status: StepStatus =
          step.status ?? (i < current ? "done" : i === current ? "current" : "upcoming");
        return (
          <li
            key={step.id}
            className={styles.step}
            data-status={status}
            aria-current={status === "current" ? "step" : undefined}
          >
            <span className={styles.dot} aria-hidden="true">
              {status === "done" ? <Icon name="check" size={12} /> : null}
            </span>
            <span>
              <span className={styles.srOnly}>{STATUS_TEXT[status]}: </span>
              {step.label}
              {step.detail ? (
                <span className={styles.stepDetail}>{step.detail}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
