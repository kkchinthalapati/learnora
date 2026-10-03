import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { PastPaperAttempt } from "../lib/pastPapers";

/* public.past_paper_attempts (20261002020000_past_paper_attempts.sql):
   owner-only, filed against one of the student's own exams. */

export type PastPaperInput = Pick<PastPaperAttempt, "exam_id" | "paper" | "series" | "marks" | "max_marks" | "sat_on" | "notes">;

const COLUMNS = "id, exam_id, paper, series, marks, max_marks, sat_on, notes, created_at";

export const pastPapersApi = {
  async fetchForExam(examId: number): Promise<PastPaperAttempt[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("past_paper_attempts")
      .select(COLUMNS)
      .eq("user_id", userId)
      .eq("exam_id", examId)
      .order("sat_on", { ascending: false });
    if (error) throw new Error(error.message);
    /* numeric columns arrive as strings from PostgREST. */
    return (data ?? []).map((r) => ({ ...r, marks: Number(r.marks), max_marks: Number(r.max_marks) })) as PastPaperAttempt[];
  },

  async add(input: PastPaperInput): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase.from("past_paper_attempts").insert([{ ...input, user_id: userId }]);
    if (error) throw new Error(error.message);
  },

  async remove(id: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase.from("past_paper_attempts").delete().eq("id", id).eq("user_id", userId);
    if (error) throw new Error(error.message);
  },
};
