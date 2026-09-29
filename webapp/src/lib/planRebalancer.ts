import type { Exam, Folder, StudySession } from "../api/types";
import type { PlanBlock } from "./aiJson";
import { formatHour, type PeakFocusWindow } from "./analyticsEngine";
import { dayAvailability } from "./availability";
import { importIcsForRange } from "./icsImport";
import { formatDuration, toMinutes, type LifeContext } from "./lifeContext";
import { formatMonthDay, localDateStr, parseLocalDate, WEEKDAY_NAMES } from "./date";
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
 *
 * A block counts as done when logged study for its subject that day covers
 * it — there is no manual "done" tick on a plan block, and Start on a block
 * logs exactly that session. Blocks already handed on by a rebalance
 * (`rebalanced: true`) are no longer owed and are skipped, so accepting a
 * rebalance clears the prompt instead of offering the same minutes again.
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
      recommendation: "You don't have a plan for this week yet.",
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
      if (block.rebalanced) continue;
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

  let recommendation = "You're on track with this week's plan.";
  if (isBehind) {
    const hours = Math.floor(totalMissedMinutes / 60);
    const mins = totalMissedMinutes % 60;
    const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    if (remainingDaysCount > 0) {
      const avgExtra = Math.round(totalMissedMinutes / remainingDaysCount);
      recommendation = `You're ${timeStr} behind. We can spread that out — about ${avgExtra} minutes extra on each of your remaining ${remainingDaysCount} day${remainingDaysCount > 1 ? "s" : ""}.`;
    } else {
      recommendation = `You missed ${timeStr} this week. Make a new plan for next week and start fresh.`;
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

/* ── Rebalance: propose, preview, apply ─────────────────────────────────────
 *
 * Deterministic on purpose. The plan was written by the model, but moving
 * missed minutes into free slots is arithmetic: a model call here would burn
 * quota, could invent hours the student does not have, and — worst — the
 * preview could not promise that what it shows is what gets saved.
 *
 * `proposeRebalance` never touches the stored plan. The view shows its moves
 * and shortfall as a diff, and only `applyRebalance` — run when the student
 * confirms — writes anything. The proposal is the single source of both. */

export type RebalanceExam = Pick<Exam, "exam_name" | "exam_date" | "status"> & {
  folder_id?: string | null;
};

export type RebalanceExamState =
  | { state: "none" }
  | { state: "passed"; name: string; date: string }
  | { state: "upcoming"; name: string; date: string; daysLeft: number };

export interface RebalanceMove {
  subject: string;
  /** The past day the missed work was planned for. */
  fromDate: string;
  toDate: string;
  minutes: number;
  /** The exam this catch-up has to land before, when its subject has one. */
  examName?: string;
}

export interface RebalanceShortfall {
  subject: string;
  fromDate: string;
  minutes: number;
  examName?: string;
}

export type RebalanceStatus =
  | "no-plan"
  | "on-track"
  /** Everything missed fits. */
  | "ready"
  /** Some fits; the rest is named rather than crammed. */
  | "partial"
  /** Nothing fits — only priorities are offered. */
  | "no-room";

export interface RebalanceProposal {
  status: RebalanceStatus;
  deficit: PlanDeficit;
  exam: RebalanceExamState;
  moves: RebalanceMove[];
  shortfall: RebalanceShortfall[];
  placedMinutes: number;
  shortfallMinutes: number;
  /** Subjects to protect first, most urgent first. */
  priorities: string[];
  /** The missed blocks this proposal accounts for. Applying marks exactly
   *  these as handled — moved, or knowingly let go. */
  sources: Array<{ date: string; subject: string }>;
  headline: string;
  detail: string;
}

export interface RebalanceLimits {
  /** Minutes the student is willing and free to study on a date, before
   *  anything already planned there is subtracted. */
  capacityFor: (date: string) => number;
  /** Minute of the day the student stops — caps what is left of today. */
  dayEndMinute: number;
  /** Longest single catch-up block. */
  maxChunkMins: number;
  /** Shortest catch-up block worth sitting down for. */
  minChunkMins: number;
}

export interface ProposeRebalanceOptions extends Partial<RebalanceLimits> {
  folders?: Folder[];
  exams?: RebalanceExam[];
  now?: Date;
  /** Monday of the plan's week. Days the plan has no entry for are still
   *  valid targets — Saturday being empty is exactly why it has room. */
  weekStartISO?: string;
  /** Cards due per subject (from planTargets): between two subjects with the
   *  same exam pressure, the one with work actually owed goes first. */
  dueCountBySubject?: Record<string, number>;
}

/** An exam that finished more than this long ago is history, not an "exam
 *  already passed" worth pointing out — nobody needs telling about March. */
const PASSED_EXAM_WINDOW_DAYS = 7;
const DEFAULT_DAY_END_MINUTE = 23 * 60;
const DEFAULT_CAPACITY_MINS = 150;
const DEFAULT_MAX_CHUNK = 55;
const DEFAULT_MIN_CHUNK = 15;

/**
 * The student's own limits, as My week describes them: free windows around
 * commitments and imported calendar events, trimmed to their daily capacity,
 * protected days at zero. A student who never opened My week gets the same
 * defaults the scheduler uses, which are still a ceiling — never "unlimited".
 */
export function rebalanceLimitsFrom(
  ctx: LifeContext,
  weekStartISO: string,
): RebalanceLimits {
  const calendar = ctx.importedIcs
    ? importIcsForRange(ctx.importedIcs, weekStartISO, 7).events
    : [];
  const sleep = toMinutes(ctx.sleepTime) ?? DEFAULT_DAY_END_MINUTE;
  return {
    capacityFor: (date) => dayAvailability(ctx, date, calendar).availableMins,
    // A 01:00 bedtime is the end of *today*, not the start of it.
    dayEndMinute: sleep < 6 * 60 ? sleep + 24 * 60 : sleep,
    maxChunkMins: ctx.maxBlockMins,
    minChunkMins: ctx.minBlockMins,
  };
}

/** "3 PM – 6 PM (Peak Focus)" — the hint BlockCard badges. */
export function peakFocusHint(window: PeakFocusWindow | null): string | undefined {
  if (!window || !window.hasData) return undefined;
  return `${formatHour(window.startHour)} – ${formatHour(window.endHour)} (Peak Focus)`;
}

function normalise(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

function examDate(exam: RebalanceExam): string {
  return typeof exam.exam_date === "string" ? exam.exam_date.slice(0, 10) : "";
}

function daysBetween(fromISO: string, toISO: string): number {
  return Math.round(
    (parseLocalDate(toISO).getTime() - parseLocalDate(fromISO).getTime()) /
      86_400_000,
  );
}

function openExams(exams: RebalanceExam[]): RebalanceExam[] {
  return exams.filter((e) => e.status !== "Completed" && examDate(e));
}

/** The exam the countdown is about: the nearest one still ahead, else one
 *  that passed within the last week (so a stale date gets pointed out),
 *  else none. */
export function resolveExamState(
  exams: RebalanceExam[],
  todayStr: string,
): RebalanceExamState {
  const open = openExams(exams);
  const upcoming = open
    .filter((e) => examDate(e) >= todayStr)
    .sort((a, b) => examDate(a).localeCompare(examDate(b)))[0];
  if (upcoming) {
    return {
      state: "upcoming",
      name: upcoming.exam_name,
      date: examDate(upcoming),
      daysLeft: daysBetween(todayStr, examDate(upcoming)),
    };
  }
  const passed = open
    .filter(
      (e) =>
        examDate(e) < todayStr &&
        daysBetween(examDate(e), todayStr) <= PASSED_EXAM_WINDOW_DAYS,
    )
    .sort((a, b) => examDate(b).localeCompare(examDate(a)))[0];
  if (passed) {
    return { state: "passed", name: passed.exam_name, date: examDate(passed) };
  }
  return { state: "none" };
}

/** Does this exam cover this plan subject? The exam's own folder when it has
 *  one, else the subject appearing as whole words in the exam's name
 *  ("Biology" ↔ "Biology Final"). A false match only moves a subject up the
 *  queue and gives it an earlier deadline; it never drops work. */
function examCoversSubject(
  exam: RebalanceExam,
  subject: string,
  folders: Folder[],
): boolean {
  const s = normalise(subject);
  if (!s) return false;
  if (exam.folder_id) {
    const folder = folders.find((f) => f.id === exam.folder_id);
    if (folder && normalise(folder.name) === s) return true;
  }
  const name = normalise(exam.exam_name ?? "");
  return name === s || ` ${name} `.includes(` ${s} `);
}

function sumBlockMinutes(blocks: PlanBlock[] = []): number {
  return blocks.reduce(
    (sum, b) => sum + (b.durationMins ?? DEFAULT_BLOCK_MINUTES),
    0,
  );
}

function weekDateList(weekStartISO: string): string[] {
  const start = parseLocalDate(weekStartISO);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return localDateStr(d);
  });
}

/** "Wed Sep 30" — the day labels the preview diff uses. */
export function rebalanceDayLabel(date: string): string {
  const d = parseLocalDate(date);
  if (Number.isNaN(d.getTime())) return date;
  return `${WEEKDAY_NAMES[d.getDay()]} ${formatMonthDay(d)}`;
}

function listSubjects(subjects: string[]): string {
  if (subjects.length <= 1) return subjects[0] ?? "";
  return `${subjects.slice(0, -1).join(", ")} and ${subjects[subjects.length - 1]}`;
}

function whenLabel(daysLeft: number): string {
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

interface PendingItem {
  subject: string;
  fromDate: string;
  minutes: number;
  /** Exclusive: work for this item must land before this date. */
  deadline?: string;
  examName?: string;
  examPassed: boolean;
  dueCount: number;
}

/**
 * Work out where the missed minutes would go, without changing anything.
 *
 * - Missed work for a subject with an exam coming must land on a day
 *   *before* that exam; everything else may use the rest of the week.
 * - A day never takes more than its free capacity (the student's limit
 *   minus what is already planned there), and today only has what is left
 *   before bedtime.
 * - When not everything fits, the most urgent work is placed first and the
 *   remainder is reported as a shortfall with priorities — the honest
 *   alternative to scheduling hours that do not exist.
 */
export function proposeRebalance(
  planJson: unknown,
  sessions: StudySession[] = [],
  options: ProposeRebalanceOptions = {},
): RebalanceProposal {
  const {
    folders = [],
    exams = [],
    now = new Date(),
    weekStartISO,
    dueCountBySubject = {},
    capacityFor = () => DEFAULT_CAPACITY_MINS,
    dayEndMinute = DEFAULT_DAY_END_MINUTE,
    maxChunkMins = DEFAULT_MAX_CHUNK,
    minChunkMins = DEFAULT_MIN_CHUNK,
  } = options;

  const todayStr = localDateStr(now);
  const exam = resolveExamState(exams, todayStr);
  const deficit = detectPlanDeficit(planJson, sessions, folders, now);
  const parsed = parseStoredPlan(planJson);

  const empty = {
    deficit,
    exam,
    moves: [],
    shortfall: [],
    placedMinutes: 0,
    shortfallMinutes: 0,
    priorities: [],
    sources: [],
    detail: "",
  };

  if (!parsed || parsed.days.length === 0) {
    return { ...empty, status: "no-plan", headline: "No plan for this week yet." };
  }
  if (!deficit.isBehind) {
    return {
      ...empty,
      status: "on-track",
      headline: "You're on track with this week's plan.",
    };
  }

  /* ── Free capacity per remaining day ── */
  const candidateDates = (
    weekStartISO ? weekDateList(weekStartISO) : parsed.days.map((d) => d.date)
  )
    .filter((date) => date >= todayStr)
    .sort();
  const plannedOn = new Map<string, number>();
  for (const day of parsed.days) {
    plannedOn.set(
      day.date,
      (plannedOn.get(day.date) ?? 0) +
        sumBlockMinutes((day.blocks ?? []).filter((b) => !b.rebalanced)),
    );
  }
  const nowMinute = now.getHours() * 60 + now.getMinutes();
  const free = new Map<string, number>();
  for (const date of candidateDates) {
    let cap = Math.max(0, capacityFor(date));
    if (date === todayStr) cap = Math.min(cap, Math.max(0, dayEndMinute - nowMinute));
    free.set(date, Math.max(0, cap - (plannedOn.get(date) ?? 0)));
  }

  /* ── What is owed, most urgent first ── */
  const open = openExams(exams);
  const items: PendingItem[] = deficit.missedBlocks.map((missed) => {
    const covering = open
      .filter((e) => examCoversSubject(e, missed.subject, folders))
      .sort((a, b) => examDate(a).localeCompare(examDate(b)));
    const upcoming = covering.find((e) => examDate(e) >= todayStr);
    const passed = !upcoming && covering.some((e) => examDate(e) < todayStr);
    return {
      subject: missed.subject,
      fromDate: missed.date,
      minutes: missed.deficitMins,
      deadline: upcoming ? examDate(upcoming) : undefined,
      examName: upcoming?.exam_name,
      examPassed: passed,
      dueCount: dueCountBySubject[missed.subject] ?? 0,
    };
  });
  const urgency = (item: PendingItem) =>
    item.deadline ? 0 : item.examPassed ? 2 : 1;
  items.sort(
    (a, b) =>
      urgency(a) - urgency(b) ||
      (a.deadline ?? "").localeCompare(b.deadline ?? "") ||
      b.dueCount - a.dueCount ||
      b.minutes - a.minutes ||
      a.fromDate.localeCompare(b.fromDate) ||
      a.subject.localeCompare(b.subject),
  );

  /* ── Place each item into the emptiest eligible day, chunk by chunk ── */
  const maxChunk = Math.max(5, maxChunkMins);
  const minChunk = Math.max(5, Math.min(minChunkMins, maxChunk));
  const moves: RebalanceMove[] = [];
  const shortfall: RebalanceShortfall[] = [];
  for (const item of items) {
    let remaining = item.minutes;
    const eligible = candidateDates.filter(
      (date) => !item.deadline || date < item.deadline,
    );
    while (remaining > 0) {
      const needed = Math.min(minChunk, remaining);
      let best: string | null = null;
      for (const date of eligible) {
        const room = free.get(date) ?? 0;
        if (room < needed) continue;
        if (best === null || room > (free.get(best) ?? 0)) best = date;
      }
      if (best === null) break;
      let chunk = Math.min(remaining, maxChunk, free.get(best) ?? 0);
      /* Never leave a sliver: 60m under a 55m cap is 35 + 25, not 55 + 5. */
      const leftover = remaining - chunk;
      if (leftover > 0 && leftover < minChunk && remaining - minChunk >= minChunk) {
        chunk = remaining - minChunk;
      }
      moves.push({
        subject: item.subject,
        fromDate: item.fromDate,
        toDate: best,
        minutes: chunk,
        ...(item.examName ? { examName: item.examName } : {}),
      });
      free.set(best, (free.get(best) ?? 0) - chunk);
      remaining -= chunk;
    }
    if (remaining > 0) {
      shortfall.push({
        subject: item.subject,
        fromDate: item.fromDate,
        minutes: remaining,
        ...(item.examName ? { examName: item.examName } : {}),
      });
    }
  }

  const placedMinutes = moves.reduce((sum, m) => sum + m.minutes, 0);
  const shortfallMinutes = shortfall.reduce((sum, s) => sum + s.minutes, 0);
  const priorities = [...new Set(items.map((i) => i.subject))].slice(0, 3);
  const status: RebalanceStatus =
    shortfallMinutes === 0 ? "ready" : placedMinutes > 0 ? "partial" : "no-room";

  /* ── Words ── */
  let headline = `You're ${formatDuration(deficit.totalMissedMinutes)} behind this week's plan.`;
  if (exam.state === "upcoming") {
    headline += ` ${exam.name} is ${whenLabel(exam.daysLeft)}.`;
  }

  const examToday = items.find(
    (i) => i.deadline && i.deadline === todayStr,
  );
  const targetDays = new Set(moves.map((m) => m.toDate)).size;
  const beforeExam = moves.find((m) => m.examName)?.examName;
  const parts: string[] = [];
  if (status === "ready") {
    parts.push(
      `All of it fits into ${targetDays} day${targetDays === 1 ? "" : "s"}${beforeExam ? ` before ${beforeExam}` : ""} without going over your daily limit.`,
    );
  } else {
    if (examToday) {
      parts.push(
        `${examToday.examName} is today, so there's no time left to make up ${examToday.subject} — a short review of the essentials beats cramming.`,
      );
    }
    if (candidateDates.length === 0) {
      parts.push("There are no days left in this week's plan to move it to.");
    } else if (status === "partial") {
      parts.push(
        `Only ${formatDuration(placedMinutes)} fits without going over your daily limit.`,
      );
    } else if (!examToday) {
      const boundBy = shortfall.find((s) => s.examName)?.examName;
      parts.push(
        `There's no free time left ${boundBy ? `before ${boundBy}` : "this week"} without going over your daily limit.`,
      );
    }
    parts.push(
      `Put ${listSubjects(priorities)} first and let the other ${formatDuration(shortfallMinutes)} go — cramming hours you don't have won't stick.`,
    );
  }
  if (exam.state === "passed") {
    parts.push(
      `${exam.name} (${rebalanceDayLabel(exam.date)}) has already passed — if it moved, update the date in Exams.`,
    );
  } else if (exam.state === "none" && status !== "no-room") {
    parts.push("No upcoming exam is set, so this spreads across the rest of the week.");
  }

  return {
    status,
    deficit,
    exam,
    moves,
    shortfall,
    placedMinutes,
    shortfallMinutes,
    priorities,
    sources: deficit.missedBlocks.map((m) => ({ date: m.date, subject: m.subject })),
    headline,
    detail: parts.join(" "),
  };
}

export class RebalanceError extends Error {
  constructor() {
    super("This plan changed before the rebalance could be saved. Please try again.");
    this.name = "RebalanceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Write a proposal into the stored plan JSON.
 *
 * Edits the raw JSON (like views/plan/planEdits.ts) so provider fields the
 * parser does not know survive. The missed blocks are kept where they were —
 * the record of what was planned — and flagged `rebalanced`, which is what
 * stops `detectPlanDeficit` counting them again. Each move becomes a new
 * block on its target day, carrying the subject verbatim so the plan's
 * Start button still resolves it to the same deck or quiz.
 */
export function applyRebalance(
  planJson: unknown,
  proposal: Pick<RebalanceProposal, "moves" | "sources">,
  options: { startHint?: string } = {},
): Record<string, unknown> {
  if (!isRecord(planJson) || !Array.isArray(planJson.days)) {
    throw new RebalanceError();
  }
  const key = (date: string, subject: string) => `${date}\u0000${subject}`;
  const sourceKeys = new Set(proposal.sources.map((s) => key(s.date, s.subject)));

  const days: unknown[] = planJson.days.map((day) => {
    if (!isRecord(day) || typeof day.date !== "string" || !Array.isArray(day.blocks)) {
      return day;
    }
    const date = day.date;
    let changed = false;
    const blocks = day.blocks.map((block) => {
      if (
        isRecord(block) &&
        typeof block.subject === "string" &&
        block.rebalanced !== true &&
        sourceKeys.has(key(date, block.subject))
      ) {
        changed = true;
        return { ...block, rebalanced: true };
      }
      return block;
    });
    return changed ? { ...day, blocks } : day;
  });

  for (const move of proposal.moves) {
    const block: Record<string, unknown> = {
      subject: move.subject,
      durationMins: move.minutes,
      reason: `Catch-up from ${rebalanceDayLabel(move.fromDate)}${move.examName ? ` · before ${move.examName}` : ""}`,
      catchUpFrom: move.fromDate,
    };
    if (options.startHint) block.startHint = options.startHint;

    const index = days.findIndex((d) => isRecord(d) && d.date === move.toDate);
    if (index >= 0) {
      const day = days[index] as Record<string, unknown>;
      const blocks = Array.isArray(day.blocks) ? [...day.blocks, block] : [block];
      days[index] = { ...day, blocks };
    } else {
      const later = days.findIndex(
        (d) => isRecord(d) && typeof d.date === "string" && d.date > move.toDate,
      );
      const newDay = { date: move.toDate, blocks: [block] };
      if (later < 0) days.push(newDay);
      else days.splice(later, 0, newDay);
    }
  }

  return { ...planJson, days };
}
