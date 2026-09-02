import { Storage } from "./storage";
import type { IconName } from "../components/icons";

export const STUDY_GOALS_STORAGE_KEY = "learnora_study_goals";
export const ACHIEVEMENTS_STORAGE_KEY = "learnora_unlocked_achievements";
export const STUDY_GOALS_EVENT = "learnora:study-goals-changed";

export interface StudyGoals {
  dailyMinutesGoal: number;
  dailyCardsGoal: number;
  dailyTasksGoal: number;
}

export const DEFAULT_STUDY_GOALS: StudyGoals = Object.freeze({
  dailyMinutesGoal: 30,
  dailyCardsGoal: 15,
  dailyTasksGoal: 3,
});

export type AchievementCategory =
  | "consistency"
  | "focus"
  | "mastery"
  | "excellence";

export type AchievementFilterCategory = "all" | AchievementCategory;

export interface AchievementBadgeDef {
  id: string;
  title: string;
  description: string;
  category: AchievementCategory;
  iconName: IconName;
  maxProgress: number;
  unit: string;
  hint: string;
}

export const ACHIEVEMENT_BADGES: ReadonlyArray<AchievementBadgeDef> = [
  // 1. Consistency (4 badges)
  {
    id: "first-spark",
    title: "First Spark",
    description: "Complete your first study streak day.",
    category: "consistency",
    iconName: "flame",
    maxProgress: 1,
    unit: "day",
    hint: "1 day streak",
  },
  {
    id: "steady-flame",
    title: "Steady Flame",
    description: "Maintain a 3-day consecutive study streak.",
    category: "consistency",
    iconName: "flame",
    maxProgress: 3,
    unit: "days",
    hint: "3 days streak",
  },
  {
    id: "week-warrior",
    title: "Week Warrior",
    description: "Reach a 7-day study streak milestone.",
    category: "consistency",
    iconName: "calendar-week",
    maxProgress: 7,
    unit: "days",
    hint: "7 days streak",
  },
  {
    id: "unstoppable",
    title: "Unstoppable",
    description: "Build an epic 30-day continuous study habit.",
    category: "consistency",
    iconName: "zap",
    maxProgress: 30,
    unit: "days",
    hint: "30 days streak",
  },

  // 2. Focus (4 badges)
  {
    id: "focus-initiate",
    title: "Focus Initiate",
    description: "Accumulate 25 total focus minutes.",
    category: "focus",
    iconName: "clock",
    maxProgress: 25,
    unit: "mins",
    hint: "25m focus time",
  },
  {
    id: "deep-diver",
    title: "Deep Diver",
    description: "Reach 60 total focus minutes of deep study.",
    category: "focus",
    iconName: "compass",
    maxProgress: 60,
    unit: "mins",
    hint: "60m focus time",
  },
  {
    id: "century-club",
    title: "Century Club",
    description: "Complete 100 total focus minutes.",
    category: "focus",
    iconName: "award",
    maxProgress: 100,
    unit: "mins",
    hint: "100m focus time",
  },
  {
    id: "focus-titan",
    title: "Focus Titan",
    description: "Clock an astonishing 500 total focus minutes.",
    category: "focus",
    iconName: "target",
    maxProgress: 500,
    unit: "mins",
    hint: "500m focus time",
  },

  // 3. Mastery (4 badges)
  {
    id: "recall-rookie",
    title: "Recall Rookie",
    description: "Review 20 flashcards in spaced repetition.",
    category: "mastery",
    iconName: "layers",
    maxProgress: 20,
    unit: "cards",
    hint: "20 cards reviewed",
  },
  {
    id: "memory-master",
    title: "Memory Master",
    description: "Review 100 flashcards across your decks.",
    category: "mastery",
    iconName: "brain",
    maxProgress: 100,
    unit: "cards",
    hint: "100 cards reviewed",
  },
  {
    id: "grandmaster",
    title: "Grandmaster",
    description: "Review 500 flashcards to seal your mastery.",
    category: "mastery",
    iconName: "graduation-cap",
    maxProgress: 500,
    unit: "cards",
    hint: "500 cards reviewed",
  },
  {
    id: "knowledge-vault",
    title: "Knowledge Vault",
    description: "Review 1000 flashcards in total mastery.",
    category: "mastery",
    iconName: "lock",
    maxProgress: 1000,
    unit: "cards",
    hint: "1000 cards reviewed",
  },

  // 4. Excellence (4 badges)
  {
    id: "quiz-ace",
    title: "Quiz Ace",
    description: "Score a perfect 100% on any practice quiz.",
    category: "excellence",
    iconName: "star",
    maxProgress: 100,
    unit: "%",
    hint: "Score 100% on a quiz",
  },
  {
    id: "speed-demon",
    title: "Speed Demon",
    description: "Complete a rapid quiz attempt with flying colors.",
    category: "excellence",
    iconName: "zap",
    maxProgress: 1,
    unit: "quiz",
    hint: "Fast quiz attempt",
  },
  {
    id: "exam-ready",
    title: "Exam Ready",
    description: "Reach 80%+ readiness score for an upcoming exam.",
    category: "excellence",
    iconName: "shield",
    maxProgress: 80,
    unit: "%",
    hint: "80%+ exam readiness",
  },
  {
    id: "perfect-week",
    title: "Perfect Week",
    description: "Meet your daily study goal 7/7 days in a week.",
    category: "excellence",
    iconName: "trophy",
    maxProgress: 7,
    unit: "days",
    hint: "7/7 days goal met",
  },
];

