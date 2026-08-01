/* Ports `getGreeting` (js/main.js:28-32) — the header's "Good afternoon,
 * Name! 👋" subtitle. Pure and takes `now` as a parameter so the time-of-day
 * boundary is testable without mocking the system clock. */

export function getGreeting(name: string, now = new Date()): string {
  const hour = now.getHours();
  const period =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${period}, ${name}! 👋`;
}
