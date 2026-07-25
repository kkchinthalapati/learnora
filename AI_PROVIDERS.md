# AI provider setup

The `learnora-ai` edge function tries providers in order until one returns
usable text. **Every provider is optional.** One with no key configured is
skipped silently, so the app works with however many you've set up — adding
more just means fewer failed requests.

This is the fix for "the AI fails sometimes": with one or two providers, a rate
limit or an outage at either is a visible failure. With five, it isn't.

---

## Setting a secret

Each key goes in Supabase, not in the repo. Either:

```bash
supabase secrets set CEREBRAS_API_KEY=your_key_here
```

or Supabase Dashboard → **Project Settings → Edge Functions → Secrets**.

After adding secrets, redeploy the function so it picks them up:

```bash
supabase functions deploy learnora-ai
```

Check what's currently set:

```bash
supabase secrets list
```

---

## The providers

Listed in the order the function tries them. Order is set by
`OPENAI_PROVIDERS` in `supabase/functions/learnora-ai/index.ts`.

| # | Provider | Secret | Get a key | Free tier |
|---|---|---|---|---|
| 1 | **Google Gemini** | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) | Generous; frontier-quality |
| 2 | **Cerebras** | `CEREBRAS_API_KEY` | [cloud.cerebras.ai](https://cloud.cerebras.ai/) | ~1M tokens/day, extremely fast |
| 3 | **Groq** | `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) | Rate-limited, very fast |
| 4 | **Mistral** | `MISTRAL_API_KEY` | [console.mistral.ai](https://console.mistral.ai/) | ~1B tokens/month "Experiment" tier (see caveat below) |
| 5 | **GitHub Models** | `GITHUB_MODELS_TOKEN` | [github.com/settings/tokens](https://github.com/settings/tokens) | Free with a GitHub account |
| 6 | **OpenRouter** | `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) | Free `:free` models, weakest in the chain |

**Gemini stays first regardless of the others.** It's the only provider here
that reads an uploaded image or PDF inline — the rest get the decoded text
folded into the prompt instead. Losing it means losing attachment handling, so
keep `GEMINI_API_KEY` set even if you add everything else.

**GitHub Models** needs a fine-grained PAT with the **`models: read`**
permission. A classic token without it returns 403.

**Mistral** requires phone-number verification, and its free Experiment tier
requires opting in to having your data used for training. See the caveat below
before enabling it.

---

## Choosing models without redeploying

Free-tier model names change often, and shipping a code change just to rename a
model is a bad trade. Every model ID is read from the environment, with the
value in the table below as the fallback:

| Secret | Default | Notes |
|---|---|---|
| `GEMINI_MODELS` | `gemini-2.0-flash,gemini-1.5-flash` | Comma-separated, tried in order |
| `CEREBRAS_MODEL` | `gpt-oss-120b` | |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | |
| `MISTRAL_MODEL` | `mistral-small-latest` | |
| `GITHUB_MODELS_MODEL` | `openai/gpt-4.1-mini` | |
| `OPENROUTER_MODEL` | `meta-llama/llama-3-8b-instruct:free` | Worth upgrading — see below |

If a provider starts returning "model not found", set the matching secret to a
current model ID rather than editing the code.

**Worth doing:** the OpenRouter default is an 8B model, which is weak at
producing valid quiz JSON and is a plausible contributor to the
"couldn't generate a quiz" failures. Check
[openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0)
for a current free 70B-class model and set `OPENROUTER_MODEL` to it.

---

## Two things to decide before adding providers

### 1. Free tiers usually train on your data

This is the standard trade for a no-credit-card tier, and Mistral's Experiment
tier makes the opt-in explicit. Learnora sends **student-uploaded study
material** — notes, PDFs, coursework — through these providers, and the app is
used by students from age 13.

That's a call for you to make, not a blocker, but it's worth making
deliberately:

- Check each provider's data-use terms before adding its key.
- If the terms don't suit, that provider's key simply doesn't get set — the
  chain works without it.
- If Learnora ever states a privacy position to users, it needs to match which
  providers are actually enabled.

### 2. Quality varies down the chain

The chain is ordered so the strongest models run first, but a request that
falls through to the last provider will produce a noticeably weaker answer than
one served by Gemini. `modelUsed` in the response body says which provider
answered, so if quality complaints come in, that field will tell you whether
the chain is falling through more than expected.

---

## Reliability behaviour

Beyond adding providers, the function was hardened against the causes of
intermittent failure:

- **Every provider has a timeout.** Gemini previously had none, so a hung
  request stalled the whole function until the platform killed it.
- **Structured generation gets longer** (35s vs 20s). A ten-question quiz with
  per-question feedback is a lot of tokens, and the old flat 15s abort was
  cutting those off mid-generation.
- **A whole-request budget of 55s**, so a slow chain returns a real error
  instead of a dropped connection.
- **JSON mode** (`response_format: json_object`) is used for quiz and plan
  generation wherever the provider supports it, which is the single biggest
  reduction in "couldn't generate" parse failures.
- **An empty 200 response counts as a failure**, so the chain moves on rather
  than returning a blank reply.

## Safety behaviour is not bypassed by adding providers

Worth understanding before you add keys, because it was the cause of a real
incident: a Gemini **safety refusal used to be caught as a generic error**, so
the same prompt was replayed against the next provider until one answered. That
is how quizzes on bomb-making and recreational drugs got generated.

The chain now:

- screens the request before it reaches any provider;
- **returns a refusal instead of continuing** when Gemini blocks — a safety
  verdict ends the chain rather than falling through to a less filtered model;
- screens the output of every non-Gemini provider, since none of them has a
  comparable filter of their own.

**Adding a provider does not weaken this** — the output screen is applied by
the shared caller, so it covers new providers automatically. Keep it that way:
a provider added outside `OPENAI_PROVIDERS` would bypass it.
