import { useId, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useDeleteExam, useSaveExam } from "../../hooks/useExams";
import { localDateStr } from "../../lib/date";
import type { Exam } from "../../api/types";
import { DIFFICULTIES, STATUSES } from "./examMeta";
import styles from "./exams.module.css";

/* Exam create/edit dialog — ports index.html:1978-2046 + js/main.js:1741-1787
 * and the form's submit/delete handlers (:1876-1914).
 *
 * The vanilla had one dialog element it reconfigured field by field on open
 * (`$("modal-exam-title").textContent = ...`, `.reset()`, un-hiding the status
 * group and the delete button). Here "editing" versus "creating" is just
 * whether an `exam` was passed, and the differences are expressed in the JSX. */

interface ExamModalProps {
  open: boolean;
  /** The exam being edited, or null when creating. */
  exam: Exam | null;
  /** Pre-filled date when creating from a calendar cell. */
  initialDate?: string;
  onClose: () => void;
}

export function ExamModal({
  open,
  exam,
  initialDate,
  onClose,
}: ExamModalProps) {
  const saveExam = useSaveExam();
  const deleteExam = useDeleteExam();
  const { confirm } = useDialog();
  const { showToast } = useToast();

  const nameId = useId();
  const dateId = useId();
  const statusId = useId();

  const editing = exam !== null;
  const [name, setName] = useState(exam?.exam_name ?? "");
  const [date, setDate] = useState(exam?.exam_date ?? initialDate ?? "");
  const [difficulty, setDifficulty] = useState(exam?.difficulty ?? "Medium");
  const [status, setStatus] = useState(exam?.status ?? "Scheduled");
  const [dateInvalid, setDateInvalid] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);

  const today = localDateStr();
  const maxDate = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    return localDateStr(d);
  })();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      setNameInvalid(false);
      requestAnimationFrame(() => setNameInvalid(true));
      showToast("Give the exam a name.", { error: true });
      return;
    }

    /* Only a *new* exam is forced into the future — an existing one may
       legitimately sit in the past, e.g. being marked Completed after the
       fact (js/main.js:1758-1760). */
    if (!editing && date < today) {
      setDateInvalid(false);
      requestAnimationFrame(() => setDateInvalid(true));
      showToast("Exam date can't be in the past.", { error: true });
      return;
    }

    try {
      await saveExam.mutateAsync({
        payload: {
          exam_name: name.trim(),
          exam_date: date,
          difficulty,
          status: editing ? status : "Scheduled",
        },
        id: exam?.id ?? null,
      });
      onClose();
    } catch (err) {
      showToast(`Could not save the exam. ${(err as Error).message}`, {
        error: true,
      });
    }
  }

  async function onDelete() {
    if (!exam) return;
    const ok = await confirm("This exam will be removed from your calendar.", {
      title: "Remove exam?",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteExam.mutateAsync(exam.id);
      onClose();
    } catch (err) {
      showToast(`Could not remove the exam. ${(err as Error).message}`, {
        error: true,
      });
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "Edit exam" : "New exam"}
      subtitle={
        editing
          ? "Update the details or remove it from your calendar."
          : "Add it to your calendar and we'll count down to the day."
      }
    >
      {/* noValidate for the same reason the vanilla #create-form carries it:
          native constraint validation on the date `min` blocks the submit
          event outright, so the JS check below would never run and the button
          would look dead. */}
      <form onSubmit={onSubmit} noValidate>
        <div className={styles.inputGroup}>
          <label htmlFor={nameId}>What&apos;s the exam?</label>
          <input
            id={nameId}
            type="text"
            required
            maxLength={120}
            className={nameInvalid ? styles.dateError : undefined}
            placeholder="e.g. AP Chemistry Midterm"
            value={name}
            onAnimationEnd={() => setNameInvalid(false)}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor={dateId}>When is it?</label>
          <input
            id={dateId}
            type="date"
            required
            className={dateInvalid ? styles.dateError : undefined}
            min={editing ? undefined : today}
            max={maxDate}
            value={date}
            onAnimationEnd={() => setDateInvalid(false)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className={styles.inputGroup}>
          <span>How tough is it?</span>
          <div
            className={styles.segmented}
            role="radiogroup"
            aria-label="Difficulty"
          >
            {DIFFICULTIES.map((level) => (
              <label key={level} className={styles.segmentedOption}>
                <input
                  type="radio"
                  name="exam-difficulty"
                  value={level}
                  checked={difficulty === level}
                  onChange={() => setDifficulty(level)}
                />
                <span>{level}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Status only exists once there is an exam to have one. */}
        {editing && (
          <div className={styles.inputGroup}>
            <label htmlFor={statusId}>Status</label>
            <select
              id={statusId}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className={styles.modalActions}>
          {editing && (
            <Button
              className={styles.ghostDanger}
              onClick={() => void onDelete()}
              disabled={deleteExam.isPending}
            >
              Delete
            </Button>
          )}
          <div className={styles.actionsRight}>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saveExam.isPending}
            >
              {editing ? "Save changes" : "Add exam"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
