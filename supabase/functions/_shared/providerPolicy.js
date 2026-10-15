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
  const match = /returned (\d{3})\b/.exec(String(message ?? ""));
  return match ? Number(match[1]) : null;
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function isDeadKeyError(message) {
  const status = statusFromProviderError(message);
  return status !== null && DEAD_KEY_STATUSES.includes(status);
}

/** Per-instance memory of providers whose key was refused. */
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
    /** @param {string} id */
    markDead(id) {
      until.set(id, now() + DEAD_KEY_COOLDOWN_MS);
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
