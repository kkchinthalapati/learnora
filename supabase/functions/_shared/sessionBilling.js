/* How today's AI calls are counted against a tool's daily allowance.
 *
 * A Study session makes several calls, and they count once: the allowance
 * for the session tools is "sessions a day", not "calls a day". Each call
 * without a session key still counts on its own.
 *
 * Grouping is per tool, and each tool has its own cap on how many calls one
 * session may group. Until 2026-11-05 any tool honoured a session key up to
 * 16 calls, so the tutor chat opened during a Study session (which picks up
 * the session's key) gave a free student 16 messages for one of their 10,
 * and a hand-built request could do the same for quizzes or flashcards.
 * Past a tool's cap, a call is not refused: it is billed on its own, like a
 * call with no session, so a long session never stops mid-way while the day's
 * allowance still has room.
 *
 * Pure, so tests/session-billing.test.js can pin the rule; learnora-ai's
 * checkAndLogRateLimit feeds it today's rows for the tool. */

/** The most calls one session may group into a single unit, per tool. A tool
 *  missing here ignores session keys: every call is one unit. */
export const SESSION_CALL_CAPS = Object.freeze({
  // Study sessions: a plan, checks and an answer marked at every step.
  debugger: 16,
  feynman: 16,
  sparring: 16,
  preMortem: 16,
  examDeconstructor: 16,
  // A lesson teaches and checks section by section; a long chapter runs long.
  learn: 30,
  // Follow-up questions asked inside a Study session.
  chat: 8,
  // The question batches a Practice session draws.
  quiz: 3,
  // A long source written in up to three parts, plus one drawing.
  notes: 4,
});

/**
 * @param {string | null | undefined} tool the billed tool
 * @param {number} [longSessionCap] override for the 16-call Study tools
 * @returns {number} 0 when the tool does not group calls
 */
export function sessionCapFor(tool, longSessionCap) {
  const cap = tool && Object.hasOwn(SESSION_CALL_CAPS, tool) ? SESSION_CALL_CAPS[tool] : 0;
  return cap === 16 && longSessionCap ? longSessionCap : cap;
}

/** Units of allowance a tool's rows use: one per session, one per call
 *  without one. The usage meter counts the same way
 *  (webapp/src/api/aiUsage.ts). */
export function unitsUsed(rows) {
  const keys = rows.map((r) => r.session_key).filter(Boolean);
  return new Set(keys).size + rows.filter((r) => !r.session_key).length;
}

/**
 * @param {{ session_key?: string | null }[]} rows today's log rows for the tool
 * @param {string | null} sessionKey this call's session, if any
 * @param {number} dailyMax the plan's allowance for the tool
 * @param {number} sessionCap the most calls one session may group (0: none)
 * @returns {{ allowed: true, sessionKey: string | null } | { allowed: false, reason: "daily" }}
 *   `sessionKey` is what the call is logged under: null when it is billed on
 *   its own.
 */
export function billingDecision(rows, sessionKey, dailyMax, sessionCap) {
  const key = sessionKey && sessionCap > 0 ? sessionKey : null;
  const callsInSession = key ? rows.filter((r) => r.session_key === key).length : 0;
  if (key && callsInSession > 0 && callsInSession < sessionCap) return { allowed: true, sessionKey: key };
  // A new session, a full one, or no session: this call takes a unit.
  if (unitsUsed(rows) >= dailyMax) return { allowed: false, reason: "daily" };
  return { allowed: true, sessionKey: key && callsInSession === 0 ? key : null };
}
