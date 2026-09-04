import { useMemo } from "react";
import { useQuizzes, useQuizAttempts } from "./useQuizzes";
import {
  buildStudentEvidence,
  type StudentEvidence,
} from "../lib/studentEvidence";

/**
 * The student's real quiz performance, for React surfaces.
 *
 * Composes the two queries that already exist rather than fetching anything of
 * its own, so a view that shows evidence costs nothing beyond what the quiz
 * list and attempt list already cost — and stays in sync with them when an
 * attempt is recorded and those keys are invalidated.
 *
 * `isPending` matters to callers that put the result in a prompt: an evidence
 * summary built from a half-loaded cache would claim "0 quizzes taken" and
 * talk the model into refusing to answer. Wait for it before grounding on it.
 *
 * (`api/studentEvidence.ts`'s `loadStudentEvidence` is the imperative
 * equivalent, for ChatProvider's send path, which is outside react-query.)
 */
export function useStudentEvidence(): {
  evidence: StudentEvidence;
  isPending: boolean;
} {
  const quizzes = useQuizzes();
  const attempts = useQuizAttempts();

  const evidence = useMemo(
    () =>
      buildStudentEvidence({
        quizzes: quizzes.data ?? [],
        attempts: attempts.data ?? [],
      }),
    [quizzes.data, attempts.data],
  );

  return { evidence, isPending: quizzes.isPending || attempts.isPending };
}
