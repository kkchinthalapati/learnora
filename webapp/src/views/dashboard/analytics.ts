import type { Exam, Folder, StudySession } from "../../api/types";
import type { LocalSessionEntry } from "./useLocalSessions";

/* Pure functions behind the dashboard's numbers — ported out of
 * js/main.js's renderDashboard/renderAnalytics/renderNextExam (:1921-2235,
 * :1988-2042) the same way lib/timer.ts lifted the timer's state machine out
 * of its DOM writes: testable without a clock, a document, or a network. */

export function formatFocusTime(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface FocusTotals {
  total: number;
  today: number;
}

/* The local session log's `id` is `Date.now()` at log time (js/timer.js) —
 * a reliable "was this today" timestamp with no parsing involved. */
export function localTotals(sessions: LocalSessionEntry[]): FocusTotals {
  const startMs = startOfToday().getTime();
  let total = 0;
  let today = 0;
  for (const s of sessions) {
    total += s.minutes || 0;
    if (s.id >= startMs) today += s.minutes || 0;
  }
  return { total, today };
}

export function remoteTotals(sessions: StudySession[]): FocusTotals {
  const start = startOfToday();
  let total = 0;
  let today = 0;
  for (const s of sessions) {
    total += s.minutes || 0;
    if (new Date(s.started_at) >= start) today += s.minutes || 0;
  }
  return { total, today };
}

const STREAK_MIN_MINUTES = 5;

/* Today is a grace day: the streak shouldn't read 0 every morning just
 * because the user hasn't studied *yet*. If today doesn't qualify, counting
 * starts from yesterday; only a fully missed day actually breaks the streak. */
export function computeStreak(sessions: StudySession[]): number {
  const dayTotals = new Map<string, number>();
  for (const s of sessions) {
    const day = new Date(s.started_at).toDateString();
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + (s.minutes || 0));
  }

  let streak = 0;
  const cursor = startOfToday();
  if ((dayTotals.get(cursor.toDateString()) ?? 0) < STREAK_MIN_MINUTES) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while ((dayTotals.get(cursor.toDateString()) ?? 0) >= STREAK_MIN_MINUTES) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface SparklineDay {
  label: string;
  key: string;
  mins: number;
}

export function computeSparkline(sessions: StudySession[]): SparklineDay[] {
  const days: SparklineDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({
      label: d.toLocaleDateString([], { weekday: "narrow" }),
      key: d.toDateString(),
      mins: 0,
    });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const s of sessions) {
    const day = byKey.get(new Date(s.started_at).toDateString());
    if (day) day.mins += s.minutes || 0;
  }
  return days;
}

/* The vanilla's `safeColor` (js/router.js:6-8) — duplicated here rather than
 * imported from views/library, matching this codebase's per-view self
 * containment (no view imports another view's internals). */
function safeColor(color: string | null | undefined): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(color || "")) ? color! : "#888";
}

export interface FolderBreakdownRow {
  id: string;
  name: string;
  color: string;
  mins: number;
}

export function computeFolderBreakdown(
  sessions: StudySession[],
  folders: Folder[],
): FolderBreakdownRow[] {
  const info = new Map(folders.map((f) => [f.id, f]));
  const totals = new Map<string, number>();
  for (const s of sessions) {
    const key = s.folder_id ?? "unassigned";
    totals.set(key, (totals.get(key) ?? 0) + (s.minutes || 0));
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([id, mins]) => {
      const folder = info.get(id);
      return {
        id,
        name: folder?.name ?? "Unassigned",
        color: safeColor(folder?.color),
        mins,
      };
    });
}

/* `exam_date` is a plain YYYY-MM-DD string, so lexicographic comparison
 * against another YYYY-MM-DD string sorts and filters correctly with no
 * Date parsing needed — same reasoning the calendar view uses. */
export function nextUpcomingExam(exams: Exam[], todayStr: string): Exam | null {
  const upcoming = exams
    .filter((e) => e.status !== "Completed" && e.exam_date >= todayStr)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
  return upcoming[0] ?? null;
}

/* Appending "T00:00:00" forces the plain date string to parse in local time.
 * `new Date("2026-08-15")` alone parses as UTC midnight, which reads as the
 * previous evening anywhere west of Greenwich — the same pitfall lib/date.ts
 * documents for `localDateStr`. */
export function daysUntil(examDateStr: string, today: Date): number {
  const examDate = new Date(`${examDateStr}T00:00:00`);
  return Math.round((examDate.getTime() - today.getTime()) / 86400000);
}
