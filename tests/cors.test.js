import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* A hard-coded Allow-Origin that no longer matched the deployed domain took
   the entire AI offline — every browser call failed with a bare
   "Failed to fetch", because Allow-Origin is compared as an exact string and
   the mismatch is rejected before the response is ever exposed. These tests
   pin the origin logic so that can't silently happen again.

   The real source is sliced out of the edge function rather than copied, so
   the test can't drift from what ships. */
const SOURCE = readFileSync(
  new URL('../supabase/functions/learnora-ai/index.ts', import.meta.url),
  'utf8',
);

const START = 'const DEFAULT_ALLOWED_ORIGINS';
const END = 'function decodeBase64UTF8';
const startIdx = SOURCE.indexOf(START);
const endIdx = SOURCE.indexOf(END);

test('the CORS helpers are still where the tests expect them', () => {
  assert.ok(startIdx !== -1, 'DEFAULT_ALLOWED_ORIGINS not found');
  assert.ok(endIdx > startIdx, 'corsHeadersFor not found after it');
});

const snippet = SOURCE.slice(startIdx, endIdx)
  .replace('function allowedOrigins(): string[]', 'function allowedOrigins()')
  .replace(
    'function corsHeadersFor(req: Request): Record<string, string>',
    'function corsHeadersFor(req)',
  );

function load(env = {}) {
  const context = {
    Deno: { env: { get: (k) => env[k] } },
    corsHeadersFor: null,
  };
  vm.createContext(context);
  vm.runInContext(`${snippet}; this.corsHeadersFor = corsHeadersFor;`, context);
  return context.corsHeadersFor;
}

// Minimal stand-in for the Request the handler receives.
const reqFrom = (origin) => ({
  headers: { get: (h) => (h === 'Origin' && origin ? origin : null) },
});

const originFor = (fn, origin) => fn(reqFrom(origin))['Access-Control-Allow-Origin'];

test('echoes back origins that are allowed', async (t) => {
  const cors = load();

  // The domain production actually serves from — the one the old hard-coded
  // value missed.
  await t.test('the live Vercel app', () => {
    assert.strictEqual(
      originFor(cors, 'https://learnora-app.vercel.app'),
      'https://learnora-app.vercel.app',
    );
  });

  await t.test('the older study-planner deployment', () => {
    assert.strictEqual(
      originFor(cors, 'https://study-planner-delta-six.vercel.app'),
      'https://study-planner-delta-six.vercel.app',
    );
  });

  // Exact-string matching means the apex and www forms are different origins
  // and both have to be listed.
  await t.test('apex and www are matched separately', () => {
    assert.strictEqual(originFor(cors, 'https://learnora.app'), 'https://learnora.app');
    assert.strictEqual(originFor(cors, 'https://www.learnora.app'), 'https://www.learnora.app');
  });

  await t.test('localhost, for running the app against the live function', () => {
    assert.strictEqual(originFor(cors, 'http://localhost:3000'), 'http://localhost:3000');
  });
});

test('matches per-build Vercel preview subdomains', async (t) => {
  const cors = load();

  await t.test('a preview deploy of this project', () => {
    const origin = 'https://learnora-app-git-fix-something-kk.vercel.app';
    assert.strictEqual(originFor(cors, origin), origin);
  });

  await t.test('an unrelated vercel.app project is not matched', () => {
    const origin = 'https://someone-elses-thing.vercel.app';
    assert.notStrictEqual(
      originFor(cors, origin),
      origin,
      'the preview pattern must not open the function to every vercel.app site',
    );
  });
});

test('does not echo arbitrary origins', async (t) => {
  const cors = load();

  for (const origin of [
    'https://evil.example.com',
    'https://learnora.app.evil.com',
    'http://learnora-app.vercel.app', // http, not https
    '',
  ]) {
    await t.test(origin || '(no Origin header)', () => {
      assert.notStrictEqual(
        originFor(cors, origin),
        origin,
        `"${origin}" must not be echoed back as allowed`,
      );
    });
  }
});

test('ALLOWED_ORIGINS overrides the defaults', async (t) => {
  const cors = load({ ALLOWED_ORIGINS: 'https://custom.example.com, https://other.example.com' });

  await t.test('a configured origin is echoed', () => {
    assert.strictEqual(
      originFor(cors, 'https://custom.example.com'),
      'https://custom.example.com',
    );
    // Whitespace around the comma is tolerated.
    assert.strictEqual(
      originFor(cors, 'https://other.example.com'),
      'https://other.example.com',
    );
  });

  await t.test('a default no longer applies once overridden', () => {
    assert.notStrictEqual(originFor(cors, 'https://learnora.app'), 'https://learnora.app');
  });
});

test('always sets Vary: Origin so responses are not cross-cached', () => {
  const cors = load();
  const headers = cors(reqFrom('https://learnora-app.vercel.app'));
  assert.strictEqual(headers['Vary'], 'Origin');
  assert.match(headers['Access-Control-Allow-Headers'], /authorization/);
  assert.match(headers['Access-Control-Allow-Methods'], /POST/);
});
