import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "../api/tasks";
import type { Task } from "../api/types";
import { toggleTask as toggleTaskOffline } from "../lib/offlineSync";
import { recordTaskCompletedToday } from "../lib/achievements";

export const tasksKeys = { all: ["tasks"] as const };

export function useTasks() {
  return useQuery({ queryKey: tasksKeys.all, queryFn: tasksApi.fetch });
}

export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      text,
      dueDate,
    }: {
      text: string;
      dueDate?: string | null;
    }) => tasksApi.add(text, dueDate ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

/* Optimistic, because the vanilla was: it flipped the row's class on click and
 * only rolled back if the write failed (js/main.js:1451-1473). Waiting for the
 * round trip instead would make every checkbox feel broken on a slow
 * connection. Step 8 added the optimistic path when this hook first got a UI.
 *
 * The write goes through the offline queue's helper (online-first, enqueue on
 * failure), so toggling with no connection keeps the optimistic flip in place
 * and replays on reconnect — the queue re-invalidates ["tasks"] after each
 * successful replay. While queued we must NOT invalidate: a refetch would
 * return the server's not-yet-toggled state and visibly un-flip the row. */
export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      currentStatus,
    }: {
      id: number;
      currentStatus: boolean;
    }) => toggleTaskOffline({ id, currentStatus }),
    onMutate: async ({ id, currentStatus }) => {
      if (!currentStatus) recordTaskCompletedToday();
      await qc.cancelQueries({ queryKey: tasksKeys.all });
      const previous = qc.getQueryData<Task[]>(tasksKeys.all);
      qc.setQueryData<Task[]>(tasksKeys.all, (old) =>
        old?.map((t) => (t.id === id ? { ...t, is_done: !t.is_done } : t)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(tasksKeys.all, context.previous);
    },
    onSuccess: ({ queued }) => {
      if (queued) return;
      qc.invalidateQueries({ queryKey: tasksKeys.all });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => tasksApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

export function useUpdateTaskText() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) =>
      tasksApi.updateText(id, text),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

export function useUpdateTaskDueDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dueDate }: { id: number; dueDate: string | null }) =>
      tasksApi.updateDueDate(id, dueDate),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}
