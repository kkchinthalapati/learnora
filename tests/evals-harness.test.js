import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { grade, promptFor } from '../evals/grade.mjs';

/* The eval harness itself is never run here (it needs a provider key). This
   checks the fixture set is well formed and the graders judge canned replies
   the way the brief says they should, so a broken grader can't quietly pass
   everything when the real run happens. */

const { fixtures } = JSON.parse(readFileSync(new URL('../evals/fixtures.json', import.meta.url), 'utf8'));

test('100 fixtures, 25 of each type, each with a pass criterion', () => {
  assert.strictEqual(fixtures.length, 100);
  const byType = {};
  for (const f of fixtures) {
    byType[f.type] = (byType[f.type] ?? 0) + 1;
    assert.ok(f.pass && f.pass.length > 20, `${f.id} has no pass criterion`);
    assert.ok(['GCSE', 'IB', 'KS3'].includes(f.level), `${f.id} level`);
    assert.doesNotThrow(() => promptFor(f));
  }
  assert.deepStrictEqual(byType, { hint_step: 25, explanation: 25, quiz_question: 25, misconception_match: 25 });
  assert.ok(fixtures.some((f) => f.seeded === false), 'includes unseeded subjects');
  assert.strictEqual(new Set(fixtures.map((f) => f.id)).size, 100);
});

const hint = fixtures.find((f) => f.id === 'hint-m1');

test('a hint that names the answer early fails', () => {
  const leaky = JSON.stringify({ nudge: 'The answer is 3.', step: 'Look at m.', worked: 'm is 3, so the gradient is 3.' });
  assert.deepStrictEqual(grade(hint, leaky), { pass: false, reason: 'nudge leaks the answer' });
});

test('a clean ladder at the right level passes', () => {
  const good = JSON.stringify({
    nudge: 'Think about the form y = mx + c.',
    step: 'Which letter multiplies x here?',
    worked: 'In y = mx + c, m is the gradient. Here m is 3. So the gradient is 3.',
  });
  assert.deepStrictEqual(grade(hint, good), { pass: true, reason: 'ok' });
});

test('an explanation pitched far above the level fails', () => {
  const f = fixtures.find((x) => x.id === 'explain-m8');
  const dense = JSON.stringify({
    misconception: 'You may think so.',
    explanation:
      'Fundamentally, notwithstanding quadrilateral generalisations, the interior angular summation characteristic of triangular polygons invariably constitutes 180°, representing precisely half of a complete rotational revolution about a point.',
  });
  assert.strictEqual(grade(f, dense).pass, false);
});

test('the checker grader wants rejection for a wrong key', () => {
  const f = fixtures.find((x) => x.id === 'check-bad-m1');
  const agreesWithBadKey = JSON.stringify({ results: [{ i: 0, answer: f.input.correctIndex, confidence: 0.9 }] });
  const solvesIt = JSON.stringify({ results: [{ i: 0, answer: 1, confidence: 0.9 }] });
  assert.strictEqual(grade(f, agreesWithBadKey).pass, false);
  assert.strictEqual(grade(f, solvesIt).pass, true);
});

test('a slip labelled as a belief fails; none passes', () => {
  const f = fixtures.find((x) => x.type === 'misconception_match' && x.expect.label === false);
  assert.strictEqual(grade(f, JSON.stringify({ items: [{ i: 0, none: true }] })).pass, true);
  assert.strictEqual(
    grade(f, JSON.stringify({ items: [{ i: 0, concept: 'Number sense', belief: 'x', reteach: 'y', contrast: 'z' }] })).pass,
    false,
  );
});
