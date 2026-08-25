import type { Folder, StudySession } from "../api/types";
import type { PlanBlock, PlanDay, WeeklyPlanJson } from "./aiJson";
import { formatHour, type PeakFocusWindow } from "./analyticsEngine";
import { localDateStr } from "./date";
import { DEFAULT_BLOCK_MINUTES, parseStoredPlan } from "./planShape";

export interface MissedBlockInfo {
  subject: string;
  date: string;
  plannedMins: number;
  actualMins: number;
  deficitMins: number;
  originalBlock?: PlanBlock;
}

export interface PlanDeficit {
  isBehind: boolean;
  totalPlannedPastMinutes: number;
  totalActualPastMinutes: number;
  totalMissedMinutes: number;
  missedBlocks: MissedBlockInfo[];
  remainingDaysCount: number;
  deficitBySubject: Record<string, number>;
  recommendation: string;
}

export interface RebalanceOptions {
  folders?: Folder[];
  now?: Date;
  peakFocusWindow?: PeakFocusWindow | null;
  maxDailyMinutes?: number;
  targetBlockDuration?: number;
}

export interface RebalanceResult {
  rebalancedPlan: WeeklyPlanJson;
  redistributedMinutes: number;
  redistributedBlocksCount: number;
  isRebalanced: boolean;
  summary: string;
}

/**
 * Match a plan block's subject to a folder or task.
 */
function findFolderForSubject(subject: string, folders: Folder[] = []): Folder | null {
  const normSubject = subject.trim().toLowerCase();
  return (
    folders.find(
      (f) =>
        f.name.trim().toLowerCase() === normSubject ||
        normSubject.includes(f.name.trim().toLowerCase()) ||
        f.name.trim().toLowerCase().includes(normSubject),
    ) ?? null
  );
}

/**
 * Calculate study minutes logged on a specific date for a specific subject.
 */
function getActualMinutesForSubjectOnDate(
  dateStr: string,
  subject: string,
  sessions: StudySession[],
  folders: Folder[] = [],
): number {
  const folder = findFolderForSubject(subject, folders);
  const normSubject = subject.trim().toLowerCase();

  let totalMins = 0;
  for (const s of sessions) {
    if (!s.started_at && !s.created_at) continue;
    const sessionDate = new Date(s.started_at || s.created_at);
    const sessionDateStr = localDateStr(sessionDate);

    if (sessionDateStr !== dateStr) continue;

    const mins = Math.max(0, s.minutes || 0);

    // If session matches folder
    if (folder && s.folder_id === folder.id) {
      totalMins += mins;
      continue;
    }

    // If session task matches subject text
    if (s.task) {
      const normTask = s.task.trim().toLowerCase();
      if (
        normTask === normSubject ||
        normTask.includes(normSubject) ||
        normSubject.includes(normTask)
      ) {
        totalMins += mins;
        continue;
      }
    }
  }

  return totalMins;
}

/**
 * Calculate total study minutes on a specific date regardless of subject.
 */
function getTotalMinutesOnDate(dateStr: string, sessions: StudySession[]): number {
  let total = 0;
  for (const s of sessions) {
    if (!s.started_at && !s.created_at) continue;
    const sessionDate = new Date(s.started_at || s.created_at);
    if (localDateStr(sessionDate) === dateStr) {
      total += Math.max(0, s.minutes || 0);
    }
  }
  return total;
}

/**
 * Detects unfinished or under-studied planned blocks up to the current date.
 */
