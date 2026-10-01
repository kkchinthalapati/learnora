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
