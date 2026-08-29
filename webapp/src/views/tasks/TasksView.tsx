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
import { dateInDays, isRecurringWeekly, localDateStr } from "../../lib/date";
import type { Task } from "../../api/types";
import { PlanSectionNav } from "../plan/PlanSectionNav";
import styles from "./tasks.module.css";

type TaskFilter = "all" | "open" | "overdue" | "completed";

const TASK_FILTERS: ReadonlyArray<{ value: TaskFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
  { value: "completed", label: "Completed" },
];

function taskMatchesFilter(task: Task, filter: TaskFilter, today: string) {
  switch (filter) {
    case "open":
      return !task.is_done;
    case "overdue":
      return !task.is_done && !!task.due_date && task.due_date < today;
    case "completed":
      return task.is_done;
    default:
      return true;
  }
}

export function TasksView() {
  const { data: tasks, isPending, isError, error } = useTasks();
  const addTask = useAddTask();
  const { showToast } = useToast();
  const { toggle, rename, setDueDate, remove, visible } = useTaskActions();
  const t = useTranslation();

  const [text, setText] = useState("");
  const [dueDate, setDueDate_] = useState("");
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>("all");
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
    const finalText =
      repeatWeekly && !isRecurringWeekly(trimmed)
        ? `${trimmed} [🔁 Weekly]`
        : trimmed;

    setText("");
    setDueDate_("");
    setRepeatWeekly(false);
    addTask.mutate(
      { text: finalText, dueDate: dueDate || null },
      {
        onError: (err) =>
          showToast(`Could not add task. ${err.message}`, { error: true }),
      },
    );
  }

  const today = localDateStr();
  const ordered = tasks ? sortTasksByUrgency(visible(tasks)) : [];
  const filteredTasks = ordered.filter((task) =>
    taskMatchesFilter(task, filter, today),
  );
  const taskGroups = [
    {
      label: "Overdue",
      tasks: filteredTasks.filter(
        (task) => !task.is_done && !!task.due_date && task.due_date < today,
      ),
    },
    {
      label: "Today",
      tasks: filteredTasks.filter(
        (task) => !task.is_done && task.due_date === today,
      ),
    },
    {
      label: "Upcoming",
      tasks: filteredTasks.filter(
        (task) => !task.is_done && !!task.due_date && task.due_date > today,
      ),
    },
    {
      label: "No due date",
      tasks: filteredTasks.filter((task) => !task.is_done && !task.due_date),
    },
    {
      label: "Completed",
      tasks: filteredTasks.filter((task) => task.is_done),
    },
  ].filter((group) => group.tasks.length > 0);
  const openCount = ordered.filter((task) => !task.is_done).length;
  const completedCount = ordered.length - openCount;

  return (
    <div className={styles.view}>
      <PlanSectionNav />

      <section aria-labelledby="task-composer-title">
        <h2 id="task-composer-title" className={styles.regionTitle}>
          Add task
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Card variant="panel" padding="none" className={styles.inputCard}>
            <div className={styles.inputMainRow}>
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

              <Button
                type="submit"
                variant="primary"
                disabled={addTask.isPending}
              >
                {t("btn_add")}
              </Button>
            </div>

            <div
              className={styles.pillRow}
              aria-label="Quick due date and recurrence options"
            >
              <span className={styles.pillLabel}>Quick due:</span>
              <button
                type="button"
                className={`${styles.pillBtn}${dueDate === localDateStr() ? ` ${styles.pillBtnActive}` : ""}`}
                onClick={() => setDueDate_(localDateStr())}
              >
                Today
              </button>
              <button
                type="button"
                className={`${styles.pillBtn}${dueDate === dateInDays(1) ? ` ${styles.pillBtnActive}` : ""}`}
                onClick={() => setDueDate_(dateInDays(1))}
              >
                Tomorrow
              </button>
              <button
                type="button"
                className={`${styles.pillBtn}${dueDate === dateInDays(7) ? ` ${styles.pillBtnActive}` : ""}`}
                onClick={() => setDueDate_(dateInDays(7))}
              >
                Next week
              </button>
              <button
                type="button"
                className={`${styles.pillBtn}${repeatWeekly ? ` ${styles.pillBtnActive}` : ""}`}
                aria-pressed={repeatWeekly}
                onClick={() => setRepeatWeekly((prev) => !prev)}
              >
                🔁 Repeat weekly
              </button>
            </div>
          </Card>
        </form>
      </section>

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
        <section
          className={styles.taskSection}
          aria-labelledby="task-list-title"
        >
          <div className={styles.taskToolbar}>
            <div>
              <h2 id="task-list-title" className={styles.regionTitle}>
                Tasks
              </h2>
              <p className={styles.taskCounts}>
                {openCount} open · {completedCount} completed
              </p>
            </div>
            <div className={styles.filters} aria-label="Filter tasks">
              {TASK_FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.filterButton}${filter === option.value ? ` ${styles.filterButtonActive}` : ""}`}
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {ordered.length === 0 ? (
            <p className={styles.empty}>No tasks yet - add one above!</p>
          ) : taskGroups.length === 0 ? (
            <p className={styles.empty}>No tasks match this filter.</p>
          ) : (
            <div className={styles.taskGroups}>
              {taskGroups.map((group) => (
                <section key={group.label} className={styles.taskGroup}>
                  <div className={styles.groupHeading}>
                    <h3>{group.label}</h3>
                    <span>{group.tasks.length}</span>
                  </div>
                  <ul className={styles.list}>
                    {group.tasks.map((task) => (
                      <TaskItem
                        key={task.id}
                        task={task}
                        onToggle={toggle}
                        onRename={rename}
                        onSetDueDate={setDueDate}
                        onDelete={remove}
                      />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
