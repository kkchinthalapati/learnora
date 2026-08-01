import { Link } from "react-router";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useExams } from "../../hooks/useExams";
import { localDateStr } from "../../lib/date";
import { daysUntil, nextUpcomingExam } from "./analytics";
import styles from "./dashboard.module.css";

/* "Next exam" spotlight — ports js/main.js:1988-2042. */
export function NextExamCard() {
  const { data: exams, isPending, isError, error } = useExams();

  if (isPending) {
    return (
      <div className={`${styles.card} ${styles.examCard}`} aria-busy="true">
        <Skeleton label="Loading your next exam" height={140} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className={`${styles.card} ${styles.examCard}`}>
        <span className={styles.eyebrow}>Next exam</span>
        <p role="alert" className={styles.emptySm}>
          Could not load your exams. {(error as Error).message}
        </p>
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = nextUpcomingExam(exams, localDateStr());

  if (!next) {
    return (
      <div className={`${styles.card} ${styles.examCard}`}>
        <span className={styles.eyebrow}>Next exam</span>
        <p className={styles.emptySm}>
          No exams scheduled. You&apos;re all clear — or add one to start
          planning.
        </p>
        <Link to="/exams" className={styles.link}>
          Open calendar →
        </Link>
      </div>
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

  return (
    <div className={`${styles.card} ${styles.examCard}`}>
      <span className={styles.eyebrow}>Next exam</span>
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
        </div>
      </div>
      <Link to="/exams" className={styles.link}>
        Open calendar →
      </Link>
    </div>
  );
}
