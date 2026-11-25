/* Ports `getGreeting` (js/main.js:28-32) — the header's "Good afternoon,
 * Name! 👋" subtitle. Pure and takes `now` as a parameter so the time-of-day
 * boundary is testable without mocking the system clock. */

export function getGreeting(name: string, now = new Date()): string {
  const hour = now.getHours();
  /* Before 5am it is still the student's night: "Good morning" at 2:34am
     read as though the app didn't know what time it was. */
  if (hour < 5) return `Still up, ${name}? 🌙`;
  const period =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${period}, ${name}! 👋`;
}

/** Home's heading: the same time-of-day rule, said plainly. No emoji and no
 *  exclamation mark, and it still reads right when the account has no name
 *  ("Good evening."). Only the first name is used; an email's local part is
 *  not a name, so the caller passes "" rather than "priya.s2009". */
export function homeGreeting(name: string, now = new Date()): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const hour = now.getHours();
  if (hour < 5) return first ? `Still up, ${first}?` : "Still up?";
  const period =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return first ? `${period}, ${first}.` : `${period}.`;
}
