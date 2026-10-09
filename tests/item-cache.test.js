import test from 'node:test';
import assert from 'node:assert';
import { cacheableRef, requestHash } from '../supabase/functions/_shared/itemCache.js';

const REF = 'bank:0f8fad5b-d9cb-469f-a165-70867728950e';

test('only practice-bank refs can be cached', () => {
  assert.strictEqual(cacheableRef({ ref: REF }), REF);
  assert.strictEqual(cacheableRef({ ref: 'gen:abc' }), null);
  assert.strictEqual(cacheableRef({ ref: 'quiz:1:abc' }), null);
  assert.strictEqual(cacheableRef({ ref: `${REF}; drop table` }), null);
  assert.strictEqual(cacheableRef(null), null);
  assert.strictEqual(cacheableRef('bank:x'), null);
});

test('the key is the whole request: any change to what the model sees is a different entry', async () => {
  const base = { mode: 'quiz', tool: 'chat', context: null, history: [{ role: 'user', content: 'hints for Q' }] };
  const same = await requestHash({ ...base, history: [{ role: 'user', content: 'hints for Q' }] });
  assert.strictEqual(await requestHash(base), same);
  assert.match(same, /^[0-9a-f]{64}$/);
  assert.notStrictEqual(await requestHash({ ...base, history: [{ role: 'user', content: 'hints for Q!' }] }), same);
  assert.notStrictEqual(await requestHash({ ...base, tool: 'debugger' }), same);
  assert.notStrictEqual(await requestHash({ ...base, context: 'level: GCSE' }), same);
});