export function detectPlanDeficit(
  planJson: unknown,
  sessions: StudySession[] = [],
  folders: Folder[] = [],
  now: Date = new Date(),
): PlanDeficit {
  const parsed = parseStoredPlan(planJson);

  if (!parsed || !parsed.days || parsed.days.length === 0) {
    return {
      isBehind: false,
      totalPlannedPastMinutes: 0,
      totalActualPastMinutes: 0,
      totalMissedMinutes: 0,
      missedBlocks: [],
      remainingDaysCount: 0,
      deficitBySubject: {},
      recommendation: "No active weekly plan found.",
    };
  }

  const todayStr = localDateStr(now);
  const pastDays = parsed.days.filter((d) => d.date < todayStr);
  const remainingDays = parsed.days.filter((d) => d.date >= todayStr);

  const missedBlocks: MissedBlockInfo[] = [];
  const deficitBySubject: Record<string, number> = {};
  let totalPlannedPastMinutes = 0;
  let totalActualPastMinutes = 0;

  for (const day of pastDays) {
    const dayTotalActual = getTotalMinutesOnDate(day.date, sessions);
    totalActualPastMinutes += dayTotalActual;

    const plannedBySubjectOnDay = new Map<string, { mins: number; blocks: PlanBlock[] }>();

    for (const block of day.blocks || []) {
      const mins = block.durationMins ?? DEFAULT_BLOCK_MINUTES;
      totalPlannedPastMinutes += mins;

      const existing = plannedBySubjectOnDay.get(block.subject) || {
        mins: 0,
        blocks: [],
      };
      existing.mins += mins;
      existing.blocks.push(block);
      plannedBySubjectOnDay.set(block.subject, existing);
    }

    for (const [subject, { mins: plannedMins, blocks }] of plannedBySubjectOnDay) {
      const actualMins = getActualMinutesForSubjectOnDate(
        day.date,
        subject,
        sessions,
        folders,
      );

      if (actualMins < plannedMins) {
        const deficitMins = plannedMins - actualMins;
        missedBlocks.push({
          subject,
          date: day.date,
          plannedMins,
          actualMins,
          deficitMins,
          originalBlock: blocks[0],
        });
        deficitBySubject[subject] = (deficitBySubject[subject] || 0) + deficitMins;
      }
    }
  }

  const totalMissedMinutes = Object.values(deficitBySubject).reduce(
    (sum, val) => sum + val,
    0,
  );

  const isBehind = totalMissedMinutes >= 15;
  const remainingDaysCount = remainingDays.length;

  let recommendation = "Your study schedule is currently on track!";
  if (isBehind) {
    const hours = Math.floor(totalMissedMinutes / 60);
    const mins = totalMissedMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    if (remainingDaysCount > 0) {
      const avgExtra = Math.round(totalMissedMinutes / remainingDaysCount);
      recommendation = `You are ${timeStr} behind on planned study time. Auto-rebalance can distribute ~${avgExtra}m across your remaining ${remainingDaysCount} day${remainingDaysCount > 1 ? "s" : ""}.`;
    } else {
      recommendation = `You missed ${timeStr} of study time this week. Generate a new plan for next week to reset your pace.`;
    }
  }

  return {
    isBehind,
    totalPlannedPastMinutes,
    totalActualPastMinutes,
    totalMissedMinutes,
    missedBlocks,
    remainingDaysCount,
    deficitBySubject,
    recommendation,
  };
}

/**
 * Intelligent Redistribution of missed study volume across remaining days in the week.
 */
