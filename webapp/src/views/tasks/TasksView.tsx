import { useId, useState } from "react";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Skeleton } from "../../components/Skeleton";
import { useAddTask, useTasks } from "../../hooks/useTasks";
import { useTranslation } from "../../hooks/useTranslation";
import { useToast } from "../../context/toast";
import { TaskItem } from "./TaskItem";
import { sortTasksByUrgency } from "./sortTasks";
import { useTaskActions } from "./useTaskActions";
import styles from "./tasks.module.css";

/* Tasks view — ports index.html:846-877 + js/main.js:1329-1645.
 *
 * The vanilla re-ran `loadTasks()` by hand after every mutation (and kept a
 * 300ms debounce so a fast series of toggles didn't thrash the network).
 * TanStack Query's cache invalidation replaces all of that, which is
 * Decision #5's whole point. */

export function TasksView() {
  const { data: tasks, isPending, isError, error } = useTasks();
  const addTask = useAddTask();
  const { showToast } = useToast();
  const { toggle, rename, setDueDate, remove, visible } = useTaskActions();
  const t = useTranslation();

  const [text, setText] = useState("");
  const [dueDate, setDueDate_] = useState("");
  const [shake, setShake] = useState(false);
  const dueId = useId();

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) {
      /* Replay the shake even on consecutive empty submits — the vanilla
         forced a reflow (`void input.offsetWidth`) between removing and
         re-adding the class; remounting the animation via a key is the
         React equivalent. */
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      return;
    }
    setText("");
    setDueDate_("");
    addTask.mutate(
      { text: trimmed, dueDate: dueDate || null },
      {
        onError: (err) =>
          showToast(`Could not add task. ${err.message}`, { error: true }),
      },
    );
  }

  const ordered = tasks ? sortTasksByUrgency(visible(tasks)) : [];

  return (
    <div className={styles.view}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Card variant="panel" padding="none" className={styles.inputCard}>
          <input
            type="text"
            className={`${styles.textInput}${shake ? ` ${styles.inputError}` : ""}`}
            placeholder={t("placeholder_task")}
            autoComplete="off"
            aria-label="New Task Input"
            value={text}
            onAnimationEnd={() => setShake(false)}
            onChange={(e) => setText(e.target.value)}
          />

          {/* The bare date box read as ambiguous ("is this the due date or the
              date I'm adding the task?"), so the field says what it sets. */}
          <div className={styles.dueField}>
            <label className={styles.dueLabel} htmlFor={dueId}>
              Due date <span className="text-faint">(optional)</span>
            </label>
            <input
              id={dueId}
              type="date"
              className={styles.dueInput}
              value={dueDate}
              onChange={(e) => setDueDate_(e.target.value)}
            />
          </div>

          <Button type="submit" variant="primary" disabled={addTask.isPending}>
            {t("btn_add")}
          </Button>
        </Card>
      </form>

      {isPending && (
        <div className={styles.list} aria-busy="true">
          <Skeleton label="Loading your tasks" height={56} />
        </div>
      )}

      {isError && (
        <p role="alert" className={styles.empty}>
          Could not load your tasks. {(error as Error).message}
        </p>
      )}

      {tasks && (
        <ul className={styles.list}>
          {ordered.length === 0 ? (
            <li className={styles.empty}>No tasks yet - add one above!</li>
          ) : (
            ordered.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onToggle={toggle}
                onRename={rename}
                onSetDueDate={setDueDate}
                onDelete={remove}
              />
            ))
          )}
        </ul>
      )}
    </div>
  );
}
