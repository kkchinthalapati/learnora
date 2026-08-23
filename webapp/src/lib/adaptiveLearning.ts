import type {
  Exam,
  Flashcard,
  FlashcardDeck,
  Folder,
  Quiz,
  QuizAttempt,
  StudySession,
  Task,
  WeakTopic,
} from "../api/types";
import { daysUntil } from "../views/dashboard/analytics";

export type HealthGrade = "optimal" | "good" | "needs-attention" | "at-risk";

export interface AdaptiveHealthScore {
  overallScore: number;
  grade: HealthGrade;
  consistencyScore: number;
  retentionScore: number;
  focusScore: number;
  pacingScore: number;
  burnoutRisk: "low" | "moderate" | "high";
  summary: string;
}

export type RecommendationCategory =
  | "spaced_repetition"
  | "quiz_drill"
  | "focus_sprint"
  | "recovery_break"
  | "exam_prep";

export type RecommendationPriority = "high" | "medium" | "low";

export interface AdaptiveRecommendation {
  id: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  description: string;
  actionUrl: string;
  actionLabel: string;
  estimatedMinutes: number;
}

export interface SubjectBalanceItem {
  folderId: string;
  folderName: string;
  color: string;
  minutes: number;
  percentage: number;
  status: "understudied" | "balanced" | "dominant";
}

export interface RetentionRisk {
  overdueCount: number;
  dueTodayCount: number;
  criticalCardsCount: number;
  retentionRate: number;
  status: "healthy" | "moderate" | "critical";
}

export interface OptimalStudyTime {
  preferredHour: number;
  peakFocusWindow: string;
  totalSessionsAnalyzed: number;
  confidence: "high" | "medium" | "low";
}

/**
 * Evaluates the learner's overall adaptive study health across 4 key dimensions:
 * 1. Consistency (30%): Daily study regularity and weekly target achievement
 * 2. Retention (25%): Spaced repetition health and quiz mastery
 * 3. Focus (25%): Deep work session quality and task execution
 * 4. Pacing (20%): Proximity of upcoming exams and workload distribution
 */
