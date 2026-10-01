/* How today's AI calls are counted against a tool's daily allowance.
 *
 * A Study session makes several calls, and they count once: the allowance
 * for the session tools is "sessions a day", not "calls a day". Each call
 * without a session key still counts on its own. A session is capped at
 * `sessionCap` calls a day so one key cannot become unlimited use.
 *
 * Pure, so tests/session-billing.test.js can pin the rule; learnora-ai's
 * checkAndLogRateLimit feeds it today's rows for the tool. */

/**
 * @param {{ session_key?: string | null }[]} rows today's log rows for the tool
 * @param {string | null} sessionKey this call's session, if any
 * @param {number} dailyMax the plan's allowance for the tool
 * @param {number} sessionCap the most calls one session may make in a day
 * @returns {{ allowed: true } | { allowed: false, reason: "daily" | "session" }}
 */
export function billingDecision(rows, sessionKey, dailyMax, sessionCap) {
  const keys = rows.map((r) => r.session_key).filter(Boolean);
  const unitsToday = new Set(keys).size + rows.filter((r) => !r.session_key).length;
  const callsInSession = sessionKey ? keys.filter((k) => k === sessionKey).length : 0;
  if (sessionKey && callsInSession >= sessionCap) return { allowed: false, reason: "session" };
  if (callsInSession > 0) return { allowed: true };
  if (unitsToday >= dailyMax) return { allowed: false, reason: "daily" };
  return { allowed: true };
}
