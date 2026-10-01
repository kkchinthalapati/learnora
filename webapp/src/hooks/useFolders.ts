import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { foldersApi } from "../api/folders";
import { decksKeys } from "./useDecks";
import { flashcardsKeys } from "./useFlashcards";
import { materialsKeys } from "./useMaterials";
import { notesKeys } from "./useNotes";
import { quizzesKeys } from "./useQuizzes";
import { notebooksKeys } from "./useNotebooks";

export const foldersKeys = { all: ["folders"] as const };

export function useFolders(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: foldersKeys.all,
    queryFn: foldersApi.fetch,
    ...options,
  });
}

export function useAddFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, color }: { name: string; color?: string }) =>
      foldersApi.add(name, color),
    onSuccess: () => qc.invalidateQueries({ queryKey: foldersKeys.all }),
  });
}

/* Deleting a folder cascades in the database: notebooks, materials, quizzes
 * and flashcard_decks are all ON DELETE CASCADE on folder_id (see the
 * 20260719000000 and 20260909000000 migrations), and their child rows cascade
 * in turn. Invalidating only the folder list would leave the Library tabs and
 * flashcards due count showing rows that no longer exist. */
export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => foldersApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: foldersKeys.all });
      qc.invalidateQueries({ queryKey: materialsKeys.all });
      qc.invalidateQueries({ queryKey: decksKeys.all });
      qc.invalidateQueries({ queryKey: quizzesKeys.all });
      qc.invalidateQueries({ queryKey: notesKeys.all });
      qc.invalidateQueries({ queryKey: notebooksKeys.all });
      qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount });
    },
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      foldersApi.rename(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: foldersKeys.all }),
  });
}