export function computeAdaptiveHealth(params: {
  sessions?: StudySession[];
  flashcards?: Flashcard[];
  quizzes?: Quiz[];
  quizAttempts?: QuizAttempt[];
  tasks?: Task[];
  exams?: Exam[];
  targetMinutesPerDay?: number;
  now?: Date;
}): AdaptiveHealthScore {
  const {
    sessions = [],
    flashcards = [],
    quizAttempts = [],
    tasks = [],
    exams = [],
    targetMinutesPerDay = 45,
    now = new Date(),
  } = params;

  // 1. Consistency Score (0-100)
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const recentSessions = sessions.filter((s) => {
    const d = new Date(s.started_at);
    return !isNaN(d.getTime()) && d >= sevenDaysAgo && d <= now;
  });

  const totalRecentMinutes = recentSessions.reduce(
    (acc, s) => acc + (s.minutes || 0),
    0,
  );
  const targetWeeklyMinutes = targetMinutesPerDay * 7;
  const volumeRatio = Math.min(
    totalRecentMinutes / Math.max(targetWeeklyMinutes, 1),
    1,
  );

  // Count distinct active days in last 7 days
  const activeDaysSet = new Set(
    recentSessions
      .filter((s) => s.minutes >= 5)
      .map((s) => new Date(s.started_at).toDateString()),
  );
  const activeDaysRatio = activeDaysSet.size / 7;
  const consistencyScore = Math.round(
    (volumeRatio * 0.5 + activeDaysRatio * 0.5) * 100,
  );

  // 2. Retention Score (0-100)
  let retentionScore = 80; // default baseline
  if (flashcards.length > 0 || quizAttempts.length > 0) {
    let flashcardHealth = 80;
    if (flashcards.length > 0) {
      const retentionData = calculateRetentionRisk(flashcards, now);
      flashcardHealth = retentionData.retentionRate;
    }

    let quizHealth = 80;
    if (quizAttempts.length > 0) {
      const recentAttempts = quizAttempts.slice(-10);
      const avgScore =
        recentAttempts.reduce(
          (acc, a) => acc + (a.total > 0 ? (a.score / a.total) * 100 : 75),
          0,
        ) / recentAttempts.length;
      quizHealth = Math.round(avgScore);
    }

    retentionScore = Math.round(flashcardHealth * 0.6 + quizHealth * 0.4);
  }

  // 3. Focus Score (0-100)
  let focusScore = 75;
  if (sessions.length > 0) {
    const validSessions = sessions.filter((s) => s.minutes > 0);
    if (validSessions.length > 0) {
      // Reward sessions between 20 and 60 minutes (optimal Pomodoro & ultradian rhythms)
      const optimalSessionCount = validSessions.filter(
        (s) => s.minutes >= 20 && s.minutes <= 60,
      ).length;
      const sessionQualityRatio = optimalSessionCount / validSessions.length;

      let taskCompletionRatio = 0.8;
      if (tasks.length > 0) {
        const completed = tasks.filter((t) => t.is_done).length;
        taskCompletionRatio = completed / tasks.length;
      }

      focusScore = Math.round(
        (sessionQualityRatio * 0.6 + taskCompletionRatio * 0.4) * 100,
      );
    }
  }

  // 4. Pacing Score (0-100)
  let pacingScore = 85;
  const upcomingExams = exams.filter((e) => {
    if (!e.exam_date || e.status === "Completed") return false;
    const du = daysUntil(e.exam_date, now);
    return du >= 0;
  });

  if (upcomingExams.length > 0) {
    const nearestDays = Math.min(
      ...upcomingExams.map((e) => daysUntil(e.exam_date, now)),
    );
    if (nearestDays <= 3) {
      // Within 3 days: pacing depends on recent study minutes
      pacingScore = totalRecentMinutes >= 180 ? 80 : 40;
    } else if (nearestDays <= 7) {
      pacingScore = totalRecentMinutes >= 120 ? 85 : 60;
    } else {
      pacingScore = 90;
    }
  }

  // Burnout Risk Detection
  let burnoutRisk: "low" | "moderate" | "high" = "low";
  if (totalRecentMinutes > 42 * 60) {
    // > 6 hours/day average
    burnoutRisk = "high";
  } else if (totalRecentMinutes > 28 * 60) {
    // > 4 hours/day average
    burnoutRisk = "moderate";
  }

  const overallScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        consistencyScore * 0.3 +
          retentionScore * 0.25 +
          focusScore * 0.25 +
          pacingScore * 0.2,
      ),
    ),
  );

  let grade: HealthGrade = "optimal";
  let summary = "Your study habits are balanced, consistent, and on track.";
  if (overallScore < 50) {
    grade = "at-risk";
    summary = "Study pace has dropped. Focus on short 15-minute daily sprints.";
  } else if (overallScore < 70) {
    grade = "needs-attention";
    summary = "Review overdue flashcards and maintain regular study sessions.";
  } else if (overallScore < 85) {
    grade = "good";
    summary =
      "Solid study rhythm! Reinforce weak quiz topics to achieve mastery.";
  }

  return {
    overallScore,
    grade,
    consistencyScore,
    retentionScore,
    focusScore,
    pacingScore,
    burnoutRisk,
    summary,
  };
}

/**
 * Calculates spaced repetition decay and retention risk from flashcards.
 */
export function calculateRetentionRisk(
  flashcards: Flashcard[],
  now: Date = new Date(),
): RetentionRisk {
  if (flashcards.length === 0) {
    return {
      overdueCount: 0,
      dueTodayCount: 0,
      criticalCardsCount: 0,
      retentionRate: 100,
      status: "healthy",
    };
  }

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  let overdueCount = 0;
  let dueTodayCount = 0;
  let criticalCardsCount = 0;

  for (const card of flashcards) {
    if (!card.next_review_date) {
      dueTodayCount++;
      continue;
    }

    const reviewDateStr = card.next_review_date.slice(0, 10);
    if (reviewDateStr < todayStr) {
      overdueCount++;
      if (card.ease_factor < 2.0 || card.srs_interval <= 1) {
        criticalCardsCount++;
      }
    } else if (reviewDateStr === todayStr) {
      dueTodayCount++;
    }
  }

  const total = flashcards.length;
  const overduePenalty = (overdueCount / total) * 60;
  const criticalPenalty = (criticalCardsCount / total) * 40;
  const retentionRate = Math.max(
    10,
    Math.round(100 - overduePenalty - criticalPenalty),
  );

  let status: RetentionRisk["status"] = "healthy";
  if (overdueCount >= 10 || retentionRate < 60) {
    status = "critical";
  } else if (overdueCount > 0 || retentionRate < 80) {
    status = "moderate";
  }

  return {
    overdueCount,
    dueTodayCount,
    criticalCardsCount,
    retentionRate,
    status,
  };
}

/**
 * Calculates study time distribution across subjects / folders.
 */