export function rebalanceWeeklyPlan(
  planJson: unknown,
  sessions: StudySession[] = [],
  options: RebalanceOptions = {},
): RebalanceResult {
  const {
    folders = [],
    now = new Date(),
    peakFocusWindow = null,
    maxDailyMinutes = 240,
    targetBlockDuration = 30,
  } = options;

  const parsed = parseStoredPlan(planJson);
  if (!parsed || !parsed.days || parsed.days.length === 0) {
    return {
      rebalancedPlan: { days: [] },
      redistributedMinutes: 0,
      redistributedBlocksCount: 0,
      isRebalanced: false,
      summary: "Cannot rebalance an empty plan.",
    };
  }

  const deficit = detectPlanDeficit(planJson, sessions, folders, now);

  if (!deficit.isBehind || deficit.totalMissedMinutes === 0 || deficit.remainingDaysCount === 0) {
    return {
      rebalancedPlan: parsed,
      redistributedMinutes: 0,
      redistributedBlocksCount: 0,
      isRebalanced: false,
      summary: "Study plan is already balanced and up to date.",
    };
  }

  const todayStr = localDateStr(now);

  // Clone days structure
  const updatedDays: PlanDay[] = parsed.days.map((day) => ({
    date: day.date,
    blocks: [...(day.blocks || []).map((b) => ({ ...b }))],
  }));

  // Identify remaining day indices
  const remainingDayIndices = updatedDays
    .map((d, index) => ({ date: d.date, index }))
    .filter((d) => d.date >= todayStr)
    .map((d) => d.index);

  let redistributedBlocksCount = 0;

  // Chronotype peak focus hint
  const peakHint = peakFocusWindow
    ? `${formatHour(peakFocusWindow.startHour)} – ${formatHour(peakFocusWindow.endHour)} (Peak Focus)`
    : undefined;

  // Iterate through subjects with deficits
  for (const [subject, totalDeficit] of Object.entries(deficit.deficitBySubject)) {
    let remainingDeficit = totalDeficit;

    while (remainingDeficit > 0) {
      // Find candidate remaining day with lowest total minutes
      let bestDayIndex = remainingDayIndices[0];
      let minDayMinutes = Infinity;

      for (const dayIdx of remainingDayIndices) {
        const day = updatedDays[dayIdx];
        const dayBlocks = day.blocks || [];
        const dayMinutes = dayBlocks.reduce(
          (acc, b) => acc + (b.durationMins ?? DEFAULT_BLOCK_MINUTES),
          0,
        );

        if (dayMinutes < minDayMinutes && dayMinutes < maxDailyMinutes) {
          minDayMinutes = dayMinutes;
          bestDayIndex = dayIdx;
        }
      }

      const blockSize = Math.min(
        remainingDeficit,
        Math.max(15, targetBlockDuration),
      );

      const targetDay = updatedDays[bestDayIndex];
      if (!targetDay.blocks) {
        targetDay.blocks = [];
      }

      // Check if subject already has a block on target day
      const existingBlock = targetDay.blocks.find(
        (b) => b.subject.trim().toLowerCase() === subject.trim().toLowerCase(),
      );

      if (existingBlock && (existingBlock.durationMins ?? DEFAULT_BLOCK_MINUTES) + blockSize <= 90) {
        // Augment existing block
        existingBlock.durationMins = (existingBlock.durationMins ?? DEFAULT_BLOCK_MINUTES) + blockSize;
        if (!existingBlock.reason?.includes("Rebalanced")) {
          existingBlock.reason = existingBlock.reason
            ? `${existingBlock.reason} · Rebalanced catch-up`
            : "Rebalanced catch-up from missed session";
        }
        if (peakHint && !existingBlock.startHint) {
          existingBlock.startHint = peakHint;
        }
      } else {
        // Insert new catch-up block
        targetDay.blocks.push({
          subject,
          durationMins: blockSize,
          startHint: peakHint || "Optimal focus slot",
          reason: "Auto-rebalanced catch-up session",
        });
        redistributedBlocksCount++;
      }

      remainingDeficit -= blockSize;
    }
  }

  const hours = Math.floor(deficit.totalMissedMinutes / 60);
  const mins = deficit.totalMissedMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  const summary = `Auto-rebalanced: Redistributed ${timeStr} of missed study volume across ${deficit.remainingDaysCount} remaining days.`;

  const rebalancedPlan: WeeklyPlanJson = {
    ...parsed,
    summary: parsed.summary ? `${parsed.summary} (${summary})` : summary,
    days: updatedDays,
  };

  return {
    rebalancedPlan,
    redistributedMinutes: deficit.totalMissedMinutes,
    redistributedBlocksCount,
    isRebalanced: true,
    summary,
  };
}
