import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { quizzesApi } from "../api/quizzes";
import { misconceptionsApi } from "../api/misconceptions";
import { candidatesFromQuizAnswers } from "../lib/misconceptions";
import { misconceptionsKeys } from "./useMisconceptions";
import { foldersKeys } from "./useFolders";
import type { Folder, Quiz } from "../api/types";

export const quizzesKeys = {
  all: ["quizzes"] as const,
  byId: (id: string) => ["quizzes", id] as const,
  latestAttempt: (quizId: string) =>
    ["quizzes", quizId, "latest-attempt"] as const,
  attempts: ["quizzes", "attempts"] as const,
  weakTopics: (limit: number) => ["quizzes", "weak-topics", limit] as const,
};

export function useQuizzes() {
  return useQuery({ queryKey: quizzesKeys.all, queryFn: quizzesApi.fetchAll });
}

export function useQuizAttempts() {
  return useQuery({
    queryKey: quizzesKeys.attempts,
    queryFn: quizzesApi.fetchAllAttempts,
  });
}

export function useQuiz(id: string) {
  return useQuery({
    queryKey: quizzesKeys.byId(id),
    queryFn: () => quizzesApi.fetchById(id),
    enabled: !!id,
  });
}

export function useLatestQuizAttempt(quizId: string) {
  return useQuery({
    queryKey: quizzesKeys.latestAttempt(quizId),
    queryFn: () => quizzesApi.fetchLatestAttempt(quizId),
    enabled: !!quizId,
  });
}

export function useWeakTopics(limit = 5) {
  return useQuery({
    queryKey: quizzesKeys.weakTopics(limit),
    queryFn: () => quizzesApi.fetchWeakTopics(limit),
  });
}

export function useDeleteQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => quizzesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: quizzesKeys.all }),
  });
}

export function useRecordQuizAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      quizId,
      score,
      total,
      answers,
      weakTopics,
      attemptKey,
    }: {
      quizId: string;
      score: number;
      total: number;
      answers: unknown;
      weakTopics: string[];
      /** Identifies the run, so a replay of this mutation cannot record a
       *  second attempt. See lib/attemptKey.ts. */
      attemptKey?: string;
    }) =>
      quizzesApi.recordAttempt(
        quizId,
        score,
        total,
        answers,
        weakTopics,
        attemptKey,
      ),
    onSuccess: (_data, { quizId, answers, attemptKey }) => {
      qc.invalidateQueries({ queryKey: quizzesKeys.latestAttempt(quizId) });
      qc.invalidateQueries({ queryKey: ["quizzes", "weak-topics"] });
      recordQuizMisconceptions(qc, quizId, answers, attemptKey);
    },
  });
}

/**
 * Feed a finished attempt into the misconception ledger.
 *
 * Hooked here rather than in QuizRunner and MockExamRunner because both write
 * attempts through this one mutation, and quizzing is the highest-volume
 * signal the ledger gets — it is how rows opened by the AI tools get closed
 * through ordinary study rather than a special ritual.
 *
 * Subject is resolved through the quiz's folder, whose `name` is what the rest
 * of the app means by a subject. Getting this right matters more than it
 * looks: the ledger merges on (subject, concept), so a quiz filing "Hydrolysis"
 * under "" while the Debugger files it under "Chemistry" would split one belief
 * into two rows and lose the recurrence signal entirely. Both reads come from
 * the cache the quiz screens already populated; if either is cold the subject
 * falls back to empty rather than blocking the completion screen on a fetch.
 */
function recordQuizMisconceptions(
  qc: ReturnType<typeof useQueryClient>,
  quizId: string,
  answers: unknown,
  attemptKey?: string,
): void {
  if (!Array.isArray(answers)) return;

  const quizzes = qc.getQueryData<Quiz[]>(quizzesKeys.all);
  const folders = qc.getQueryData<Folder[]>(foldersKeys.all);
  const quiz = quizzes?.find((q) => q.id === quizId);
  const subject =
    folders?.find((f) => f.id === quiz?.folder_id)?.name ?? "";

  const candidates = candidatesFromQuizAnswers(
    answers as Array<{ topic?: string; correct?: boolean }>,
    { subject, attemptId: attemptKey },
  );
  if (candidates.length === 0) return;

  /* Deliberately not awaited and never surfaced. The student has finished the
     quiz; a ledger write is bookkeeping behind their result screen and must
     not be able to turn into an error toast on it. */
  void misconceptionsApi
    .record(candidates)
    .then((written) => {
      if (written.length > 0) {
        void qc.invalidateQueries({ queryKey: misconceptionsKeys.all });
      }
    })
    .catch((err) => console.warn("[misconceptions] quiz write failed:", err));
}
