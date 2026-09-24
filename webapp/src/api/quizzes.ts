import { supabase } from "../lib/supabase";
import { requireUserId } from "./session";
import type { Quiz, QuizAttempt, WeakTopic } from "./types";
import { isDuplicateAttempt } from "../lib/attemptKey";
import {
  answerForIndex,
  parseStoredAnswers,
  parseStoredQuestions,
} from "../views/quiz/quizMeta";

/** The most recent question a student got wrong on a topic, for handing to
 *  the solver as the actual mistake rather than just the topic's name. */
export interface WrongAnswerExample {
  question: string;
  chosen: string;
  correct: string;
  folderId: string | null;
}

/* Direct port of js/api.js's `Quizzes` object (:1006-1123). */
export const quizzesApi = {
  async add(
    materialId: string | null,
    folderId: string | null,
    title: string,
    questions: unknown,
    notebookId?: string | null,
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
          ...(notebookId ? { notebook_id: notebookId } : {}),
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
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("quizzes")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async delete(id: string): Promise<void> {
    const userId = await requireUserId();
    const { error } = await supabase
      .from("quizzes")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
  },

  /** `attemptKey` identifies the run, so recording the same finished run
   *  twice — a replayed mutation, a duplicated tab, a resumed draft — lands on
   *  the row that already exists instead of inserting a second attempt.
   *  Optional so a caller with no run to key on still writes. */
  async recordAttempt(
    quizId: string,
    score: number,
    total: number,
    answers: unknown,
    weakTopics: string[],
    attemptKey?: string,
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
        ...(attemptKey ? { attempt_key: attemptKey } : {}),
      },
    ]);
    /* Losing the race against the duplicate is the mechanism working, not a
       failure: the attempt is recorded, just not by this call. Surfacing it
       would show the student an error over a score that saved fine. */
    if (error && !isDuplicateAttempt(error)) throw new Error(error.message);
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

  /* The solver's "from your recent quizzes" list used to fill in only "I keep
     getting <topic> wrong", though the attempt holds the question, the answer
     picked and the right one. A null here just means the solver falls back
     to that sentence. */
  async fetchLatestWrongAnswer(topic: string): Promise<WrongAnswerExample | null> {
    const userId = await requireUserId();
    const { data, error } = await supabase
      .from("quiz_attempts")
      .select("quiz_id, answers_json, weak_topics")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    const attempt = (
      (data ?? []) as {
        quiz_id: string;
        answers_json: unknown;
        weak_topics: string[] | null;
      }[]
    ).find((a) => (a.weak_topics ?? []).includes(topic));
    if (!attempt) return null;

    const { data: quiz, error: quizError } = await supabase
      .from("quizzes")
      .select("questions_json, folder_id")
      .eq("id", attempt.quiz_id)
      .maybeSingle();
    if (quizError || !quiz) return null;

    const questions = parseStoredQuestions(quiz.questions_json);
    const answers = parseStoredAnswers(attempt.answers_json);
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const given = answerForIndex(answers, questions, i);
      if (!given || given.correct) continue;
      if ((q.topic ?? given.topic) !== topic) continue;
      return {
        question: q.question,
        chosen: q.choices[given.chosenIndex] ?? "",
        correct: q.choices[q.correctIndex],
        folderId: (quiz.folder_id as string | null) ?? null,
      };
    }
    return null;
  },
};
