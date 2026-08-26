import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Note } from "./types";

/* Direct port of js/api.js's `Notes` object (:595-640). */
export const notesApi = {
  async updateHtml(id: string, htmlContent: string): Promise<Note> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("notes")
      .update({ html_content: htmlContent })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (error) throw new Error(error.message);
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
