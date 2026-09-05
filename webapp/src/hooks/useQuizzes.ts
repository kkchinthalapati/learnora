import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { quizzesApi } from "../api/quizzes";

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

export function useAddQuiz() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      materialId,
      folderId,
      title,
      questions,
    }: {
      materialId: string | null;
      folderId: string | null;
      title: string;
      questions: unknown;
    }) => quizzesApi.add(materialId, folderId, title, questions),
    onSuccess: () => qc.invalidateQueries({ queryKey: quizzesKeys.all }),
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
    onSuccess: (_data, { quizId }) => {
      qc.invalidateQueries({ queryKey: quizzesKeys.latestAttempt(quizId) });
      qc.invalidateQueries({ queryKey: ["quizzes", "weak-topics"] });
    },
  });
}
