import type {
  StudySession,
  QuizAttempt,
  Folder,
  Exam,
  Flashcard,
  Material,
} from "../api/types";
import { localDateStr, parseLocalDate, formatDateStr } from "./date";
import { STREAK_MIN_MINUTES, computeStudyStreak } from "./streak";

export interface HeatmapCell {
  date: Date;
  dateStr: string;
  minutes: number;
  level: 0 | 1 | 2 | 3 | 4;
  count: number;
}

export interface MonthLabel {
  month: string;
  index: number;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  totalMinutes: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  monthLabels: MonthLabel[];
}

export type ActivityHeatmapData = HeatmapData;

export interface HourlyStats {
  hour: number;
  totalMinutes: number;
  sessionCount: number;
  avgQuizScore: number | null;
  quizAttemptCount: number;
}

export interface PeakFocusWindow {
  label: string;
  startHour: number;
  endHour: number;
  description: string;
}

export type SubjectStatus = "Balanced" | "Under-invested" | "High Urgency";

export interface SubjectBalanceRow {
  folderId: string;
  name: string;
  color: string;
  minutesStudied: number;
  examName: string | null;
  examDate: string | null;
  daysUntilExam: number | null;
  status: SubjectStatus;
}

export type SubjectUrgencyRow = SubjectBalanceRow;

/**
 * Activity Heatmap Generator
 *
 * Generates an array of daily activity cells for the specified number of days (default 365),
 * aligned to 7-day calendar weeks (Sunday to Saturday), computing total study minutes,
 * active days count, streaks, and month header positions for a 52-week grid.
 */
export function generateActivityHeatmap(
  sessions: StudySession[] = [],
  daysCount = 365,
  now: Date = new Date(),
): HeatmapData {
  const todayStr = localDateStr(now);
  const endDate = parseLocalDate(todayStr);

  // Group study sessions by local date (YYYY-MM-DD)
  const minutesByDate = new Map<string, number>();
  const countByDate = new Map<string, number>();

  for (const s of sessions) {
    if (!s.started_at && !s.created_at) continue;
    const sessionDate = new Date(s.started_at || s.created_at);
    const dateKey = localDateStr(sessionDate);
    const mins = Math.max(0, s.minutes || 0);

    minutesByDate.set(dateKey, (minutesByDate.get(dateKey) || 0) + mins);
    countByDate.set(dateKey, (countByDate.get(dateKey) || 0) + 1);
  }

  // Determine the start date: daysCount - 1 days before endDate
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (daysCount - 1));

  // Determine Sunday of that starting week to align grid nicely
  const startDayOfWeek = startDate.getDay(); // 0 = Sun, 1 = Mon ...
  const gridStartDate = new Date(startDate);
  gridStartDate.setDate(gridStartDate.getDate() - startDayOfWeek);

  // Determine Saturday of the ending week
  const endDayOfWeek = endDate.getDay();
  const gridEndDate = new Date(endDate);
  gridEndDate.setDate(gridEndDate.getDate() + (6 - endDayOfWeek));

  const cells: HeatmapCell[] = [];
  const monthLabels: MonthLabel[] = [];
  const MONTH_NAMES = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  let totalMinutes = 0;
  let activeDays = 0;

  const cur = new Date(gridStartDate);
  let weekIndex = 0;
  let lastMonthLogged = -1;

  while (cur <= gridEndDate) {
    const curDateStr = formatDateStr(
      cur.getFullYear(),
      cur.getMonth(),
      cur.getDate(),
    );
    const isWithinRange = cur >= startDate && cur <= endDate;
    const dayOfWeek = cur.getDay();

    // Determine week index start
    if (dayOfWeek === 0 && cells.length > 0) {
      weekIndex++;
    }

    // Check if we should log a month label for this week column
    if (
      dayOfWeek === 0 &&
      cur.getMonth() !== lastMonthLogged &&
      weekIndex >= 0
    ) {
      monthLabels.push({
        month: MONTH_NAMES[cur.getMonth()],
        index: weekIndex,
      });
      lastMonthLogged = cur.getMonth();
    }

    const mins = minutesByDate.get(curDateStr) || 0;
    const count = countByDate.get(curDateStr) || 0;

    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (mins >= 120) level = 4;
    else if (mins >= 60) level = 3;
    else if (mins >= 30) level = 2;
    else if (mins > 0) level = 1;

    if (isWithinRange && mins > 0) {
      totalMinutes += mins;
      activeDays += 1;
    }

    cells.push({
      date: new Date(cur),
      dateStr: curDateStr,
      minutes: mins,
      level,
      count,
    });

    cur.setDate(cur.getDate() + 1);
  }

  // Calculate streaks. Current streak uses the canonical lib/streak.ts
  // definition — a day qualifies at STREAK_MIN_MINUTES, and today is a grace
  // day. This heatmap used to run its own walk counting any >0-minute day,
  // so the same history read "12 day streak" here and "9 day streak" on the
  // dashboard's StreakCard, which requires ≥5 minutes.
  const currentStreak = computeStudyStreak(sessions, STREAK_MIN_MINUTES, endDate);

  let longestStreak = 0;
  let tempStreak = 0;

  // Longest streak across the generated cell range, at the same qualifying
  // bar as currentStreak — not merely "touched the app" days.
  for (const cell of cells) {
    if (cell.date >= startDate && cell.date <= endDate) {
      if (cell.minutes >= STREAK_MIN_MINUTES) {
        tempStreak++;
        if (tempStreak > longestStreak) {
          longestStreak = tempStreak;
        }
      } else {
        tempStreak = 0;
      }
    }
  }

  return {
    cells,
    totalMinutes,
    activeDays,
    currentStreak,
    longestStreak,
    monthLabels,
  };
}

