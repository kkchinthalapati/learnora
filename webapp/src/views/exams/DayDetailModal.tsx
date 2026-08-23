import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { useExamReadiness } from "../../hooks/useExamReadiness";
import type { Exam } from "../../api/types";
import { formatDayTitle } from "./examMeta";
import styles from "./exams.module.css";

/* "Exams on <date>" dialog — ports index.html:1962-1976 + js/main.js:1789-1844.
 * Includes live Exam Readiness Index and AI Prep Roadmap launch trigger. */

interface DayDetailModalProps {
  open: boolean;
  dateStr: string;
  exams: Exam[];
  onClose: () => void;
  onEditExam: (exam: Exam) => void;
  onAddExam: () => void;
  onOpenPrepRoadmap: (exam: Exam) => void;
}

interface DayExamRowProps {
  exam: Exam;
  onEditExam: (exam: Exam) => void;
  onOpenPrepRoadmap: (exam: Exam) => void;
}

function DayExamRow({ exam, onEditExam, onOpenPrepRoadmap }: DayExamRowProps) {
  const { readiness } = useExamReadiness(exam);

  const badgeClass =
    readiness?.tier === "Exam Ready"
      ? styles.badgeReady
      : readiness?.tier === "In Progress"
        ? styles.badgeProgress
        : styles.badgeGap;

  return (
    <div className={styles.dayItem}>
      <button
        type="button"
        style={{
          background: "none",
          border: "none",
          padding: 0,
          textAlign: "left",
          flex: 1,
          cursor: "pointer",
          color: "inherit",
          font: "inherit",
        }}
        aria-label={`Edit exam: ${exam.exam_name}`}
        onClick={() => onEditExam(exam)}
      >
        <span className={styles.dayItemText}>
          <span className={styles.dayItemName}>{exam.exam_name}</span>
          <span className={styles.dayItemMeta}>
            {exam.difficulty} • {exam.status}
          </span>
        </span>
      </button>

      <div className={styles.dayItemActions}>
        {readiness && (
          <span
            className={`${styles.readinessBadge} ${badgeClass}`}
            title={`Readiness score: ${readiness.score}% (${readiness.tier})`}
          >
            <Icon name="brain" size={11} />
            {readiness.score}%
          </span>
        )}
        <button
          type="button"
          className={styles.dayItemPrepBtn}
          onClick={(e) => {
            e.stopPropagation();
            onOpenPrepRoadmap(exam);
          }}
          title="Open AI Prep Roadmap"
          aria-label={`Open AI Prep Roadmap for ${exam.exam_name}`}
        >
          <Icon name="compass" size={13} />
          Roadmap
        </button>
        <button
          type="button"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            display: "inline-flex",
            padding: "4px",
          }}
          onClick={() => onEditExam(exam)}
          aria-label={`Edit ${exam.exam_name}`}
        >
          <Icon name="pencil" size={16} />
        </button>
      </div>
    </div>
  );
}

export function DayDetailModal({
  open,
  dateStr,
  exams,
  onClose,
  onEditExam,
  onAddExam,
  onOpenPrepRoadmap,
}: DayDetailModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Exams on ${formatDayTitle(dateStr)}`}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={onAddExam}>
            + Add exam
          </Button>
        </>
      }
    >
      <div className={styles.dayList}>
        {exams.map((exam) => (
          <DayExamRow
            key={exam.id}
            exam={exam}
            onEditExam={onEditExam}
            onOpenPrepRoadmap={onOpenPrepRoadmap}
          />
        ))}
      </div>
    </Modal>
  );
}
