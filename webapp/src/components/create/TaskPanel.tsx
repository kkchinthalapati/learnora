import { useRef, useState, type FormEvent } from "react";
import { useAddTask } from "../../hooks/useTasks";
import { useToast } from "../../context/toast";
import { Button } from "../Button";
import shared from "./formShared.module.css";

interface TaskPanelProps {
  onClose: () => void;
  onDone?: () => void;
}

/* Vanilla has no task modal — just an inline input on the Tasks view and a
 * second copy on the dashboard (js/main.js:1593-1645), with no toast on
 * success since the new row appears in the visible list immediately. Here
 * the modal closes on success instead, so a toast is the only feedback the
 * student gets — a deliberate small addition, not a silent parity gap. */
export function TaskPanel({ onClose, onDone }: TaskPanelProps) {
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLInputElement>(null);
  const addTask = useAddTask();
  const { showToast } = useToast();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setError("Write down what you need to do.");
      textRef.current?.focus();
      return;
    }
    setError(null);
    try {
      await addTask.mutateAsync({ text: trimmed, dueDate: dueDate || null });
      showToast("Task added.");
      onDone?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className={shared.inputGroup}>
        <label htmlFor="task-text-input">Task</label>
        <input
          ref={textRef}
          id="task-text-input"
          className={shared.field}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Finish reading chapter 4"
          autoFocus
        />
      </div>

      <div className={shared.inputGroup}>
        <label htmlFor="task-due-date-input">
          Due date <span>(optional)</span>
        </label>
        <input
          id="task-due-date-input"
          className={shared.field}
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
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
        <Button type="submit" variant="primary" disabled={addTask.isPending}>
          {addTask.isPending ? "Adding…" : "Add task"}
        </Button>
      </div>
    </form>
  );
}
