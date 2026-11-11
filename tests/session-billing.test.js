import test from 'node:test';
import assert from 'node:assert';
import { billingDecision, sessionCapFor, unitsUsed } from '../supabase/functions/_shared/sessionBilling.js';

/* Free plan, debugger/sparring/feynman: 2 a day. Counted per call, one
   Explain session (plan + check) used the whole day and Socratic ran out
   after its first answer. Counted per session, both finish. */

const row = (session_key = null) => ({ session_key });

test('calls inside a session that is already billed today carry on', () => {
  const rows = [row('s-a'), row('s-b')];
  assert.deepStrictEqual(billingDecision(rows, 's-a', 2, 16), { allowed: true, sessionKey: 's-a' });
});

test('a new session is refused once the day\'s sessions are spent', () => {
  const rows = [row('s-a'), row('s-a'), row('s-b')];
  assert.deepStrictEqual(billingDecision(rows, 's-c', 2, 16), { allowed: false, reason: 'daily' });
});

test('a Socratic session (start + 4 answers) fits in one unit of a 2-a-day allowance', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) {
    const verdict = billingDecision(rows, 's-soc', 2, 16);
    assert.strictEqual(verdict.allowed, true, `call ${i + 1}`);
    rows.push(row(verdict.sessionKey));
  }
  assert.strictEqual(unitsUsed(rows), 1);
  assert.strictEqual(billingDecision(rows, 's-two', 2, 16).allowed, true, 'a second session still fits');
});

test('calls without a session count one each, as before', () => {
  assert.strictEqual(billingDecision([row(), row()], null, 2, 16).allowed, false);
  assert.deepStrictEqual(billingDecision([row()], null, 2, 16), { allowed: true, sessionKey: null });
});

test('past its cap a session is billed call by call, not refused, and not unlimited', () => {
  const rows = Array.from({ length: 16 }, () => row('s-a'));
  assert.deepStrictEqual(billingDecision(rows, 's-a', 3, 16), { allowed: true, sessionKey: null });
  rows.push(row(null));
  assert.deepStrictEqual(billingDecision(rows, 's-a', 3, 16), { allowed: true, sessionKey: null });
  rows.push(row(null));
  assert.deepStrictEqual(billingDecision(rows, 's-a', 3, 16), { allowed: false, reason: 'daily' });
});

test('a tool that does not group calls ignores the session key', () => {
  assert.strictEqual(sessionCapFor('flashcards'), 0);
  assert.strictEqual(sessionCapFor('image'), 0);
  assert.strictEqual(sessionCapFor('notebookStudio'), 0);
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const verdict = billingDecision(rows, 's-a', 3, sessionCapFor('flashcards'));
    assert.deepStrictEqual(verdict, { allowed: true, sessionKey: null });
    rows.push(row(verdict.sessionKey));
  }
  assert.strictEqual(billingDecision(rows, 's-a', 3, 0).allowed, false);
});

test('tutor chat inside a Study session groups 8 messages, not 16', () => {
  assert.strictEqual(sessionCapFor('chat'), 8);
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const verdict = billingDecision(rows, 's-a', 10, sessionCapFor('chat'));
    rows.push(row(verdict.sessionKey));
  }
  // 8 grouped into one unit, then 4 billed on their own.
  assert.strictEqual(unitsUsed(rows), 5);
});

test('a three-part note and its drawing are one notes unit', () => {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const verdict = billingDecision(rows, 'notes-1', 3, sessionCapFor('notes'));
    assert.strictEqual(verdict.allowed, true);
    rows.push(row(verdict.sessionKey));
  }
  assert.strictEqual(unitsUsed(rows), 1);
});

test('the long-session override applies to the 16-call Study tools only', () => {
  assert.strictEqual(sessionCapFor('debugger', 24), 24);
  assert.strictEqual(sessionCapFor('chat', 24), 8);
  assert.strictEqual(sessionCapFor(undefined, 24), 0);
});
