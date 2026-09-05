/* Classifying a failed request, so retry and session-recovery policy can be
 * decided in one place rather than re-guessed at each of the ~73 mutation and
 * ~200 query call sites.
 *
 * The distinction that matters for retrying a *write* is not "did it fail" but
 * "did the server ever see it". A request that never got a response (DNS,
 * dropped socket, a tunnel closing mid-flight on 3G) is safe to send again —
 * nothing happened. A 500 is not: the server received the row, and may well
 * have written it before falling over, so a blind retry is how one flashcard
 * becomes two. Queries are read-only and get the looser rule. */

/** Status codes where the request demonstrably never reached the origin, so
 *  replaying it cannot duplicate a write. 408/425/429 are the origin asking
 *  for a retry; 502/503/504 come from a proxy that could not reach upstream. */
const GATEWAY_STATUSES = new Set([408, 425, 429, 502, 503, 504]);

/** `fetch` rejects rather than resolving when the request never completed.
 *  The message is the only signal — there is no typed error for this — and it
 *  differs per engine, hence the alternation. */
const TRANSPORT_MESSAGE =
  /failed to fetch|networkerror|network request failed|load failed|connection closed|socket hang up|err_network|err_internet_disconnected/i;

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/** Supabase surfaces PostgREST/GoTrue failures as objects carrying `status`,
 *  while a raw `fetch` throw carries none. Both shapes reach these helpers. */
function statusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  for (const key of ["status", "statusCode", "code"] as const) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === "number" && value >= 100 && value <= 599) return value;
  }
  return null;
}

/**
 * The request never landed: no response was produced at all. Safe to replay,
 * write or not.
 */
export function isTransportError(error: unknown): boolean {
  if (statusOf(error) !== null) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return true;
  }
  return TRANSPORT_MESSAGE.test(messageOf(error));
}

/**
 * Worth retrying a *read*: the transport failed, or an edge returned one of
 * the "ask again" statuses. Deliberately excludes a bare 500 — that is a bug
 * in a query, and hammering it just delays the error the caller needs to see.
 */
export function isRetryableRead(error: unknown): boolean {
  if (isTransportError(error)) return true;
  const status = statusOf(error);
  return status !== null && GATEWAY_STATUSES.has(status);
}

/**
 * Worth retrying a *write*. Strictly narrower than the read rule: only when
 * the request provably never reached the origin, so a replay cannot write the
 * same row twice. A 502 is excluded on purpose — a proxy can time out waiting
 * for a response to a request the origin already committed.
 */
export function isRetryableWrite(error: unknown): boolean {
  return isTransportError(error);
}

/**
 * The session is gone or no longer accepted. PostgREST answers an expired JWT
 * with 401 and code PGRST301; GoTrue answers a refresh that cannot be honoured
 * with 401 and a `refresh_token_not_found` style message. Either way the fix
 * is the same and it is not a retry.
 */
export function isAuthError(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 401) return true;
  return /\bjwt\b.*(expired|invalid)|pgrst301|refresh[\s_-]*token[\s_-]*not[\s_-]*found|invalid[\s_-]*refresh[\s_-]*token|session.*(expired|not found)/i.test(
    messageOf(error),
  );
}
