/* Ports the header's live clock (`startClock`, js/main.js:2664-2683) as pure
 * functions — the formatting and the "how long until the next minute tick"
 * math, both testable without a real timer. `useLiveClock` (hooks/) is the
 * thin effectful wrapper around these. */

/** Locale-default time, no seconds (e.g. "2:41 PM"). */
export function formatClock(now = new Date()): string {
  return now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** Milliseconds until the wall clock crosses into the next minute, so the
 *  first tick lands exactly on a minute boundary instead of a minute after
 *  whatever moment the clock happened to mount. */
export function msUntilNextMinute(now = new Date()): number {
  return (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
}
