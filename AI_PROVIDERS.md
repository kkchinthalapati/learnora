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

Listed in the order the function tries them, which is the order of
`BUILTIN_PROVIDERS` in `supabase/functions/learnora-ai/index.ts`.

**Gemini runs first, ahead of this table.** It is handled separately because
it is the only provider that can read an uploaded *image* inline. PDFs no
longer depend on it — they are parsed to text in the browser before the
request is made (see [PDFs and attachments](#pdfs-and-attachments)) — but an
uploaded photo of a worksheet still needs it.

| # | Provider | Secret | Get a key | Cost |
|---|---|---|---|---|
| — | **Google Gemini** | `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/apikey) | Free tier; generous |
| 1 | **Cerebras** | `CEREBRAS_API_KEY` | [cloud.cerebras.ai](https://cloud.cerebras.ai/) | Free, ~1M tokens/day, fastest in the chain |
| 2 | **Groq** | `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) | Free, rate-limited per minute |
| 3 | **Cloudflare Workers AI** | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` | [dash.cloudflare.com](https://dash.cloudflare.com/) → AI | Free daily allowance |
| 4 | **GitHub Models** | `GITHUB_MODELS_TOKEN` | [github.com/settings/tokens](https://github.com/settings/tokens) | Free with a GitHub account |
| 5 | **Mistral** | `MISTRAL_API_KEY` | [console.mistral.ai](https://console.mistral.ai/) | Free "Experiment" tier (see caveat below) |
| 6 | **OpenRouter** | `OPENROUTER_API_KEY` | [openrouter.ai/keys](https://openrouter.ai/keys) | Free `:free` models, weakest here |
| 7 | **NVIDIA NIM** | `NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com/) | Free credits, then billed |
| 8 | **OpenAI** | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com/api-keys) | Paid from the first token |
| 9 | **Anthropic** | `CLAUDE_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) | Paid from the first token |

### The order is deliberate: free, then credits, then paid

Providers 1–6 have standing free tiers. 7 has free credits that eventually run
out. 8 and 9 bill immediately.

Because the chain stops at the first provider that answers, a deployment with
every key set **spends nothing until the free tiers are exhausted** — the paid
keys are there as a floor under an outage, not as the default path.
`tests/ai-providers.test.js` enforces this ordering, so a provider cannot be
added in the wrong place without failing a test.

You do not need the paid ones at all. Keys 1–6 are enough, and cost nothing.

### Two provider-specific requirements

- **Cloudflare needs two secrets**, not one. Workers AI's endpoint is scoped
  per account, so without `CLOUDFLARE_ACCOUNT_ID` there is no URL to call and
  the provider is skipped (with a line in the debug output saying exactly
  that). Its model IDs all start with `@cf/`.
- **GitHub Models** needs a fine-grained PAT with the **`models: read`**
  permission. A classic token without it returns 403.

---

## Choosing models without redeploying

Free-tier model names change often, and shipping a code change just to rename a
model is a bad trade. Every model ID is read from the environment, with the
value in the table below as the fallback:

| Secret | Default |
|---|---|
| `GEMINI_MODELS` | `gemini-2.0-flash` (comma-separated, tried in order) |
| `CEREBRAS_MODEL` | `gpt-oss-120b` |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `CLOUDFLARE_MODEL` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |
| `GITHUB_MODELS_MODEL` | `openai/gpt-4.1-mini` |
| `MISTRAL_MODEL` | `mistral-small-latest` |
| `OPENROUTER_MODEL` | `openai/gpt-oss-20b:free` |
| `NVIDIA_MODEL` | `meta/llama-3.3-70b-instruct` |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `CLAUDE_MODEL` | `claude-3-5-haiku-20241022` |

If a provider starts returning "model not found", set the matching secret to a
current model ID rather than editing the code. Two defaults in this file have
already died that way.

---

## Adding a provider that isn't listed here

`AI_EXTRA_PROVIDERS` takes a JSON array of OpenAI-compatible endpoints and
appends them to the chain — no code change, no release. This exists because
free-tier offerings appear and disappear faster than this function gets
redeployed.

```bash
supabase secrets set AI_EXTRA_PROVIDERS='[
  {
    "id": "together",
    "keyEnv": "TOGETHER_API_KEY",
    "defaultModel": "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
    "url": "https://api.together.xyz/v1/chat/completions"
  }
]'
supabase secrets set TOGETHER_API_KEY=your_key_here
```

Required per entry: `id`, `keyEnv`, `defaultModel`, `url`.
Optional: `modelEnv` (defaults to `<ID>_MODEL`), `jsonMode` (default `true`),
`headers`, `accountEnv`, `dialect` (`openai` or `anthropic`), `cost`.

Rules worth knowing:

- **Entries are appended**, so a new key can never displace a working one.
- **`url` must be https.** A non-https entry is dropped — student study
  material is not going over plaintext.
- **A malformed value is ignored, not fatal.** Bad JSON logs an error and the
  built-in chain carries on; it cannot take the AI offline.
- **The safety screen still applies.** Extra providers go through the same
  caller as the built-ins, which is where output screening happens. That is
  the whole reason they are appended to the same list rather than called
  separately.

Anything you find worth keeping belongs in `BUILTIN_PROVIDERS` eventually —
this is the fast path, not the permanent home.

---

## PDFs and attachments

A PDF is **parsed to text in the browser** (`webapp/src/lib/pdfText.ts`) and
folded into the prompt, so whichever provider answers can read it.

This used to work differently, and the difference mattered. The PDF was sent as
a base64 attachment, and Gemini is the only provider in the chain that reads an
attachment inline. Every other provider got a note saying a file existed that
it could not see — and was still asked to write study notes from it. So if
Gemini was rate-limited, an upload produced confident notes about nothing. No
error, no warning; just a wrong answer that looked right.

What still uses the attachment path:

- **Images**, which only Gemini can read.
- **Scanned PDFs with no text layer.** If extraction yields almost nothing per
  page, the original file is sent so Gemini can OCR it, and the student is told
  the answer may be less precise.

Practical consequences:

- **You want `GEMINI_API_KEY` set** if students upload photos or scans. For
  text PDFs it is no longer load-bearing.
- Extracted text is capped (40 pages / 60k characters). Past that the model is
  told the document was cut short, rather than left to summarise a fraction of
  it as though it were the whole thing.

---

## Two things to decide before adding providers

### 1. Free tiers usually train on your data

This is the standard trade for a no-credit-card tier, and Mistral's Experiment
tier makes the opt-in explicit (it also requires phone-number verification).
Learnora sends **student-uploaded study material** — notes, PDFs, coursework —
through these providers, and the app is used by students from age 13.

That's a call for you to make, not a blocker, but it's worth making
deliberately:

- Check each provider's data-use terms before adding its key.
- If the terms don't suit, that provider's key simply doesn't get set — the
  chain works without it.
- If Learnora ever states a privacy position to users, it needs to match which
  providers are actually enabled.

### 2. Quality varies down the chain

The chain is ordered so the strongest free models run first, but a request that
falls through to the last provider will produce a noticeably weaker answer than
one served by Gemini or Cerebras. `modelUsed` in the response body says which
provider answered, so if quality complaints come in, that field will tell you
whether the chain is falling through more than expected.

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
- **A provider missing a required secret is skipped before the call**, not
  called and failed. Cloudflare without its account ID is the case that
  matters: the request would otherwise go to a URL with an unfilled
  placeholder in the path and burn a timeout on a guaranteed 404.

---

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
the shared caller, so it covers new providers automatically, including ones
added through `AI_EXTRA_PROVIDERS`. Keep it that way: a provider called from
outside that loop would bypass it.
