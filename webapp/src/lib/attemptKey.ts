/* An id for one attempt at something, generated on the client and sent with
 * the write that records it.
 *
 * It identifies a *run*, not a request. Generated when the run starts and
 * persisted alongside the run's local draft, so resuming after a refresh
 * keeps the same key and re-recording collapses onto the row that already
 * exists — while genuinely starting over produces a new one and is allowed to
 * count separately. The uniqueness is enforced server-side; see
 * supabase/migrations/20260905080000_quiz_attempt_idempotency.sql. */

/** `crypto.randomUUID` is only defined in a secure context, so it is absent
 *  over plain http — the same guard api/studyRoom.ts already uses for its own
 *  ids. Only uniqueness is wanted here, not unpredictability. */
export function newAttemptKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Postgres' unique-violation SQLSTATE. A write that lost this race did not
 *  fail — the row it was trying to create is already there, put there by the
 *  attempt this one duplicates, so the caller's outcome is success. */
const UNIQUE_VIOLATION = "23505";

export function isDuplicateAttempt(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (error.code === UNIQUE_VIOLATION) return true;
  return /duplicate key value|already exists/i.test(error.message ?? "");
}