export interface EvaluatedAchievement extends AchievementBadgeDef {
  currentProgress: number;
  progressPercent: number;
  unlocked: boolean;
  unlockedAt: string | null;
}

export interface AchievementEvaluationInput {
  streak?: number;
  totalFocusMinutes?: number;
  cardsReviewed?: number;
  quizAttempts?: Array<{
    score: number;
    total: number;
    created_at?: string;
  }>;
  examReadinessScore?: number;
  daysGoalMetInWeek?: number;
  fastQuizCompleted?: boolean;
  unlockedTimestamps?: Record<string, string>;
}

export interface DailyGoalProgressInput {
  todayFocusMinutes?: number;
  todayCardsReviewed?: number;
  todayTasksCompleted?: number;
  goals?: StudyGoals;
}

export interface DailyGoalProgress {
  minutesCurrent: number;
  minutesGoal: number;
  minutesPercent: number;
  cardsCurrent: number;
  cardsGoal: number;
  cardsPercent: number;
  tasksCurrent: number;
  tasksGoal: number;
  tasksPercent: number;
  totalPercent: number;
  achieved: boolean;
  isMinutesMet: boolean;
  isCardsMet: boolean;
  isTasksMet: boolean;
}

export function loadStudyGoals(): StudyGoals {
  const stored = Storage.get<Partial<StudyGoals>>(STUDY_GOALS_STORAGE_KEY, {});
  return {
    dailyMinutesGoal:
      typeof stored.dailyMinutesGoal === "number" && stored.dailyMinutesGoal > 0
        ? stored.dailyMinutesGoal
        : DEFAULT_STUDY_GOALS.dailyMinutesGoal,
    dailyCardsGoal:
      typeof stored.dailyCardsGoal === "number" && stored.dailyCardsGoal > 0
        ? stored.dailyCardsGoal
        : DEFAULT_STUDY_GOALS.dailyCardsGoal,
    dailyTasksGoal:
      typeof stored.dailyTasksGoal === "number" && stored.dailyTasksGoal > 0
        ? stored.dailyTasksGoal
        : DEFAULT_STUDY_GOALS.dailyTasksGoal,
  };
}

