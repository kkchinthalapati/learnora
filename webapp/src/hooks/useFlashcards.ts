import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flashcardsApi } from "../api/flashcards";

export const flashcardsKeys = {
  byDeck: (deckId: string) => ["flashcards", "deck", deckId] as const,
  dueCount: ["flashcards", "due-count"] as const,
  allDue: (limit: number) => ["flashcards", "all-due", limit] as const,
};

export function useFlashcardsByDeck(deckId: string) {
  return useQuery({
    queryKey: flashcardsKeys.byDeck(deckId),
    queryFn: () => flashcardsApi.fetchByDeck(deckId),
    enabled: !!deckId,
  });
}

export function useFlashcardsDueCount() {
  return useQuery({
    queryKey: flashcardsKeys.dueCount,
    queryFn: flashcardsApi.fetchDueCount,
  });
}

export function useAllDueFlashcards(limit = 50) {
  return useQuery({
    queryKey: flashcardsKeys.allDue(limit),
    queryFn: () => flashcardsApi.fetchAllDue(limit),
  });
}

export function useAddFlashcardBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      deckId,
      cards,
    }: {
      deckId: string;
      cards: { front: string; back: string }[];
    }) => flashcardsApi.addBatch(deckId, cards),
    onSuccess: (_data, { deckId }) => {
      qc.invalidateQueries({ queryKey: flashcardsKeys.byDeck(deckId) });
      qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount });
    },
  });
}

export function useUpdateFlashcardReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cardId,
      nextReviewDate,
      interval,
      ease,
    }: {
      cardId: string;
      nextReviewDate: string;
      interval: number;
      ease: number;
    }) => flashcardsApi.updateReview(cardId, nextReviewDate, interval, ease),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount });
      qc.invalidateQueries({ queryKey: ["flashcards", "all-due"] });
      qc.invalidateQueries({ queryKey: ["flashcards", "deck"] });
    },
  });
}
