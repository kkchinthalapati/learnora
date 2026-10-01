import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flashcardsApi, type CardFields } from "../api/flashcards";
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

export function useFlashcardsByDeck(deckId: string) {
  return useQuery({
    queryKey: flashcardsKeys.byDeck(deckId),
    queryFn: () => flashcardsApi.fetchByDeck(deckId),
    enabled: !!deckId,
  });
}

export function useFlashcardsDueCount(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: flashcardsKeys.dueCount,
    queryFn: flashcardsApi.fetchDueCount,
    ...options,
  });
}

export function useAllDueFlashcards(limit = 50) {
  return useQuery({
    queryKey: flashcardsKeys.allDue(limit),
    queryFn: () => flashcardsApi.fetchAllDue(limit),
  });
}

/* Card-level mutations. Each invalidates every flashcard query (a prefix
 * match on ["flashcards"]): adding, editing or removing a card changes the
 * deck's list, the Library banner and per-deck counts, the daily drill, and
 * the all-cards list that readiness and Today's recommendation read. */
export function useAddFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ deckId, card }: { deckId: string; card: CardFields }) =>
      flashcardsApi.add(deckId, card),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: flashcardsKeys.all });
    },
  });
}

export function useUpdateFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      cardId,
      fields,
    }: {
      cardId: string;
      deckId: string;
      fields: CardFields;
    }) => flashcardsApi.update(cardId, fields),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: flashcardsKeys.all });
    },
  });
}

export function useDeleteFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId }: { cardId: string; deckId: string }) =>
      flashcardsApi.delete(cardId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: flashcardsKeys.all });
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
      /* The whole family, including the unscoped all-cards list: Today's
         recommendation, exam readiness and the forecast all read that one,
         and invalidating only the due/deck keys left them showing the
         pre-review mastery for up to a minute after the session ended. The
         offline replay already did this; the online path now matches it. */
      qc.invalidateQueries({ queryKey: flashcardsKeys.all });
    },
  });
}
