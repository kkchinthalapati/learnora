/** True when any of the passed query pending flags is set.
 *
 * A screen that reads several queries and feeds them straight into a stat
 * engine has to gate on *all* of them: `data: sessions = []` renders a
 * confident "0 hours studied" while the request is still in flight, then pops
 * to the real number. That exact bug has been fixed twice on the dashboard
 * (see FEATURE_BACKLOG.md) and re-appeared on Analytics and Achievements,
 * because the gate lives at each call site and is easy to forget when a
 * fifth query is added later.
 *
 * Naming the aggregation makes the omission visible in review: a view that
 * pulls four queries and never calls this is missing its gate.
 */
export function anyPending(...flags: boolean[]): boolean {
  return flags.some(Boolean);
}
