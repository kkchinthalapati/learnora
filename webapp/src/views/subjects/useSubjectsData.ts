import { useMemo } from "react";
import { useExams } from "../../hooks/useExams";
import { useFlashcards } from "../../hooks/useFlashcards";
import { useFolders } from "../../hooks/useFolders";
import { useMaterials } from "../../hooks/useMaterials";
import { usePlanForWeek } from "../../hooks/usePlans";
import { localDateStr, mondayOfWeek } from "../../lib/date";
import { progressByLesson } from "../../lib/lessons";
import { parseStoredPlan } from "../../lib/planShape";
import { useStudySchedule } from "../../hooks/useStudySchedule";
import { blocksFromSchedule, upcomingBlocks, type DatedBlock } from "../../lib/subjects";

/* What the Subjects page and a subject's page both read: subjects, lessons,
 * card progress per lesson, exams and this week's plan. One hook so the two
 * pages always count the same things the same way. */
export function useSubjectsData() {
  const folders = useFolders();
  const materials = useMaterials();
  const cards = useFlashcards();
  const exams = useExams();
  const today = localDateStr();
  const week = usePlanForWeek(localDateStr(mondayOfWeek()));

  const schedule = useStudySchedule();

  const progress = useMemo(() => progressByLesson(cards.data ?? []), [cards.data]);
  const plan = useMemo(() => (week.data ? parseStoredPlan(week.data.plan_json) : null), [week.data]);
  /* The same week the Plan page shows: the AI plan when one was made,
     otherwise the schedule built from free time, tasks and exams. */
  const weekBlocks: DatedBlock[] = useMemo(
    () => (plan ? upcomingBlocks(plan, today) : blocksFromSchedule(schedule.blocks, today)),
    [plan, schedule.blocks, today],
  );
  const weekSource: "plan" | "schedule" = plan ? "plan" : "schedule";

  return {
    today,
    folders: folders.data ?? [],
    lessons: materials.data ?? [],
    progress,
    exams: exams.data ?? [],
    plan,
    weekBlocks,
    weekSource,
    isPending: folders.isPending || materials.isPending,
    isError: folders.isError || materials.isError,
    planPending: week.isPending || schedule.isPending,
    retry: () => {
      void folders.refetch();
      void materials.refetch();
    },
  };
}
