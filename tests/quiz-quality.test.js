import test from 'node:test';
import assert from 'node:assert';
import {
  applyVerdicts,
  buildVerifierPrompt,
  improveQuiz,
  parseQuizPayload,
  referencesMissingVisual,
  shuffleChoices,
} from '../supabase/functions/_shared/quizQuality.js';

/* Fixtures are the defective questions found in production's own quizzes. */
const ROOT2_WRONG_KEY = {
  question: 'Which of the following is a consequence of the proof that root 2 is irrational?',
  choices: ['All square roots are irrational', 'All square roots are rational', 'Root 2 is the only irrational number', 'Only root 2 and root 3 are irrational'],
  correctIndex: 0,
};
const DIAGRAM = {
  question: 'In the diagram below, triangle ABC and triangle DEF share side BC. Which criterion proves them congruent?',
  choices: ['SSS', 'SAS', 'ASA', 'AAS'],
  correctIndex: 2,
};
const GOOD = {
  question: 'What gas does photosynthesis release?',
  choices: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Helium'],
  correctIndex: 0,
  feedback: 'Water is split and oxygen is released.',
};

/** A seeded generator, so a shuffle test is repeatable. */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test('flags questions that rely on a figure the student cannot see', () => {
  assert.strictEqual(referencesMissingVisual(DIAGRAM), true);
  assert.strictEqual(referencesMissingVisual({ question: 'Using the graph shown, what is the gradient?', choices: ['1', '2'] }), true);
  assert.strictEqual(referencesMissingVisual(GOOD), false);
  assert.strictEqual(referencesMissingVisual({ question: 'What does a line graph show best?', choices: ['Trends', 'Parts of a whole'] }), false);
});

test('reads both the wrapped and the bare quiz shape, and drops malformed questions', () => {
  assert.strictEqual(parseQuizPayload(JSON.stringify({ questions: [GOOD] })).length, 1);
  assert.strictEqual(parseQuizPayload(JSON.stringify([GOOD, { question: 'x', choices: ['a'], correctIndex: 0 }])).length, 1);
  assert.strictEqual(parseQuizPayload('not json'), null);
  assert.strictEqual(parseQuizPayload(JSON.stringify({ steps: [] })), null);
});

test('shuffling keeps the key on the same answer', () => {
  const random = seeded(7);
  for (let n = 0; n < 50; n++) {
    const q = shuffleChoices(GOOD, random);
    assert.strictEqual(q.choices[q.correctIndex], 'Oxygen');
    assert.deepStrictEqual([...q.choices].sort(), [...GOOD.choices].sort());
  }
});

test('the correct answer stops sitting in the same position', () => {
  const random = seeded(42);
  const positions = new Set();
  for (let n = 0; n < 40; n++) positions.add(shuffleChoices(GOOD, random).correctIndex);
  assert.ok(positions.size >= 3, `only saw positions ${[...positions]}`);
});

test('the checker prompt withholds the answer key', () => {
  const prompt = buildVerifierPrompt([GOOD]);
  assert.match(prompt, /Question 0: What gas/);
  assert.match(prompt, /0\. Oxygen/);
  assert.doesNotMatch(prompt, /correctIndex/);
});

test('drops questions the checker disagrees with, is ambiguous about, or cannot answer', () => {
  const qs = [GOOD, ROOT2_WRONG_KEY, DIAGRAM, { ...GOOD, question: 'Two right answers?' }];
  const verdict = JSON.stringify({
    results: [
      { i: 0, answer: 0, exactlyOneCorrect: true, selfContained: true },
      { i: 1, answer: 3, exactlyOneCorrect: false, selfContained: true },
      { i: 2, answer: 2, exactlyOneCorrect: true, selfContained: false },
      { i: 3, answer: 0, exactlyOneCorrect: false, selfContained: true },
    ],
  });
  assert.deepStrictEqual(applyVerdicts(qs, verdict), [GOOD]);
});

test('a question the checker skipped is kept; an unreadable verdict is null', () => {
  assert.deepStrictEqual(applyVerdicts([GOOD], JSON.stringify({ results: [{ i: 5, answer: 1 }] })), [GOOD]);
  assert.strictEqual(applyVerdicts([GOOD], 'Sure! Here are my thoughts'), null);
});

test('the full pass removes the bad questions and shuffles the rest', async () => {
  const input = JSON.stringify({ questions: [GOOD, ROOT2_WRONG_KEY, DIAGRAM] });
  const verify = async (_system, prompt) => {
    /* The diagram question never reaches the checker. */
    assert.doesNotMatch(prompt, /diagram below/);
    return JSON.stringify({
      results: [
        { i: 0, answer: 0, exactlyOneCorrect: true, selfContained: true },
        { i: 1, answer: 1, exactlyOneCorrect: true, selfContained: true },
      ],
    });
  };
  const out = JSON.parse(await improveQuiz(input, verify, seeded(3)));
  assert.strictEqual(out.questions.length, 1);
  assert.strictEqual(out.questions[0].choices[out.questions[0].correctIndex], 'Oxygen');
});

test('fails open when the checker is missing, throws, or rejects everything', async () => {
  const input = JSON.stringify({ questions: [GOOD, ROOT2_WRONG_KEY] });
  for (const verify of [
    async () => null,
    async () => { throw new Error('provider down'); },
    async () => JSON.stringify({ results: [{ i: 0, answer: 3 }, { i: 1, answer: 3 }] }),
  ]) {
    const out = JSON.parse(await improveQuiz(input, verify, seeded(1)));
    assert.strictEqual(out.questions.length, 2);
  }
});

test('leaves non-quiz JSON and extra fields alone', async () => {
  const verify = async () => null;
  const feynman = JSON.stringify({ reply: 'Wait, so plants eat light?', gaps: [] });
  assert.strictEqual(await improveQuiz(feynman, verify), feynman);
  const withSummary = JSON.stringify({ summary: 'Traps in this paper', questions: [GOOD] });
  assert.strictEqual(JSON.parse(await improveQuiz(withSummary, verify)).summary, 'Traps in this paper');
});
