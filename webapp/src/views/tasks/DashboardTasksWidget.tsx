import { useContext, useState, type Ref } from "react";
import { UNSAFE_NavigationContext } from "react-router";
import { Button } from "../../components/Button";
import { Skeleton } from "../../components/Skeleton";
import { useOptionalTimer } from "../../context/timer";
import { useAddTask, useTasks } from "../../hooks/useTasks";
import { useToast } from "../../context/toast";
import { sortTasksByUrgency } from "./sortTasks";
import { useTaskActions } from "./useTaskActions";
import {
  dateInDays,
  formatDueDate,
  formatRecurrenceCleanText,
  isRecurringWeekly,
} from "../../lib/date";
import styles from "./tasks.module.css";

/* The dashboard's compact task widget — ports js/main.js:2045-2100 (the list)
 * and :1622-1644 (the quick-add). Reads the same TanStack query as the full
 * Tasks view, so the vanilla's "loadTasks() re-renders both" coupling and its
 * `tasksUpdated` window event both disappear: one cache, two subscribers.
 *
 * Lives in views/tasks rather than views/dashboard because it is the Tasks
 * feature's second entry point; Step 12 imports it into the real dashboard. */

const MAX_VISIBLE = 6;

type DashboardTasksWidgetProps = {
  /* Lets OnboardingBanner focus the quick-add input without reaching across
   * components via document.getElementById — see DashboardView, which owns
   * the ref both components need. */
  inputRef?: Ref<HTMLInputElement>;
};

export function DashboardTasksWidget({
  inputRef,
}: DashboardTasksWidgetProps = {}) {
  const { data: tasks, isPending } = useTasks();
  const addTask = useAddTask();
  const timer = useOptionalTimer();
  const navCtx = useContext(UNSAFE_NavigationContext);
  const { showToast } = useToast();
  const { toggle, setDueDate, visible } = useTaskActions();

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
          ref={inputRef}
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
            } else if (e.key === "Escape") {
              setText("");
            }
          }}
        />
        <Button variant="primary" size="sm" onClick={submit}>
          Add
        </Button>
      </div>

      {isPending ? (
        /* `tasks` is undefined while this is in flight, which collapsed
           straight to "No tasks yet" below — a false empty state for anyone
           who actually has pending work. */
        <div aria-busy="true">
          <Skeleton label="Loading your tasks" height={64} />
        </div>
      ) : (
        <ul className={styles.dashList}>
          {pending.length === 0 ? (
            <li className={styles.empty}>
              {all.length
                ? "All caught up — nothing pending."
                : "No tasks yet. Add your first above."}
            </li>
          ) : (
            pending.map((task) => {
              const isRecurring = isRecurringWeekly(task.text);
              const displayText =
                formatRecurrenceCleanText(task.text) || task.text;
              const dueLabel = task.due_date
                ? formatDueDate(task.due_date)
                : null;

              return (
                <li
                  key={task.id}
                  className={styles.dashTask}
                  role="checkbox"
                  aria-checked={false}
                  aria-label={task.text}
                  tabIndex={0}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.closest("button")) return;
                    toggle(task);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggle(task);
                    }
                  }}
                >
                  <span className={styles.dashCheck} aria-hidden="true" />
                  <div className={styles.dashContent}>
                    <span className={styles.dashLabel}>{displayText}</span>
                    <div className={styles.dashMeta}>
                      {isRecurring && (
                        <span
                          className={styles.dashRecurring}
                          aria-label="Recurring weekly"
                          title="Recurring weekly"
                        >
                          🔁 Weekly
                        </span>
                      )}
                      {dueLabel && (
                        <span className={styles.dashDue}>{dueLabel}</span>
                      )}
                    </div>
                  </div>
                  <div className={styles.dashActions}>
                    <button
                      type="button"
                      className={styles.dashFocusBtn}
                      aria-label={`Focus on ${task.text}`}
                      title="Focus on this task (25m Timer)"
                      onClick={(e) => {
                        e.stopPropagation();
                        timer?.prepareFocus(25, task.text);
                        if (navCtx?.navigator) {
                          navCtx.navigator.push("/timer");
                        }
                      }}
                    >
                      Focus
                    </button>
                    <button
                      type="button"
                      className={styles.dashSnoozeBtn}
                      aria-label="Tomorrow"
                      title="Snooze to tomorrow"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDueDate(task, dateInDays(1));
                      }}
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      className={styles.dashSnoozeBtn}
                      aria-label="Next week"
                      title="Snooze to next week"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDueDate(task, dateInDays(7));
                      }}
                    >
                      Next week
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}

