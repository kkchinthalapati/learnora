import { useId, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useDialog } from "../../context/dialog";
import { useToast } from "../../context/toast";
import { useDeleteExam, useSaveExam } from "../../hooks/useExams";
import { useFolders } from "../../hooks/useFolders";
import { localDateStr } from "../../lib/date";
import type { Exam } from "../../api/types";
import {
  SYLLABUS_SPECS,
  defaultTier,
  getSpec,
  isTier,
  specLabel,
  suggestSpecs,
} from "../../lib/syllabus";
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
  /* Folders are only needed to populate the optional subject picker, so a
     slow or failed fetch simply hides it rather than blocking the dialog. */
  const folders = useFolders().data ?? [];

  const nameId = useId();
  const dateId = useId();
  const statusId = useId();
  const folderId = useId();
  const specId = useId();

  const editing = exam !== null;
  const [name, setName] = useState(exam?.exam_name ?? "");
  const today = localDateStr();
  /* A past pre-fill (a stale calendar cell) starts a new exam on today
     instead, so the dialog never opens holding a date it will refuse. */
  const [date, setDate] = useState(
    exam?.exam_date ??
      (initialDate && initialDate < today ? today : (initialDate ?? "")),
  );
  const [difficulty, setDifficulty] = useState(exam?.difficulty ?? "Medium");
  const [status, setStatus] = useState(exam?.status ?? "Scheduled");
  const [folder, setFolder] = useState(exam?.folder_id ?? "");
  /* An id the catalogue no longer knows reads as "no spec" rather than a
     select stuck on a value it has no option for. */
  const [spec, setSpec] = useState(getSpec(exam?.syllabus_id)?.id ?? "");
  const chosenSpec = getSpec(spec);
  const [tier, setTier] = useState<string>(
    chosenSpec && isTier(chosenSpec, exam?.syllabus_tier)
      ? exam!.syllabus_tier!
      : chosenSpec
        ? defaultTier(chosenSpec)
        : "",
  );
  /* Offered only while nothing is chosen: a nudge from the name the student
     already typed, never a silent pick. */
  const suggestion = !spec ? (suggestSpecs(name)[0] ?? null) : null;

  function chooseSpec(id: string) {
    setSpec(id);
    const next = getSpec(id);
    setTier(next ? (isTier(next, tier) ? tier : defaultTier(next)) : "");
  }
  const [dateInvalid, setDateInvalid] = useState(false);
  const [nameInvalid, setNameInvalid] = useState(false);
  /* `saveExam.isPending` only flips after a re-render, so a double-click's
     second submit lands before the button disables and inserts the exam
     twice. A ref is set synchronously inside the first submit. */
  const submittingRef = useRef(false);

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

    if (!date) {
      setDateInvalid(false);
      requestAnimationFrame(() => setDateInvalid(true));
      showToast("Pick a date for the exam.", { error: true });
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

    /* The form is noValidate, so the input's `max` is advisory only — a
       mistyped year (2206 for 2026) would otherwise be saved as-is. */
    if (date > maxDate && date !== exam?.exam_date) {
      setDateInvalid(false);
      requestAnimationFrame(() => setDateInvalid(true));
      showToast("That date is more than five years away — check the year.", {
        error: true,
      });
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await saveExam.mutateAsync({
        payload: {
          exam_name: name.trim(),
          exam_date: date,
          difficulty,
          status: editing ? status : "Scheduled",
          folder_id: folder || null,
          syllabus_id: chosenSpec?.id ?? null,
          syllabus_tier: chosenSpec && isTier(chosenSpec, tier) ? tier : null,
        },
        id: exam?.id ?? null,
      });
      onClose();
    } catch (err) {
      showToast(`Could not save the exam. ${(err as Error).message}`, {
        error: true,
      });
    } finally {
      submittingRef.current = false;
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

        {/* Optional, and last, because it is the only field a student can
            safely ignore. It is also the one that makes readiness and the
            forecast about *this* exam rather than about everything: without
            it both fall back to guessing the subject from the exam's name,
            and a miss there means the forecast quietly runs on the whole
            library. Hidden entirely when there are no folders to choose. */}
        {folders.length > 0 && (
          <div className={styles.inputGroup}>
            <label htmlFor={folderId}>
              Subject (optional)
            </label>
            <select
              id={folderId}
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
            >
              <option value="">No subject</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Which specification this is. Optional, but it is what lets the
            app pitch every question, explanation and plan block at this
            exam instead of at the subject in general. */}
        <div className={styles.inputGroup}>
          <label htmlFor={specId}>Exam board and specification (optional)</label>
          <select
            id={specId}
            value={spec}
            onChange={(e) => chooseSpec(e.target.value)}
          >
            <option value="">Not listed / not sure</option>
            {(["GCSE", "IB", "CBSE"] as const).map((qual) => (
              <optgroup key={qual} label={qual}>
                {SYLLABUS_SPECS.filter((s) => s.qualification === qual).map(
                  (s) => (
                    <option key={s.id} value={s.id}>
                      {specLabel(s)}
                    </option>
                  ),
                )}
              </optgroup>
            ))}
          </select>
          {suggestion && (
            <button
              type="button"
              className={styles.specSuggestion}
              onClick={() => chooseSpec(suggestion.id)}
            >
              Use {specLabel(suggestion)}?
            </button>
          )}
        </div>

        {chosenSpec && chosenSpec.tiers.length > 1 && (
          <div className={styles.inputGroup}>
            <span>Which tier?</span>
            <div
              className={`${styles.segmented} ${styles.segmentedTwo}`}
              role="radiogroup"
              aria-label="Tier"
            >
              {chosenSpec.tiers.map((level) => (
                <label key={level} className={styles.segmentedOption}>
                  <input
                    type="radio"
                    name="exam-tier"
                    value={level}
                    checked={tier === level}
                    onChange={() => setTier(level)}
                  />
                  <span>{level}</span>
                </label>
              ))}
            </div>
          </div>
        )}

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
