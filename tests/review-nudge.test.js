import test from 'node:test';
import assert from 'node:assert';
import { dueCheckBacksByUser, escapeHtml, reviewNudge } from '../supabase/functions/_shared/reviewNudge.js';

const NOW = new Date('2026-11-06T13:00:00Z');
const row = (over) => ({
  id: 'm1',
  user_id: 'u1',
  concept: 'Osmosis',
  status: 'improving',
  repaired_at: '2026-11-03T10:00:00Z',
  retest_due_at: '2026-11-05T10:00:00Z',
  ...over,
});

test('only re-taught, unresolved, due mix-ups are check-backs, oldest first', () => {
  const byUser = dueCheckBacksByUser(
    [
      row({ id: 'late', retest_due_at: '2026-11-06T09:00:00Z' }),
      row({ id: 'early', retest_due_at: '2026-11-04T09:00:00Z' }),
      row({ id: 'future', retest_due_at: '2026-11-07T09:00:00Z' }),
      row({ id: 'fixed', status: 'resolved' }),
      row({ id: 'not-retaught', repaired_at: null }),
      row({ id: 'other', user_id: 'u2' }),
    ],
    NOW,
  );
  assert.deepStrictEqual(byUser.get('u1').map((c) => c.id), ['early', 'late']);
  assert.deepStrictEqual(byUser.get('u2').map((c) => c.id), ['other']);
});

test('a due check-back leads, names the concept, and opens that check', () => {
  const nudge = reviewNudge({ cardsDue: 12, checkBacks: [{ id: 'm 1', concept: 'Osmosis' }, { id: 'm2', concept: 'Ions' }] });
  assert.deepStrictEqual(nudge, {
    title: 'Did your fix on Osmosis stick?',
    body: 'One new question will tell you. 1 more check is waiting, and 12 cards are due.',
    path: '/app/check-back/m%201',
  });
});

test('a lone check-back says only that', () => {
  assert.strictEqual(
    reviewNudge({ cardsDue: 0, checkBacks: [{ id: 'm1', concept: 'Osmosis' }] }).body,
    'One new question will tell you.',
  );
});

test('cards alone read as before, and nothing due sends nothing', () => {
  assert.deepStrictEqual(reviewNudge({ cardsDue: 1, checkBacks: [] }), {
    title: '1 flashcard due',
    body: 'Time for a quick review round.',
    path: '/app/review',
  });
  assert.strictEqual(reviewNudge({ cardsDue: 0, checkBacks: [] }), null);
});

test('a long or empty concept is kept lock-screen sized', () => {
  const [long] = dueCheckBacksByUser([row({ concept: 'x'.repeat(200) })], NOW).get('u1');
  assert.ok(long.concept.length <= 60);
  const [blank] = dueCheckBacksByUser([row({ concept: '  ' })], NOW).get('u1');
  assert.strictEqual(blank.concept, 'an idea you fixed');
});

test('concept text is escaped for the email body', () => {
  assert.strictEqual(escapeHtml('<b>"A" & B\'s</b>'), '&lt;b&gt;&quot;A&quot; &amp; B&#39;s&lt;/b&gt;');
});
