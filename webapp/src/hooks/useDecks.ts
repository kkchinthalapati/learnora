import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { decksApi } from "../api/decks";
import { flashcardsKeys } from "./useFlashcards";

export const decksKeys = {
  all: ["decks"] as const,
  byFolder: (folderId: string) => ["decks", folderId] as const,
};

export function useAllDecks() {
  return useQuery({ queryKey: decksKeys.all, queryFn: decksApi.fetchAll });
}

export function useDecksByFolder(folderId: string) {
  return useQuery({
    queryKey: decksKeys.byFolder(folderId),
    queryFn: () => decksApi.fetch(folderId),
    enabled: !!folderId,
  });
}

export function useAddDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      folderId,
      title,
    }: {
      folderId: string | null;
      title: string;
    }) => decksApi.add(folderId, title),
    onSuccess: (_data, { folderId }) => {
      qc.invalidateQueries({ queryKey: decksKeys.all });
      if (folderId)
        qc.invalidateQueries({ queryKey: decksKeys.byFolder(folderId) });
    },
  });
}

/* `flashcards.deck_id` is ON DELETE CASCADE, so deleting a deck also changes
 * the due count the Library's Flashcards banner (and, later, the dashboard
 * badge) reads. */
export function useDeleteDeck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => decksApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: decksKeys.all });
      qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount });
    },
  });
}