export function saveStudyGoals(goals: Partial<StudyGoals>): StudyGoals {
  const current = loadStudyGoals();
  const updated: StudyGoals = {
    dailyMinutesGoal:
      typeof goals.dailyMinutesGoal === "number" && goals.dailyMinutesGoal > 0
        ? Math.round(goals.dailyMinutesGoal)
        : current.dailyMinutesGoal,
    dailyCardsGoal:
      typeof goals.dailyCardsGoal === "number" && goals.dailyCardsGoal > 0
        ? Math.round(goals.dailyCardsGoal)
        : current.dailyCardsGoal,
    dailyTasksGoal:
      typeof goals.dailyTasksGoal === "number" && goals.dailyTasksGoal > 0
        ? Math.round(goals.dailyTasksGoal)
        : current.dailyTasksGoal,
  };
  Storage.set(STUDY_GOALS_STORAGE_KEY, updated);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(STUDY_GOALS_EVENT, { detail: updated }),
    );
  }
  return updated;
}

export function loadUnlockedAchievements(): Record<string, string> {
  return Storage.get<Record<string, string>>(ACHIEVEMENTS_STORAGE_KEY, {});
}

export function saveUnlockedAchievements(
  records: Record<string, string>,
): void {
  Storage.set(ACHIEVEMENTS_STORAGE_KEY, records);
}

export function computeDaysGoalMetInWeek(
  sessions: { started_at: string; minutes?: number }[],
  dailyMinutesGoal: number = DEFAULT_STUDY_GOALS.dailyMinutesGoal,
): number {
  const dayTotals = new Map<string, number>();
  for (const s of sessions) {
    const day = new Date(s.started_at).toDateString();
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + (s.minutes || 0));
  }

  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const dayStr = d.toDateString();
    if ((dayTotals.get(dayStr) ?? 0) >= dailyMinutesGoal) {
      count++;
    }
  }
  return count;
}

/* Thresholds for the Speed Demon badge ("complete a rapid quiz attempt with
 * flying colors"): at most 10 seconds per question on average, and at least
 * 80% correct. */
export const FAST_QUIZ_MAX_AVG_SECONDS = 10;
export const FAST_QUIZ_MIN_PERCENT = 80;

/** Whether one quiz attempt counts for Speed Demon. Requires per-question
 *  timing (`secondsSpent`, stamped by QuizRunner): attempts recorded before
 *  timing existed carry no speed evidence and never count — the badge used to
 *  fall back to "any attempt with a correct answer", which was no threshold
 *  at all. */
export function isFastQuizAttempt(attempt: {
  score: number;
  total: number;
  answers: Array<{ secondsSpent?: number }>;
}): boolean {
  if (attempt.total <= 0) return false;
  if (attempt.score / attempt.total < FAST_QUIZ_MIN_PERCENT / 100) return false;
  const timed = attempt.answers.filter(
    (a) => typeof a.secondsSpent === "number",
  );
  if (timed.length === 0) return false;
  const totalSeconds = timed.reduce((sum, a) => sum + (a.secondsSpent ?? 0), 0);
  return totalSeconds / timed.length <= FAST_QUIZ_MAX_AVG_SECONDS;
}

