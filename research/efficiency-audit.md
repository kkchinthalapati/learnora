# Efficiency audit: tokens, latency, reliability, engineering

Measurements are from production `ai_request_log` (last 60 days) [R13] and code [R6]. **Every impact estimate below is a hypothesis unless a measured figure is quoted.** Learning quality is the constraint: no optimisation here removes verification, the tutor's access to the verified solution, or safety checks.

## 0. What was measured

| Fact | Value | Source |
|---|---|---|
| Quiz generation latency via OpenRouter | mean 24.1 s, p90 34.0 s (n=9) | R13 |
| Quiz via Groq | mean 12.4 s (n=4) | R13 |
| Feynman via OpenRouter / Groq | 12.1 s / 7.8 s | R13 |
| Requests with a recorded provider that also recorded a failover | all of them in the window | R13 |
| Total outages (every provider failed) | **Not logged.** `refundRequest` deletes the row to refund quota (`learnora-ai/index.ts` ~L1081) | R6 |
| Tokens and cost per request | **Not recorded.** No columns | R13 |
| Calls per quiz | 1 generate + 1 verify (+1 regenerate on reject) when verification ships | R6 |
| Free-plan quiz cap | 3 generations per day | R6 comment |

**Implication:** Learnora currently cannot compute *cost per session* or *availability*, the two numbers this audit is meant to optimise. Instrumentation comes first (E1).

## 1. Opportunities, ranked

Effort: S < 1 day, M = 1–3 days, L = a week or more. Impact is relative within this list.

| # | Opportunity | Problem today | Expected effect (hypothesis) | Effort | Learning-quality risk |
|---|---|---|---|---|---|
| **E1** | **Instrument the AI log**: add `input_tokens`, `output_tokens`, `est_cost_usd`, `status` (`ok`, `failed_all`, `rejected`, `cached`). Keep failed rows but mark them `refunded=true` instead of deleting them. | No cost or availability data. Outages invisible. | Enables every other row. Zero user impact. | S | None |
| **E2** | **Bank-first practice.** Quick checks, exam practice and review serve from `question_bank` when it has ≥ N items for the skill; AI generation only fills gaps. | 2–3 LLM calls and ~12–34 s per 4-question quiz [R13]; free plan capped at 3 a day. | Latency from ~25 s to < 0.5 s for covered skills. AI calls per practice session fall roughly in proportion to bank coverage. Removes the daily cap for covered skills. | M | **Improves quality**: bank keys are trusted. Risk: repetition, so track exposure (architecture A2). |
| **E3** | **Generate once, keep forever.** Verified AI questions are stored and promoted (architecture D tier 2) instead of discarded after one quiz. | Every quiz is regenerated from scratch. | The bank grows with use. Generation cost per skill tends towards zero. | M | Needs the promotion rule and reports *(reports exist)*. |
| **E4** | **Server-side cache for item-bound AI text**: hint ladders, worked solutions and wrong-option explanations keyed by `(item_id, level, chosen_option)`. | `hintState.ts` caches per device in localStorage only. Each student pays a call for identical bank items. | After warm-up, hint and explanation calls on bank items become about one per (item, level, option). | S–M | **Semantically safe** only for bank items with a fixed key. Never cache student-specific tutor turns. |
| **E5** | **Pay for one reliable primary provider, and route by task.** Small and fast model for verification, labels and short rubric checks. Mid model for tutor turns. Strong model only for item generation. Update stale defaults (`claude-3-5-haiku-20241022`, `gpt-4o-mini`). | A free-tier chain with failover on every logged request. One live provider as of 2026-09-24 [R11]. | Availability and p90 latency are the main wins. Cost per call drops for checker and labeller calls. | S (config) + **DECISION** (spend) | Use a model at least as strong as the generator for verification, not cheaper. A weaker checker passes wrong keys. |
| **E6** | **Student-state summary instead of history** (architecture H): about 300 tokens of deterministic state plus the last 6 turns, replacing up to 20 messages (`MAX_HISTORY = 20`). | Long prompts, repeated context, no shared picture across tools. | Fewer input tokens per tutor turn (size unmeasured until E1). Better consistency across tools. | M | Must keep the misconception context (already formatted). Eval with `evals/` before switching. |
| **E7** | **Structured outputs / JSON schema** where the provider supports it, for quiz, plan, labels and rubric. | `aiJson.ts` repairs and parses free text. Parse failures lead to regeneration. | Fewer regenerations. Simpler code. | S–M | None. Validation stays. |
| **E8** | **Background pre-generation.** While a student answers question k, prefetch the next item, or generate gap items nightly per skill with low bank coverage (cron exists for reminders). | Generation sits on the critical path. | Perceived latency near zero for AI-filled items. | M | Pre-generated items must be verified like any other. |
| **E9** | **Deterministic graders** for numeric and expression answers (architecture D). | No constructed-response grading at all; the alternative is an LLM judge per answer. | Enables CBSE-style numeric questions without per-answer AI cost. | M | Improves correctness [C15]. |
| **E10** | **Consolidate the five diagnosis tools into tutor modes** (architecture H). | Five prompts, five extractors, five surfaces. | Engineering time and prompt surface roughly halved (judgement). | L | Keep each tool's eval fixtures as tests of its mode. |
| **E11** | **One forgetting model** (FSRS retrievability) for schedule and forecast. | Two curves [R3]. | Fewer bugs and contradictions. Negligible compute. | S | None. |

## 2. What not to optimise

- **Do not drop the verification call** to save cost. The production audit found wrong keys in AI-written questions (header of `quizQuality.js`), and wrong keys poison the ledger. Remove it only for items that are already verified (bank).
- **Do not pick the cheapest model as verifier.** The checker must be able to solve the item.
- **Do not cache per-student tutor replies.** They carry student context, so caching them would cause privacy and correctness drift.
- **Do not add embeddings or a vector store yet.** BM25 grounding exists, and adding a provider means new disclosure [R6]. Revisit only if retrieval misses show up in evals.

## 3. Cost per learning outcome (how to compute it after E1)

```
cost_per_session          = Σ est_cost_usd over ai_request_log rows with the same session_key
cost_per_resolved_belief  = Σ cost over 30 days ÷ misconceptions newly resolved in 30 days
cost_per_secure_skill     = Σ cost over 30 days ÷ skills newly reaching `secure` (architecture A5)
```

Report these monthly. A rising cost per session with flat resolution is the signal to cut a tool. The column `session_key` already exists (migration `20261001010000`).

## 4. Reliability and observability checklist

| Item | State | Action |
|---|---|---|
| Provider health visible | No dashboard; outages deleted | E1, plus a daily query of failover share and `failed_all` share |
| Fallback when AI is down | Bank fallback exists for Practice *(exists)* | Make bank-first the default (E2), so AI downtime degrades only the tutor |
| Verification deployed | No (prod v66) [R11] | Merge PR #133 and deploy (ledger row 1.2) |
| Eval regression | Manual runs only | Weekly scheduled `evals/run.mjs` against the pinned production model, with results stored |
| Latency SLO | None | Target practice item served in under 1 s (p90), tutor first token in under 3 s |

## 5. Engineering efficiency

- **Pure modules with tests are an asset**: 304 test files. Keep new engine logic pure (the `chooseNext` and knowledge-model folds) so it is testable without Supabase, as the codebase already does.
- **Duplicated decision logic is the main debt**: six "what next" deciders (audit §3.2). Collapsing them (architecture S3) reduces future work more than any token optimisation.
- **Feature surface vs users**: 34 view directories for 8 monthly actives. Freezing new tools until the core loop has data is the largest efficiency gain available.
