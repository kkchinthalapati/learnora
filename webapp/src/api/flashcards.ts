import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Flashcard, FlashcardDue } from "./types";

/* Direct port of js/api.js's `Flashcards` object (:697-782). */
export const flashcardsApi = {
  async fetchByDeck(deckId: string): Promise<Flashcard[]> {
    const { data, error } = await supabase
      .from("flashcards")
      .select("*")
      .eq("deck_id", deckId);
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async addBatch(
    deckId: string,
    cards: { front: string; back: string }[],
  ): Promise<Flashcard[]> {
    const userId = await requireUserId();
    const inserts = cards.map((c) => ({
      user_id: userId,
      deck_id: deckId,
      front: c.front,
      back: c.back,
    }));
    const { data, error } = await supabase
      .from("flashcards")
      .insert(inserts)
      .select();
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async updateReview(
    cardId: string,
    nextReviewDate: string,
    interval: number,
    ease: number,
  ): Promise<void> {
    const { error } = await supabase
      .from("flashcards")
      .update({
        next_review_date: nextReviewDate,
        srs_interval: interval,
        ease_factor: ease,
      })
      .eq("id", cardId);
    if (error) throw new Error(error.message);
  },

  /* Never-reviewed cards have a NULL next_review_date and are due
   * immediately — `.lte()` alone silently excludes them, so a brand-new deck
   * reported "0 due" while the review screen (which treats NULL as due)
   * happily served the same cards. */
  async fetchDueCount(): Promise<number> {
    const userId = await requireUserId();
    const { count, error } = await supabase
      .from("flashcards")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .or(
        `next_review_date.is.null,next_review_date.lte.${new Date().toISOString()}`,
      );
    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async fetchAllDue(limit = 50): Promise<FlashcardDue[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("flashcards")
      .select("*, flashcard_decks(title)")
      .eq("user_id", userId)
      .or(
        `next_review_date.is.null,next_review_date.lte.${new Date().toISOString()}`,
      )
      .order("next_review_date", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []) as FlashcardDue[];
  },

  async fetchWeakDecks(limit = 5): Promise<string[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("flashcards")
      .select("ease_factor, flashcard_decks!inner(title)")
      .eq("user_id", userId)
      .lt("ease_factor", 2.1)
      .order("ease_factor", { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);

    const counts: Record<string, number> = {};
    (data ?? []).forEach((row: any) => {
      const title = row.flashcard_decks?.title;
      if (title) counts[title] = (counts[title] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([title]) => title);
  },
};
