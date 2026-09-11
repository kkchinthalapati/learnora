import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* Same approach as safety.test.js: the provider chain lives in a Deno edge
   function that can't be imported here, so the real source is sliced out of
   index.ts and evaluated rather than copied. A rename or a syntax slip fails
   these tests instead of silently skipping them.

   What's being guarded is the class of bug this chain shipped with: two of
   the three providers ahead of every free one could not have worked —
   Cloudflare was pointed at a path Workers AI doesn't serve, and Anthropic
   was sent OpenAI-shaped requests its API rejects. Both failed silently into
   the debug log, so the only visible symptom was the chain being slower and
   falling through further than it should have. */

const SOURCE = readFileSync(
  new URL('../supabase/functions/learnora-ai/index.ts', import.meta.url),
  'utf8',
);

function slice(startMarker, endMarker) {
  const start = SOURCE.indexOf(startMarker);
  const end = SOURCE.indexOf(endMarker, start + startMarker.length);
  assert.ok(start !== -1, `${startMarker} not found in the edge function`);
  assert.ok(end > start, `${endMarker} not found after ${startMarker}`);
  return SOURCE.slice(start, end);
}

/* The two regions under test, taken separately so neither drags in the
   unrelated code that sits between them. */
const TABLE_SRC = slice('const BUILTIN_PROVIDERS', '/* Structured JSON takes');
const CALLER_SRC = slice('/* Response readers', 'function safetyRefusalResponse');

/* TypeScript the snippets carry, stripped so plain `vm` can run them. Each
   entry must match, so an annotation that changes shape fails loudly here
   rather than quietly leaving TS syntax in the evaluated source. */
