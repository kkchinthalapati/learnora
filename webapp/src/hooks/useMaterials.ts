import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { materialsApi } from "../api/materials";
import { notesKeys } from "./useNotes";
import { quizzesKeys } from "./useQuizzes";

export const materialsKeys = {
  all: ["materials"] as const,
  list: (folderId: string | null) => ["materials", folderId ?? "all"] as const,
  byId: (id: string) => ["materials", "byId", id] as const,
};

export function useMaterials(folderId: string | null = null) {
  return useQuery({
    queryKey: materialsKeys.list(folderId),
    queryFn: () => materialsApi.fetch(folderId),
  });
}

export function useMaterial(id: string) {
  return useQuery({
    queryKey: materialsKeys.byId(id),
    queryFn: () => materialsApi.fetchById(id),
    enabled: !!id,
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: materialsKeys.all });
      qc.invalidateQueries({ queryKey: notesKeys.all });
      qc.invalidateQueries({ queryKey: quizzesKeys.all });
    },
  });
}
