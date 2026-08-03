/* Pure display helpers for the friends views — same split as examMeta.ts and
 * planMeta.ts: everything that can be decided without a network, a clock or a
 * DOM lives here so it can be tested directly. */

/* full_name is nullable all the way down: it comes from the signup form's
 * metadata, and an account created before that field existed (or one made
 * through a provider that didn't supply it) simply has none. Friends still
 * need to render as *somebody*. */
export function displayName(fullName: string | null | undefined): string {
  return (fullName ?? "").trim() || "Learnora student";
}

/** First letter of the first and last word, so "Ada Byron King" reads "AK". */
export function initials(fullName: string | null | undefined): string {
  const words = displayName(fullName).split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

/* Deliberately a copy of the dashboard's formatFocusTime rather than an
 * import: views in this codebase don't reach into each other's internals
 * (see the note on safeColor in views/dashboard/analytics.ts). */
export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function streakLabel(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

/* The one-line summary under a leaderboard name. Reads as a sentence rather
 * than a stat block because a zero week is the common case for a new friend
 * and "0m this week · 0 days" is a bleak way to meet someone. */
export function leaderboardMeta(weeklyMinutes: number, streak: number): string {
  const focus =
    weeklyMinutes > 0
      ? `${formatMinutes(weeklyMinutes)} this week`
      : "No focus time yet this week";
  return streak > 0 ? `${focus} · ${streakLabel(streak)} streak` : focus;
}
