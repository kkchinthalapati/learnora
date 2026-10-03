import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Exam } from "./types";

export type ExamPayload = Partial<
  Pick<
    Exam,
    | "exam_name"
    | "exam_date"
    | "difficulty"
    | "status"
    | "folder_id"
    | "syllabus_id"
    | "syllabus_tier"
  >
>;

/* The spec columns arrive with 20261002000000_exams_syllabus.sql. Until that
   is applied PostgREST refuses any write that names them ("Could not find the
   'syllabus_id' column"), and refusing the whole exam over an optional field
   would be worse than saving it without one. */
const SPEC_COLUMN_MISSING = /syllabus_(id|tier)/;

function withoutSpec(payload: ExamPayload): ExamPayload {
  const { syllabus_id: _id, syllabus_tier: _tier, ...rest } = payload;
  return rest;
}

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
    const write = (body: ExamPayload) => {
      const withUser = { ...body, user_id: userId };
      return id !== null
        ? supabase
            .from("exams")
            .update(withUser)
            .eq("id", id)
            .eq("user_id", userId)
        : supabase.from("exams").insert([withUser]);
    };

    let res = await write(payload);
    if (
      res.error &&
      SPEC_COLUMN_MISSING.test(res.error.message) &&
      ("syllabus_id" in payload || "syllabus_tier" in payload)
    ) {
      res = await write(withoutSpec(payload));
    }
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
