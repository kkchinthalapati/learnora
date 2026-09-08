import { useMemo } from "react";
import type { Exam } from "../api/types";
import { useAllDecks } from "./useDecks";
import { useExams } from "./useExams";
import { useFlashcards } from "./useFlashcards";
import { useFolders } from "./useFolders";
import { useLifeContext } from "./useLifeContext";
import { useQuizAttempts } from "./useQuizzes";
import { localDateStr } from "../lib/date";
import { anyPending } from "../lib/queryState";
import { buildForecast } from "../lib/trajectoryJoin";
import type { TrajectoryForecast } from "../lib/trajectory";

/* Trajectory, assembled.
 *
 * Everything below it is pure. What this hook contributes is the data: the
 * memory model (decks, cards, quiz history) and the time model (Life Sync's
 * real free hours between now and the exam) fetched in one place and handed to
 * `lib/trajectoryJoin.ts`, which the weekly planner calls with its own
 * awaited fetches. One join, two callers, so a block the plan values at 4.2
 * marks is worth 4.2 marks on the chart as well — the moment those two numbers
 * disagree, neither is believed again. */

export { MAX_FORECAST_DAYS } from "../lib/trajectoryJoin";

export interface UseTrajectoryResult {
  /** The exam being forecast — the soonest upcoming one unless told otherwise. */
  exam: Exam | null;
  /** Every exam that could be forecast, for the picker. */
  candidates: Exam[];
  forecast: TrajectoryForecast | null;
  /** True when the student has a life context but no decks to project from —
   *  a different, more fixable problem than having no exams. */
  needsMaterial: boolean;
  isPending: boolean;
}

export function useTrajectory(examId?: number | null): UseTrajectoryResult {
  const { context } = useLifeContext();
  const exams = useExams();
  const folders = useFolders();
  const decks = useAllDecks();
  const cards = useFlashcards();
  const attempts = useQuizAttempts();

  const today = localDateStr();

  const isPending = anyPending(
    exams.isPending,
    folders.isPending,
    decks.isPending,
    cards.isPending,
    attempts.isPending,
  );

  const join = useMemo(
    () =>
      buildForecast({
        exams: exams.data ?? [],
        folders: folders.data ?? [],
        decks: decks.data ?? [],
        cards: cards.data ?? [],
        attempts: attempts.data ?? [],
        life: context,
        today,
        examId,
      }),
    [
      exams.data,
      folders.data,
      decks.data,
      cards.data,
      attempts.data,
      context,
      today,
      examId,
    ],
  );

  return {
    ...join,
    /* Held back while queries are still in flight: "you have no material" is a
       claim about the student, and making it from an empty cache would accuse
       them of nothing during every page load. */
    needsMaterial: !isPending && join.needsMaterial,
    isPending,
  };
}
