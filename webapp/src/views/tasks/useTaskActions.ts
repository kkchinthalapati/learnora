import { useCallback } from "react";
import { tasksApi } from "../../api/tasks";
import type { Task } from "../../api/types";
import {
  tasksKeys,
  useToggleTask,
  useUpdateTaskDueDate,
  useUpdateTaskText,
} from "../../hooks/useTasks";
import { useDeferredDelete } from "../../hooks/useDeferredDelete";

/* The mutations shared by the Tasks view and the dashboard widget.
 *
 * Task deletion uses the generalized deferred-delete-with-Undo pattern
 * (now in useDeferredDelete.ts). */
export function useTaskActions() {
  const toggleTask = useToggleTask();
  const updateText = useUpdateTaskText();
  const updateDueDate = useUpdateTaskDueDate();
  const { remove: removePending, visible: visibleTasks } =
    useDeferredDelete<number, Task>({
      deleteFn: (id) => tasksApi.delete(id),
      invalidateKey: [...tasksKeys.all],
      label: "Task",
    });

  const toggle = useCallback(
    (task: Task) => {
      toggleTask.mutate({ id: task.id, currentStatus: task.is_done });
    },
    [toggleTask],
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