export function evaluateAchievements(
  input: AchievementEvaluationInput = {},
): EvaluatedAchievement[] {
  const {
    streak = 0,
    totalFocusMinutes = 0,
    cardsReviewed = 0,
    quizAttempts = [],
    examReadinessScore = 0,
    daysGoalMetInWeek = 0,
    fastQuizCompleted = false,
    unlockedTimestamps = loadUnlockedAchievements(),
  } = input;

  const nowIso = new Date().toISOString();
  const updatedTimestamps: Record<string, string> = { ...unlockedTimestamps };
  let timestampsChanged = false;

  const hasQuizAce = quizAttempts.some(
    (q) => q.total > 0 && q.score >= q.total,
  );
  const maxQuizPercent = quizAttempts.reduce((max, q) => {
    if (q.total <= 0) return max;
    const pct = Math.round((q.score / q.total) * 100);
    return Math.max(max, pct);
  }, 0);

  /* "Rapid" must come from a real speed signal (`fastQuizCompleted`, computed
   * by the caller from per-question timing stored in an attempt's answers).
   * It used to fall back to "any attempt with at least one correct answer",
   * which unlocked the badge for a slow 1/10 — a threshold no better than
   * none. Attempts recorded before per-question timing existed simply never
   * count, which is honest: there is no evidence they were rapid. */
  const hasFastQuiz = fastQuizCompleted;

  const results: EvaluatedAchievement[] = ACHIEVEMENT_BADGES.map((badge) => {
    let current = 0;
    let unlocked = false;

    switch (badge.id) {
      // 1. Consistency
      case "first-spark":
        current = Math.min(badge.maxProgress, streak);
        unlocked = streak >= 1;
        break;
      case "steady-flame":
        current = Math.min(badge.maxProgress, streak);
        unlocked = streak >= 3;
        break;
      case "week-warrior":
        current = Math.min(badge.maxProgress, streak);
        unlocked = streak >= 7;
        break;
      case "unstoppable":
        current = Math.min(badge.maxProgress, streak);
        unlocked = streak >= 30;
        break;

      // 2. Focus
      case "focus-initiate":
        current = Math.min(badge.maxProgress, totalFocusMinutes);
        unlocked = totalFocusMinutes >= 25;
        break;
      case "deep-diver":
        current = Math.min(badge.maxProgress, totalFocusMinutes);
        unlocked = totalFocusMinutes >= 60;
        break;
      case "century-club":
        current = Math.min(badge.maxProgress, totalFocusMinutes);
        unlocked = totalFocusMinutes >= 100;
        break;
      case "focus-titan":
        current = Math.min(badge.maxProgress, totalFocusMinutes);
        unlocked = totalFocusMinutes >= 500;
        break;

      // 3. Mastery
      case "recall-rookie":
        current = Math.min(badge.maxProgress, cardsReviewed);
        unlocked = cardsReviewed >= 20;
        break;
      case "memory-master":
        current = Math.min(badge.maxProgress, cardsReviewed);
        unlocked = cardsReviewed >= 100;
        break;
      case "grandmaster":
        current = Math.min(badge.maxProgress, cardsReviewed);
        unlocked = cardsReviewed >= 500;
        break;
      case "knowledge-vault":
        current = Math.min(badge.maxProgress, cardsReviewed);
        unlocked = cardsReviewed >= 1000;
        break;

      // 4. Excellence
      case "quiz-ace":
        current = hasQuizAce ? 100 : Math.min(100, maxQuizPercent);
        unlocked = hasQuizAce || current >= 100;
        break;
      case "speed-demon":
        current = hasFastQuiz ? 1 : 0;
        unlocked = hasFastQuiz;
        break;
      case "exam-ready":
        current = Math.min(badge.maxProgress, examReadinessScore);
        unlocked = examReadinessScore >= 80;
        break;
      case "perfect-week":
        current = Math.min(badge.maxProgress, daysGoalMetInWeek);
        /* Goal-days only. It used to also unlock on streak >= 7, but the
         * streak counts a day at ≥5 minutes while the goal defaults to 30 —
         * a week of 10-minute days earned "met your daily goal 7/7" without
         * ever meeting it. */
        unlocked = daysGoalMetInWeek >= 7;
        if (unlocked) current = 7;
        break;

      default:
        current = 0;
        unlocked = false;
    }

    let unlockedAt: string | null = null;
    if (unlocked) {
      if (updatedTimestamps[badge.id]) {
        unlockedAt = updatedTimestamps[badge.id];
      } else {
        unlockedAt = nowIso;
        updatedTimestamps[badge.id] = nowIso;
        timestampsChanged = true;
      }
    } else {
      unlockedAt = null;
    }

    const progressPercent = Math.min(
      100,
      Math.max(0, Math.round((current / badge.maxProgress) * 100)),
    );

    return {
      ...badge,
      currentProgress: current,
      progressPercent,
      unlocked,
      unlockedAt,
    };
  });

  if (timestampsChanged && typeof window !== "undefined") {
    saveUnlockedAchievements(updatedTimestamps);
  }

  return results;
}

