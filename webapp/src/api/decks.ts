import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { FlashcardDeck } from "./types";

/* Direct port of js/api.js's `Decks` object (:642-695). */
export const decksApi = {
  async fetchAll(): Promise<FlashcardDeck[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("flashcard_decks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async fetch(folderId: string): Promise<FlashcardDeck[]> {
    const { data, error } = await supabase
      .from("flashcard_decks")
      .select("*")
      .eq("folder_id", folderId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /* `folder_id` is nullable: a deck generated from a bare topic is filed
     nowhere, which is what the Create modal's Topic source does (it hides the
     folder picker entirely). */
  async add(folderId: string | null, title: string): Promise<FlashcardDeck> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("flashcard_decks")
      .insert([{ user_id: userId, folder_id: folderId, title }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  // flashcards.deck_id -> flashcard_decks.id is ON DELETE CASCADE, so the
  // deck's cards are removed automatically.
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from("flashcard_decks")
      .delete()
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
