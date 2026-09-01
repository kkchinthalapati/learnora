import { useCallback } from "react";
import { tasksApi } from "../../api/tasks";
import type { Task } from "../../api/types";
import {
  tasksKeys,
  useAddTask,
  useToggleTask,
  useUpdateTaskDueDate,
  useUpdateTaskText,
} from "../../hooks/useTasks";
import { useDeferredDelete } from "../../hooks/useDeferredDelete";
import { useToast } from "../../context/toast";
import {
  createNextWeeklyDate,
  formatDueDate,
  isRecurringWeekly,
} from "../../lib/date";

/* The mutations shared by the Tasks view and the dashboard widget.
 *
 * Task deletion uses the generalized deferred-delete-with-Undo pattern
 * (now in useDeferredDelete.ts). */
export function useTaskActions() {
  const toggleTask = useToggleTask();
  const addTask = useAddTask();
  const updateText = useUpdateTaskText();
  const updateDueDate = useUpdateTaskDueDate();
  const { showToast } = useToast();
  const { remove: removePending, visible: visibleTasks } = useDeferredDelete<
    number,
    Task
  >({
    deleteFn: (id) => tasksApi.delete(id),
    invalidateKey: [...tasksKeys.all],
    label: "Task",
  });

  const toggle = useCallback(
    (task: Task) => {
      const willComplete = !task.is_done;
      toggleTask.mutate({ id: task.id, currentStatus: task.is_done });
      if (willComplete && isRecurringWeekly(task.text)) {
        const nextDueDate = createNextWeeklyDate(task.due_date);
        addTask.mutate(
          {
            text: task.text,
            dueDate: nextDueDate,
          },
          {
            onSuccess: () => {
              const formattedDate = formatDueDate(nextDueDate);
              showToast(`Scheduled next weekly task for ${formattedDate}`);
            },
            onError: (error) => {
              showToast(
                `Couldn't schedule the next weekly task. ${error.message}`,
                { error: true },
              );
            },
          },
        );
      }
    },
    [toggleTask, addTask, showToast],
  );

  /* Both edits are optimistic, so a failure silently reverts the row on the
     next refetch — the student sees their rename or date undo itself with no
     explanation and no idea it ever reached the server. Say so, in the same
     shape as the add/toggle handlers above. */
  const rename = useCallback(
    (task: Task, text: string) => {
      updateText.mutate(
        { id: task.id, text },
        {
          onError: (err) =>
            showToast(`Could not rename task. ${err.message}`, { error: true }),
        },
      );
    },
    [updateText, showToast],
  );

  const setDueDate = useCallback(
    (task: Task, dueDate: string | null) => {
      updateDueDate.mutate(
        { id: task.id, dueDate },
        {
          onError: (err) =>
            showToast(`Could not update the due date. ${err.message}`, {
              error: true,
            }),
        },
      );
    },
    [updateDueDate, showToast],
  );

  const remove = useCallback(
    (task: Task) => {
      removePending(task.id);
    },
    [removePending],
  );

  const visible = useCallback(
    (tasks: Task[]) => visibleTasks(tasks, (t) => t.id),
    [visibleTasks],
  );

  return { toggle, rename, setDueDate, remove, visible };
}
