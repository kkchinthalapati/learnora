import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Task } from "./types";
import { TASK_MAX } from "../lib/fieldLimits";

/* Direct port of js/api.js's `Tasks` object (:788-867) — same queries, throws
 * on error instead of returning `false`/`[]` (Decision #6). */
export const tasksApi = {
  async fetch(): Promise<Task[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("id", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async add(text: string, dueDate: string | null = null): Promise<void> {
    const userId = await requireUserId();
    /* The inputs cap at TASK_MAX; this also covers tasks the AI creates. */
    const capped = text.slice(0, TASK_MAX);
    const { error } = await supabase
      .from("tasks")
      .insert([
        {
          text: capped,
          is_done: false,
          user_id: userId,
          due_date: dueDate || null,
        },
      ]);
    if (error) throw new Error(error.message);
  },

  async toggle(id: number, currentStatus: boolean): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("tasks")
      .update({ is_done: !currentStatus })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async delete(id: number): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async updateText(id: number, newText: string): Promise<void> {
    const userId = await requireUserId();
    /* Same cap as `add`: a rename was the way around it. */
    const { error } = await supabase
      .from("tasks")
      .update({ text: newText.slice(0, TASK_MAX) })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  async updateDueDate(id: number, dueDate: string | null): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("tasks")
      .update({ due_date: dueDate || null })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },
};
