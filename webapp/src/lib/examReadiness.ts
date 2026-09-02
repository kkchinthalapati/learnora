import type {
  Exam,
  Folder,
  Flashcard,
  Material,
  Quiz,
  QuizAttempt,
  StudySession,
  Task,
} from "../api/types";
import { daysUntil } from "../views/dashboard/analytics";
import { formatDateStr } from "./date";

/* =========================================================================
 * 1. Exam Readiness & Milestone Roadmap Architecture (Prompt Specification)
 * ========================================================================= */

export type ReadinessTier = "Needs work" | "Getting there" | "Exam ready";

export interface ExamReadinessBreakdown {
  coverage: number; // 0-100 (30% weight)
  mastery: number; // 0-100 (40% weight)
  studyTime: number; // 0-100 (30% weight)
}

export interface ExamReadiness {
  score: number; // 0-100
  tier: ReadinessTier;
  breakdown: ExamReadinessBreakdown;
  weakTopics: string[];
  daysRemaining: number;
  targetHoursRemaining: number;
  totalStudyMinutes: number;
  targetStudyMinutes: number;
}

export interface PrepMilestoneTask {
  id: string;
  title: string;
  description: string;
  dueDate: string; // YYYY-MM-DD
  daysBeforeExam: number;
  phase: number;
  completed: boolean;
  category: "materials" | "flashcards" | "quizzes" | "review" | "general";
}

export interface PrepMilestonePhase {
  phaseNumber: number; // 1, 2, 3, 4
  title: string;
  subtitle: string;
  daysRange: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: "completed" | "current" | "upcoming";
  tasks: PrepMilestoneTask[];
}

/**
 * Calculates days between now and target date (local midnight-safe).
 */
export function getDaysRemaining(
  targetDateStr: string,
  now: Date = new Date(),
): number {
  const current = new Date(now);
  current.setHours(0, 0, 0, 0);

  const parts = targetDateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return 0;
  }
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  target.setHours(0, 0, 0, 0);

  const msDiff = target.getTime() - current.getTime();
  return Math.max(0, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
}

/**
 * Adds integer days to a base date, returning a YYYY-MM-DD string.
 */
