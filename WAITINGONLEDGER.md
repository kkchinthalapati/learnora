# WAITING ON LEDGER

Everything the code is waiting for that only a person (or a decision) can
unblock: migrations, edge-function deploys, secrets and API keys, accounts,
domain, billing, legal. **If it is not in the code and not done, it is here.**

## How to keep this honest (agents: this is a standing duty)

- Update this file **in the same commit** as anything that changes a row:
  adding a migration, changing an edge function, reading a new env var or
  secret, touching billing/email/push, merging or opening a PR that needs a
  follow-up step.
- Every row has an owner, a status and a **Last verified** date. A date means
  someone checked production (or the dashboard) that day, not that the code
  says so. Rows verified from memory or old docs say `unverified`.
- When something is done, move the row to **Done** with the date. Never delete it.
- Production wins over this file. Verify before acting (queries are in
  `unmergedsupabase.md` and `docs/ROLLBACK.md`).
- Do not use `supabase db push` (migration history has drifted: production
  records its own timestamps). Apply single migrations and keep the file in
  `supabase/migrations/`.

Status key: **BLOCKED** needs you · **READY** one command away · **DECISION**
needs a call · **UNVERIFIED** probably true, nobody checked recently.

Last full review: **2026-10-06** (production migrations and edge-function list
read directly that day; secrets are not readable by an agent, so every secret
row is UNVERIFIED until you run `supabase secrets list`).

---

## 1. Do these first (shipping blockers)

| # | What | Status | Who | Command / where | Why it matters |
|---|------|--------|-----|-----------------|----------------|
| 1 | Merge the **`learning-engine`** branch. It also carries `97ad70c` (this ledger, the archive) and `a5ac4dd` (maths rendering), which were pushed to `tutor-hints-verification` after PR #133 merged and so never reached `main`. | READY | you | GitHub PR from `learning-engine` | Vercel deploys the webapp on merge. Until then `main` has no WAITINGONLEDGER.md and no maths rendering in Practice. |
| 3 | Smoke test AI after the deploy | READY | you | Signed in, generate one quiz in a seeded subject (e.g. GCSE Biology), then `select mode, provider, model, latency_ms, status, input_tokens, output_tokens from ai_request_log order by created_at desc limit 10;` Expect rows with `mode='verify'` and token counts. Then check `question_review_log` and the "unverified" label in an unseeded subject. | Proves the checker, caps and fallback chain work end to end. Needs a signed-in student; an agent may not create a production account. |
| 4 | Remove the dead Cerebras key | READY | you | `supabase secrets unset CEREBRAS_API_KEY` | It answered 402 to every request (checked 2026-09-24); the provider chain skips it but the secret should go. |

## 2. Migrations

Production has 63 migrations recorded (2026-10-10, after `question_bank_numeric`)
and the repo has 63 files in `supabase/migrations/`. They match
one to one by name; many carry different timestamps because they were applied
through the dashboard/API (the known history drift). **Nothing is pending.**

| Migration | Status | Notes |
|-----------|--------|-------|
| `20261010000000_question_bank_numeric.sql` | **Applied 2026-10-10** | `answer_type` / `numeric_answer` on the bank; 25 typed-in numeric CBSE Class 10 questions inserted (bank now 385). |
| `20261009030000_ai_item_cache.sql` | **Applied 2026-10-09** | Service-role-only cache of AI text for bank questions (keyed by a hash of the whole request); `ai_request_log.status` gains `cached`. Used by learnora-ai v69. |
| `20261009020000_question_bank_kind_and_distractors.sql` | **Applied 2026-10-09** | `kind` and `distractor_misconceptions` on the bank; then 132 CBSE Class 10 questions inserted (Learnora-written, `scripts/question-bank/cbse-source.mjs`). |
| `20261009010000_cbse_tiers.sql` | **Applied 2026-10-09** | Allows tiers `Standard` / `Basic` on `exams.syllabus_tier` and `question_bank.tier`, for the CBSE specs in `webapp/src/lib/syllabus/cbse.ts`. Widening only. |
| `20261009000000_ai_request_log_usage.sql` | **Applied 2026-10-09** | Token counts, status, and `refunded` (failed requests are kept and flagged instead of deleted). learnora-ai v68 and the usage meter filter `refunded = false`. |
| `20261006000000_question_verification_and_reports.sql` | Applied 2026-10-06 | Ahead of the PR #133 merge. Webapp tolerates it either way. |
| `20260901000000_add_diagram_artifact_type.sql` | **Applied 2026-10-06** | Found missing during cleanup: production still had the old check constraint, so saving a Notebook Studio diagram would fail with a 23514. Fixed. |
| `20260718000000_baseline_dashboard_tables.sql` | Not applied, by design | Reconstructed (not dumped) baseline for building a fresh database. Moved to `archive/migrations-unapplied/`. If you ever need a local/CI database from scratch, dump the real schema from production instead (see 6.3). |

