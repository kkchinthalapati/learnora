import { useEffect, useMemo, useState } from "react";
import { useSessionsSince } from "../../hooks/useSessions";
import {
  getTodayProgress,
  loadStudyGoals,
  DAILY_PROGRESS_EVENT,
  STUDY_GOALS_EVENT,
  type StudyGoals,
} from "../../lib/achievements";
import { remoteTotals, computeStreak } from "./analytics";
import { ActivityRings } from "./ActivityRings";
import { Skeleton } from "../../components/Skeleton";

/** Connects the pure ActivityRings presentational component to today's
 *  actual progress. Cards/tasks counts come from client-side counters
 *  (see achievements.ts) rather than the API, since neither flashcards nor
 *  tasks carry a "reviewed/completed at" timestamp server-side. */
export function ActivityRingsCard() {
  const { data: sessions, isPending } = useSessionsSince(90);
  const [goals, setGoals] = useState<StudyGoals>(loadStudyGoals);
  const [progress, setProgress] = useState(getTodayProgress);

  useEffect(() => {
    const onGoals = () => setGoals(loadStudyGoals());
    const onProgress = () => setProgress(getTodayProgress());
    window.addEventListener(STUDY_GOALS_EVENT, onGoals);
    window.addEventListener(DAILY_PROGRESS_EVENT, onProgress);
    window.addEventListener("focus", onProgress);
    return () => {
      window.removeEventListener(STUDY_GOALS_EVENT, onGoals);
      window.removeEventListener(DAILY_PROGRESS_EVENT, onProgress);
      window.removeEventListener("focus", onProgress);
    };
  }, []);

  const todayMins = useMemo(
    () => (sessions ? remoteTotals(sessions).today : 0),
    [sessions],
  );
  const streak = useMemo(() => computeStreak(sessions ?? []), [sessions]);

  if (isPending) {
    return <Skeleton label="Loading today's progress" height={112} />;
  }

  return (
    <ActivityRings
      focusMinutes={todayMins}
      focusGoal={goals.dailyMinutesGoal}
      cardsReviewed={progress.cardsReviewed}
      cardsGoal={goals.dailyCardsGoal}
      tasksCompleted={progress.tasksCompleted}
      tasksGoal={goals.dailyTasksGoal}
      streakDays={streak}
    />
  );
}
