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

/* An import adds a set (or cards to one) and changes every count the Library
 * and Today read, so both families are refreshed — on failure too, since an
 * import into an existing set may have added some cards before it stopped. */
export function useImportCards() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      target,
      cards,
      onProgress,
    }: {
      target: Parameters<typeof decksApi.importCards>[0];
      cards: { front: string; back: string }[];
      onProgress?: (added: number) => void;
    }) => decksApi.importCards(target, cards, onProgress),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: decksKeys.all });
      qc.invalidateQueries({ queryKey: flashcardsKeys.all });
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
      qc.invalidateQueries({ queryKey: flashcardsKeys.all });
    },
  });
}
