import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Icon } from "../../components/Icon";
import type { Task } from "../../api/types";
import { localDateStr } from "../../lib/date";
import styles from "./tasks.module.css";

/* One row of the task list — ports js/main.js:1348-1570.
 *
 * The vanilla built each row imperatively and swapped nodes in and out
 * (`span.replaceWith(input)`) for the two inline editors. Here "editing text"
 * and "editing the due date" are just local state, so there is no node
 * juggling. The vanilla's `hasSaved` latch does survive in spirit as the
 * `cancelled` ref below — removing a focused input fires blur, so Escape
 * still needs to say "don't save this one". */

/** How long a click on the task text waits to see whether it's a double-click. */
export const DOUBLE_CLICK_MS = 250;

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  onRename: (task: Task, text: string) => void;
  onSetDueDate: (task: Task, dueDate: string | null) => void;
  onDelete: (task: Task) => void;
}

export function TaskItem({
  task,
  onToggle,
  onRename,
  onSetDueDate,
  onDelete,
}: TaskItemProps) {
  const [editingText, setEditingText] = useState(false);
  const [draftText, setDraftText] = useState(task.text);
  const [editingDue, setEditingDue] = useState(false);
  /* Escape tears the input out of the tree, and removing a focused element
     fires blur — which would otherwise run commitText and save the very edit
     the user just abandoned. `setDraftText` can't guard it: the blur handler
     closes over the pre-Escape draft. */
  const cancelled = useRef(false);

  /* Clicking the row toggles, double-clicking the text renames — and in the
     vanilla those two fought: a double-click on the text ran the row's click
     handler twice on the way to the dblclick, so the task flipped done and
     back (or landed wherever the two in-flight writes raced to) and the
     rename guard then read whatever `is_done` had become. Clicks on the text
     are held for one double-click interval so only one of the two intents
     wins; clicks anywhere else on the row still toggle immediately. */
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
    },
    [],
  );

  const today = localDateStr();
  const overdue = !!task.due_date && task.due_date < today;
  const dueToday = task.due_date === today;

  function commitText() {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const next = draftText.trim();
    setEditingText(false);
    if (next && next !== task.text) onRename(task, next);
  }

  function onRowKeyDown(e: KeyboardEvent<HTMLLIElement>) {
    if (e.target !== e.currentTarget) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onToggle(task);
    }
  }

  const dueClasses = [
    styles.due,
    !task.due_date ? styles.dueUnset : null,
    overdue ? styles.overdue : null,
    dueToday ? styles.dueToday : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li
      className={`${styles.item}${task.is_done ? ` ${styles.done}` : ""}`}
      role="checkbox"
      aria-checked={task.is_done}
      aria-label={task.text}
      tabIndex={0}
      onKeyDown={onRowKeyDown}
      onClick={(e) => {
        /* Clicks that landed on a nested control belong to that control —
           the vanilla checked tagName, which also caught the date input. */
        const target = e.target as HTMLElement;
        if (target.closest("button, input")) return;
        if (target.closest(`.${styles.text}`)) return; // handled by the span
        onToggle(task);
      }}
    >
      {editingText ? (
        <input
          type="text"
          className={styles.editInput}
          aria-label="Edit task text"
          autoFocus
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
            } else if (e.key === "Escape") {
              cancelled.current = true;
              setDraftText(task.text);
              setEditingText(false);
            }
          }}
        />
      ) : (
        <span
          className={styles.text}
          onClick={() => {
            if (clickTimer.current) clearTimeout(clickTimer.current);
            clickTimer.current = setTimeout(() => {
              clickTimer.current = null;
              onToggle(task);
            }, DOUBLE_CLICK_MS);
          }}
          onDoubleClick={() => {
            if (clickTimer.current) {
              clearTimeout(clickTimer.current);
              clickTimer.current = null;
            }
            if (task.is_done) return;
            setDraftText(task.text);
            setEditingText(true);
          }}
        >
          {task.text}
        </span>
      )}

      {/* The vanilla omitted the due badge entirely on completed tasks. */}
      {!task.is_done &&
        (editingDue ? (
          <input
            type="date"
            className={styles.dueEditInput}
            aria-label="Due date"
            autoFocus
            defaultValue={task.due_date ?? ""}
            onChange={(e) => {
              setEditingDue(false);
              const next = e.target.value || null;
              if (next !== task.due_date) onSetDueDate(task, next);
            }}
            onBlur={() => setEditingDue(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditingDue(false);
            }}
          />
        ) : (
          <button
            type="button"
            className={dueClasses}
            aria-label={
              task.due_date
                ? `Due date: ${task.due_date}. Click to change.`
                : "Set a due date"
            }
            onClick={(e) => {
              e.stopPropagation();
              setEditingDue(true);
            }}
          >
            {task.due_date ? (
              <>
                <Icon name="calendar" size={13} />
                {task.due_date}
              </>
            ) : (
              "+ due date"
            )}
          </button>
        ))}

      <button
        type="button"
        className={styles.deleteBtn}
        aria-label={`Delete task: ${task.text}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(task);
        }}
      >
        ✖
      </button>
    </li>
  );
}
