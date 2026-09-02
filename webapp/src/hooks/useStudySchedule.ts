import { useMemo } from "react";
import { useExams } from "./useExams";
import { useFlashcardsDueCount } from "./useFlashcards";
import { useLifeContext } from "./useLifeContext";
import { useTasks } from "./useTasks";
import { useWeakTopics } from "./useQuizzes";
import { availabilityRange, type DayAvailability } from "../lib/availability";
import {
  autoSchedule,
  blocksOn,
  scheduledMinutes,
  type ScheduledBlock,
  type UnplacedDemand,
} from "../lib/autoSchedule";
import { importIcsForRange, type IcsEvent } from "../lib/icsImport";
import { isLifeContextConfigured, type LifeContext } from "../lib/lifeContext";
import { buildDemands } from "../lib/studyDemands";
import { localDateStr } from "../lib/date";
import { anyPending } from "../lib/queryState";

/* The whole Life Sync engine, assembled from what the app already knows.
 *
 * Everything under it is pure, so this hook is only wiring plus memoisation —
 * and the memoisation matters. Expanding a term's worth of recurring lectures
 * and re-running the scheduler on every keystroke somewhere else on the page
 * would be wasteful, and worse, a re-run that produced a *different* answer
 * would visibly reshuffle the student's day. The scheduler is deterministic
 * precisely so that never happens; the memo just stops the work.
 *
 * Data that has not arrived yet is treated as absent rather than waited for.
 * A timeline built from a student's real timetable is still worth showing
 * while the flashcard count is in flight; it gains a review block a moment
 * later. `isPending` is exposed so a caller can hold the first paint if it
 * would rather. */

export const DEFAULT_HORIZON_DAYS = 7;

export interface StudySchedule {
  /** The context these results were computed from. */
  context: LifeContext;
  configured: boolean;
  /** Per-day availability across the horizon, starting today. */
  days: DayAvailability[];
  /** Every scheduled block across the horizon, in chronological order. */
  blocks: ScheduledBlock[];
  /** Today's blocks, the common case, so callers do not re-filter. */
  today: ScheduledBlock[];
  todayDate: string;
  /** Work that genuinely does not fit. Surfacing this is a feature. */
  unplaced: UnplacedDemand[];
  /** Events expanded out of the imported calendar, across the horizon. */
  calendar: IcsEvent[];
  todayMins: number;
  weekMins: number;
  isPending: boolean;
}

export function useStudySchedule(
  horizonDays: number = DEFAULT_HORIZON_DAYS,
): StudySchedule {
  const { context } = useLifeContext();
  const tasks = useTasks();
  const exams = useExams();
  const dueCount = useFlashcardsDueCount();
  const weakTopics = useWeakTopics(2);

  /* Recomputed once a day rather than once a render. `localDateStr()` is not a
     stable dependency — it changes at midnight — and threading a live clock in
     here would rebuild the whole schedule every tick. A student with the tab
     open across midnight sees the new day on their next interaction, which is
     the same deal the rest of the dashboard makes. */
  const todayDate = localDateStr();

  const calendar = useMemo<IcsEvent[]>(
    () =>
      context.importedIcs
        ? importIcsForRange(context.importedIcs, todayDate, horizonDays).events
        : [],
    [context.importedIcs, todayDate, horizonDays],
  );

  const days = useMemo(
    () => availabilityRange(context, todayDate, horizonDays, calendar),
    [context, todayDate, horizonDays, calendar],
  );

  const demands = useMemo(
    () =>
      buildDemands({
        tasks: tasks.data ?? [],
        exams: exams.data ?? [],
        dueCardCount: dueCount.data ?? 0,
        weakTopics: weakTopics.data ?? [],
        today: todayDate,
        horizonDays,
      }),
    [
      tasks.data,
      exams.data,
      dueCount.data,
      weakTopics.data,
      todayDate,
      horizonDays,
    ],
  );

  const schedule = useMemo(
    () =>
      autoSchedule(
        demands,
        days.flatMap((d) => d.windows),
        {
          maxBlockMins: context.maxBlockMins,
          minBlockMins: context.minBlockMins,
          breakMins: context.breakMins,
          today: todayDate,
        },
      ),
    [
      demands,
      days,
      context.maxBlockMins,
      context.minBlockMins,
      context.breakMins,
      todayDate,
    ],
  );

  const today = useMemo(
    () => blocksOn(schedule.blocks, todayDate),
    [schedule.blocks, todayDate],
  );

  return {
    context,
    configured: isLifeContextConfigured(context),
    days,
    blocks: schedule.blocks,
    today,
    todayDate,
    unplaced: schedule.unplaced,
    calendar,
    todayMins: scheduledMinutes(today),
    weekMins: scheduledMinutes(schedule.blocks),
    isPending: anyPending(
      tasks.isPending,
      exams.isPending,
      dueCount.isPending,
      weakTopics.isPending,
    ),
  };
}
