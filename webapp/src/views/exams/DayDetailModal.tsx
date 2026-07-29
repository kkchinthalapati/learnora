import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import type { Exam } from "../../api/types";
import { formatDayTitle } from "./examMeta";
import styles from "./exams.module.css";

/* "Exams on <date>" dialog — ports index.html:1962-1976 + js/main.js:1789-1844.
 *
 * Two things the vanilla needed and this doesn't: it built each row with
 * `innerHTML` (hence the `esc()` calls around every field), and it
 * `cloneNode`d the "+ Add exam" button on every open to shed the listener the
 * previous open had attached. React re-renders instead of re-binding, and JSX
 * escapes by construction.
 *
 * Each row is a real <button> rather than a div with role="button" plus a
 * hand-rolled Enter/Space handler. */

interface DayDetailModalProps {
  open: boolean;
  dateStr: string;
  exams: Exam[];
  onClose: () => void;
  onEditExam: (exam: Exam) => void;
  onAddExam: () => void;
}

export function DayDetailModal({
  open,
  dateStr,
  exams,
  onClose,
  onEditExam,
  onAddExam,
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
          <button
            key={exam.id}
            type="button"
            className={styles.dayItem}
            aria-label={`Edit exam: ${exam.exam_name}`}
            onClick={() => onEditExam(exam)}
          >
            <span className={styles.dayItemText}>
              <span className={styles.dayItemName}>{exam.exam_name}</span>
              <span className={styles.dayItemMeta}>
                {exam.difficulty} • {exam.status}
              </span>
            </span>
            <span aria-hidden="true">
              <Icon name="pencil" size={16} />
            </span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