export function calculateSubjectBalance(
  sessions: StudySession[],
  folders: Folder[],
  lookbackDays = 14,
  now: Date = new Date(),
): SubjectBalanceItem[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  cutoff.setHours(0, 0, 0, 0);

  const folderMap = new Map<string, { name: string; color: string }>();
  for (const f of folders) {
    folderMap.set(f.id, { name: f.name, color: f.color || "#888" });
  }

  const minutesByFolder = new Map<string, number>();
  let totalMinutes = 0;

  for (const s of sessions) {
    const d = new Date(s.started_at);
    if (isNaN(d.getTime()) || d < cutoff || d > now) continue;
    const mins = s.minutes || 0;
    const fId = s.folder_id || "unassigned";
    minutesByFolder.set(fId, (minutesByFolder.get(fId) || 0) + mins);
    totalMinutes += mins;
  }

  if (totalMinutes === 0) {
    return folders.map((f) => ({
      folderId: f.id,
      folderName: f.name,
      color: f.color || "#888",
      minutes: 0,
      percentage: 0,
      status: "balanced",
    }));
  }

  const result: SubjectBalanceItem[] = [];

  for (const f of folders) {
    const mins = minutesByFolder.get(f.id) || 0;
    const percentage = Math.round((mins / totalMinutes) * 100);
    let status: SubjectBalanceItem["status"] = "balanced";
    if (percentage < 10 && folders.length > 1) {
      status = "understudied";
    } else if (percentage > 50 && folders.length > 2) {
      status = "dominant";
    }
    result.push({
      folderId: f.id,
      folderName: f.name,
      color: f.color || "#888",
      minutes: mins,
      percentage,
      status,
    });
  }

  if (minutesByFolder.has("unassigned")) {
    const unassignedMins = minutesByFolder.get("unassigned") || 0;
    if (unassignedMins > 0) {
      const percentage = Math.round((unassignedMins / totalMinutes) * 100);
      result.push({
        folderId: "unassigned",
        folderName: "General / Unassigned",
        color: "#888888",
        minutes: unassignedMins,
        percentage,
        status: "balanced",
      });
    }
  }

  return result.sort((a, b) => b.minutes - a.minutes);
}

/**
 * Predicts the user's optimal study hour window based on historical session starts.
 */
export function predictOptimalStudyTime(
  sessions: StudySession[],
): OptimalStudyTime {
  if (sessions.length === 0) {
    return {
      preferredHour: 9,
      peakFocusWindow: "9:00 AM – 11:00 AM",
      totalSessionsAnalyzed: 0,
      confidence: "low",
    };
  }

  const hourCounts = new Array(24).fill(0);
  let validCount = 0;

  for (const s of sessions) {
    const d = new Date(s.started_at);
    if (!isNaN(d.getTime())) {
      const hour = d.getHours();
      hourCounts[hour] += s.minutes || 25;
      validCount++;
    }
  }

  if (validCount === 0) {
    return {
      preferredHour: 9,
      peakFocusWindow: "9:00 AM – 11:00 AM",
      totalSessionsAnalyzed: 0,
      confidence: "low",
    };
  }

  let peakHour = 9;
  let maxWeight = -1;
  for (let h = 0; h < 24; h++) {
    // Smoothed 3-hour window weight
    const prev = (h + 23) % 24;
    const next = (h + 1) % 24;
    const weight =
      hourCounts[prev] * 0.5 + hourCounts[h] + hourCounts[next] * 0.5;
    if (weight > maxWeight) {
      maxWeight = weight;
      peakHour = h;
    }
  }

  const formatHour = (h: number) => {
    const normalized = (h + 24) % 24;
    const period = normalized >= 12 ? "PM" : "AM";
    const hour12 = normalized % 12 === 0 ? 12 : normalized % 12;
    return `${hour12}:00 ${period}`;
  };

  const peakFocusWindow = `${formatHour(peakHour)} – ${formatHour(peakHour + 2)}`;

  let confidence: "high" | "medium" | "low" = "low";
  if (validCount >= 10) {
    confidence = "high";
  } else if (validCount >= 4) {
    confidence = "medium";
  }

  return {
    preferredHour: peakHour,
    peakFocusWindow,
    totalSessionsAnalyzed: validCount,
    confidence,
  };
}

/**
 * Returns prioritized, actionable adaptive recommendations tailored to current state.
 */
