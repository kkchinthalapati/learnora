import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Material, MaterialType } from "./types";

/* Direct port of js/api.js's `Materials` object (:436-589). */
export const materialsApi = {
  async fetch(folderId: string | null = null): Promise<Material[]> {
    const userId = await requireUserId();
    let query = supabase
      .from("materials")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (folderId) query = query.eq("folder_id", folderId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async uploadFile(
    file: File,
    folderId: string | null,
    type: MaterialType,
    customTitle?: string,
  ): Promise<Material> {
    const userId = await requireUserId();

    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("materials")
      .upload(filePath, file);
    if (uploadError) throw new Error(uploadError.message);

    const { data, error: dbError } = await supabase
      .from("materials")
      .insert([
        {
          user_id: userId,
          folder_id: folderId,
          title: customTitle || file.name,
          type,
          storage_path: filePath,
        },
      ])
      .select()
      .single();
    if (dbError) {
      // Do not leave an unreferenced object behind when the row insert fails.
      // Storage and Postgres are separate services, so this rollback has to be
      // explicit; a later folder/material cleanup cannot discover this path.
      const { error: cleanupError } = await supabase.storage
        .from("materials")
        .remove([filePath]);
      if (cleanupError) {
        console.error(
          "[materialsApi.uploadFile] uploaded object cleanup failed",
          cleanupError.message,
        );
      }
      throw new Error(dbError.message);
    }
    return data;
  },

  async addLink(
    url: string,
    folderId: string | null,
    customTitle?: string,
  ): Promise<Material> {
    const userId = await requireUserId();
    const isYouTube = url.includes("youtube.com") || url.includes("youtu.be");
    const defaultTitle = isYouTube ? "YouTube Link" : "Web Link";

    const { data, error } = await supabase
      .from("materials")
      .insert([
        {
          user_id: userId,
          folder_id: folderId,
          title: customTitle || defaultTitle,
          type: isYouTube ? "youtube" : "text",
          raw_content: url,
        },
      ])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /* The stored object goes first, then the row: a failed storage delete
   * leaves the material still listed and retryable, whereas dropping the row
   * first would orphan the object with nothing left pointing at it. Rows in
   * dependent tables (notes, decks, quizzes) are removed by the FK cascade. */
  async delete(
    materialId: string,
    storagePath: string | null = null,
  ): Promise<void> {
    const userId = await requireUserId();
    if (storagePath) {
      const { error: storageError } = await supabase.storage
        .from("materials")
        .remove([storagePath]);
      if (storageError) throw new Error(storageError.message);
    }

    const { error } = await supabase
      .from("materials")
      .delete()
      .eq("id", materialId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async getSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage
      .from("materials")
      .createSignedUrl(storagePath, 3600);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  async fetchMostRecent(): Promise<Material | null> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async fetchById(id: string): Promise<Material | null> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("materials")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },
};
