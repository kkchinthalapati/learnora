import { useState, type Ref } from "react";
import { useNavigate } from "react-router";
import { Button } from "../../components/Button";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/Skeleton";
import { useOptionalTimer } from "../../context/timer";
import { useAddTask, useTasks } from "../../hooks/useTasks";
import { useToast } from "../../context/toast";
import { sortTasksByUrgency } from "./sortTasks";
import { useTaskActions } from "./useTaskActions";
import {
  dateInDays,
  localDateStr,
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
  dueOnly?: boolean;
  inputRef?: Ref<HTMLInputElement>;
};

export function DashboardTasksWidget({
  inputRef,
  dueOnly = false,
}: DashboardTasksWidgetProps = {}) {
  const { data: tasks, isPending } = useTasks();
  const addTask = useAddTask();
  const timer = useOptionalTimer();
  const navigate = useNavigate();
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
    /* `dueDate`, not `due_date`: the mutation takes the camelCase name and
       maps it to the column itself. It used to spread in `due_date`, which a
       spread hides from TypeScript's excess-property check — so the key was
       silently dropped and every Today quick-add landed with no due date,
       i.e. filtered straight back out of the list that created it. Passing
       the field directly keeps that check switched on. */
    addTask.mutate(
      { text: trimmed, dueDate: dueOnly ? localDateStr() : null },
      {
        onError: (err) =>
          showToast(`Could not add task. ${err.message}`, { error: true }),
      },
    );
  }

  const all = tasks ? visible(tasks) : [];
  const pending = sortTasksByUrgency(all.filter((t) => !t.is_done && (!dueOnly || (t.due_date && t.due_date <= localDateStr())))).slice(
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
        {/* Secondary: this widget sits on the dashboard beside Resume, which
            is the screen's one primary action. Enter in the field submits
            too, so the button is the affordance, not the call to action. */}
        <Button variant="secondary" size="sm" onClick={submit}>
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
              {dueOnly ? "Nothing due today. View all tasks to plan ahead." : all.length
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

              /* A negative id is the optimistic placeholder useAddTask shows
                 while the save is in flight (or queued offline). It has no
                 server row yet, so it cannot be ticked or moved. */
              const pending = task.id < 0;

              return (
                <li
                  key={task.id}
                  className={styles.dashTask}
                  role="checkbox"
                  aria-checked={false}
                  aria-label={task.text}
                  aria-disabled={pending || undefined}
                  tabIndex={0}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (pending || target.closest("button")) return;
                    toggle(task);
                  }}
                  onKeyDown={(e) => {
                    if (pending) return;
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
                  {pending ? (
                    <span className={styles.dashDue}>Saving…</span>
                  ) : (
                  <div className={styles.dashActions}>
                    <button
                      type="button"
                      className={styles.dashFocusBtn}
                      aria-label={`Focus on ${task.text}`}
                      title="Focus on this task (25m Timer)"
                      onClick={(e) => {
                        e.stopPropagation();
                        timer?.prepareFocus(25, task.text);
                        navigate("/timer");
                      }}
                    >
                      <Icon name="play" size={11} /> Focus
                    </button>
                    <button
                      type="button"
                      className={styles.dashSnoozeBtn}
                      aria-label={`Move ${task.text} to tomorrow`}
                      title="Move to tomorrow"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDueDate(task, dateInDays(1));
                      }}
                    >
                      → Tomorrow
                    </button>
                    <button
                      type="button"
                      className={styles.dashSnoozeBtn}
                      aria-label={`Move ${task.text} to next week`}
                      title="Move to next week"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDueDate(task, dateInDays(7));
                      }}
                    >
                      → Next week
                    </button>
                  </div>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