export function getAdaptiveRecommendations(params: {
  sessions?: StudySession[];
  flashcards?: Flashcard[];
  quizzes?: Quiz[];
  quizAttempts?: QuizAttempt[];
  tasks?: Task[];
  exams?: Exam[];
  folders?: Folder[];
  now?: Date;
}): AdaptiveRecommendation[] {
  const {
    sessions = [],
    flashcards = [],
    quizAttempts = [],
    tasks = [],
    exams = [],
    folders = [],
    now = new Date(),
  } = params;

  const recommendations: AdaptiveRecommendation[] = [];

  // 1. Spaced Repetition Due/Overdue Check
  const retention = calculateRetentionRisk(flashcards, now);
  if (retention.overdueCount > 0) {
    recommendations.push({
      id: "rec-srs-due",
      category: "spaced_repetition",
      priority: retention.overdueCount > 10 ? "high" : "medium",
      title: `${retention.overdueCount} Flashcard${retention.overdueCount > 1 ? "s" : ""} Due for Review`,
      description: `Active recall now will prevent memory decay on ${retention.criticalCardsCount} high-risk items.`,
      actionUrl: "/library/flashcards",
      actionLabel: "Start Flashcard Review",
      estimatedMinutes: Math.min(
        25,
        Math.max(5, Math.ceil(retention.overdueCount * 0.8)),
      ),
    });
  }

  // 2. Upcoming Exam Preparation Alert
  const upcomingExams = exams
    .filter((e) => {
      if (!e.exam_date || e.status === "Completed") return false;
      const du = daysUntil(e.exam_date, now);
      return du >= 0 && du <= 10;
    })
    .sort((a, b) => daysUntil(a.exam_date, now) - daysUntil(b.exam_date, now));

  if (upcomingExams.length > 0) {
    const nextExam = upcomingExams[0];
    const du = daysUntil(nextExam.exam_date, now);
    recommendations.push({
      id: `rec-exam-${nextExam.id}`,
      category: "exam_prep",
      priority: du <= 3 ? "high" : "medium",
      title: `${nextExam.exam_name} in ${du === 0 ? "Today" : `${du} Day${du > 1 ? "s" : ""}`}`,
      description:
        "Review key summaries, mock tests, and high-yield notes to maximize exam readiness.",
      actionUrl: "/exams",
      actionLabel: "Open Exam Prep",
      estimatedMinutes: du <= 2 ? 45 : 30,
    });
  }

  // 3. Quiz Mastery & Weak Topic Drill
  if (quizAttempts.length > 0) {
    const recentAttempts = quizAttempts.slice(-5);
    const lowScoreAttempts = recentAttempts.filter(
      (a) => a.total > 0 && a.score / a.total < 0.7,
    );
    if (lowScoreAttempts.length > 0) {
      recommendations.push({
        id: "rec-quiz-weak",
        category: "quiz_drill",
        priority: "medium",
        title: "Target Weak Quiz Concepts",
        description:
          "Your recent quiz scores show room for growth. Run a quick 10-question practice drill.",
        actionUrl: "/library/quizzes",
        actionLabel: "Take Practice Quiz",
        estimatedMinutes: 15,
      });
    }
  }

  // 4. Pending High Priority Tasks
  const pendingTasks = tasks.filter((t) => !t.is_done);
  if (pendingTasks.length > 0) {
    recommendations.push({
      id: "rec-task-sprint",
      category: "focus_sprint",
      priority: pendingTasks.length >= 5 ? "medium" : "low",
      title: `${pendingTasks.length} Pending Task${pendingTasks.length > 1 ? "s" : ""}`,
      description: `Knock out "${pendingTasks[0].text}" in a focused Pomodoro block.`,
      actionUrl: "/tasks",
      actionLabel: "Start Focus Sprint",
      estimatedMinutes: 25,
    });
  }

  // 5. Recovery Break (if heavy study volume recently)
  const health = computeAdaptiveHealth({
    sessions,
    flashcards,
    quizAttempts,
    tasks,
    exams,
    now,
  });
  if (health.burnoutRisk === "high") {
    recommendations.unshift({
      id: "rec-burnout-recovery",
      category: "recovery_break",
      priority: "high",
      title: "Pacing Warning: Schedule a Recharge",
      description:
        "High cognitive load detected over recent sessions. Take a 15-minute restorative break.",
      actionUrl: "/timer",
      actionLabel: "Take Short Break",
      estimatedMinutes: 15,
    });
  }

  // 6. Understudied Subject Rebalance
  if (folders.length > 1 && sessions.length > 0) {
    const balance = calculateSubjectBalance(sessions, folders, 14, now);
    const understudied = balance.find(
      (b) => b.status === "understudied" && b.folderId !== "unassigned",
    );
    if (understudied) {
      recommendations.push({
        id: `rec-subject-${understudied.folderId}`,
        category: "focus_sprint",
        priority: "low",
        title: `Rebalance: Study ${understudied.folderName}`,
        description: `${understudied.folderName} accounts for only ${understudied.percentage}% of your recent study time.`,
        actionUrl: `/folders/${understudied.folderId}`,
        actionLabel: `Open ${understudied.folderName}`,
        estimatedMinutes: 30,
      });
    }
  }

  return recommendations;
}