/**
 * Peak Performance / Chronotype Window
 *
 * Computes 24-hour distribution of focus time and quiz scores.
 */
export function computeHourlyDistribution(
  sessions: StudySession[] = [],
  quizAttempts: QuizAttempt[] = [],
): HourlyStats[] {
  const stats: HourlyStats[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    totalMinutes: 0,
    sessionCount: 0,
    avgQuizScore: null,
    quizAttemptCount: 0,
  }));

  const quizScoresByHour: number[][] = Array.from({ length: 24 }, () => []);

  for (const s of sessions) {
    if (!s.started_at && !s.created_at) continue;
    const d = new Date(s.started_at || s.created_at);
    const hour = d.getHours();
    if (hour >= 0 && hour < 24) {
      stats[hour].totalMinutes += Math.max(0, s.minutes || 0);
      stats[hour].sessionCount += 1;
    }
  }

  for (const q of quizAttempts) {
    if (!q.created_at) continue;
    const d = new Date(q.created_at);
    const hour = d.getHours();
    if (hour >= 0 && hour < 24 && q.total > 0) {
      const percentage = Math.round((q.score / q.total) * 100);
      quizScoresByHour[hour].push(percentage);
    }
  }

  for (let h = 0; h < 24; h++) {
    const scores = quizScoresByHour[h];
    stats[h].quizAttemptCount = scores.length;
    if (scores.length > 0) {
      const sum = scores.reduce((a, b) => a + b, 0);
      stats[h].avgQuizScore = Math.round(sum / scores.length);
    }
  }

  return stats;
}

/**
 * Helper to format 24-hour integer to 12-hour AM/PM string
 */
