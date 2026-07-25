import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* js/ai.js imports the Supabase client from a CDN URL, which Node can't
   resolve, so the parser is sliced out of the real source and evaluated —
   same approach as tests/safety.test.js, and for the same reason: a copy of
   the function in the test would drift from the shipped one. */
const SOURCE = readFileSync(new URL('../js/ai.js', import.meta.url), 'utf8');

const START = '  _extractQuizJSON(text) {';
const startIdx = SOURCE.indexOf(START);

test('the quiz parser is still where the test expects it', () => {
  assert.ok(startIdx !== -1, '_extractQuizJSON not found in js/ai.js');
});

// Take the method through to its closing brace at the same indent level.
const rest = SOURCE.slice(startIdx);
const endIdx = rest.indexOf('\n  },');
const method = rest.slice(0, endIdx + 4);

const context = { _extractQuizJSON: null };
vm.createContext(context);
vm.runInContext(
  `const holder = { ${method} };\nthis._extractQuizJSON = holder._extractQuizJSON.bind(holder);`,
  context,
);
const { _extractQuizJSON } = context;

const QUESTION = {
  question: 'What is the capital of France?',
  choices: ['Paris', 'Lyon', 'Nice', 'Marseille'],
  correctIndex: 0,
  topic: 'Geography',
  feedback: 'Paris has been the capital since 987.',
};

test('accepts the shapes providers actually return', async (t) => {
  await t.test('a bare array (Gemini, and anything pre-JSON-mode)', () => {
    const out = _extractQuizJSON(JSON.stringify([QUESTION]));
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].correctIndex, 0);
  });

  // response_format:json_object only permits an object at the top level, so
  // every provider using JSON mode wraps the array.
  await t.test('an object wrapper from JSON mode', () => {
    const out = _extractQuizJSON(JSON.stringify({ questions: [QUESTION] }));
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].question, QUESTION.question);
  });

  // The last-ditch fallback slices between the first "[" and the last "]",
  // which lands mid-string when an earlier field happens to contain a bracket.
  // Unwrapping the parsed object is what actually rescues this one.
  await t.test('an object wrapper whose other fields contain brackets', () => {
    const payload = JSON.stringify({
      title: 'Chemistry Quiz [Draft]',
      questions: [QUESTION],
    });
    const out = _extractQuizJSON(payload);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].correctIndex, 0);
  });

  await t.test('other common wrapper keys', () => {
    for (const key of ['quiz', 'items', 'data']) {
      const out = _extractQuizJSON(JSON.stringify({ [key]: [QUESTION] }));
      assert.strictEqual(out.length, 1, `wrapper key "${key}" should be unwrapped`);
    }
  });

  await t.test('wrapped in markdown code fences', () => {
    const out = _extractQuizJSON('```json\n' + JSON.stringify({ questions: [QUESTION] }) + '\n```');
    assert.strictEqual(out.length, 1);
  });

  await t.test('with prose around it', () => {
    const out = _extractQuizJSON(`Here is your quiz!\n${JSON.stringify([QUESTION])}\nGood luck!`);
    assert.strictEqual(out.length, 1);
  });

  await t.test('with a trailing comma', () => {
    const out = _extractQuizJSON(`[${JSON.stringify(QUESTION)},]`);
    assert.strictEqual(out.length, 1);
  });
});

test('rejects payloads that would grade every answer wrong', async (t) => {
  // The quiz view grades with `i === q.correctIndex`. A model that emits
  // `answer` instead produces a quiz where even the right option is marked
  // wrong, with no visible error — so these must not be accepted.
  // The parser runs in a separate realm, so its arrays aren't prototype-equal
  // to this one's — length is the assertion that matters here anyway.
  const rejects = (payload) => assert.strictEqual(_extractQuizJSON(payload).length, 0);

  await t.test('missing correctIndex', () => {
    const bad = { ...QUESTION };
    delete bad.correctIndex;
    rejects(JSON.stringify({ questions: [bad] }));
  });

  await t.test('correctIndex out of range', () => {
    rejects(JSON.stringify([{ ...QUESTION, correctIndex: 9 }]));
  });

  await t.test('correctIndex not an integer', () => {
    rejects(JSON.stringify([{ ...QUESTION, correctIndex: '0' }]));
  });

  await t.test('fewer than two choices', () => {
    rejects(JSON.stringify([{ ...QUESTION, choices: ['Paris'], correctIndex: 0 }]));
  });
});

test('returns an empty array for unusable input', () => {
  const empty = (payload) => assert.strictEqual(_extractQuizJSON(payload).length, 0);
  empty('');
  empty(null);
  empty('I cannot help with that topic.');
  // The refusal path the content policy asks for.
  empty('[]');
  empty('{"questions":[]}');
});
