import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { materialsApi } from "../api/materials";
import { notesKeys } from "./useNotes";
import { quizzesKeys } from "./useQuizzes";
import { decksKeys } from "./useDecks";

export const materialsKeys = {
  all: ["materials"] as const,
  list: (folderId: string | null) => ["materials", folderId ?? "all"] as const,
  byId: (id: string) => ["materials", "byId", id] as const,
};

export function useMaterials(folderId: string | null = null) {
  return useQuery({
    queryKey: materialsKeys.list(folderId),
    queryFn: () => materialsApi.fetch(folderId),
    refetchInterval: (query) =>
      query.state.data?.some(
        (material) => material.processing_status === "pending",
      )
        ? 5000
        : false,
  });
}

export function useMaterial(id: string) {
  return useQuery({
    queryKey: materialsKeys.byId(id),
    queryFn: () => materialsApi.fetchById(id),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.processing_status === "pending" ? 5000 : false,
  });
}

/* `notes.material_id` and `quizzes.material_id` both reference the row being
 * deleted, so the notes and quizzes generated from a material go with it —
 * exactly what the delete confirmation promises the user. */
export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      storagePath,
    }: {
      id: string;
      storagePath?: string | null;
    }) => materialsApi.delete(id, storagePath),
    onSuccess: (_data, { id }) => {
      /* Every list refetches, but not the deleted lesson's own query: its
         page is about to leave, and refetching it first flashed "This
         lesson isn't here" on the way out (audit 2026-11-08). */
      const gone = materialsKeys.byId(id);
      qc.invalidateQueries({
        queryKey: materialsKeys.all,
        predicate: (query) =>
          query.queryKey.length !== gone.length ||
          query.queryKey.some((part, i) => part !== gone[i]),
      });
      qc.invalidateQueries({ queryKey: notesKeys.all });
      qc.invalidateQueries({ queryKey: quizzesKeys.all });
    },
  });
}

/* Saves a subject's lesson order (lib/lessonOrder.ts). The list is refetched
 * either way: on success to show the stored order, on failure to put the
 * lessons back where they were. */
export function useSetLessonOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (changes: ReadonlyArray<{ id: string; position: number }>) =>
      materialsApi.setOrder(changes),
    /* Show the move at once; the refetch below confirms or undoes it. */
    onMutate: (changes) => {
      const placed = new Map(changes.map((c) => [c.id, c.position]));
      qc.setQueriesData<unknown>({ queryKey: materialsKeys.all }, (old: unknown) =>
        Array.isArray(old)
          ? old.map((m: { id: string }) => (placed.has(m.id) ? { ...m, position: placed.get(m.id) } : m))
          : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: materialsKeys.all });
    },
  });
}

export function useRenameMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => materialsApi.rename(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialsKeys.all });
    },
  });
}

export function useMoveMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      materialsApi.moveToFolder(id, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialsKeys.all });
      qc.invalidateQueries({ queryKey: quizzesKeys.all });
      qc.invalidateQueries({ queryKey: decksKeys.all });
    },
  });
}
