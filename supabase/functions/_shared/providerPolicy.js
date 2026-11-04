/* =========================================================================
   PROVIDER POLICY — which AI providers may receive a student's request.

   The chain in learnora-ai/index.ts can reach ten providers, but the sign-up
   consent, Settings ▸ Privacy and the privacy policy told students only
   "Anthropic (Claude) and Google (Gemini)". Production logs on 2026-09-25
   show requests reaching Cerebras, Groq, GitHub Models and Mistral. For an
   audience that starts at 13, sending study data somewhere the student was
   never told about is not a reliability detail.

   This file is the single list of providers students are told about. The
   edge function refuses to call anything not on it, and
   tests/provider-disclosure.test.js requires webapp/src/lib/aiProviders.ts —
   what the consent and privacy screens render — to list exactly these ids.
   Adding a provider therefore means telling students first, or the test
   fails.

   `AI_PROVIDER_ALLOWLIST` (comma-separated ids) narrows the chain further
   without a redeploy. It can never widen it past DISCLOSED_PROVIDER_IDS.
   ========================================================================= */

/** Every provider a student's request may be sent to, in the order the
 *  chain tries them. Mistral is deliberately absent: its free "Experiment"
 *  tier may use requests for training (see AI_PROVIDERS.md). */
export const DISCLOSED_PROVIDER_IDS = Object.freeze([
  "gemini",
  "groq",
  "cloudflare",
  "github-models",
  "openrouter",
  "nvidia",
  "radox",
  "openai",
  "anthropic",
]);

/**
 * The provider ids the chain may call, given the optional allowlist secret.
 * @param {string | undefined | null} allowlistEnv
 * @returns {Set<string>}
 */
export function permittedProviderIds(allowlistEnv) {
  const disclosed = new Set(DISCLOSED_PROVIDER_IDS);
  if (!allowlistEnv || !allowlistEnv.trim()) return disclosed;
  const wanted = allowlistEnv
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return new Set(wanted.filter((id) => disclosed.has(id)));
}

/* A 401/402/403 is a key or billing problem, not a busy provider: Cerebras
   answered 402 "Payment required" to every request on 2026-09-25, and each
   one still cost the student a round trip before the chain moved on. Such a
   provider is skipped for a while in this function instance instead of
   being retried on every request. 429 and 5xx are transient and are not
   included. */
export const DEAD_KEY_STATUSES = Object.freeze([401, 402, 403]);
export const DEAD_KEY_COOLDOWN_MS = 15 * 60_000;

/**
 * The HTTP status a provider error message carries ("groq returned 429: …"),
 * or null.
 * @param {string} message
 * @returns {number | null}
 */
