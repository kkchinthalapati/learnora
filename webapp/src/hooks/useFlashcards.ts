import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flashcardsApi } from "../api/flashcards";
import { submitSrsReview } from "../lib/offlineSync";

export const flashcardsKeys = {
  all: ["flashcards"] as const,
  byDeck: (deckId: string) => ["flashcards", "deck", deckId] as const,
  dueCount: ["flashcards", "due-count"] as const,
  allDue: (limit: number) => ["flashcards", "all-due", limit] as const,
};

export function useFlashcards() {
  return useQuery({
    queryKey: flashcardsKeys.all,
    queryFn: flashcardsApi.fetchAll,
  });
}

export const useAllFlashcards = useFlashcards;

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

/* The write goes through the offline queue's helper (online-first, enqueue on
 * failure), so a review graded with no connection is replayed on reconnect
 * instead of lost — the queue re-invalidates these same keys after each
 * successful replay. While an action sits queued the cache must NOT be
 * invalidated: a refetch would return the server's not-yet-reviewed state and
 * un-grade the card in the UI. */
export function useUpdateFlashcardReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      cardId: string;
      nextReviewDate: string;
      interval: number;
      ease: number;
      stability?: number;
      difficulty?: number;
    }) => submitSrsReview(payload),
    onSuccess: ({ queued }) => {
      if (queued) return;
      qc.invalidateQueries({ queryKey: flashcardsKeys.dueCount });
      qc.invalidateQueries({ queryKey: ["flashcards", "all-due"] });
      qc.invalidateQueries({ queryKey: ["flashcards", "deck"] });
    },
  });
}
