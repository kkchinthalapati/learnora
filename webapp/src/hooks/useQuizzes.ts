import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { quizzesApi } from "../api/quizzes";
import { misconceptionsApi } from "../api/misconceptions";
import {
  candidatesFromQuizAnswers,
  conceptKey,
  type Misconception,
  type MisconceptionCandidate,
} from "../lib/misconceptions";
import { recordLoopObservation } from "../lib/offlineSync";
import { retestDueAt } from "../lib/mistakeLoop";
import { observationKey } from "../lib/questionKey";
import {
  answeredQuestions,
  quizLoopCandidates,
  unmatchedWrong,
} from "../lib/quizMistakes";
import { labelWrongAnswers } from "../api/mistakeLabel";
import {
  parseStoredAnswers,
  parseStoredQuestions,
} from "../views/quiz/quizMeta";
import { misconceptionsKeys } from "./useMisconceptions";
import { foldersKeys } from "./useFolders";
import type { Folder, LearningEvent, Quiz, QuizAttempt } from "../api/types";
import { collectAttempts } from "../lib/attempts";
import { buildKnowledge } from "../lib/knowledgeModel";
import { learningEventsKeys } from "./useLearningEvents";
import { addMissedQuestionCards } from "../api/missedQuestions";
import { decksKeys } from "./useDecks";
import { flashcardsKeys } from "./useFlashcards";

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

export function useWeakTopics(limit = 5, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: quizzesKeys.weakTopics(limit),
    queryFn: () => quizzesApi.fetchWeakTopics(limit),
    ...options,
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
      /* Every attempt, too: readiness, the forecast, Progress's quiz average
         and the quiz list's "Last score" all read this list, and without it
         a student who finished a quiz and went straight to Progress saw the
         average from before it. */
      qc.invalidateQueries({ queryKey: quizzesKeys.attempts });
      recordQuizMisconceptions(qc, quizId, answers, attemptKey);
      fileMissedQuestions(qc, quizId, answers);
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
  const subject = folders?.find((f) => f.id === quiz?.folder_id)?.name ?? "";

  /* A correct answer the student marked as a guess is not evidence they
     know it: it earns no correction on the ledger (and the scheduler
     brings it back sooner). Wrong answers count whatever the confidence. */
  const evidence = (
    answers as Array<{
      topic?: string;
      correct?: boolean;
      confidence?: string | null;
      hintRung?: number;
    }>
  ).filter(
    (a) => !(a.correct && (a.confidence === "guess" || (a.hintRung ?? 0) > 0)),
  );
  const write = async (candidates: MisconceptionCandidate[]) => {
    if (candidates.length === 0) return;
    const written = await misconceptionsApi.record(candidates);
    /* A question the student was walked through: the worked solution is its
       repair, so the loop books a retest on a different question. Keyed per
       attempt and question, so a replayed attempt writes it once. */
    const now = new Date();
    await Promise.all(
      candidates
        .filter((c) => c.workedSolution && c.questionKey)
        .map((c) => {
          const row = written.find(
            (w) =>
              w.conceptKey === conceptKey(c.concept) && w.subject === c.subject,
          );
          if (!row) return null;
          return recordLoopObservation({
            misconceptionId: row.id,
            kind: "repair",
            sourceTool: "quiz",
            questionKey: c.questionKey!,
            idempotencyKey: observationKey(
              "worked",
              attemptKey ?? "quiz",
              c.questionKey!,
            ),
            dueAt: retestDueAt(now, row.timesObserved + 1),
            detail: "Walked through the worked solution.",
          }).catch((err) =>
            console.warn(
              "[mistakeLoop] worked-solution repair not recorded:",
              err,
            ),
          );
        }),
    );
    if (written.length > 0) {
      void qc.invalidateQueries({ queryKey: misconceptionsKeys.all });
    }
  };

  /* With the quiz's questions in hand, each wrong answer is matched under
     the mistake loop (lib/quizMistakes.ts): catalogue, then a provisional AI
     label, then a generic error type, each with its repair and question
     key. Without them (cache cold) it is the topic-level write quizzes
     always made, which the loop still accepts. */
  /* The quiz list is often not in the cache here (the runner loads one quiz
     by id), so it is fetched as fileMissedQuestions does. Without the
     questions it is the topic-level write quizzes always made. */
  const run = (async () => {
    const source =
      quiz ??
      (attemptKey
        ? (await quizzesApi.fetchAll().catch(() => [])).find(
            (q) => q.id === quizId,
          )
        : undefined);
    const questions = source ? parseStoredQuestions(source.questions_json) : [];
    if (questions.length > 0 && attemptKey) {
      const answered = answeredQuestions(
        questions,
        parseStoredAnswers(answers),
      );
      const known = (
        qc.getQueryData<Misconception[]>(misconceptionsKeys.all) ?? []
      )
        .filter((m) => m.provisional && m.subject === subject)
        .map((m) => m.concept);
      const labels = await labelWrongAnswers(
        subject,
        unmatchedWrong(answered),
        known,
      );
      /* What the student had shown they know before this sitting: a quick
         miss on a secure topic is read as a slip, not a belief. */
      const priorAttempts = (qc.getQueryData<QuizAttempt[]>(quizzesKeys.attempts) ?? []).filter(
        (a) => a.id !== attemptKey,
      );
      const priorEvents = qc.getQueryData<LearningEvent[]>(learningEventsKeys.all) ?? [];
      const secureTopics = new Set(
        /* Keyed by topic label (not skill), as the answers being read are. */
        [...buildKnowledge(
          collectAttempts(priorAttempts, priorEvents).map((a) => ({ ...a, skill: null })),
        ).values()]
          .filter((k) => k.status === "secure")
          .map((k) => k.key),
      );
      await write(
        quizLoopCandidates(answered, { subject, attemptKey, labels, secureTopics }),
      );
      return;
    }
    await write(
      candidatesFromQuizAnswers(evidence, { subject, attemptId: attemptKey }),
    );
  })();

  /* Deliberately not awaited and never surfaced. The student has finished the
     quiz; a ledger write is bookkeeping behind their result screen and must
     not be able to turn into an error toast on it. */
  void run.catch((err) =>
    console.warn("[misconceptions] quiz write failed:", err),
  );
}

/* Wrong and guessed questions go to Recall as cards (api/missedQuestions.ts),
   which is what the results screen tells the student will happen. Behind
   the results screen like the ledger write: never awaited, never a toast. */
function fileMissedQuestions(
  qc: ReturnType<typeof useQueryClient>,
  quizId: string,
  answers: unknown,
): void {
  const quiz = qc
    .getQueryData<Quiz[]>(quizzesKeys.all)
    ?.find((q) => q.id === quizId);
  const run = quiz
    ? Promise.resolve(quiz)
    : quizzesApi.fetchAll().then((all) => all.find((q) => q.id === quizId));
  void run
    .then((q) => (q ? addMissedQuestionCards(q, answers) : 0))
    .then((added) => {
      if (added > 0) {
        void qc.invalidateQueries({ queryKey: decksKeys.all });
        void qc.invalidateQueries({ queryKey: flashcardsKeys.all });
      }
    })
    .catch((err) => console.warn("[recall] missed questions not filed:", err));
}
