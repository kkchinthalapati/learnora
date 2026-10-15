import test from 'node:test';
import assert from 'node:assert';
import { ageFromDob, radoxPermittedForAge } from '../supabase/functions/_shared/providerPolicy.js';

/* Radox AI's terms need users to be 16 or older (WAITINGONLEDGER 6.9). The
   route stays closed for under-16s, and for any account whose date of birth
   cannot be read. */

const today = new Date(2026, 9, 15); // 15 October 2026, local time

test('age is counted in whole years, and turns over on the birthday', () => {
  assert.strictEqual(ageFromDob('2010-10-15', today), 16);
  assert.strictEqual(ageFromDob('2010-10-16', today), 15);
  assert.strictEqual(ageFromDob('2010-01-01', today), 16);
});

test('a malformed or impossible date of birth has no age', () => {
  assert.strictEqual(ageFromDob(undefined, today), null);
  assert.strictEqual(ageFromDob('', today), null);
  assert.strictEqual(ageFromDob('15/10/2010', today), null);
  assert.strictEqual(ageFromDob('2010-02-30', today), null);
  assert.strictEqual(ageFromDob('2010-13-01', today), null);
});

test('Radox is open from 16, and closed below 16 or when unknown', () => {
  assert.strictEqual(radoxPermittedForAge('2010-10-15', today), true);
  assert.strictEqual(radoxPermittedForAge('2010-10-16', today), false);
  assert.strictEqual(radoxPermittedForAge('2013-08-30', today), false);
  assert.strictEqual(radoxPermittedForAge(undefined, today), false);
  assert.strictEqual(radoxPermittedForAge('not a date', today), false);
});
