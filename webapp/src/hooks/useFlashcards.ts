import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { flashcardsApi, type CardFields } from "../api/flashcards";
import { useOptionalAuth } from "../context/auth";
import type { Flashcard } from "../api/types";
import { recordOfflineGrade, restoreOfflineCard } from "../lib/offlineCards";
import {
  submitSrsReview,
  undoSrsReview,
  type SrsReviewPayload,
} from "../lib/offlineSync";

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

/* Writes to the device's offline copy are read-modify-write on one stored
 * snapshot, and a grade's write is fire-and-forget. An undo pressed straight
 * after the grade could otherwise read the copy before the grade's write
 * finished and have its restore overwritten by it. Running them one after
 * another keeps the copy in the order the student acted. */
let offlineCopyWrites: Promise<unknown> = Promise.resolve();

function afterOfflineCopyWrites<T>(write: () => Promise<T>): Promise<T> {
  const next = offlineCopyWrites.then(write, write);
  offlineCopyWrites = next.catch(() => undefined);
  return next;
}

/* The write goes through the offline queue's helper (online-first, enqueue on
 * failure), so a review graded with no connection is replayed on reconnect
 * instead of lost — the queue re-invalidates these same keys after each
 * successful replay. While an action sits queued the cache must NOT be
 * invalidated: a refetch would return the server's not-yet-reviewed state and
 * un-grade the card in the UI. */
export function useUpdateFlashcardReview() {
  const qc = useQueryClient();
  const userId = useOptionalAuth()?.user?.id;
  return useMutation({
    /* React Query's default ("online") parks a mutation in memory while the
       browser is offline, so a grade never reached the durable queue below
       and was lost if the tab closed. submitSrsReview decides online vs
       queued itself; let it run. */
    networkMode: "always",
    mutationFn: (payload: SrsReviewPayload) => submitSrsReview(payload),
    onSuccess: ({ queued }, payload) => {
      /* The device's offline copy learns the grade too, online or not, so a
         card graded now never reappears as due in an offline session later. */
      if (userId) {
        void afterOfflineCopyWrites(() =>
          recordOfflineGrade(userId, payload),
        ).then(() => qc.invalidateQueries({ queryKey: ["offline-review"] }));
      }
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

/* Undo of a review written by `useUpdateFlashcardReview`, for the one grade
 * the review screen lets a student take back. `card` is the card as it was
 * before that grade: its scheduling columns are what the server is restored
 * to, and the whole card is what goes back into the device's offline copy. */
export function useUndoFlashcardReview() {
  const qc = useQueryClient();
  const userId = useOptionalAuth()?.user?.id;
  return useMutation({
    /* A review still sitting in the offline queue is undone by removing it,
       which needs no network and must not wait for one. */
    networkMode: "always",
    mutationFn: ({ card, reviewedAt }: { card: Flashcard; reviewedAt: string }) =>
      undoSrsReview({
        cardId: card.id,
        reviewedAt,
        previous: {
          nextReviewDate: card.next_review_date,
          interval: card.srs_interval,
          ease: card.ease_factor,
          stability: card.stability ?? null,
          difficulty: card.difficulty ?? null,
          lastReviewedAt: card.last_reviewed_at,
        },
      }),
    onSuccess: ({ cancelledQueued }, { card, reviewedAt }) => {
      if (userId) {
        void afterOfflineCopyWrites(() =>
          restoreOfflineCard(userId, card, reviewedAt),
        ).then(() => qc.invalidateQueries({ queryKey: ["offline-review"] }));
      }
      /* Nothing reached the server, so its lists never changed. */
      if (cancelledQueued) return;
      qc.invalidateQueries({ queryKey: flashcardsKeys.all });
    },
  });
}
