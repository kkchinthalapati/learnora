import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { FlashcardDeck } from "./types";

/* PostgREST's "column not in schema cache" (PGRST204) or Postgres's
   "undefined column" (42703): a column a pending migration adds. */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST204" || error.code === "42703") return true;
  const message = error.message ?? "";
  return /material_id/.test(message) && /column/i.test(message);
}

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

  /* `folder_id` is nullable: a deck generated from a bare topic is filed
     nowhere, which is what the Create modal's Topic source does (it hides the
     folder picker entirely). */
  async add(
    folderId: string | null,
    title: string,
    notebookId?: string | null,
    /** The lesson the set is made from (audit F-16). */
    materialId?: string | null,
  ): Promise<FlashcardDeck> {
    const userId = await requireUserId();
    const row = {
      user_id: userId,
      folder_id: folderId,
      title,
      ...(notebookId ? { notebook_id: notebookId } : {}),
    };
    const insert = (values: Record<string, unknown>) =>
      supabase.from("flashcard_decks").insert([values]).select().single();
    let { data, error } = await insert(materialId ? { ...row, material_id: materialId } : row);
    /* Until migration 20261108000000 is applied the column does not exist.
       Making the cards matters more than linking them, so try again without
       the link rather than failing the whole deck. */
    if (error && materialId && isMissingColumn(error)) {
      ({ data, error } = await insert(row));
    }
    if (error) throw new Error(error.message);
    return data;
  },

  /** Files a lesson's card sets under its new subject (or none). */
  async moveForMaterial(materialId: string, folderId: string | null): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("flashcard_decks")
      .update({ folder_id: folderId })
      .eq("material_id", materialId)
      .eq("user_id", userId);
    if (error && !isMissingColumn(error)) throw new Error(error.message);
  },

  // flashcards.deck_id -> flashcard_decks.id is ON DELETE CASCADE, so the
  // deck's cards are removed automatically.
  async delete(id: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("flashcard_decks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },
};
