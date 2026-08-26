import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Exam } from "./types";

export type ExamPayload = Partial<
  Pick<Exam, "exam_name" | "exam_date" | "difficulty" | "status">
>;

/* Direct port of js/api.js's `Exams` object (:873-914). */
export const examsApi = {
  async fetch(): Promise<Exam[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("exams")
      .select("*")
      .eq("user_id", userId)
      .order("exam_date", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /** `id` present updates, absent inserts — mirrors the vanilla save(). */
  async save(payload: ExamPayload, id: number | null = null): Promise<void> {
    const userId = await requireUserId();
    const withUser = { ...payload, user_id: userId };

    const res =
      id !== null
        ? await supabase
            .from("exams")
            .update(withUser)
            .eq("id", id)
            .eq("user_id", userId)
        : await supabase.from("exams").insert([withUser]);

    if (res.error) throw new Error(res.error.message);
  },

  async delete(id: number): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("exams")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },
};
