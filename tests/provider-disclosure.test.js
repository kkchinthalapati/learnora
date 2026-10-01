import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  DISCLOSED_PROVIDER_IDS,
  createDeadKeyRegistry,
  isDeadKeyError,
  permittedProviderIds,
} from '../supabase/functions/_shared/providerPolicy.js';

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