export function evaluateDailyGoalProgress(
  input: DailyGoalProgressInput = {},
): DailyGoalProgress {
  const goals = input.goals ?? loadStudyGoals();
  const minutesCurrent = Math.max(0, input.todayFocusMinutes ?? 0);
  const minutesGoal = Math.max(1, goals.dailyMinutesGoal);
  const minutesPercent = Math.min(
    100,
    Math.round((minutesCurrent / minutesGoal) * 100),
  );

  const cardsCurrent = Math.max(0, input.todayCardsReviewed ?? 0);
  const cardsGoal = Math.max(1, goals.dailyCardsGoal);
  const cardsPercent = Math.min(
    100,
    Math.round((cardsCurrent / cardsGoal) * 100),
  );

  const tasksCurrent = Math.max(0, input.todayTasksCompleted ?? 0);
  const tasksGoal = Math.max(1, goals.dailyTasksGoal);
  const tasksPercent = Math.min(
    100,
    Math.round((tasksCurrent / tasksGoal) * 100),
  );

  const isMinutesMet = minutesCurrent >= minutesGoal;
  const isCardsMet = cardsCurrent >= cardsGoal;
  const isTasksMet = tasksCurrent >= tasksGoal;

  const totalPercent = minutesPercent;
  const achieved = isMinutesMet;

  return {
    minutesCurrent,
    minutesGoal,
    minutesPercent,
    cardsCurrent,
    cardsGoal,
    cardsPercent,
    tasksCurrent,
    tasksGoal,
    tasksPercent,
    totalPercent,
    achieved,
    isMinutesMet,
    isCardsMet,
    isTasksMet,
  };
}

export const DAILY_PROGRESS_STORAGE_KEY = "learnora_daily_progress_v1";
export const DAILY_PROGRESS_EVENT = "learnora:daily-progress-changed";

interface StoredDailyProgress {
  date: string;
  cardsReviewed: number;
  tasksCompleted: number;
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadDailyProgress(): StoredDailyProgress {
  const stored = Storage.get<StoredDailyProgress>(DAILY_PROGRESS_STORAGE_KEY, {
    date: todayKey(),
    cardsReviewed: 0,
    tasksCompleted: 0,
  });
  return stored.date === todayKey()
    ? stored
    : { date: todayKey(), cardsReviewed: 0, tasksCompleted: 0 };
}

function saveDailyProgress(progress: StoredDailyProgress): void {
  Storage.set(DAILY_PROGRESS_STORAGE_KEY, progress);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(DAILY_PROGRESS_EVENT, { detail: progress }),
    );
  }
}

/** Today's cards-reviewed and tasks-completed counts. Neither is stored
 *  server-side (flashcards have no review log, tasks have no completed_at),
 *  so these are recorded client-side at the point of action and reset when
 *  the local calendar date rolls over. */
export function getTodayProgress(): {
  cardsReviewed: number;
  tasksCompleted: number;
} {
  const { cardsReviewed, tasksCompleted } = loadDailyProgress();
  return { cardsReviewed, tasksCompleted };
}

export function recordCardReviewedToday(): void {
  const current = loadDailyProgress();
  saveDailyProgress({ ...current, cardsReviewed: current.cardsReviewed + 1 });
}

export function recordTaskCompletedToday(): void {
  const current = loadDailyProgress();
  saveDailyProgress({
    ...current,
    tasksCompleted: current.tasksCompleted + 1,
  });
}

export function getUnlockedAchievements(
  achievements: EvaluatedAchievement[],
): EvaluatedAchievement[] {
  return achievements.filter((a) => a.unlocked);
}

export function getLockedAchievements(
  achievements: EvaluatedAchievement[],
): EvaluatedAchievement[] {
  return achievements.filter((a) => !a.unlocked);
}

export function getNextMilestones(
  achievements: EvaluatedAchievement[],
  limit = 3,
): EvaluatedAchievement[] {
  return achievements
    .filter((a) => !a.unlocked)
    .sort((a, b) => b.progressPercent - a.progressPercent)
    .slice(0, limit);
}
