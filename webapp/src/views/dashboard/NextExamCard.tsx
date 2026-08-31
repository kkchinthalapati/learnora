import { useState } from "react";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useExams } from "../../hooks/useExams";
import { useExamReadiness } from "../../hooks/useExamReadiness";
import { localDateStr } from "../../lib/date";
import { ExamPrepModal } from "../exams/ExamPrepModal";
import { DashboardCardHeader } from "./DashboardCardHeader";
import { daysUntil, nextUpcomingExam } from "./analytics";
import styles from "./dashboard.module.css";

/* "Next exam" spotlight. */
export function NextExamCard() {
  const { data: exams = [], isPending, isError, error } = useExams();
  const [prepModalOpen, setPrepModalOpen] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = nextUpcomingExam(exams, localDateStr());

  const { readiness } = useExamReadiness(next);

  if (isPending) {
    return (
      <Card variant="elevated" className={styles.examCard} aria-busy="true">
        <Skeleton label="Loading your next exam" height={140} />
      </Card>
    );
  }

  if (isError) {
    return (
      <Card variant="elevated" className={styles.examCard}>
        <DashboardCardHeader eyebrow="Next exam" />
        <p role="alert" className={styles.emptySm}>
          Could not load your exams. {(error as Error).message}
        </p>
      </Card>
    );
  }

  if (!next) {
    return (
      <Card variant="elevated" className={styles.examCard}>
        <DashboardCardHeader
          eyebrow="Next exam"
          action={{ to: "/exams", label: "Open calendar" }}
        />
        <p className={styles.emptySm}>
          No exams scheduled. You&apos;re all clear, or add one to start
          planning.
        </p>
      </Card>
    );
  }

  const days = daysUntil(next.exam_date, today);
  const big = days <= 0 ? "Today" : String(days);
  const unit = days <= 0 ? "Good luck!" : days === 1 ? "day away" : "days away";
  const prettyDate = new Date(`${next.exam_date}T00:00:00`).toLocaleDateString(
    [],
    { weekday: "short", month: "short", day: "numeric" },
  );
  const difficulty = next.difficulty || "Medium";
  const diffClass =
    difficulty.toLowerCase() === "easy"
      ? styles.diffEasy
      : difficulty.toLowerCase() === "hard"
        ? styles.diffHard
        : styles.diffMedium;

  const readinessTone =
    readiness?.tier === "Exam ready"
      ? "success"
      : readiness?.tier === "Getting there"
        ? "warning"
        : "danger";

  return (
    <>
      <Card variant="elevated" className={styles.examCard}>
        <DashboardCardHeader
          eyebrow="Next exam"
          action={{ to: "/exams", label: "Open calendar" }}
        />
        <div className={styles.countdown}>
          {big}
          <span className={styles.countdownUnit}>{unit}</span>
        </div>
        <div>
          <div className={styles.examName}>{next.exam_name}</div>
          <div className={styles.examMeta}>
            <span className={styles.examMetaDate}>
              <Icon name="calendar" size={14} />
              {prettyDate}
            </span>
            <span className={`${styles.pill} ${diffClass}`}>{difficulty}</span>
            {readiness && (
              <Chip
                soft
                tone={readinessTone}
                size="sm"
                onClick={() => setPrepModalOpen(true)}
                title="View AI Exam Readiness & Prep Roadmap"
                aria-label={`Exam readiness: ${readiness.score}% ready. Click to open AI Prep Roadmap.`}
              >
                <Icon name="brain" size={13} />
                {readiness.score}% Ready
              </Chip>
            )}
          </div>
        </div>
      </Card>

      {prepModalOpen && (
        <ExamPrepModal
          open={prepModalOpen}
          exam={next}
          onClose={() => setPrepModalOpen(false)}
        />
      )}
    </>
  );
}
