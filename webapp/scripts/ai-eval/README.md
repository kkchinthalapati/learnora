# AI evaluation harness

Builds the exact requests Learnora sends to its AI provider, so the prompts can
be run against a model and graded, without a provider key in the browser or a
deployed backend.

## Step 1: build the requests

```bash
cd webapp
AI_EVAL_OUT=/tmp/ai-eval npx vitest run -c scripts/ai-eval/vitest.config.ts
```

`requests.eval.ts` runs the app's real AI functions (tutor chat context, quiz
generation, first-run lesson, Explain, Socratic scoring, Teach). MSW captures
each request as it leaves `callEdge`. The harness then joins it with the edge
function's system instruction from
`supabase/functions/_shared/systemPrompt.js`. Each scenario becomes
`$AI_EVAL_OUT/<id>.json`, holding:

- `system` and `messages`: what a provider receives.
- `followUps`: scripted student turns.
- `rubric`: what a good reply does.

## Step 2: run and grade

Send `system` + `messages` to any chat model. For multi-turn scenarios,
answer each follow-up in order. Keep the rubric away from the model under
test, then grade each reply against it.

Production uses whichever provider in the chain answers first. Gemini Flash
and open models such as gpt-oss-120b and Llama 3.3 70B are the usual ones.
Results from a different model test the *prompts*, not production's exact
output. A provider key in `GEMINI_API_KEY` lets you run step 2 against the
production model directly.
