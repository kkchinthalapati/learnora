import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

/* The daily AI allowance is written down twice: `QUOTAS` in
   webapp/src/lib/entitlements.ts, which is what the student is shown, and
   `AI_TOOL_QUOTAS` in the edge function, which is what actually stops a
   request. There is no shared import between a Deno function and a Vite app,
   so both files carry a comment asking whoever edits one to remember the
   other.

   A comment is not a mechanism. If the two drift, the app shows a student an
   allowance they do not have — the settings screen promises 10 quizzes, the
   server refuses at 3 — and nothing anywhere fails. That is the shape of
   "it says one thing and does another": no error, no crash, just a product
   that contradicts itself.

   This test is the mechanism. It parses both tables out of their source and
   requires them to agree, so the drift fails here instead of in front of a
   student. */

function read(rel) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}

/** Pulls `{ plan: { tool: number } }` out of an object literal in TS source. */
function parseQuotaTable(source, declaration) {
  const start = source.indexOf(declaration);
  assert.ok(start !== -1, `${declaration} not found — was it renamed?`);

  // Walk braces from the first `{` so a nested plan object cannot end the scan.
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  assert.ok(end !== -1, `Could not find the end of ${declaration}`);
  const body = source.slice(open + 1, end);

  const table = {};
  const planPattern = /(\w+)\s*:\s*\{([^}]*)\}/g;
  let planMatch;
  while ((planMatch = planPattern.exec(body)) !== null) {
    const [, plan, fields] = planMatch;
    const row = {};
    const fieldPattern = /(\w+)\s*:\s*(Infinity|\d+)/g;
    let fieldMatch;
    while ((fieldMatch = fieldPattern.exec(fields)) !== null) {
      const [, tool, raw] = fieldMatch;
      row[tool] = raw === 'Infinity' ? Infinity : Number(raw);
    }
    table[plan] = row;
  }
  return table;
}

const CLIENT = parseQuotaTable(
  read('../webapp/src/lib/entitlements.ts'),
  'export const QUOTAS',
);
const SERVER = parseQuotaTable(
  read('../supabase/functions/learnora-ai/index.ts'),
  'const AI_TOOL_QUOTAS',
);

/* Quotas the client tracks on its own — they are not AI requests and the
   edge function has no say in them, so it is correct that they appear on one
   side only. */
const CLIENT_ONLY = new Set(['notebooks', 'importedCalendars']);

const PLANS = ['free', 'plus', 'pro'];

test('both quota tables were found and parsed', () => {
  for (const plan of PLANS) {
    assert.ok(CLIENT[plan], `client table has no "${plan}" row`);
    assert.ok(SERVER[plan], `server table has no "${plan}" row`);
    assert.ok(
      Object.keys(SERVER[plan]).length > 5,
      `server "${plan}" row parsed as ${JSON.stringify(SERVER[plan])} — the parser is probably broken, not the table`,
    );
  }
});

test('every AI tool the client shows a limit for is enforced by the server', () => {
  for (const plan of PLANS) {
    for (const tool of Object.keys(CLIENT[plan])) {
      if (CLIENT_ONLY.has(tool)) continue;
      assert.ok(
        tool in SERVER[plan],
        `${plan}.${tool}: the app shows an allowance the edge function does not enforce`,
      );
    }
  }
});

test('every tool the server enforces is one the client knows about', () => {
  for (const plan of PLANS) {
    for (const tool of Object.keys(SERVER[plan])) {
      assert.ok(
        tool in CLIENT[plan],
        `${plan}.${tool}: the edge function enforces a limit the app never shows`,
      );
    }
  }
});

test('the numbers agree, so the app never promises what the server refuses', () => {
  const mismatches = [];
  for (const plan of PLANS) {
    for (const [tool, serverValue] of Object.entries(SERVER[plan])) {
      const clientValue = CLIENT[plan]?.[tool];
      if (clientValue !== serverValue) {
        mismatches.push(
          `${plan}.${tool}: app shows ${clientValue}, server enforces ${serverValue}`,
        );
      }
    }
  }
  assert.deepStrictEqual(mismatches, [], `\n${mismatches.join('\n')}\n`);
});

test('a paid plan is never worse than the one below it', () => {
  for (const tool of Object.keys(SERVER.free)) {
    assert.ok(
      SERVER.plus[tool] >= SERVER.free[tool],
      `plus.${tool} (${SERVER.plus[tool]}) is below free (${SERVER.free[tool]})`,
    );
    assert.ok(
      SERVER.pro[tool] >= SERVER.plus[tool],
      `pro.${tool} (${SERVER.pro[tool]}) is below plus (${SERVER.plus[tool]})`,
    );
  }
});
