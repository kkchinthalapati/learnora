/**
 * The join behind the forecast — decks, cards, quiz history and a real
 * calendar meeting one exam.
 *
 * `trajectory.ts` is the model; this is the wiring that feeds it. It lived
 * inside `hooks/useTrajectory.ts` while the Trajectory page was the only thing
 * that wanted a forecast. The planner wants one too, and two copies of this
 * join would be worse than a shared module in a way that is specific and bad:
 * the plan would tell a student a block is worth 4.2 marks while the chart on
 * the next page said 2.1, and the moment those two numbers disagree neither is
 * believed again.
 *
 * Pure, and free of React and Supabase, so both callers can hand it whatever
 * they already hold — a hook its query data, the plan loader its awaited
 * fetches — and get the same answer.
 */

import type {
  Exam,
  Flashcard,
  FlashcardDeck,
  Folder,
  QuizAttempt,
} from "../api/types";
import { availabilityRange } from "./availability";
import { localDateStr, parseLocalDate } from "./date";
import { matchExamFolder } from "./examReadiness";
import { importIcsForRange } from "./icsImport";
import type { LifeContext } from "./lifeContext";
import {
  buildTopicStates,
  forecast,
  type TrajectoryForecast,
} from "./trajectory";

/** Beyond this the forecast stops meaning anything: a projection ninety days
 *  out is dominated by decisions the student has not made yet, and rendering
 *  it with a decimal point would be false precision. */
export const MAX_FORECAST_DAYS = 60;

export interface ForecastSources {
  exams: Exam[];
  folders: Folder[];
  decks: FlashcardDeck[];
  cards: Flashcard[];
  attempts: QuizAttempt[];
  life: LifeContext;
  today?: string;
  /** Which exam to forecast. Defaults to the soonest upcoming one, which is
   *  the one a student means when they have not said. */
  examId?: number | null;
}

export interface ForecastJoin {
  /** The exam being forecast, or null when there is no upcoming one. */
  exam: Exam | null;
  /** Every exam that could be forecast, soonest first — the picker's list. */
  candidates: Exam[];
  forecast: TrajectoryForecast | null;
  /** True when there is an exam and a life context but nothing to project
   *  from. A different and much more fixable problem than having no exams,
   *  and worth saying differently. */
  needsMaterial: boolean;
}

/** Upcoming, unfinished exams, soonest first. */
export function forecastCandidates(exams: Exam[], today: string): Exam[] {
  return exams
    .filter((e) => e.status !== "Completed" && e.exam_date >= today)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
}

/** The student's genuinely free minutes per day between today and the exam.
 *
 *  Availability rather than the scheduler's own output, on purpose: the
 *  question is what their time is *worth*, which means asking what time they
 *  have, not what has already been spent on their behalf. */
export function availableMinutesToExam(
  life: LifeContext,
  today: string,
  examDate: string,
): Record<string, number> {
  const days =
    Math.round(
      (parseLocalDate(examDate).getTime() - parseLocalDate(today).getTime()) /
        86_400_000,
    ) + 1;
  const span = Math.max(1, Math.min(MAX_FORECAST_DAYS, days));
  const calendar = life.importedIcs
    ? importIcsForRange(life.importedIcs, today, span).events
    : [];

  const out: Record<string, number> = {};
  for (const day of availabilityRange(life, today, span, calendar)) {
    out[day.date] = day.availableMins;
  }
  return out;
}

/** Build the forecast. Returns nulls rather than throwing on missing data:
 *  every caller renders something else in that case, and a student with no
 *  exams is a normal state, not a failure. */
export function buildForecast(src: ForecastSources): ForecastJoin {
  const today = src.today ?? localDateStr();
  const candidates = forecastCandidates(src.exams, today);

  const exam =
    src.examId != null
      ? (candidates.find((e) => e.id === src.examId) ?? candidates[0] ?? null)
      : (candidates[0] ?? null);

  if (!exam) {
    return { exam: null, candidates, forecast: null, needsMaterial: false };
  }

  const folder = matchExamFolder(exam, src.folders);

  const topics = buildTopicStates({
    decks: src.decks,
    cards: src.cards,
    attempts: src.attempts,
    /* Scoped to the matched folder when there is one. Without a match we
       forecast off everything, which is imprecise but far better than
       forecasting off nothing — and the view says which of the two it is. */
    folderId: folder?.id ?? null,
  });

  if (topics.length === 0) {
    return { exam, candidates, forecast: null, needsMaterial: true };
  }

  return {
    exam,
    candidates,
    needsMaterial: false,
    forecast: forecast({
      topics,
      examName: exam.exam_name,
      examDate: exam.exam_date,
      today,
      plannedMinutes: availableMinutesToExam(src.life, today, exam.exam_date),
      blockMins: src.life.maxBlockMins,
    }),
  };
}
