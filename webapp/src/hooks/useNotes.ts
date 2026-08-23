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
    onSuccess: (_data, { materialId }) =>
      qc.invalidateQueries({ queryKey: notesKeys.byMaterial(materialId) }),
  });
}

export function useUpdateNoteHtml() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, htmlContent }: { id: string; htmlContent: string }) =>
      notesApi.updateHtml(id, htmlContent),
    onSuccess: (data) => {
      if (data.material_id) {
        qc.invalidateQueries({
          queryKey: notesKeys.byMaterial(data.material_id),
        });
      }
    },
  });
}
