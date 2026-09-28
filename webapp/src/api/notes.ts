import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Note } from "./types";

/* A save refused because the note changed since this editor loaded it — in
 * another tab, on another device. Distinct from a network failure: retrying
 * would fail the same way, and forcing it would erase the other edit. */
export class NoteConflictError extends Error {
  constructor() {
    super("This note was changed somewhere else since you opened it.");
    this.name = "NoteConflictError";
  }
}

/* Direct port of js/api.js's `Notes` object (:595-640). */
export const notesApi = {
  /* `expectedUpdatedAt` is the version the editor started from. When given,
   * the update only applies if the row is still at that version (optimistic
   * concurrency); zero rows back means someone else saved first. Rows from
   * before migration 20260928010000 have no `updated_at`, and the caller
   * passes null for them — the save then behaves as it always did. */
  async updateHtml(
    id: string,
    htmlContent: string,
    expectedUpdatedAt: string | null = null,
  ): Promise<Note> {
    const userId = await requireUserId();
    let query = supabase
      .from("notes")
      .update({ html_content: htmlContent })
      .eq("id", id)
      .eq("user_id", userId);
    if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
    const { data, error } = await query.select().maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      if (expectedUpdatedAt) throw new NoteConflictError();
      throw new Error("Note not found.");
    }
    return data;
  },

  async fetchByMaterial(materialId: string): Promise<Note[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("material_id", materialId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async fetchAll(): Promise<Note[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async add(materialId: string, markdownContent: string): Promise<Note> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notes")
      .insert([
        {
          user_id: userId,
          material_id: materialId,
          markdown_content: markdownContent,
        },
      ])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },
};