export function formatHour(hour: number): string {
  const h = hour % 24;
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

/**
 * Detects the user's peak focus window using sliding 3-hour analysis.
 */
export function detectPeakFocusWindow(
  hourlyStats: HourlyStats[],
): PeakFocusWindow {
  let maxScore = -1;
  let bestStartHour = 9; // Default 9 AM

  // Sliding 3-hour window
  for (let h = 0; h < 24; h++) {
    const h1 = hourlyStats[h % 24];
    const h2 = hourlyStats[(h + 1) % 24];
    const h3 = hourlyStats[(h + 2) % 24];

    const windowMinutes = h1.totalMinutes + h2.totalMinutes + h3.totalMinutes;
    const windowSessions = h1.sessionCount + h2.sessionCount + h3.sessionCount;

    // Weight minutes and session density
    const score = windowMinutes + windowSessions * 15;

    if (score > maxScore) {
      maxScore = score;
      bestStartHour = h;
    }
  }

  const endHour = (bestStartHour + 3) % 24;
  const timeLabel = `${formatHour(bestStartHour)} – ${formatHour(endHour)}`;

  if (maxScore <= 0) {
    return {
      label: "Morning Deep Work",
      startHour: 9,
      endHour: 12,
      description:
        "Log study sessions with the focus timer to reveal your optimal chronotype prime time.",
    };
  }

  if (bestStartHour >= 5 && bestStartHour <= 9) {
    return {
      label: `Early Bird Focus (${timeLabel})`,
      startHour: bestStartHour,
      endHour,
      description:
        "Your cognitive endurance peaks in the early morning. Best for mastering complex theory, math, and high-difficulty tasks.",
    };
  }

  if (bestStartHour >= 10 && bestStartHour <= 13) {
    return {
      label: `Mid-Day Peak (${timeLabel})`,
      startHour: bestStartHour,
      endHour,
      description:
        "Your focus surges around mid-day. Ideal for intensive active recall, practice exams, and problem sets.",
    };
  }

  if (bestStartHour >= 14 && bestStartHour <= 17) {
    return {
      label: `Afternoon Flow (${timeLabel})`,
      startHour: bestStartHour,
      endHour,
      description:
        "You sustain optimal momentum in the afternoon. Great for structured review, note synthesis, and flashcard drills.",
    };
  }

  return {
    label: `Night Owl Prime (${timeLabel})`,
    startHour: bestStartHour,
    endHour,
    description:
      "You excel during quiet late-hour sessions with fewer interruptions. Ideal for deep creative synthesis and uninterrupted study blocks.",
  };
}

/**
 * Subject Balance & Exam Urgency Matrix
 *
 * Computes study distribution across subjects and matches them against
 * upcoming exams to calculate balance status ('Balanced' | 'Under-invested' | 'High Urgency').
 */
export function computeSubjectUrgencyMatrix(
  sessions: StudySession[] = [],
  folders: Folder[] = [],
  exams: Exam[] = [],
): SubjectBalanceRow[] {
  // Aggregate study minutes by folderId
  const minutesByFolder = new Map<string, number>();
  for (const s of sessions) {
    if (s.folder_id) {
      minutesByFolder.set(
        s.folder_id,
        (minutesByFolder.get(s.folder_id) || 0) + (s.minutes || 0),
      );
    }
  }

  const now = new Date();
  const todayTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  // Map each folder to its upcoming exam and urgency
  const rows: SubjectBalanceRow[] = folders.map((folder) => {
    const minutesStudied = minutesByFolder.get(folder.id) || 0;

    // Find closest upcoming exam matching folder name or closest date
    let closestExam: Exam | null = null;
    let minDays: number | null = null;

    for (const exam of exams) {
      const examNameLower = (exam.exam_name || "").toLowerCase();
      const folderNameLower = folder.name.toLowerCase();

      // Check name association or keyword match
      const isRelated =
        examNameLower.includes(folderNameLower) ||
        folderNameLower.includes(examNameLower);

      if (isRelated) {
        const examDate = parseLocalDate(exam.exam_date);
        const diffDays = Math.ceil(
          (examDate.getTime() - todayTime) / (1000 * 60 * 60 * 24),
        );

        if (diffDays >= 0) {
          if (minDays === null || diffDays < minDays) {
            minDays = diffDays;
            closestExam = exam;
          }
        }
      }
    }

    // Determine status
    let status: SubjectStatus = "Balanced";

    if (minDays !== null && minDays <= 14) {
      if (minDays <= 7 && minutesStudied < 120) {
        status = "High Urgency";
      } else if (minutesStudied < 60) {
        status = "High Urgency";
      } else {
        status = "Balanced";
      }
    } else if (minutesStudied < 30) {
      status = "Under-invested";
    } else {
      status = "Balanced";
    }

    return {
      folderId: folder.id,
      name: folder.name,
      color: folder.color || "var(--accent)",
      minutesStudied,
      examName: closestExam ? closestExam.exam_name : null,
      examDate: closestExam ? closestExam.exam_date : null,
      daysUntilExam: minDays,
      status,
    };
  });

  // Sort rows: High Urgency first, then Under-invested, then Balanced
  const priorityOrder: Record<SubjectStatus, number> = {
    "High Urgency": 1,
    "Under-invested": 2,
    Balanced: 3,
  };

  return rows.sort((a, b) => {
    const pA = priorityOrder[a.status];
    const pB = priorityOrder[b.status];
    if (pA !== pB) return pA - pB;

    // If both have exams, sort by closest days
    if (a.daysUntilExam !== null && b.daysUntilExam !== null) {
      return a.daysUntilExam - b.daysUntilExam;
    }
    if (a.daysUntilExam !== null) return -1;
    if (b.daysUntilExam !== null) return 1;

    // Otherwise sort by minutes studied ascending
    return a.minutesStudied - b.minutesStudied;
  });
}

/**
 * AI Study Insights Generator
 *
 * Synthesizes cross-metric analysis into actionable, intelligent recommendations.
 */
export function generateStudyInsights(
  sessions: StudySession[] = [],
  quizAttempts: QuizAttempt[] = [],
  heatData: HeatmapData,
  hourly: HourlyStats[],
): string[] {
  const insights: string[] = [];
  const peak = detectPeakFocusWindow(hourly);

  // 1. Streak & Consistency insight
  if (heatData.currentStreak >= 3) {
    insights.push(
      `🔥 Excellent momentum! You are currently on a ${heatData.currentStreak}-day study streak. Daily micro-sessions build stronger neural pathways than cramming blocks.`,
    );
  } else if (heatData.activeDays > 0) {
    insights.push(
      `🔥 Consistency checkpoint: You have studied ${heatData.activeDays} days this year. Logging a 25-minute session today will build your active streak.`,
    );
  } else {
    insights.push(
      `🔥 Kickstart your study streak: Daily consistent sessions of 20–30 minutes compound rapidly into high academic retention.`,
    );
  }

  // 2. Chronotype & Peak window
  insights.push(`⚡ Prime Focus Window: ${peak.label}. ${peak.description}`);

  // 3. Focus Volume & Pacing
  const hours = Math.floor(heatData.totalMinutes / 60);
  const mins = heatData.totalMinutes % 60;
  if (heatData.totalMinutes > 0) {
    const avgMinsPerActiveDay = Math.round(
      heatData.totalMinutes / Math.max(1, heatData.activeDays),
    );
    insights.push(
      `⏱️ Study Volume: You have logged ${hours}h ${mins}m across ${sessions.length} total sessions, averaging ~${avgMinsPerActiveDay} mins per active day.`,
    );
  } else {
    insights.push(
      `⏱️ Study Volume: No timer sessions recorded yet. Use the Pomodoro or Stopwatch timer to track deep work automatically.`,
    );
  }

  // 4. Quiz mastery & Active Recall
  if (quizAttempts.length > 0) {
    const totalScore = quizAttempts.reduce(
      (acc, q) => acc + (q.total > 0 ? (q.score / q.total) * 100 : 0),
      0,
    );
    const avgScore = Math.round(totalScore / quizAttempts.length);

    if (avgScore >= 80) {
      insights.push(
        `🎯 Active Recall Mastery: Your average quiz score is ${avgScore}%. High mastery observed — challenge yourself with timed mock exams and spaced flashcard reviews.`,
      );
    } else {
      insights.push(
        `🎯 Knowledge Retention: Your average quiz accuracy is ${avgScore}%. Focus on reviewing flagged weak topics and re-testing every 48 hours.`,
      );
    }
  } else {
    insights.push(
      `🎯 Active Recall: Generating AI practice quizzes from your study notes boosts conceptual recall by up to 50% over passive reading.`,
    );
  }

  // 5. Spacing & Subject Interleaving
  insights.push(
    `💡 Spaced Practice: Interleaving multiple subjects during weekly study blocks prevents cognitive fatigue and improves exam transferability.`,
  );

  return insights;
}

export type ExamReadinessTier =
  | "Exam Ready"
  | "On Track"
  | "Needs Review"
  | "Critical Gap";

export interface UnifiedExamReadiness {
  score: number; // 0-100
  tier: ExamReadinessTier;
  syllabusCoverage: number; // 0-100
  flashcardStability: number; // 0-100
  quizMastery: number; // 0-100
  summary: string;
}

/**
 * Computes a unified Exam Readiness Score (0-100%) factoring in:
 * 1. Syllabus & Material Coverage (30% weight)
 * 2. Flashcard Stability & Spaced Retention (35% weight)
 * 3. Quiz Mastery & Active Recall (35% weight)
 */
export function computeUnifiedExamReadiness(params: {
  materials?: Material[];
  flashcards?: Flashcard[];
  quizAttempts?: QuizAttempt[];
  exams?: Exam[];
  folders?: Folder[];
  now?: Date;
}): UnifiedExamReadiness {
  const {
    materials = [],
    flashcards = [],
    quizAttempts = [],
    exams = [],
    folders = [],
    now = new Date(),
  } = params;

  // 1. Syllabus Coverage (0-100)
  let syllabusCoverage = 0;
  if (materials.length > 0) {
    const baseScore = Math.min(80, materials.length * 35);
    const richContentCount = materials.filter(
      (m) => m.raw_content && m.raw_content.trim().length > 30,
    ).length;
    const richBonus = Math.min(20, richContentCount * 10);
    syllabusCoverage = Math.min(100, baseScore + richBonus);
  } else if (flashcards.length > 0) {
    syllabusCoverage = Math.min(60, flashcards.length * 6);
  } else if (exams.length === 0 && folders.length === 0) {
    syllabusCoverage = 100;
  }

  // 2. Flashcard Stability & Spaced Retention (0-100)
  let flashcardStability = 100;
  if (flashcards.length > 0) {
    const todayStr = localDateStr(now);
    let overdueCount = 0;
    let criticalCount = 0;
    let matureCount = 0;

    for (const card of flashcards) {
      if (card.srs_interval >= 3) {
        matureCount++;
      }

      if (card.next_review_date) {
        const reviewDateStr = card.next_review_date.slice(0, 10);
        if (reviewDateStr < todayStr) {
          overdueCount++;
          if ((card.ease_factor && card.ease_factor < 2.0) || card.srs_interval <= 1) {
            criticalCount++;
          }
        }
      }
    }

    const total = flashcards.length;
    const overduePenalty = (overdueCount / total) * 60;
    const criticalPenalty = (criticalCount / total) * 40;
    const retentionRate = Math.max(10, Math.round(100 - overduePenalty - criticalPenalty));
    const maturityRate = Math.round((matureCount / total) * 100);

    flashcardStability = Math.round(retentionRate * 0.6 + maturityRate * 0.4);
  }

  // 3. Quiz Mastery (0-100)
  let quizMastery = 80;
  if (quizAttempts.length > 0) {
    const valid = quizAttempts.filter((a) => a.total > 0);
    if (valid.length > 0) {
      const avg =
        valid.reduce((acc, a) => acc + (a.score / a.total) * 100, 0) /
        valid.length;
      quizMastery = Math.round(avg);
    }
  }

  // Unified score: 30% syllabus coverage, 35% flashcard stability, 35% quiz mastery
  const rawScore =
    syllabusCoverage * 0.3 + flashcardStability * 0.35 + quizMastery * 0.35;
  const score = Math.min(100, Math.max(0, Math.round(rawScore)));

  let tier: ExamReadinessTier = "Critical Gap";
  let summary =
    "Exam prep is falling behind. Focus on fundamental notes and flashcard drills.";

  if (score >= 85) {
    tier = "Exam Ready";
    summary =
      "Excellent preparation! High retention, solid quiz accuracy, and comprehensive coverage.";
  } else if (score >= 70) {
    tier = "On Track";
    summary =
      "Solid study progress. Reinforce weak quiz topics to lock in high exam confidence.";
  } else if (score >= 50) {
    tier = "Needs Review";
    summary =
      "Decay risks detected in flashcards and moderate quiz mastery. Run focused practice sprints.";
  }

  return {
    score,
    tier,
    syllabusCoverage,
    flashcardStability,
    quizMastery,
    summary,
  };
}

