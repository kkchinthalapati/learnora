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

/* Port of js/ui.js's `mondayOfWeek` (:45-49). getDay() is 0(Sun)-6(Sat); the
 * `(day + 6) % 7` rotation maps Sunday to 6 days back and every other day to
 * `day - 1` days back, landing on the Monday of the same week. */
export function mondayOfWeek(d: Date = new Date()): Date {
  const monday = new Date(d);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}
