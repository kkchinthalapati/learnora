import { useRef, useState, type FormEvent } from "react";
import { useSaveExam } from "../../hooks/useExams";
import { useToast } from "../../context/toast";
import { Button } from "../Button";
import shared from "./formShared.module.css";

interface ExamPanelProps {
  onClose: () => void;
  onDone?: () => void;
}

type Difficulty = "Easy" | "Medium" | "Hard";

function localDateStr(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/* Quick-create only — mirrors the "New exam" half of the vanilla
 * #exam-modal (js/main.js:1748-1902). Editing, status changes and delete
 * stay in Step 9's calendar-owned ExamModal; this panel's job is the same
 * one the sidebar's "+ Create" button needs: get a new exam onto the
 * calendar in as few fields as possible. */
export function ExamPanel({ onClose, onDone }: ExamPanelProps) {
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const saveExam = useSaveExam();
  const { showToast } = useToast();

  const today = localDateStr();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = examName.trim();
    if (!trimmedName) {
      setError("Give the exam a name.");
      nameRef.current?.focus();
      return;
    }
    if (!examDate) {
      setError("Pick a date for the exam.");
      dateRef.current?.focus();
      return;
    }
    if (examDate < today) {
      setError("Exam date can't be in the past.");
      dateRef.current?.focus();
      return;
    }
    setError(null);
    try {
      // New exams always start "Scheduled" — the vanilla create form hides
      // the status field entirely and submits this same fixed value
      // (js/main.js:1781).
      await saveExam.mutateAsync({
        payload: {
          exam_name: trimmedName,
          exam_date: examDate,
          difficulty,
          status: "Scheduled",
        },
      });
      showToast(`Added "${trimmedName}" to your calendar.`);
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    // noValidate: the date input's `min` is a soft nudge (native date pickers
    // grey out earlier days), but the past-date rule is enforced by the JS
    // check above so it produces the same inline message as every other
    // validation error here, not a native browser tooltip.
    <form onSubmit={handleSubmit} noValidate>
      <div className={shared.inputGroup}>
        <label htmlFor="exam-name-input">Exam name</label>
        <input
          ref={nameRef}
          id="exam-name-input"
          className={shared.field}
          type="text"
          value={examName}
          onChange={(e) => setExamName(e.target.value)}
          placeholder="e.g. Midterm — Chapter 4"
          maxLength={120}
          autoFocus
        />
      </div>

      <div className={shared.inputGroup}>
        <label htmlFor="exam-date-input">Date</label>
        <input
          ref={dateRef}
          id="exam-date-input"
          className={shared.field}
          type="date"
          value={examDate}
          min={today}
          onChange={(e) => setExamDate(e.target.value)}
        />
      </div>

      <div className={shared.inputGroup}>
        <label id="exam-difficulty-label">Difficulty</label>
        <div
          className={shared.segmented}
          role="radiogroup"
          aria-labelledby="exam-difficulty-label"
        >
          {(["Easy", "Medium", "Hard"] as const).map((d) => (
            <label key={d} className={shared.segmentedOption}>
              <input
                type="radio"
                name="exam-difficulty"
                value={d}
                checked={difficulty === d}
                onChange={() => setDifficulty(d)}
              />
              <span>{d}</span>
            </label>
          ))}
        </div>
      </div>

      {error ? (
        <p className={shared.error} role="alert">
          {error}
        </p>
      ) : null}

      <div className={shared.actions}>
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saveExam.isPending}>
          {saveExam.isPending ? "Adding…" : "Add exam"}
        </Button>
      </div>
    </form>
  );
}
