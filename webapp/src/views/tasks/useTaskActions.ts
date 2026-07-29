import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "../../api/tasks";
import type { Task } from "../../api/types";
import { useToast } from "../../context/toast";
import {
  tasksKeys,
  useToggleTask,
  useUpdateTaskDueDate,
  useUpdateTaskText,
} from "../../hooks/useTasks";

export const UNDO_WINDOW_MS = 4000;

/* The mutations shared by the Tasks view and the dashboard widget, including
 * the vanilla's deferred-delete-with-Undo (js/main.js:1537-1561): the row
 * disappears at once, a toast offers Undo, and the DB delete only fires once
 * the window closes.
 *
 * The deferred delete deliberately does NOT go through `useDeleteTask`. A
 * mutation observer is torn down with its component, so a delete armed just
 * before the user navigated away could be dropped — silently resurrecting a
 * task they watched disappear. Calling the api module directly and
 * invalidating through the QueryClient (which outlives any component) keeps
 * the user's intent, and the unmount cleanup flushes rather than cancels for
 * the same reason. */
export function useTaskActions() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const toggleTask = useToggleTask();
  const updateText = useUpdateTaskText();
  const updateDueDate = useUpdateTaskDueDate();

  /* Ids hidden pending their undo window. Kept out of the query cache so a
     refetch mid-window can't bring the row back. */
  const [pendingDelete, setPendingDelete] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const undone = useRef(new Set<number>());

  const commitDelete = useCallback(
    async (id: number) => {
      timers.current.delete(id);
      if (undone.current.has(id)) {
        undone.current.delete(id);
        return;
      }
      try {
        await tasksApi.delete(id);
        await queryClient.invalidateQueries({ queryKey: tasksKeys.all });
      } catch (err) {
        setPendingDelete((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        showToast(`Failed to delete task. ${(err as Error).message}`, {
          error: true,
        });
      }
    },
    [queryClient, showToast],
  );

  /* Flush on unmount rather than cancel — see the note above. */
  const commitRef = useRef(commitDelete);
  commitRef.current = commitDelete;
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const [id, timer] of map) {
        clearTimeout(timer);
        void commitRef.current(id);
      }
      map.clear();
    };
  }, []);

  const remove = useCallback(
    (task: Task) => {
      setPendingDelete((prev) => new Set(prev).add(task.id));
      undone.current.delete(task.id);

      showToast("Task deleted.", {
        duration: UNDO_WINDOW_MS,
        actionLabel: "Undo",
        onAction: () => {
          undone.current.add(task.id);
          const timer = timers.current.get(task.id);
          if (timer) {
            clearTimeout(timer);
            timers.current.delete(task.id);
          }
          setPendingDelete((prev) => {
            const next = new Set(prev);
            next.delete(task.id);
            return next;
          });
        },
      });

      timers.current.set(
        task.id,
        setTimeout(() => void commitRef.current(task.id), UNDO_WINDOW_MS),
      );
    },
    [showToast],
  );

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

  const visible = useCallback(
    (tasks: Task[]) => tasks.filter((t) => !pendingDelete.has(t.id)),
    [pendingDelete],
  );

  return { toggle, rename, setDueDate, remove, visible };
}
