import type { StudySession } from "../api/types";

/* The one canonical streak definition, shared by the dashboard's StreakCard,
 * the analytics heatmap, and anything else that says "day streak": a day
 * qualifies at STREAK_MIN_MINUTES of focus, and today is a grace day — the
 * streak must not read 0 every morning just because the user hasn't studied
 * *yet*; only a fully missed day breaks it.
 *
 * This used to exist twice with different thresholds (dashboard: ≥5 minutes,
 * heatmap: >0 minutes), so the same study history showed "0 day streak" on
 * one card and "5 day streak" on another. */

export const STREAK_MIN_MINUTES = 5;

export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Focus minutes per local calendar day. */
export function dayTotalsByDate(sessions: StudySession[]): Map<string, number> {
  const dayTotals = new Map<string, number>();
  for (const s of sessions) {
    const day = new Date(s.started_at).toDateString();
    dayTotals.set(day, (dayTotals.get(day) ?? 0) + (s.minutes || 0));
  }
  return dayTotals;
}

/** Consecutive qualifying days ending today (or yesterday, if today doesn't
 *  qualify yet — the grace day). */
export function computeStudyStreak(
  sessions: StudySession[],
  minMinutes: number = STREAK_MIN_MINUTES,
  now: Date = new Date(),
): number {
  const dayTotals = dayTotalsByDate(sessions);

  let streak = 0;
  const cursor = startOfToday(now);
  if ((dayTotals.get(cursor.toDateString()) ?? 0) < minMinutes) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while ((dayTotals.get(cursor.toDateString()) ?? 0) >= minMinutes) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
