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

  const rename = useCallback(
    (task: Task, text: string) => {
      updateText.mutate({ id: task.id, text });
    },
    [updateText],
  );

  const setDueDate = useCallback(
    (task: Task, dueDate: string | null) => {
      updateDueDate.mutate({ id: task.id, dueDate });
    },
    [updateDueDate],
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
