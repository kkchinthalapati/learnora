import test from 'node:test';
import assert from 'node:assert/strict';
import { safeReturnUrl } from '../supabase/functions/_shared/returnUrl.js';

const ORIGINS = ['https://learnora-app.vercel.app', 'https://learnora.app'];
const FALLBACK = 'https://learnora-app.vercel.app/app/settings';

test('a return URL on one of our origins is kept', () => {
  assert.equal(
    safeReturnUrl('https://learnora-app.vercel.app/app/settings?billing=done', ORIGINS),
    'https://learnora-app.vercel.app/app/settings?billing=done',
  );
  assert.equal(safeReturnUrl('http://localhost:5173/app/', ORIGINS), 'http://localhost:5173/app/');
});

/* Audit 2026-11-08: any *.vercel.app passed, and anyone can deploy one. */
test('someone else\'s vercel.app site falls back to ours', () => {
  assert.equal(safeReturnUrl('https://learnora-phish.vercel.app/login', ORIGINS), FALLBACK);
  assert.equal(
    safeReturnUrl('https://learnora-abc-study-planner-by-karth.vercel.app/', ORIGINS),
    FALLBACK,
  );
});

test('other hosts, schemes and junk fall back', () => {
  for (const raw of [
    'https://evil.example/',
    'http://learnora-app.vercel.app/',
    'javascript:alert(1)',
    'not a url',
    42,
    undefined,
  ]) {
    assert.equal(safeReturnUrl(raw, ORIGINS), FALLBACK, String(raw));
  }
});
