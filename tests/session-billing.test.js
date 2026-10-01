import test from 'node:test';
import assert from 'node:assert';
import { billingDecision } from '../supabase/functions/_shared/sessionBilling.js';

/* Free plan, debugger/sparring/feynman: 2 a day. Counted per call, one
   Explain session (plan + check) used the whole day and Socratic ran out
   after its first answer. Counted per session, both finish. */

const row = (session_key = null) => ({ session_key });

test('calls inside a session that is already billed today carry on', () => {
  const rows = [row('s-a'), row('s-b')];
  assert.deepStrictEqual(billingDecision(rows, 's-a', 2, 16), { allowed: true });
});

test('a new session is refused once the day\'s sessions are spent', () => {
  const rows = [row('s-a'), row('s-a'), row('s-b')];
  assert.deepStrictEqual(billingDecision(rows, 's-c', 2, 16), { allowed: false, reason: 'daily' });
});

test('a Socratic session (start + 4 answers) fits in one unit of a 2-a-day allowance', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(billingDecision(rows, 's-soc', 2, 16).allowed, true, `call ${i + 1}`);
    rows.push(row('s-soc'));
  }
  assert.strictEqual(billingDecision(rows, 's-two', 2, 16).allowed, true, 'a second session still fits');
});

test('calls without a session count one each, as before', () => {
  assert.strictEqual(billingDecision([row(), row()], null, 2, 16).allowed, false);
  assert.strictEqual(billingDecision([row()], null, 2, 16).allowed, true);
});

test('one session cannot become unlimited', () => {
  const rows = Array.from({ length: 16 }, () => row('s-a'));
  assert.deepStrictEqual(billingDecision(rows, 's-a', 2, 16), { allowed: false, reason: 'session' });
});
