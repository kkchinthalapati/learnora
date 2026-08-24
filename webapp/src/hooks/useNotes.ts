import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notesApi } from "../api/notes";

export const notesKeys = {
  /* Prefix of every per-material key, for the cascade invalidations in
     useFolders/useMaterials — deleting either takes the notes with it. */
  all: ["notes"] as const,
  byMaterial: (materialId: string) => ["notes", materialId] as const,
};

export function useNotesByMaterial(materialId: string) {
  return useQuery({
    queryKey: notesKeys.byMaterial(materialId),
    queryFn: () => notesApi.fetchByMaterial(materialId),
    enabled: !!materialId,
  });
}

export function useNotes() {
  return useQuery({
    queryKey: notesKeys.all,
    queryFn: notesApi.fetchAll,
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      materialId,
      markdownContent,
    }: {
      materialId: string;
      markdownContent: string;
    }) => notesApi.add(materialId, markdownContent),
    onSuccess: () =>
      /* ["notes"] prefix-matches every notes query — the per-material list
       * for this material AND the global ["notes"] list the Concept Graph
       * builds its nodes from. Invalidation by byMaterial(materialId) alone
       * left the graph rendering stale nodes until something else refetched. */
      qc.invalidateQueries({ queryKey: notesKeys.all }),
  });
}

export function useUpdateNoteHtml() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, htmlContent }: { id: string; htmlContent: string }) =>
      notesApi.updateHtml(id, htmlContent),
    onSuccess: (data) => {
      if (data.material_id) {
        // Same prefix sweep as useAddNote — covers the edited material's
        // list and the graph's global snapshot in one go.
        qc.invalidateQueries({ queryKey: notesKeys.all });
      }
    },
  });
}
