/* Port of js/ui.js's `localDateStr` (:41-43) and js/main.js's
 * `formatDateStr`.
 *
 * Both build a YYYY-MM-DD string from *local* calendar fields rather than
 * `toISOString().slice(0, 10)`, which converts to UTC first — west of
 * Greenwich that reports yesterday for most of the evening, so a task due
 * today would render as overdue. Every date column in this app is a plain
 * date, not an instant, so local is the correct reading. */

export function formatDateStr(
  year: number,
  monthIndex: number,
  day: number,
): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function localDateStr(d: Date = new Date()): string {
  return formatDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

/* Port of js/ui.js's `mondayOfWeek` (:45-49). The week starts Monday, so
 * Sunday belongs to the week that has just ended, not the one about to
 * start — `(getDay() + 6) % 7` maps Sun→6 rather than JS's native Sun→0. */
export function mondayOfWeek(d: Date = new Date()): Date {
  const monday = new Date(d);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

/** The seven local dates of the week containing `d`, Monday first. */
export function weekDates(d: Date = new Date()): string[] {
  const monday = mondayOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return localDateStr(day);
  });
}

/** Parse a plain YYYY-MM-DD as local midnight. Bare `new Date("2026-08-03")`
 *  parses as UTC and renders the wrong weekday west of Greenwich. */
export function parseLocalDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

/** Port of js/router.js's `formatRelativeTime` (:10-18). */
export function formatRelativeTime(isoString: string): string {
  const mins = Math.round((Date.now() - new Date(isoString).getTime()) / 60000);
  /* Rounding puts anything from 30s-89s at 1 minute, and that still reads
     as "just now" to a student glancing at a timestamp — only 90s+ (which
     rounds to 2) earns an actual "Xm ago". */
  if (mins <= 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** "Aug 3" — the short label the plan grid and its week range both use. */
export function formatMonthDay(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const WEEKDAY_NAMES = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;
