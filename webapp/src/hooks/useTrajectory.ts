import { useMemo } from "react";
import type { Exam } from "../api/types";
import { useAllDecks } from "./useDecks";
import { useExams } from "./useExams";
import { useFlashcards } from "./useFlashcards";
import { useFolders } from "./useFolders";
import { useLifeContext } from "./useLifeContext";
import { useQuizAttempts } from "./useQuizzes";
import { availabilityRange } from "../lib/availability";
import { localDateStr, parseLocalDate } from "../lib/date";
import { matchExamFolder } from "../lib/examReadiness";
import { importIcsForRange } from "../lib/icsImport";
import { anyPending } from "../lib/queryState";
import {
  buildTopicStates,
  forecast,
  type TrajectoryForecast,
} from "../lib/trajectory";

/* Trajectory, assembled.
 *
 * Everything below it is pure. What this hook contributes is the join nothing
 * else in the app makes: the memory model (decks, cards, quiz history) and the
 * time model (Life Sync's real free hours between now and the exam) meeting in
 * one place. That join is the product — it is what lets us answer "what is the
 * next hour worth" when every competitor can only answer "here is more
 * material". */

/** Beyond this the forecast stops meaning anything: a projection ninety days
 *  out is dominated by decisions the student has not made yet, and rendering
 *  it with a decimal point would be false precision. */
export const MAX_FORECAST_DAYS = 60;

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

  const candidates = useMemo(
    () =>
      (exams.data ?? [])
        .filter((e) => e.status !== "Completed" && e.exam_date >= today)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date)),
    [exams.data, today],
  );

  const exam = useMemo(() => {
    if (examId != null) {
      return candidates.find((e) => e.id === examId) ?? candidates[0] ?? null;
    }
    return candidates[0] ?? null;
  }, [candidates, examId]);

  const folder = useMemo(
    () => matchExamFolder(exam, folders.data),
    [exam, folders.data],
  );

  const topics = useMemo(() => {
    if (!exam) return [];
    return buildTopicStates({
      decks: decks.data ?? [],
      cards: cards.data ?? [],
      attempts: attempts.data ?? [],
      /* Scoped to the matched folder when there is one. Without a match we
         forecast off everything, which is imprecise but far better than
         forecasting off nothing — and the view says which of the two it is. */
      folderId: folder?.id ?? null,
    });
  }, [exam, decks.data, cards.data, attempts.data, folder?.id]);

  /* The student's genuinely free minutes per day between now and the exam.
     Availability rather than the scheduler's output on purpose: the question
     is what their time is *worth*, which means asking what time they have,
     not what we have already spent it on. */
  const plannedMinutes = useMemo(() => {
    if (!exam) return {};
    const days =
      Math.round(
        (parseLocalDate(exam.exam_date).getTime() -
          parseLocalDate(today).getTime()) /
          86400000,
      ) + 1;
    const span = Math.max(1, Math.min(MAX_FORECAST_DAYS, days));
    const calendar = context.importedIcs
      ? importIcsForRange(context.importedIcs, today, span).events
      : [];
    const out: Record<string, number> = {};
    for (const day of availabilityRange(context, today, span, calendar)) {
      out[day.date] = day.availableMins;
    }
    return out;
  }, [exam, context, today]);

  const result = useMemo(() => {
    if (!exam || topics.length === 0) return null;
    return forecast({
      topics,
      examName: exam.exam_name,
      examDate: exam.exam_date,
      today,
      plannedMinutes,
      blockMins: context.maxBlockMins,
    });
  }, [exam, topics, today, plannedMinutes, context.maxBlockMins]);

  const isPending = anyPending(
    exams.isPending,
    folders.isPending,
    decks.isPending,
    cards.isPending,
    attempts.isPending,
  );

  return {
    exam,
    candidates,
    forecast: result,
    needsMaterial: !isPending && Boolean(exam) && topics.length === 0,
    isPending,
  };
}
