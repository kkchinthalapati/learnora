import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Quiz, QuizAttempt, WeakTopic } from "./types";

/* Direct port of js/api.js's `Quizzes` object (:1006-1123). */
export const quizzesApi = {
  async add(
    materialId: string | null,
    folderId: string | null,
    title: string,
    questions: unknown,
  ): Promise<Quiz> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("quizzes")
      .insert([
        {
          user_id: userId,
          material_id: materialId,
          folder_id: folderId,
          title,
          questions_json: questions,
        },
      ])
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  async fetchAll(): Promise<Quiz[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("quizzes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  async fetchById(id: string): Promise<Quiz | null> {
    const { data, error } = await supabase
      .from("quizzes")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("quizzes").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async recordAttempt(
    quizId: string,
    score: number,
    total: number,
    answers: unknown,
    weakTopics: string[],
  ): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase.from("quiz_attempts").insert([
      {
        user_id: userId,
        quiz_id: quizId,
        score,
        total,
        answers_json: answers,
        weak_topics: weakTopics,
      },
    ]);
    if (error) throw new Error(error.message);
  },

  async fetchAllAttempts(): Promise<QuizAttempt[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  },

  /* The most recent attempt at one quiz, for the review screen — reading
   * back which option was chosen per question beats re-sitting the whole
   * quiz just to find out what the right answer was. */
  async fetchLatestAttempt(quizId: string) {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("user_id", userId)
      .eq("quiz_id", quizId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async fetchWeakTopics(limit = 5): Promise<WeakTopic[]> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("quiz_attempts")
      .select("weak_topics")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    const counts: Record<string, number> = {};
    (data ?? []).forEach((a: { weak_topics: string[] | null }) =>
      (a.weak_topics || []).forEach((t) => {
        counts[t] = (counts[t] || 0) + 1;
      }),
    );
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([topic, count]) => ({ topic, count }));
  },
};
