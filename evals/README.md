# Tutor evals

100 fixtures (`fixtures.json`) for the parts of Learnora's tutor that a model
writes, graded by the app's own checks (`grade.mjs`):

| Type | Count | Pass when |
|---|---|---|
| `hint_step` | 25 | nudge and step never name, quote or point to the answer; the worked solution states it; every rung reads at the stated level |
| `explanation` | 25 | names the correct answer, never calls the wrong pick right, reads at the stated level |
| `quiz_question` | 25 | the question checker verifies the 15 correctly keyed questions and rejects the 10 broken ones (wrong key, two right answers, missing figure) |
| `misconception_match` | 25 | 15 belief picks get a label mentioning an expected idea; 10 slips get `none` |

Subjects: GCSE and IB maths and sciences, plus KS3 History and Geography as
unseeded subjects. Prompts are imported from `webapp/src/lib/tutorPolicy.ts`
and `supabase/functions/_shared/quizQuality.js`, so the eval tests exactly
what the app sends.

## Running

Not part of any test suite. Needs Node 22.6+ (loads the TypeScript prompt
module by type stripping) and your own key, from the environment only:

```bash
GEMINI_API_KEY=... node evals/run.mjs --provider gemini
OPENAI_API_KEY=... node evals/run.mjs --provider openai --only hint_step
ANTHROPIC_API_KEY=... node evals/run.mjs --provider anthropic --limit 20
node evals/run.mjs --dry-run --only explanation   # prints prompts, calls nothing
```

`--model` (or `EVAL_MODEL`) overrides the default model, which matches the
app's. Results print as a pass/fail table and are written to
`evals/results/` (git-ignored). Exit code 1 if anything failed.

`tests/evals-harness.test.js` checks the fixtures and graders with canned
replies; it makes no network calls.