Record-keeping: production records migrations by the time they were applied,
not the filename. If you want `supabase migration list` to match, run
`supabase migration repair` per file. Optional, cosmetic.

## 3. Edge functions (deployed versions read 2026-10-06; learnora-ai 2026-10-09)

| Function | Prod version | Waiting on |
|----------|--------------|------------|
| `learnora-ai` | v69 (2026-10-09) | Nothing. v67 = the verification build from `main`; v68 = plus token and outage logging; v69 = plus the bank-question item cache (`learning-engine` branch). Smoke test is row 3. Rollback: Edge Functions > learnora-ai > versions. |
| `stripe-billing` | v19 | Nothing known. Needs Stripe secrets (4.1). |
| `stripe-webhook` | v17 | Nothing known. Needs `STRIPE_WEBHOOK_SECRET` (4.1). |
| `delete-account` | v13 | Nothing. |
| `send-email-reminders` | v14 | A mail provider secret (4.2) or it answers 500. |
| `send-push-reminders` | v4 | Nothing; VAPID keys set per 2026-09-24 notes. |
| `web-research` | v6 | Nothing. |

I have not diffed deployed source against `main` for the functions other than
`learnora-ai`. UNVERIFIED.

## 4. Secrets, API keys, accounts

None of these can be read by an agent. Run `supabase secrets list` and tick
what exists. Names only: never paste values anywhere.

### 4.1 Billing (Stripe)

