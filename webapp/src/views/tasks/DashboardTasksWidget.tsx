import { useState } from "react";
import { Button } from "../../components/Button";
import { useAddTask, useTasks } from "../../hooks/useTasks";
import { useToast } from "../../context/toast";
import { sortTasksByUrgency } from "./sortTasks";
import { useTaskActions } from "./useTaskActions";
import styles from "./tasks.module.css";

/* The dashboard's compact task widget — ports js/main.js:2045-2100 (the list)
 * and :1622-1644 (the quick-add). Reads the same TanStack query as the full
 * Tasks view, so the vanilla's "loadTasks() re-renders both" coupling and its
 * `tasksUpdated` window event both disappear: one cache, two subscribers.
 *
 * Lives in views/tasks rather than views/dashboard because it is the Tasks
 * feature's second entry point; Step 12 imports it into the real dashboard. */

const MAX_VISIBLE = 6;

export function DashboardTasksWidget() {
  const { data: tasks } = useTasks();
  const addTask = useAddTask();
  const { showToast } = useToast();
  const { toggle, visible } = useTaskActions();

  const [text, setText] = useState("");
  const [shake, setShake] = useState(false);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) {
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      return;
    }
    setText("");
    /* The quick-add deliberately has no due-date field, matching the vanilla. */
    addTask.mutate(
      { text: trimmed },
      {
        onError: (err) =>
          showToast(`Could not add task. ${err.message}`, { error: true }),
      },
    );
  }

  const all = tasks ? visible(tasks) : [];
  const pending = sortTasksByUrgency(all.filter((t) => !t.is_done)).slice(
    0,
    MAX_VISIBLE,
  );

  return (
    <div>
      <div className={styles.dashAddRow}>
        <input
          type="text"
          id="dash-task-input"
          className={shake ? styles.inputError : undefined}
          placeholder="Add a task..."
          autoComplete="off"
          aria-label="Quick add task"
          value={text}
          onAnimationEnd={() => setShake(false)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button variant="primary" size="sm" onClick={submit}>
          Add
        </Button>
      </div>

      <ul className={styles.dashList}>
        {pending.length === 0 ? (
          <li className={styles.empty}>
            {all.length
              ? "All caught up — nothing pending. 🎉"
              : "No tasks yet. Add your first above."}
          </li>
        ) : (
          pending.map((task) => (
            <li
              key={task.id}
              className={styles.dashTask}
              role="checkbox"
              aria-checked={false}
              aria-label={task.text}
              tabIndex={0}
              onClick={() => toggle(task)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  toggle(task);
                }
              }}
            >
              <span className={styles.dashCheck} aria-hidden="true" />
              <span className={styles.dashLabel}>{task.text}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