export interface SubjectMastery {
  folderId: string;
  folderName: string;
  masteryScore: number; // 0-100
  retentionRate: number; // 0-100
  cardsCount: number;
  atRiskCount: number;
  averageQuizScore: number; // 0-100
  weakTopics: string[];
  tier: "Novice" | "Developing" | "Competent" | "Mastered";
}

/**
 * Formula: R(t) = exp(-t / S)
 * where S = max(1, interval * (ease / 2.5) * stabilityFactor)
 * t is elapsed days since last review (or creation if never reviewed).
 * Returns estimated retention probability from 0.0 to 1.0.
 */
export function computeRetentionProbability(
  card: Flashcard,
  now = new Date(),
  stabilityFactor = 1.0,
): number {
  const interval = Math.max(0, card.srs_interval ?? 0);
  const ease =
    card.ease_factor && card.ease_factor > 0 ? card.ease_factor : 2.5;
  const stability = Math.max(1, interval * (ease / 2.5) * stabilityFactor);

  let t = 0;
  const nowMs = now.getTime();

  if (card.next_review_date) {
    const nextReviewMs = new Date(card.next_review_date).getTime();
    if (interval > 0) {
      // Last review occurred approximately `interval` days before scheduled next_review_date
      const lastReviewMs = nextReviewMs - interval * 24 * 60 * 60 * 1000;
      t = Math.max(0, (nowMs - lastReviewMs) / (24 * 60 * 60 * 1000));
    } else {
      // Interval is 0 (due immediately / lapsed). Elapsed days past next_review_date
      t = Math.max(0, (nowMs - nextReviewMs) / (24 * 60 * 60 * 1000));
    }
  } else if (card.created_at) {
    // Unreviewed card: elapsed days since creation
    const createdMs = new Date(card.created_at).getTime();
    t = Math.max(0, (nowMs - createdMs) / (24 * 60 * 60 * 1000));
  } else {
    t = 1.0;
  }

  const retention = Math.exp(-t / stability);
  return Math.min(1, Math.max(0, Number.isFinite(retention) ? retention : 0));
}

/**
 * Returns cards whose retention probability is below the threshold (default 0.75),
 * sorted ascending by retention probability (highest forgetting risk first).
 */
export function getCardsAtForgettingRisk(
  cards: Flashcard[],
  threshold = 0.75,
  now = new Date(),
): Flashcard[] {
  return (cards || [])
    .filter((card) => computeRetentionProbability(card, now) < threshold)
    .sort(
      (a, b) =>
        computeRetentionProbability(a, now) -
        computeRetentionProbability(b, now),
    );
}

/**
 * Computes overall average retention rate percentage (0-100) across a collection of cards.
 * Returns 100 if no cards exist.
 */
export function computeOverallRetention(
  cards: Flashcard[],
  now = new Date(),
): number {
  if (!cards || cards.length === 0) return 100;
  const sum = cards.reduce(
    (acc, card) => acc + computeRetentionProbability(card, now),
    0,
  );
  return Math.round((sum / cards.length) * 100);
}

/**
 * Computes subject mastery metrics, retention rate, and proficiency tier for a folder.
 */
