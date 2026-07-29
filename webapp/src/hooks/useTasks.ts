import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "../api/tasks";

export const tasksKeys = { all: ["tasks"] as const };

export function useTasks() {
  return useQuery({ queryKey: tasksKeys.all, queryFn: tasksApi.fetch });
}

export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ text, dueDate }: { text: string; dueDate?: string | null }) =>
      tasksApi.add(text, dueDate ?? null),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
  });
}

export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, currentStatus }: { id: number; currentStatus: boolean }) =>
      tasksApi.toggle(id, currentStatus),
    onSuccess: () => qc.invalidateQueries({ queryKey: tasksKeys.all }),
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
