import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  DEAD_KEY_COOLDOWN_MS,
  DISCLOSED_PROVIDER_IDS,
  EMPTY_REPLY_COOLDOWN_MS,
  OVERLOAD_COOLDOWN_MS,
  RATE_LIMIT_COOLDOWN_MS,
  cooldownForProviderError,
  createDeadKeyRegistry,
  failedProviderLabels,
  isDeadKeyError,
  permittedProviderIds,
  retryHintMs,
} from '../supabase/functions/_shared/providerPolicy.js';

/* Error texts as production logged them between 2026-10-19 and 10-30. */
const GEMINI_QUOTA =
  '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent: [429 Too Many Requests] You exceeded your current quota, please check your plan and billing details.';
const GEMINI_BUSY =
  '[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent: [503 Service Unavailable] This model is currently experiencing high demand.';
const GROQ_TPM =
  'groq returned 429: {"message":"Rate limit reached for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7770, Requested 4136. Please try again in 29.295s.","type":"tokens","code":"rate_limit_exceeded"}';
const GROQ_TOO_LARGE =
  'groq returned 413: {"message":"Request too large for model `openai/gpt-oss-120b` in organization `org_x` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Requested 9751, please reduce your message size and try again."}';
const OPENAI_NO_CREDIT =
  'openai returned 429: {"message":"You have no credits remaining. Add credits to continue using the API"}';
const ANTHROPIC_NO_CREDIT =
  'anthropic returned 400: {"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}';
const GROQ_PROSE =
  'groq returned 400: {"message":"Failed to generate JSON. Please adjust your prompt.","code":"json_validate_failed"}';

/* Students are told which companies receive their study data in three
   places (sign-up consent, Settings ▸ Privacy, the privacy policy), all
   rendered from webapp/src/lib/aiProviders.ts. The edge function may only
   call providers in _shared/providerPolicy.js. These must be the same list,
   or a student has consented to something other than what happens. */

function read(rel) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

test('the providers students are told about are exactly the ones the chain may call', () => {
  const client = read('../webapp/src/lib/aiProviders.ts');
  const ids = [...client.matchAll(/\bid:\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual([...ids].sort(), [...DISCLOSED_PROVIDER_IDS].sort());
});

test('every built-in provider in the edge function is disclosed or excluded on purpose', () => {
  const source = read('../supabase/functions/learnora-ai/index.ts');
  const builtins = [...source.matchAll(/^\s{4}id:\s*"([a-z-]+)"/gm)].map((m) => m[1]);
  const undisclosed = builtins.filter((id) => !DISCLOSED_PROVIDER_IDS.includes(id));
  // Mistral stays in the source for operators who disclose it, but is never called by default.
  assert.deepStrictEqual(undisclosed, ['mistral']);
});

test('the allowlist secret can narrow the chain but never widen it', () => {
  assert.deepStrictEqual([...permittedProviderIds('')].sort(), [...DISCLOSED_PROVIDER_IDS].sort());
  assert.deepStrictEqual([...permittedProviderIds('gemini, anthropic')], ['gemini', 'anthropic']);
  assert.deepStrictEqual([...permittedProviderIds('mistral,gemini')], ['gemini']);
});

test('a refused key is skipped for a while; a busy provider is not', () => {
  assert.strictEqual(isDeadKeyError('cerebras returned 402: {"message":"Payment required"}'), true);
  assert.strictEqual(isDeadKeyError('groq returned 429: rate limit'), false);
  assert.strictEqual(isDeadKeyError('github-models returned an empty completion.'), false);
  let now = 0;
  const reg = createDeadKeyRegistry(() => now);
  reg.markDead('cerebras');
  assert.strictEqual(reg.isDead('cerebras'), true);
  now += 16 * 60_000;
  assert.strictEqual(reg.isDead('cerebras'), false);
});

test('the SDK wording of a refused Gemini key counts as a dead key', () => {
  assert.strictEqual(isDeadKeyError('Error fetching from …: [403 Forbidden] Permission denied'), true);
  assert.strictEqual(isDeadKeyError(GEMINI_QUOTA), false);
});

test('a provider asking for a wait is skipped for that long', () => {
  assert.strictEqual(retryHintMs(GROQ_TPM), 29_295);
  assert.strictEqual(retryHintMs('Please retry in 41s.'), 41_000);
  assert.strictEqual(retryHintMs('{"retryDelay":"33s"}'), 33_000);
  assert.strictEqual(retryHintMs(GROQ_TOO_LARGE), null);
  assert.strictEqual(cooldownForProviderError(GROQ_TPM), 29_295);
});

test('each production failure cools a provider down for the right length of time', () => {
  assert.strictEqual(cooldownForProviderError(GEMINI_QUOTA), DEAD_KEY_COOLDOWN_MS);
  assert.strictEqual(cooldownForProviderError(OPENAI_NO_CREDIT), DEAD_KEY_COOLDOWN_MS);
  assert.strictEqual(cooldownForProviderError(ANTHROPIC_NO_CREDIT), DEAD_KEY_COOLDOWN_MS);
  assert.strictEqual(cooldownForProviderError('groq returned 429: rate limit'), RATE_LIMIT_COOLDOWN_MS);
  assert.strictEqual(cooldownForProviderError(GEMINI_BUSY), OVERLOAD_COOLDOWN_MS);
  assert.strictEqual(cooldownForProviderError('github-models returned an empty completion.'), EMPTY_REPLY_COOLDOWN_MS);
  // About this request, not the provider: the next, smaller request may fit.
  assert.strictEqual(cooldownForProviderError(GROQ_TOO_LARGE), 0);
  assert.strictEqual(cooldownForProviderError(GROQ_PROSE), 0);
  assert.strictEqual(cooldownForProviderError('quiz-check timed out'), 0);
  // A hint never stretches a cooldown past the dead-key length.
  assert.strictEqual(cooldownForProviderError('groq returned 429: try again in 7200s'), DEAD_KEY_COOLDOWN_MS);
});

test('coolDown keeps the longer of two cooldowns', () => {
  let now = 0;
  const reg = createDeadKeyRegistry(() => now);
  assert.strictEqual(reg.coolDown('groq', GROQ_TOO_LARGE), 0);
  assert.strictEqual(reg.isDead('groq'), false);
  reg.coolDown('openai', OPENAI_NO_CREDIT);
  reg.coolDown('openai', 'openai returned 503: busy');
  now += 60_000;
  assert.strictEqual(reg.isDead('openai'), true);
  reg.coolDown('groq', GROQ_TPM);
  now += 30_000;
  assert.strictEqual(reg.isDead('groq'), false);
});

test('failed providers are logged with the reason, and skipped ones are left out', () => {
  assert.deepStrictEqual(
    failedProviderLabels({
      'gemini (gemini-3.6-flash)': GEMINI_QUOTA,
      groq: GROQ_TPM,
      'github-models': 'github-models returned an empty completion.',
      openrouter: 'openrouter returned JSON that does not parse',
      cloudflare: 'CLOUDFLARE_API_TOKEN is not set in Supabase.',
      nvidia: 'Skipped — request budget exhausted.',
      'gemini (gemini-x)': 'Skipped — cooling down after a quota, rate-limit or overload error.',
    }),
    ['gemini (gemini-3.6-flash): 429', 'groq: 429', 'github-models: empty', 'openrouter: bad-json'],
  );
});