| Item | Status |
|------|--------|
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`, `STRIPE_WEBHOOK_SECRET` set | UNVERIFIED. Functions are deployed; whether live keys are set is unknown. See `STRIPE_SETUP.md`. |
| Webhook endpoint registered in the Stripe dashboard | UNVERIFIED |
| Live-mode vs test-mode decision before charging anyone | DECISION |

### 4.2 Email reminders

| Item | Status |
|------|--------|
| A provider secret: Gmail stopgap (`SMTP_USER` + `SMTP_PASS` app password, 400/day cap) **or** `RESEND_API_KEY` + `EMAIL_FROM` | UNVERIFIED (as of 2026-09-24 neither was set; the function returned 500 naming what was missing) |
| Verify the sending domain in Resend | BLOCKED on the domain (5.1) |
| After Resend works: `supabase secrets unset SMTP_USER SMTP_PASS` | Later |

### 4.3 Push reminders

VAPID keys and `VITE_VAPID_PUBLIC_KEY` (Vercel Production + Preview) were set
as of 2026-09-24. Cron secret in Vault `reminders_cron_secret` must equal the
functions' `CRON_SECRET`. UNVERIFIED since then. The wording of lapsed-topic
pushes has not been reviewed.

### 4.4 AI providers (all UNVERIFIED; last live check 2026-09-24)

| Provider | Secret | Last known state |
|----------|--------|------------------|
| Groq | `GROQ_API_KEY` | Answering (~6 s). The only reliable one then. |
| Google Gemini | `GEMINI_API_KEY` | 503 overloaded that day. Also the **first-choice quiz checker** (`QUIZ_VERIFIER_MODEL` optional) and needed for photo/scan uploads and image generation. |
| Cerebras | `CEREBRAS_API_KEY` | 402, dead. Remove (1.4). |
| OpenAI | `OPENAI_API_KEY` | Out of credit |
| Anthropic | `CLAUDE_API_KEY` | Out of credit |
| Mistral | `MISTRAL_API_KEY` | 429. **Privacy text no longer names Mistral**; remove or disclose (see 6.1). |
| GitHub Models | | Empty replies, cause unknown |
| OpenRouter | `OPENROUTER_API_KEY` | Paid last resort |

**Decision:** which providers you are willing to pay for. With Groq as the
only live provider, one outage means no AI at all.

Optional verification tuning (defaults are fine): `QUIZ_VERIFIER_MODEL`
(cheaper checker model), `QUIZ_VERIFY_USER_DAILY` (default 20),
`QUIZ_VERIFY_GLOBAL_DAILY` (default 2000).

### 4.5 Other keys

**Oak import, as reviewed 2026-10-07** (run in review mode, nothing written): 1,050 questions, all `gcse-maths` (Year 10 and 11, foundation and higher). Four sampled answers hand-checked and correct. 692 contain LaTeX (`$$…$$`); no explanations. **There is no GCSE science from Oak**: the API's science programmes stop at Year 9, so the sciences stay on the 228 Learnora-written questions. Run it yourself, from `webapp/`:

```bash
OAK_API_KEY=… SUPABASE_URL=https://mlvgqwqiynpwpwzqufdf.supabase.co \n  SUPABASE_SERVICE_ROLE_KEY=… node scripts/question-bank/import-oak.mjs --apply
```

Re-running is safe (duplicates are skipped). To undo: `delete from question_bank where source = 'oak';`. Also add the OGL attribution line to the About or Terms page (see `docs/QUESTION_SOURCES.md`).

| Item | Status |
|------|--------|
| **Apply the Oak import** (1,050 GCSE Maths questions). Blocked on the **Oak API key**, which is not on this machine or in the repo. The service-role key is *not* needed: `OAK_API_KEY=… node scripts/question-bank/import-oak.mjs --sql oak.sql`, then `npx supabase db query --linked -f oak.sql` (the CLI is already authenticated). | **READY** (after PR #133 merges, so Practice, QuickCheck and retests render the LaTeX) |
| **Add `GROQ_API_KEY` as a GitHub repository secret** (Settings > Secrets and variables > Actions) so the weekly tutor evals run (`.github/workflows/tutor-evals.yml`, added 2026-10-09). Optional: `GEMINI_API_KEY` to run with `--provider gemini`. Locally: `GROQ_API_KEY=... node evals/run.mjs --provider groq`. | BLOCKED on you. The workflow skips cleanly until a key exists; the evals have **never run against a real model**, so the pass rate is unknown. |

## 5. Domain, hosting, accounts

| # | Item | Status |
|---|------|--------|
| 5.1 | **Purchase / connect the domain** | BLOCKED. You expected it around 2026-10-01 to 10-08; not confirmed. Needed for: Resend sender verification (4.2), real email `from`, and the static pages' canonical URLs/sitemap. |
| 5.2 | Point the domain at Vercel; add it in Vercel project settings; update Supabase Auth site URL and redirect URLs; update `sitemap.xml`, `robots.txt`, `llms.txt`, `openapi.json` if they hardcode the old host | Blocked on 5.1 |
| 5.3 | Supabase backups / PITR confirmed on for the production project | UNVERIFIED |

## 6. Decisions and sign-offs (not engineering)

| # | Item | Status |
|---|------|--------|
| 6.1 | **Privacy copy lists only Anthropic + Google**, but prompts can reach about 8 providers (see 4.4). Either trim the provider chain or update the policy. | DECISION, open since 2026-09-24 |
| 6.2 | Legal sign-off: provider text, retention, GDPR/COPPA (under-13/16 users, school use) | BLOCKED, not engineering |
| 6.3 | Dump the real production schema (`supabase db dump --schema public`) and replace the reconstructed baseline, so a fresh database can be built for local dev or CI. Only needed if you want that. | DECISION |
| 6.4 | Human review of the question bank (now incl. 132 CBSE Class 10 questions) and the 59-item misconception catalogue (14 added for CBSE, 2026-10-09) by a teacher, ideally one who teaches CBSE for those. Question reports land in `question_review_log` / `question_reports`; hand-run queries are in `docs/question_review.sql`. Nobody is reviewing them yet. | BLOCKED, needs a person |
| 6.5 | Peer benchmarking (plan item 2.6) needs a privacy review before any build | DECISION |
| 6.6 | Exam boards beyond the current set (AP/SAT, other GCSE science boards); past papers can only be linked, not hosted (AQA refuses apps) | DECISION |

## 7. Known gaps in what shipped (code, not waiting on you)

- Hint ladder and verification have only run under tests and fixtures, never
  against a live model. Row 1.3 is what changes that.
- Seeded-subject quizzes fall back to the practice bank when every generated
  question is rejected. If a seeded subject has a thin bank, students see
  fewer questions rather than unverified ones.
- Report thresholds (3 reporters for bank, 1 for generated) are guesses; revisit
  after real reports exist.

## Done

| Date | What |
|------|------|
| 2026-10-10 | Applied `question_bank_numeric`; inserted 25 numeric CBSE questions (bank 385) |
| 2026-10-09 | PR #133 confirmed merged; deployed `learnora-ai` v67 (verification build), then v68 (token/outage logging); applied `ai_request_log_usage` |
| 2026-10-09 | Applied `ai_item_cache`; deployed `learnora-ai` v69 |
| 2026-10-09 | Applied `question_bank_kind_and_distractors`; inserted 132 CBSE Class 10 bank questions (bank now 360) |
| 2026-10-09 | Applied `cbse_tiers` (CBSE Class 9/10 Science and Maths added to the syllabus catalogue) |
| 2026-10-06 | Applied `add_diagram_artifact_type` (constraint was missing in production) |
| 2026-10-06 | Applied `question_verification_and_reports` |
| 2026-10-06 | Applied `drop_duplicate_ai_request_log_index`, `mistake_loop`, `study_profile_any_board` |
| 2026-10-02 | Applied A1-A3, B1a/b, B2a, C1-C3; deployed `learnora-ai` v65-66; question bank seeded (228) |
| 2026-10-07 | Oak API key obtained; importer reviewed (maths only) |
| 2026-10-06 | Cleanup: stale docs, SQL, screenshots, design handoff and the unapplied baseline moved to `archive/` |