function addDaysDateStr(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return formatDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calculates target study minutes according to exam difficulty.
 */
export function getTargetStudyMinutes(
  difficulty: string | null | undefined,
): number {
  const diff = (difficulty || "Medium").toLowerCase();
  switch (diff) {
    case "easy":
      return 10 * 60; // 10 hours
    case "hard":
      return 35 * 60; // 35 hours
    case "medium":
    default:
      return 20 * 60; // 20 hours
  }
}

/**
 * Computes the multi-factor Exam Readiness Index (0-100).
 * Factors:
 *  - Material Coverage (30%)
 *  - Quiz scores and card maturity (40%)
 *  - Study Time Investment (30%)
 */
export function computeExamReadiness(
  exam: Exam,
  folder?: Folder | null,
  materials?: Material[],
  flashcards?: Flashcard[],
  quizAttempts?: QuizAttempt[],
  sessions?: StudySession[],
  now: Date = new Date(),
): ExamReadiness {
  const daysRemaining = getDaysRemaining(exam.exam_date, now);

  // 1. Material Coverage (30% weight)
  const relevantMaterials = folder
    ? (materials || []).filter((m) => m.folder_id === folder.id)
    : materials || [];

  let coverage = 0;
  if (relevantMaterials.length > 0) {
    const baseQuantity = Math.min(70, relevantMaterials.length * 25);
    const hasRichContent = relevantMaterials.some(
      (m) => m.raw_content && m.raw_content.length > 40,
    );
    const hasFlashcards = (flashcards || []).length > 0;
    const contentBonus = (hasRichContent ? 15 : 0) + (hasFlashcards ? 15 : 0);
    coverage = Math.min(100, baseQuantity + contentBonus);
  } else if ((flashcards || []).length > 0) {
    coverage = Math.min(60, (flashcards || []).length * 6);
  }

  // 2. Quiz scores and card maturity (40% weight)
  let avgQuizScore: number | null = null;
  const attempts = quizAttempts || [];
  const validAttempts = attempts.filter((a) => a.total > 0);
  if (validAttempts.length > 0) {
    const totalPercentage = validAttempts.reduce(
      (acc, a) => acc + (a.score / a.total) * 100,
      0,
    );
    avgQuizScore = totalPercentage / validAttempts.length;
  }

  let cardMaturityRate: number | null = null;
  const cards = flashcards || [];
  if (cards.length > 0) {
    // Ease is a difficulty multiplier and defaults to 2.5 on brand-new
    // cards, so it cannot establish that a card has actually been learned.
    const matureCards = cards.filter((c) => c.srs_interval >= 3);
    cardMaturityRate = (matureCards.length / cards.length) * 100;
  }

  let mastery = 0;
  if (avgQuizScore !== null && cardMaturityRate !== null) {
    mastery = Math.round(avgQuizScore * 0.55 + cardMaturityRate * 0.45);
  } else if (avgQuizScore !== null) {
    mastery = Math.round(avgQuizScore);
  } else if (cardMaturityRate !== null) {
    mastery = Math.round(cardMaturityRate);
  } else {
    mastery = 0;
  }
  mastery = Math.min(100, Math.max(0, mastery));

  // 3. Study Time Investment (30% weight)
  const targetStudyMinutes = getTargetStudyMinutes(exam.difficulty);
  const relevantSessions = folder
    ? (sessions || []).filter((s) => s.folder_id === folder.id)
    : sessions || [];
  const totalStudyMinutes = relevantSessions.reduce(
    (acc, s) => acc + (s.minutes || 0),
    0,
  );
  const studyTime = Math.min(
    100,
    Math.round((totalStudyMinutes / targetStudyMinutes) * 100),
  );
  const targetHoursRemaining = Math.max(
    0,
    Number(((targetStudyMinutes - totalStudyMinutes) / 60).toFixed(1)),
  );

  // Aggregate weighted score
  const score = Math.min(
    100,
    Math.max(0, Math.round(coverage * 0.3 + mastery * 0.4 + studyTime * 0.3)),
  );

  // Tier classification: 80+ is Exam ready, 45-79 is Getting there, < 45 is Needs work
  let tier: ReadinessTier = "Needs work";
  if (score >= 80) {
    tier = "Exam ready";
  } else if (score >= 45) {
    tier = "Getting there";
  }

  // Extract weak topics
  const topicCounts: Record<string, number> = {};
  attempts.forEach((a) => {
    (a.weak_topics || []).forEach((topic) => {
      if (topic && typeof topic === "string") {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    });
  });

  if (Object.keys(topicCounts).length === 0 && cards.length > 0) {
    cards
      .filter((c) => c.ease_factor < 2.1)
      .slice(0, 4)
      .forEach((c) => {
        const snippet = c.front.trim().slice(0, 35);
        if (snippet) topicCounts[snippet] = 1;
      });
  }

  const weakTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  return {
    score,
    tier,
    breakdown: {
      coverage,
      mastery,
      studyTime,
    },
    weakTopics,
    daysRemaining,
    targetHoursRemaining,
    totalStudyMinutes,
    targetStudyMinutes,
  };
}

/**
 * Generates a 4-phase prep countdown roadmap tailored to the exam timeline and readiness.
 */
export function generatePrepRoadmap(
  exam: Exam,
  readiness: ExamReadiness,
  now: Date = new Date(),
): PrepMilestonePhase[] {
  const days = Math.max(0, readiness.daysRemaining);
  const examName = exam.exam_name || "Exam";
  const weak = readiness.weakTopics;
  const isReady = readiness.score >= 75;

  let p1EndOffset = 0;
  let p2StartOffset = 0;
  let p2EndOffset = 0;
  let p3StartOffset = 0;
  let p3EndOffset = 0;
  let p4StartOffset = 0;
  let p4EndOffset = days;

  if (days >= 14) {
    p1EndOffset = Math.max(1, days - 10);
    p2StartOffset = p1EndOffset;
    p2EndOffset = Math.max(p2StartOffset + 1, days - 5);
    p3StartOffset = p2EndOffset;
    p3EndOffset = Math.max(p3StartOffset + 1, days - 2);
    p4StartOffset = p3EndOffset;
    p4EndOffset = days;
  } else if (days >= 4) {
    p1EndOffset = Math.max(1, Math.floor(days * 0.35));
    p2StartOffset = p1EndOffset;
    p2EndOffset = Math.max(p2StartOffset + 1, Math.floor(days * 0.65));
    p3StartOffset = p2EndOffset;
    p3EndOffset = Math.max(p3StartOffset + 1, days - 1);
    p4StartOffset = p3EndOffset;
    p4EndOffset = days;
  } else {
    p1EndOffset = 0;
    p2StartOffset = 0;
    p2EndOffset = Math.min(1, days);
    p3StartOffset = p2EndOffset;
    p3EndOffset = Math.max(p3StartOffset, days - 1);
    p4StartOffset = p3EndOffset;
    p4EndOffset = days;
  }

  const p1StartDate = addDaysDateStr(now, 0);
  const p1EndDate = addDaysDateStr(now, p1EndOffset);

  const p2StartDate = addDaysDateStr(now, p2StartOffset);
  const p2EndDate = addDaysDateStr(now, p2EndOffset);

  const p3StartDate = addDaysDateStr(now, p3StartOffset);
  const p3EndDate = addDaysDateStr(now, p3EndOffset);

  const p4StartDate = addDaysDateStr(now, p4StartOffset);
  const p4EndDate = addDaysDateStr(now, p4EndOffset);

  const getPhaseStatus = (
    phaseIdx: number,
  ): "completed" | "current" | "upcoming" => {
    if (readiness.score === 100) return "completed";
    if (days === 0) return phaseIdx === 4 ? "current" : "completed";
    if (phaseIdx === 1)
      return readiness.breakdown.coverage >= 80 ? "completed" : "current";
    if (phaseIdx === 2) {
      if (readiness.breakdown.coverage < 80) return "upcoming";
      return readiness.breakdown.mastery >= 70 ? "completed" : "current";
    }
    if (phaseIdx === 3) {
      if (
        readiness.breakdown.coverage < 80 ||
        readiness.breakdown.mastery < 70
      ) {
        return "upcoming";
      }
      return readiness.score >= 85 ? "completed" : "current";
    }
    return readiness.breakdown.coverage >= 80 &&
      readiness.breakdown.mastery >= 70 &&
      readiness.score >= 85
      ? "current"
      : "upcoming";
  };

  const p1Tasks: PrepMilestoneTask[] = [
    {
      id: `${exam.id}-p1-1`,
      title: `Get your ${examName} notes in order`,
      description:
        "Upload your class notes, slides and any summaries you have.",
      dueDate: addDaysDateStr(now, Math.floor(p1EndOffset * 0.5)),
      daysBeforeExam: Math.max(0, days - Math.floor(p1EndOffset * 0.5)),
      phase: 1,
      completed: readiness.breakdown.coverage >= 60,
      category: "materials",
    },
    {
      id: `${exam.id}-p1-2`,
      title: `Make flashcard decks for the basics`,
      description:
        "Turn your notes and formulas into decks you can test yourself on.",
      dueDate: p1EndDate,
      daysBeforeExam: Math.max(0, days - p1EndOffset),
      phase: 1,
      completed: readiness.breakdown.coverage >= 90,
      category: "flashcards",
    },
  ];

  const p2Tasks: PrepMilestoneTask[] = [
    {
      id: `${exam.id}-p2-1`,
      title: `Do your ${examName} cards every day`,
      description:
        "Go through the cards that are due — a little every day is what makes it stick.",
      dueDate: addDaysDateStr(
        now,
        Math.floor((p2StartOffset + p2EndOffset) / 2),
      ),
      daysBeforeExam: Math.max(
        0,
        days - Math.floor((p2StartOffset + p2EndOffset) / 2),
      ),
      phase: 2,
      completed: readiness.breakdown.mastery >= 50,
      category: "flashcards",
    },
    {
      id: `${exam.id}-p2-2`,
      title: `Do short quizzes to find your weak spots`,
      description: "Ten quick questions on each of the main chapters.",
      dueDate: p2EndDate,
      daysBeforeExam: Math.max(0, days - p2EndOffset),
      phase: 2,
      completed: readiness.breakdown.mastery >= 75,
      category: "quizzes",
    },
  ];

  const p3WeakTaskDescription =
    weak.length > 0
      ? `Focus on the topics you keep dropping marks on: ${weak.slice(0, 3).join(", ")}.`
      : `Work through the harder questions and get the ${examName} formulas down.`;

  const p3Tasks: PrepMilestoneTask[] = [
    {
      id: `${exam.id}-p3-1`,
      title: `Work on your weak topics`,
      description: p3WeakTaskDescription,
      dueDate: addDaysDateStr(
        now,
        Math.floor((p3StartOffset + p3EndOffset) / 2),
      ),
      daysBeforeExam: Math.max(
        0,
        days - Math.floor((p3StartOffset + p3EndOffset) / 2),
      ),
      phase: 3,
      completed: weak.length === 0 && readiness.breakdown.mastery >= 80,
      category: "quizzes",
    },
    {
      id: `${exam.id}-p3-2`,
      title: `Do a full timed mock`,
      description:
        "Sit a full paper under proper exam conditions — timed, no notes.",
      dueDate: p3EndDate,
      daysBeforeExam: Math.max(0, days - p3EndOffset),
      phase: 3,
      completed: isReady,
      category: "quizzes",
    },
  ];

  const p4Tasks: PrepMilestoneTask[] = [
    {
      id: `${exam.id}-p4-1`,
      title: `Skim your formulas and summary sheet`,
      description:
        "A quick run through the key definitions, formulas and memory tricks.",
      dueDate: addDaysDateStr(now, Math.max(0, days - 1)),
      daysBeforeExam: 1,
      phase: 4,
      completed: false,
      category: "review",
    },
    {
      id: `${exam.id}-p4-2`,
      title: `Get your things ready and get some sleep`,
      description: "Pack your pens and ID, sleep properly, and don't cram.",
      dueDate: addDaysDateStr(now, days),
      daysBeforeExam: 0,
      phase: 4,
      completed: false,
      category: "general",
    },
  ];

  const phase1RangeStr =
    days >= 14 ? `T-${days} to T-10` : `Day 1 to ${p1EndOffset + 1}`;
  const phase2RangeStr =
    days >= 14
      ? `T-9 to T-5`
      : `Day ${p2StartOffset + 1} to ${p2EndOffset + 1}`;
  const phase3RangeStr =
    days >= 14
      ? `T-4 to T-2`
      : `Day ${p3StartOffset + 1} to ${p3EndOffset + 1}`;
  const phase4RangeStr = days >= 1 ? `T-1 to Exam Day` : `Exam Day`;

  return [
    {
      phaseNumber: 1,
      title: "Phase 1: Get your material together",
      subtitle: "Sort out your notes and build your first decks.",
      daysRange: phase1RangeStr,
      startDate: p1StartDate,
      endDate: p1EndDate,
      status: getPhaseStatus(1),
      tasks: p1Tasks,
    },
    {
      phaseNumber: 2,
      title: "Phase 2: Test yourself, little and often",
      subtitle: "Do your cards daily and quiz yourself by topic.",
      daysRange: phase2RangeStr,
      startDate: p2StartDate,
      endDate: p2EndDate,
      status: getPhaseStatus(2),
      tasks: p2Tasks,
    },
    {
      phaseNumber: 3,
      title: "Phase 3: Mocks and weak spots",
      subtitle: "Find what you're shaky on, fix it, and sit a full mock.",
      daysRange: phase3RangeStr,
      startDate: p3StartDate,
      endDate: p3EndDate,
      status: getPhaseStatus(3),
      tasks: p3Tasks,
    },
    {
      phaseNumber: 4,
      title: "Phase 4: Last look, then rest",
      subtitle: "Skim your summary sheet, get your things ready, and sleep.",
      daysRange: phase4RangeStr,
      startDate: p4StartDate,
      endDate: p4EndDate,
      status: getPhaseStatus(4),
      tasks: p4Tasks,
    },
  ];
}

/* =========================================================================
 * 2. Backward-Compatible Analytics Helpers
 * ========================================================================= */

export type ReadinessLevel = "ready" | "on_track" | "behind" | "critical";

export interface ExamReadinessScore {
  overallReadiness: number;
  level: ReadinessLevel;
  confidence: "high" | "medium" | "low";
  daysRemaining: number;
  hoursStudied: number;
  targetHours: number;
  recommendedDailyHours: number;
  passProbability: number;
  distinctionProbability: number;
  quizMasteryScore: number | null;
  flashcardMasteryScore: number | null;
  summary: string;
}

export interface ExamStudyMilestone {
  id: string;
  title: string;
  targetDate: string;
  targetHours: number;
  completed: boolean;
  description: string;
}

export interface CramRisk {
  isCramming: boolean;
  cramRiskScore: number;
  message: string;
  severity: "low" | "medium" | "high";
}

export interface RevisionPlanDay {
  dayOffset: number;
  date: string;
  topic: string;
  focusMode: "review" | "deep_dive" | "practice_test" | "light_recall";
  targetMinutes: number;
}

export function calculateExamReadiness(
  exam: Exam,
  params: {
    sessions?: StudySession[];
    quizzes?: Quiz[];
    quizAttempts?: QuizAttempt[];
    flashcards?: Flashcard[];
    tasks?: Task[];
    folderId?: string | null;
    targetHours?: number;
    now?: Date;
  } = {},
): ExamReadinessScore {
  const {
    sessions = [],
    quizAttempts = [],
    flashcards = [],
    targetHours: customTargetHours,
    folderId = null,
    now = new Date(),
  } = params;

  const daysRemaining = daysUntil(exam.exam_date, now);

  let defaultTargetHours = 20;
  const difficulty = (exam.difficulty || "medium").toLowerCase();
  if (difficulty === "hard" || difficulty === "difficult") {
    defaultTargetHours = 35;
  } else if (difficulty === "easy") {
    defaultTargetHours = 12;
  }
  const targetHours = customTargetHours ?? defaultTargetHours;

  const relevantSessions = sessions.filter((s) => {
    if (folderId && s.folder_id === folderId) return true;
    if (s.task && s.task.toLowerCase().includes(exam.exam_name.toLowerCase())) {
      return true;
    }
    return false;
  });

  const candidateSessions =
    relevantSessions.length > 0 ? relevantSessions : sessions;

  const totalMinutesStudied = candidateSessions.reduce(
    (sum, s) => sum + (s.minutes || 0),
    0,
  );
  const hoursStudied = Number((totalMinutesStudied / 60).toFixed(1));

  const hoursRatio = Math.min(hoursStudied / Math.max(targetHours, 1), 1.2);
  const studyVolumeScore = Math.min(100, Math.round(hoursRatio * 100));

  let quizMasteryScore: number | null = null;
  if (quizAttempts.length > 0) {
    const validAttempts = quizAttempts.filter((a) => a.total > 0);
    if (validAttempts.length > 0) {
      const avg =
        validAttempts.reduce((sum, a) => sum + (a.score / a.total) * 100, 0) /
        validAttempts.length;
      quizMasteryScore = Math.round(avg);
    }
  }

  let flashcardMasteryScore: number | null = null;
  if (flashcards.length > 0) {
    const matureCount = flashcards.filter((f) => f.srs_interval > 14).length;
    flashcardMasteryScore = Math.round((matureCount / flashcards.length) * 100);
  }

  let weightedReadiness = studyVolumeScore * 0.5;
  let weightSum = 0.5;

  if (quizMasteryScore !== null) {
    weightedReadiness += quizMasteryScore * 0.3;
    weightSum += 0.3;
  }

  if (flashcardMasteryScore !== null) {
    weightedReadiness += flashcardMasteryScore * 0.2;
    weightSum += 0.2;
  }

  const normalizedReadiness = Math.min(
    100,
    Math.max(0, Math.round(weightedReadiness / weightSum)),
  );

  let level: ReadinessLevel = "ready";
  if (daysRemaining < 0) {
    level = exam.status === "Completed" ? "ready" : "behind";
  } else if (normalizedReadiness >= 80) {
    level = "ready";
  } else if (normalizedReadiness >= 55) {
    level = "on_track";
  } else if (daysRemaining <= 3 && normalizedReadiness < 50) {
    level = "critical";
  } else {
    level = "behind";
  }

  const safeDays = Math.max(1, daysRemaining);
  const remainingHours = Math.max(0, targetHours - hoursStudied);
  const recommendedDailyHours = Number((remainingHours / safeDays).toFixed(1));

  const passProbability = Math.min(
    99,
    Math.max(20, Math.round(normalizedReadiness * 0.8 + 20)),
  );
  const distinctionProbability = Math.min(
    95,
    Math.max(5, Math.round(normalizedReadiness * 0.9 - 10)),
  );

  let confidence: "high" | "medium" | "low" = "low";
  if (candidateSessions.length >= 8 && quizMasteryScore !== null) {
    confidence = "high";
  } else if (candidateSessions.length >= 3 || quizMasteryScore !== null) {
    confidence = "medium";
  }

  let summary = `You have completed ${hoursStudied}h of ${targetHours}h targeted study.`;
  if (level === "ready") {
    summary +=
      " Really strong prep. Keep it ticking over with a short review each day.";
  } else if (level === "on_track") {
    summary += ` You're on pace. Aim for ${recommendedDailyHours}h a day until the exam.`;
  } else if (level === "critical") {
    summary +=
      " There's not long left. Stick to mock papers and the topics that come up most.";
  } else {
    summary += ` Push to ${recommendedDailyHours}h a day and you'll catch up.`;
  }

  return {
    overallReadiness: normalizedReadiness,
    level,
    confidence,
    daysRemaining,
    hoursStudied,
    targetHours,
    recommendedDailyHours,
    passProbability,
    distinctionProbability,
    quizMasteryScore,
    flashcardMasteryScore,
    summary,
  };
}

export function generateExamStudyMilestones(
  exam: Exam,
  targetHours = 20,
  startDate?: Date,
  now: Date = new Date(),
): ExamStudyMilestone[] {
  const examDate = new Date(exam.exam_date + "T00:00:00");
  const start = startDate ? new Date(startDate) : new Date(now);
  start.setHours(0, 0, 0, 0);

  const totalTime = examDate.getTime() - start.getTime();
  const totalDays = Math.max(1, Math.round(totalTime / (1000 * 60 * 60 * 24)));

  const formatDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const m1Date = new Date(start.getTime() + totalDays * 0.25 * 86400000);
  const m2Date = new Date(start.getTime() + totalDays * 0.5 * 86400000);
  const m3Date = new Date(start.getTime() + totalDays * 0.75 * 86400000);
  const m4Date = new Date(examDate.getTime() - 86400000);

  return [
    {
      id: "m-1",
      title: "Phase 1: The basics",
      targetDate: formatDate(m1Date),
      targetHours: Math.round(targetHours * 0.25),
      completed: now >= m1Date,
      description: "Read your main notes and write down the key terms.",
    },
    {
      id: "m-2",
      title: "Phase 2: Dig in and test yourself",
      targetDate: formatDate(m2Date),
      targetHours: Math.round(targetHours * 0.5),
      completed: now >= m2Date,
      description:
        "Work through the chapters and turn your notes into flashcards.",
    },
    {
      id: "m-3",
      title: "Phase 3: Timed mocks",
      targetDate: formatDate(m3Date),
      targetHours: Math.round(targetHours * 0.75),
      completed: now >= m3Date,
      description: "Sit at least two full papers under exam conditions.",
    },
    {
      id: "m-4",
      title: "Phase 4: Final polish",
      targetDate: formatDate(m4Date),
      targetHours: targetHours,
      completed: now >= m4Date,
      description:
        "A light run over the formulas, diagrams and summaries you find hardest.",
    },
  ];
}

export function calculateCramRisk(
  exam: Exam,
  sessions: StudySession[],
  now: Date = new Date(),
): CramRisk {
  const daysLeft = daysUntil(exam.exam_date, now);
  if (daysLeft < 0 || daysLeft > 14) {
    return {
      isCramming: false,
      cramRiskScore: 10,
      message: "Your study is nicely spread out.",
      severity: "low",
    };
  }

  const twoDaysAgo = new Date(now);
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const recentSessions = sessions.filter((s) => {
    const d = new Date(s.started_at);
    return !isNaN(d.getTime()) && d >= twoDaysAgo && d <= now;
  });

  const recentMinutes = recentSessions.reduce(
    (sum, s) => sum + (s.minutes || 0),
    0,
  );
  const totalMinutes = sessions.reduce((sum, s) => sum + (s.minutes || 0), 0);

  if (
    daysLeft <= 3 &&
    totalMinutes > 0 &&
    recentMinutes / totalMinutes > 0.6 &&
    recentMinutes > 240
  ) {
    return {
      isCramming: true,
      cramRiskScore: 85,
      message:
        "That's a lot in a short space. Spread it out a bit and get some sleep before the exam.",
      severity: "high",
    };
  }

  if (daysLeft <= 2 && recentMinutes > 300) {
    return {
      isCramming: true,
      cramRiskScore: 70,
      message:
        "You're putting in long stretches. Take short breaks — it actually helps things stick.",
      severity: "medium",
    };
  }

  return {
    isCramming: false,
    cramRiskScore: 25,
    message: "You're pacing this well.",
    severity: "low",
  };
}

export function recommendRevisionSchedule(
  exam: Exam,
  topics: string[] = [],
  remainingDays?: number,
  now: Date = new Date(),
): RevisionPlanDay[] {
  const days = remainingDays ?? Math.max(1, daysUntil(exam.exam_date, now));
  const effectiveDays = Math.min(14, Math.max(1, days));

  const fallbackTopics =
    topics.length > 0
      ? topics
      : ["The basics", "Problem solving", "Mock practice", "Formulas"];

  const plan: RevisionPlanDay[] = [];

  for (let i = 0; i < effectiveDays; i++) {
    const targetDateObj = new Date(now);
    targetDateObj.setDate(targetDateObj.getDate() + i);
    const dateStr = `${targetDateObj.getFullYear()}-${String(targetDateObj.getMonth() + 1).padStart(2, "0")}-${String(targetDateObj.getDate()).padStart(2, "0")}`;

    const topicIndex = i % fallbackTopics.length;
    const topic = fallbackTopics[topicIndex];

    let focusMode: RevisionPlanDay["focusMode"] = "review";
    let targetMinutes = 45;

    if (i === effectiveDays - 1) {
      focusMode = "light_recall";
      targetMinutes = 30;
    } else if (i === effectiveDays - 2) {
      focusMode = "practice_test";
      targetMinutes = 60;
    } else if (i % 2 === 1) {
      focusMode = "deep_dive";
      targetMinutes = 50;
    }

    plan.push({
      dayOffset: i,
      date: dateStr,
      topic,
      focusMode,
      targetMinutes,
    });
  }

  return plan;
}

/** The subject folder an exam most likely belongs to.
 *
 * Exams carry a free-text name and no folder id, so the link has to be
 * inferred from the two strings. Exact match first, then containment either
 * way ("Chemistry Paper 1" ↔ "Chemistry"), which is loose enough to catch how
 * students actually name things and strict enough not to attach a Biology
 * folder to a Physics exam.
 *
 * Extracted from `useExamReadiness`, which had this inline, so the Trajectory
 * engine resolves an exam to a folder exactly the same way rather than
 * disagreeing with the readiness score on the same screen.
 */
export function matchExamFolder<T extends { id: string; name: string }>(
  exam: Exam | null | undefined,
  folders: T[] | null | undefined,
): T | null {
  if (!exam || !folders || folders.length === 0) return null;
  const name = exam.exam_name.toLowerCase().trim();
  return (
    folders.find((f) => {
      const folderName = f.name.toLowerCase().trim();
      return (
        folderName === name ||
        name.includes(folderName) ||
        folderName.includes(name)
      );
    }) ?? null
  );
}