export function computeSubjectMastery(
  folderId: string,
  folderName: string,
  cards: Flashcard[],
  quizAttempts: QuizAttempt[],
  now = new Date(),
): SubjectMastery {
  const cardsCount = cards.length;
  const atRiskCount = cards.filter(
    (c) => computeRetentionProbability(c, now) < 0.75,
  ).length;

  const retentionRate =
    cardsCount > 0
      ? Math.round(
          (cards.reduce(
            (acc, c) => acc + computeRetentionProbability(c, now),
            0,
          ) /
            cardsCount) *
            100,
        )
      : 0;

  let averageQuizScore = 0;
  if (quizAttempts.length > 0) {
    const validAttempts = quizAttempts.filter((a) => a.total > 0);
    if (validAttempts.length > 0) {
      const totalScorePercent = validAttempts.reduce(
        (acc, a) => acc + (a.score / a.total) * 100,
        0,
      );
      averageQuizScore = Math.round(totalScorePercent / validAttempts.length);
    }
  }

  // Aggregate weak topics from quiz attempts
  const topicCounts: Record<string, number> = {};
  quizAttempts.forEach((attempt) => {
    (attempt.weak_topics || []).forEach((topic) => {
      topicCounts[topic] = (topicCounts[topic] || 0) + 1;
    });
  });

  const weakTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => topic);

  let masteryScore = 0;
  if (cardsCount > 0 && quizAttempts.length > 0) {
    masteryScore = Math.round(retentionRate * 0.5 + averageQuizScore * 0.5);
  } else if (cardsCount > 0) {
    masteryScore = retentionRate;
  } else if (quizAttempts.length > 0) {
    masteryScore = averageQuizScore;
  } else {
    masteryScore = 0;
  }

  masteryScore = Math.min(100, Math.max(0, masteryScore));

  let tier: SubjectMastery["tier"] = "Novice";
  if (masteryScore >= 85) {
    tier = "Mastered";
  } else if (masteryScore >= 70) {
    tier = "Competent";
  } else if (masteryScore >= 50) {
    tier = "Developing";
  } else {
    tier = "Novice";
  }

  return {
    folderId,
    folderName,
    masteryScore,
    retentionRate,
    cardsCount,
    atRiskCount,
    averageQuizScore,
    weakTopics,
    tier,
  };
}

/**
 * Extracts top weak topics ranked by occurrence count.
 */
export function extractTopWeakTopics(
  quizAttempts: QuizAttempt[],
  limit = 5,
): WeakTopic[] {
  const counts: Record<string, number> = {};
  (quizAttempts || []).forEach((a) => {
    (a.weak_topics || []).forEach((topic) => {
      counts[topic] = (counts[topic] || 0) + 1;
    });
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([topic, count]) => ({ topic, count }));
}

/**
 * Pre-Exam Surge Queue:
 * Sorts cards prioritizing upcoming exams (<14 days) and high decay risk.
 */
export function getPreExamSurgeQueue(
  cards: Flashcard[],
  exams: Exam[],
  folders: Folder[],
  now = new Date(),
  decks?: FlashcardDeck[],
): Flashcard[] {
  // Filter exams in next 14 days
  const upcomingExams = (exams || []).filter((exam) => {
    if (!exam.exam_date) return false;
    const daysLeft = daysUntil(exam.exam_date, now);
    return Number.isFinite(daysLeft) && daysLeft >= 0 && daysLeft <= 14;
  });

  // Map decks to folder ids
  const deckToFolderId: Record<string, string> = {};
  (decks || []).forEach((d) => {
    if (d.folder_id) deckToFolderId[d.id] = d.folder_id;
  });

  // Calculate exam urgency per folder (closer exam = higher boost)
  const folderUrgencyMap: Record<string, number> = {};
  upcomingExams.forEach((exam) => {
    const daysLeft = daysUntil(exam.exam_date, now);
    const urgency = Math.max(0.1, (14 - daysLeft) / 14);

    const examNameClean = exam.exam_name.toLowerCase();

    // Match with folder names
    (folders || []).forEach((f) => {
      const fNameClean = f.name.toLowerCase();
      if (
        examNameClean.includes(fNameClean) ||
        fNameClean.includes(examNameClean)
      ) {
        folderUrgencyMap[f.id] = Math.max(folderUrgencyMap[f.id] || 0, urgency);
      }
    });
  });

  // Calculate priority score for each card
  const scoredCards = (cards || []).flatMap((card) => {
    const retention = computeRetentionProbability(card, now);
    const decayRisk = 1.0 - retention; // 0.0 to 1.0

    const folderId = card.deck_id ? deckToFolderId[card.deck_id] : undefined;
    const folderUrgency = folderId ? folderUrgencyMap[folderId] : undefined;

    // A surge queue represents exam-related work, not every card in the
    // library. Returning unrelated cards made the dashboard announce an
    // active pre-exam surge even when no exam was upcoming.
    if (!folderUrgency) return [];

    const examBoost = folderUrgency * 1.5;

    return [{ card, priority: decayRisk * 1.2 + examBoost }];
  });

  return scoredCards
    .sort((a, b) => b.priority - a.priority)
    .map((item) => item.card);
}