const TS_STRIPS = [
  [/const BUILTIN_PROVIDERS: AIProvider\[\]/, 'const BUILTIN_PROVIDERS'],
  [/function parseExtraProviders\(\): AIProvider\[\]/, 'function parseExtraProviders()'],
  [/function providerChain\(\): AIProvider\[\]/, 'function providerChain()'],
  [/function resolveProviderUrl\(provider: AIProvider\): string \| null/, 'function resolveProviderUrl(provider)'],
  [/let parsed: unknown;/, 'let parsed;'],
  [/const out: AIProvider\[\] = \[\];/, 'const out = [];'],
  [/for \(const entry of parsed as any\[\]\)/, 'for (const entry of parsed)'],
  [/function extractContent\(data: any, dialect: ProviderDialect\): string \| null/, 'function extractContent(data, dialect)'],
  [/function buildProviderRequest\(\s*provider: AIProvider,\s*model: string,\s*key: string,\s*opts: \{[^}]*\},\s*\): \{[^}]*\} \{/, 'function buildProviderRequest(provider, model, key, opts) {'],
  [/async function callProvider\(\s*provider: AIProvider,\s*opts: \{[\s\S]*?\n  \},\s*\): Promise<string> \{/, 'async function callProvider(provider, opts) {'],
  [/const priorTurns = \(opts\.history \|\| \[\]\)\.slice\(0, -1\)\.map\(\(m: any\) => \(\{/, 'const priorTurns = (opts.history || []).slice(0, -1).map((m) => ({'],
  [/\.filter\(\(b: any\) => b\?\.type === "text" && typeof b\.text === "string"\)/, '.filter((b) => b?.type === "text" && typeof b.text === "string")'],
  [/\.map\(\(b: any\) => b\.text\)/, '.map((b) => b.text)'],
  [/const body: Record<string, unknown> = \{/, 'const body = {'],
  [/const dialect: ProviderDialect = /, 'const dialect = '],
];

function stripTypes(source) {
  let out = source;
  for (const [pattern, replacement] of TS_STRIPS) {
    assert.match(out, pattern, `TypeScript strip no longer matches: ${pattern}`);
    out = out.replace(pattern, replacement);
  }
  assert.ok(
    !/:\s*(?:AIProvider|ProviderDialect|Record<|Promise<|unknown\b)/.test(out),
    'an unstripped TypeScript annotation is left in the evaluated snippet',
  );
  return out;
}

const SNIPPET = stripTypes(`${TABLE_SRC}\n${CALLER_SRC}`);

function load(env = {}) {
  const context = {
    Deno: { env: { get: (k) => env[k] } },
    console: { error() {}, warn() {}, log() {} },
    Number,
    JSON,
    Array,
    String,
    encodeURIComponent,
    module: { exports: {} },
  };
  vm.createContext(context);
  vm.runInContext(
    `const isJsonMode = (mode) => mode === 'quiz' || mode === 'plan';
     const timeoutFor = () => 1000;
     ${SNIPPET}
     module.exports = { BUILTIN_PROVIDERS, providerChain, resolveProviderUrl,
                        parseExtraProviders, extractContent, buildProviderRequest };`,
    context,
  );
  return context.module.exports;
}

/* Values built inside the `vm` realm have that realm's Array/Object
   prototypes, so deepStrictEqual rejects them against a host-realm literal
   even when the contents match. Round-tripping through JSON re-creates them
   here before any deep comparison. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('the provider chain source is still where the tests expect it', () => {
  const api = load();
  assert.ok(Array.isArray(api.BUILTIN_PROVIDERS));
  assert.ok(api.BUILTIN_PROVIDERS.length > 0);
});

/* ---- Ordering -------------------------------------------------------- */

test('free providers are tried before ones that cost money', () => {
  const { BUILTIN_PROVIDERS } = load();
  const rank = { free: 0, credits: 1, paid: 2 };
  const ranks = plain(BUILTIN_PROVIDERS.map((p) => rank[p.cost]));
  for (const [i, r] of ranks.entries()) {
    assert.ok(
      typeof r === 'number',
      `${BUILTIN_PROVIDERS[i].id} has no recognised cost tier`,
    );
  }
  const sorted = [...ranks].sort((a, b) => a - b);
  assert.deepStrictEqual(
    ranks,
    sorted,
    `chain order must be free → credits → paid, got: ${BUILTIN_PROVIDERS.map((p) => `${p.id}(${p.cost})`).join(', ')}`,
  );
});

test('every provider has a distinct id and its own key secret', () => {
  const { BUILTIN_PROVIDERS } = load();
  const ids = BUILTIN_PROVIDERS.map((p) => p.id);
  const keys = BUILTIN_PROVIDERS.map((p) => p.keyEnv);
  assert.strictEqual(new Set(ids).size, ids.length, 'duplicate provider id');
  assert.strictEqual(new Set(keys).size, keys.length, 'two providers share a key secret');
});

test('every provider endpoint is https and carries no unfilled placeholder but {account}', () => {
  const { BUILTIN_PROVIDERS } = load();
  for (const p of BUILTIN_PROVIDERS) {
    assert.match(p.url, /^https:\/\//, `${p.id} must be https`);
    const leftover = p.url.replace('{account}', '').match(/\{[a-z_]+\}/i);
    assert.strictEqual(leftover, null, `${p.id} has an unresolved placeholder: ${leftover}`);
  }
});

/* ---- The two entries that were dead on arrival ----------------------- */

test('Cloudflare points at the OpenAI-compatible path, not /accounts/me/ai/run', () => {
  const { BUILTIN_PROVIDERS } = load();
  const cf = BUILTIN_PROVIDERS.find((p) => p.id === 'cloudflare');
  assert.ok(cf, 'cloudflare provider missing');
  assert.ok(
    !cf.url.includes('/accounts/me/'),
    'Workers AI has no `me` account alias — the endpoint must be account-scoped',
  );
  assert.ok(
    cf.url.includes('/ai/v1/chat/completions'),
    'must use the OpenAI-compatible path, not /ai/run/',
  );
  assert.strictEqual(cf.accountEnv, 'CLOUDFLARE_ACCOUNT_ID');
  assert.match(
    cf.defaultModel,
    /^@cf\//,
    'every Workers AI model id carries the @cf/ prefix',
  );
});

test('Anthropic uses its own dialect rather than the OpenAI one', () => {
  const { BUILTIN_PROVIDERS } = load();
  const anthropic = BUILTIN_PROVIDERS.find((p) => p.url.includes('api.anthropic.com'));
  assert.ok(anthropic, 'anthropic provider missing');
  assert.strictEqual(
    anthropic.dialect,
    'anthropic',
    '/v1/messages does not accept an OpenAI chat-completions request',
  );
});

/* ---- Account-scoped URLs -------------------------------------------- */

test('a provider needing an account id is skipped when it is not set', () => {
  const { BUILTIN_PROVIDERS, resolveProviderUrl } = load({ CLOUDFLARE_API_TOKEN: 'tok' });
  const cf = BUILTIN_PROVIDERS.find((p) => p.id === 'cloudflare');
  assert.strictEqual(
    resolveProviderUrl(cf),
    null,
    'calling the URL with {account} still in the path is a guaranteed 404',
  );
});

test('the account id is substituted when it is set', () => {
  const api = load({ CLOUDFLARE_ACCOUNT_ID: 'abc123' });
  const cf = api.BUILTIN_PROVIDERS.find((p) => p.id === 'cloudflare');
  const url = api.resolveProviderUrl(cf);
  assert.ok(url.includes('/accounts/abc123/ai/v1/chat/completions'), url);
  assert.ok(!url.includes('{account}'));
});

test('providers with no placeholder resolve to their URL unchanged', () => {
  const api = load();
  for (const p of api.BUILTIN_PROVIDERS.filter((x) => !x.accountEnv)) {
    assert.strictEqual(api.resolveProviderUrl(p), p.url);
  }
});

/* ---- AI_EXTRA_PROVIDERS --------------------------------------------- */

test('extra providers are appended after the built-ins, never ahead of them', () => {
  const api = load({
    AI_EXTRA_PROVIDERS: JSON.stringify([
      { id: 'together', keyEnv: 'TOGETHER_API_KEY', defaultModel: 'x', url: 'https://api.together.xyz/v1/chat/completions' },
    ]),
  });
  const chain = api.providerChain();
  assert.strictEqual(chain.length, api.BUILTIN_PROVIDERS.length + 1);
  assert.strictEqual(chain[chain.length - 1].id, 'together');
});

test('an extra provider gets a derived model secret name when it omits one', () => {
  const api = load({
    AI_EXTRA_PROVIDERS: JSON.stringify([
      { id: 'together-ai', keyEnv: 'TOGETHER_API_KEY', defaultModel: 'x', url: 'https://example.com/v1/chat/completions' },
    ]),
  });
  assert.strictEqual(api.parseExtraProviders()[0].modelEnv, 'TOGETHER_AI_MODEL');
});

test('malformed AI_EXTRA_PROVIDERS is ignored rather than taking the AI offline', () => {
  for (const raw of ['not json', '{"id":"x"}', '[]', '   ']) {
    const api = load({ AI_EXTRA_PROVIDERS: raw });
    assert.deepStrictEqual(plain(api.parseExtraProviders()), [], `raw: ${raw}`);
    assert.strictEqual(api.providerChain().length, api.BUILTIN_PROVIDERS.length);
  }
});

test('extra provider entries missing required fields are dropped individually', () => {
  const api = load({
    AI_EXTRA_PROVIDERS: JSON.stringify([
      { id: 'nourl', keyEnv: 'K', defaultModel: 'm' },
      { keyEnv: 'K2', defaultModel: 'm', url: 'https://example.com' },
      { id: 'good', keyEnv: 'K3', defaultModel: 'm', url: 'https://example.com' },
    ]),
  });
  const extra = api.parseExtraProviders();
  assert.deepStrictEqual(plain(extra.map((p) => p.id)), ['good']);
});

test('a non-https extra provider is refused', () => {
  const api = load({
    AI_EXTRA_PROVIDERS: JSON.stringify([
      { id: 'plain', keyEnv: 'K', defaultModel: 'm', url: 'http://example.com/v1/chat/completions' },
    ]),
  });
  assert.deepStrictEqual(
    plain(api.parseExtraProviders()),
    [],
    'student study material must not be sent over plaintext',
  );
});

/* ---- Response reading ------------------------------------------------ */

test('OpenAI-shaped and Anthropic-shaped replies are both read correctly', () => {
  const { extractContent } = load();
  assert.strictEqual(
    extractContent({ choices: [{ message: { content: 'hello' } }] }, 'openai'),
    'hello',
  );
  assert.strictEqual(
    extractContent({ content: [{ type: 'text', text: 'hello' }] }, 'anthropic'),
    'hello',
  );
  assert.strictEqual(
    extractContent({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }, 'anthropic'),
    'ab',
  );
});

test('an empty completion reads as null in either dialect, so the chain moves on', () => {
  const { extractContent } = load();
  assert.strictEqual(extractContent({ choices: [{ message: { content: '  ' } }] }, 'openai'), null);
  assert.strictEqual(extractContent({}, 'openai'), null);
  assert.strictEqual(extractContent({ content: [] }, 'anthropic'), null);
  assert.strictEqual(extractContent({ content: [{ type: 'thinking' }] }, 'anthropic'), null);
  assert.strictEqual(extractContent({}, 'anthropic'), null);
});

/* ---- Request building ------------------------------------------------ */

const REQ = {
  systemInstruction: 'be a tutor',
  history: [{ role: 'user', content: 'earlier' }, { role: 'user', content: 'ignored' }],
  userContent: 'now',
  wantsJson: false,
};

test('OpenAI-dialect requests authenticate with a bearer token', () => {
  const api = load();
  const groq = api.BUILTIN_PROVIDERS.find((p) => p.id === 'groq');
  const { headers, body } = api.buildProviderRequest(groq, 'm', 'secret', REQ);
  assert.strictEqual(headers.Authorization, 'Bearer secret');
  assert.strictEqual(body.messages[0].role, 'system');
  assert.strictEqual(body.messages[0].content, 'be a tutor');
});

test('Anthropic requests use x-api-key, a version header, and a top-level system field', () => {
  const api = load();
  const anthropic = api.BUILTIN_PROVIDERS.find((p) => p.dialect === 'anthropic');
  const { headers, body } = api.buildProviderRequest(anthropic, 'm', 'secret', REQ);
  assert.strictEqual(headers['x-api-key'], 'secret');
  assert.ok(!headers.Authorization, 'a bearer token is what made this a 401');
  assert.match(headers['anthropic-version'], /^\d{4}-\d{2}-\d{2}$/);
  assert.strictEqual(body.system, 'be a tutor');
  assert.ok(body.max_tokens > 0, '/v1/messages 400s without max_tokens');
  assert.ok(
    body.messages.every((m) => m.role !== 'system'),
    'the system prompt is a field here, not a message',
  );
});

test('the last history turn is dropped — it is resent as userContent', () => {
  const api = load();
  const groq = api.BUILTIN_PROVIDERS.find((p) => p.id === 'groq');
  const { body } = api.buildProviderRequest(groq, 'm', 'k', REQ);
  const contents = body.messages.map((m) => m.content);
  assert.ok(contents.includes('earlier'));
  assert.ok(!contents.includes('ignored'));
  assert.strictEqual(contents[contents.length - 1], 'now');
});

test('JSON mode is only requested from providers that support it', () => {
  const api = load();
  const supports = api.BUILTIN_PROVIDERS.find((p) => p.jsonMode && p.dialect !== 'anthropic');
  const doesNot = api.BUILTIN_PROVIDERS.find((p) => !p.jsonMode && p.dialect !== 'anthropic');
  const withJson = { ...REQ, wantsJson: true };
  assert.deepStrictEqual(
    plain(api.buildProviderRequest(supports, 'm', 'k', withJson).body.response_format),
    { type: 'json_object' },
  );
  assert.strictEqual(
    api.buildProviderRequest(doesNot, 'm', 'k', withJson).body.response_format,
    undefined,
    'sending response_format to a provider that rejects it fails the whole call',
  );
});
