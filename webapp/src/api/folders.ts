import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import { materialsApi } from "./materials";
import type { Folder } from "./types";

/* Direct port of js/api.js's `Folders` object (:354-430). */
export const foldersApi = {
  async fetch(): Promise<Folder[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("folders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async add(name: string, color = "#4A90E2"): Promise<Folder> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("folders")
      .insert([{ name, color, user_id: userId }])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /* The DB cascade removes materials/quizzes/decks rows, but not the
   * uploaded files themselves — collect their storage paths before the
   * folder (and the rows referencing them) are gone. */
  async delete(id: string): Promise<{ storageCleanupFailed: boolean }> {
    const materials = await materialsApi.fetch(id);
    const paths = materials.reduce<string[]>((acc, m) => {
      if (m.storage_path) acc.push(m.storage_path);
      return acc;
    }, []);

    const { error } = await supabase.from("folders").delete().eq("id", id);
    if (error) throw new Error(error.message);

    let storageCleanupFailed = false;
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from("materials")
        .remove(paths);
      if (storageError) {
        // The folder is already gone and the DB is consistent — a storage
        // cleanup miss here is recoverable later, not worth failing on.
        storageCleanupFailed = true;
        console.error(
          "[foldersApi.delete] storage cleanup failed",
          storageError.message,
        );
      }
    }

    return { storageCleanupFailed };
  },

  async rename(id: string, name: string): Promise<void> {
    const { error } = await supabase
      .from("folders")
      .update({ name })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
};