export function statusFromProviderError(message) {
  // "groq returned 429: …" from callProvider, "[429 Too Many Requests] …" from
  // the Gemini SDK.
  const match = /(?:returned |\[)(\d{3})\b/.exec(String(message ?? ""));
  return match ? Number(match[1]) : null;
}

/* Busy, out-of-quota and broken providers, as production saw them between
   2026-10-19 and 10-30: Gemini answered 429 "exceeded your current quota" to
   most requests, Groq 429 "tokens per minute … try again in 29s", OpenAI 429
   "no credits", Anthropic 400 "credit balance is too low", and GitHub Models
   an empty completion every time. Each was still tried on every request, so a
   student paid for every dead hop before reaching one that could answer.
   These cool a provider down for as long as its own error says, or a default
   that fits the kind of failure. A 413 (this request is too big for it) is
   about the request, not the provider, so it never cools one down. */
export const RATE_LIMIT_COOLDOWN_MS = 60_000;
export const OVERLOAD_COOLDOWN_MS = 30_000;
export const EMPTY_REPLY_COOLDOWN_MS = 5 * 60_000;

/**
 * The wait a provider asked for ("try again in 29.295s", "Please retry in
 * 41s", `"retryDelay":"33s"`), in milliseconds, or null.
 * @param {string} message
 * @returns {number | null}
 */
export function retryHintMs(message) {
  const text = String(message ?? "");
  const phrase = /(?:try again|retry) in (\d+(?:\.\d+)?)\s*(ms|s)\b/i.exec(text);
  const field = /"?retryDelay"?\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(text);
  const hit = phrase ?? (field ? [field[0], field[1], "s"] : null);
  if (!hit) return null;
  const value = Number(hit[1]);
  return Math.ceil(hit[2].toLowerCase() === "ms" ? value : value * 1000);
}

/**
 * How long to skip a provider after this error, in milliseconds; 0 means
 * try it again on the next request.
 * @param {string} message
 * @returns {number}
 */
export function cooldownForProviderError(message) {
  const text = String(message ?? "");
  const status = statusFromProviderError(text);
  if (status !== null && DEAD_KEY_STATUSES.includes(status)) return DEAD_KEY_COOLDOWN_MS;
  const hint = retryHintMs(text);
  const hinted = (fallback) => (hint === null ? fallback : Math.min(hint, DEAD_KEY_COOLDOWN_MS));
  // Out of credit or quota. Anthropic words it as a 400, so this is matched
  // on the text, not the status.
  if (/credit balance|no credits|insufficient_quota|exceeded your current quota/i.test(text)) {
    return hinted(DEAD_KEY_COOLDOWN_MS);
  }
  if (status === 429) return hinted(RATE_LIMIT_COOLDOWN_MS);
  if (status === 503) return hinted(OVERLOAD_COOLDOWN_MS);
  if (/empty completion/.test(text)) return EMPTY_REPLY_COOLDOWN_MS;
  return 0;
}

/**
 * A provider's id with why it failed ("groq: 429", "github-models: empty"),
 * for ai_request_log.failed_providers. The bare ids it held before could not
 * tell a dead key from a busy minute without reading raw function logs.
 * @param {string} id
 * @param {string} message
 * @returns {string}
 */
export function failureLabel(id, message) {
  const text = String(message ?? "");
  const status = statusFromProviderError(text);
  const reason =
    status !== null ? String(status)
    : /empty completion/.test(text) ? "empty"
    : /timed out|abort/i.test(text) ? "timeout"
    : /does not parse/.test(text) ? "bad-json"
    : "error";
  return `${id}: ${reason}`;
}

/** Entries that record a provider never tried, rather than one that failed. */
const NOT_TRIED = /not set|Skipped|Not permitted|cooling down/;

/**
 * The providers that were tried and failed, labelled with the reason.
 * @param {Record<string, string>} debugErrors
 * @returns {string[]}
 */
export function failedProviderLabels(debugErrors) {
  return Object.entries(debugErrors)
    .filter(([, message]) => !NOT_TRIED.test(String(message)))
    .map(([id, message]) => failureLabel(id, message));
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function isDeadKeyError(message) {
  const status = statusFromProviderError(message);
  return status !== null && DEAD_KEY_STATUSES.includes(status);
}

/** Per-instance memory of providers to skip for now: a refused key, or a
 *  provider cooling down after one of the errors above. */
export function createDeadKeyRegistry(now = () => Date.now()) {
  /** @type {Map<string, number>} */
  const until = new Map();
  return {
    /** @param {string} id */
    isDead(id) {
      const t = until.get(id);
      if (t === undefined) return false;
      if (now() >= t) {
        until.delete(id);
        return false;
      }
      return true;
    },
    /**
     * @param {string} id
     * @param {number} [ms]
     */
    markDead(id, ms = DEAD_KEY_COOLDOWN_MS) {
      // A shorter cooldown never cuts a longer one short.
      until.set(id, Math.max(until.get(id) ?? 0, now() + ms));
    },
    /**
     * Cool a provider down for as long as this error calls for.
     * @param {string} id
     * @param {string} message
     * @returns {number} the cooldown applied, 0 for none
     */
    coolDown(id, message) {
      const ms = cooldownForProviderError(message);
      if (ms > 0) this.markDead(id, ms);
      return ms;
    },
  };
}

/* Radox AI's terms require users to be 16 or older (WAITINGONLEDGER 6.9).
   Until that is decided, its route is closed for anyone under 16 — and for
   anyone whose age cannot be read, since the date of birth is self-declared
   at sign-up and a missing one is the case to fail closed on. */
export const RADOX_MIN_AGE = 16;

/**
 * Whole years between a "YYYY-MM-DD" date of birth and `today`, or null when
 * the value is missing or not a real date. Reads the fields out of the string
 * rather than `new Date(dob)`, for the same reason as webapp/src/api/auth.ts:
 * UTC midnight against a local `today` moves the birthday a day.
 * @param {unknown} dob
 * @param {Date} [today]
 * @returns {number | null}
 */
export function ageFromDob(dob, today = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob ?? ""));
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  let age = today.getFullYear() - year;
  const monthDiff = today.getMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < day)) age--;
  return age;
}

/**
 * Whether this account may be sent to the Radox route.
 * @param {unknown} dob
 * @param {Date} [today]
 * @returns {boolean}
 */
export function radoxPermittedForAge(dob, today = new Date()) {
  const age = ageFromDob(dob, today);
  return age !== null && age >= RADOX_MIN_AGE;
}
