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
| - | Nothing open. Mail (4.2) waits on the domain. | | | | |

## 2. Migrations

Production has 64 migrations recorded (2026-10-13, after `drop_legacy_leaderboard_overload`)
and the repo has 64 files in `supabase/migrations/`. They match
one to one by name; many carry different timestamps because they were applied
through the dashboard/API (the known history drift). **One is pending:**
`20261028000000_class_misconception_map.sql` (below), held for the privacy
review in 6.11.

| Migration | Status | Notes |
|-----------|--------|-------|
| `20261028000000_class_misconception_map.sql` | **Not applied, BLOCKED on 6.11** | Classes for the class misconception map (PR from branch `class-map`): `classes`, `class_members` (RLS: a student sees only their own membership; the teacher never reads members), `join_class(code)`, and two owner-only aggregates. The map returns nothing until 5 students share and drops any belief fewer than 2 hold; it counts catalogue beliefs only, so no student text leaves an account. Harmless to apply early: the UI is behind the `classMap` flag, off in production, and without the migration the flagged screens just fail to load. Apply on its own (no `db push`), then turn the flag on only after 6.11. UNVERIFIED (never run against a database; reviewed by `migrations.test.ts` only). |
| `20261013000000_drop_legacy_leaderboard_overload.sql` | **Applied 2026-10-13** | Privacy: dropped the old `get_friends_leaderboard(tz)` overload, which ignored `leaderboard_opt_out` and returned opted-out friends' minutes and streaks when called with only `tz`. Verified that day: one overload left, `(tz, period)`, executable by `authenticated` only; the app's call and a `tz`-only call both answer 200 from it. |
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
| `learnora-ai` (Learn allowance) | **Not deployed.** Branch `lesson-intake-fixes` adds a `learn` tool to `AI_TOOL_QUOTAS` (free 3, Plus 12, Pro 30 lessons a day; a whole lesson is one session key, so it counts once). Until it is deployed nothing breaks: the server bills an unknown tool as `chat`, so Learn works but draws on the chat allowance. Deploy after the branch merges to `main` with `supabase functions deploy learnora-ai --project-ref mlvgqwqiynpwpwzqufdf --use-api`; this branch already carries the streaming and free-tier changes above. Smoke test: unauthenticated POST returns 401; then a Learn section on a free account should log `tool = 'learn'` in `ai_request_log`. UNVERIFIED. |
| `learnora-ai` (free-tier limits) | **deployed 2026-10-19** with `supabase functions deploy learnora-ai --project-ref mlvgqwqiynpwpwzqufdf --use-api`, from `overhaul/unified` (uncommitted until the next commit). Free accounts now reach only providers with cost `free` (no OpenAI, Anthropic, Radox or NVIDIA credits), and only the free image models (no OpenAI image). Free daily allowances cut: chat 15 to 10, notebook studio 5 to 3, image 2 to 1. Smoke test: unauthenticated POST returns 401. Behaviour for a real free account: **UNVERIFIED**. Rollback: Edge Functions > learnora-ai > versions (the streaming version). |
| `learnora-ai` (streaming) | **v77 (2026-10-19)**, deployed from `overhaul/unified` with `supabase functions deploy learnora-ai --project-ref mlvgqwqiynpwpwzqufdf --use-api`. Before it, production was v76, byte-identical to `overhaul/unified` HEAD. Adds server-sent-event streaming for free-form tutor replies (`stream: true`); JSON modes, attachments and cached replies keep the blocking path. Smoke test: unauthenticated POST returns 401. Streamed reply end-to-end: **UNVERIFIED**; needs a signed-in session. Not merged to `main`. Rollback: Edge Functions > learnora-ai > versions (v76). |
| `learnora-ai` | **v73 (2026-10-15)**, deployed from `radox-provider` (commit `e70c076`) with `supabase functions deploy`. Carries the Radox backup and its under-16 gate. Not yet merged to `main`; merge the branch so `main` matches production. Smoke test: unauthenticated POST returns 401. Radox itself is inert until `RADOX_API_KEY` is set. Older note: **READY** once `claude/new-session-nch92w` merges: redeploy so quiz mode asks for TeX in question/choice/feedback strings (`_shared/systemPrompt.js`, `JSON_MATH_RULE`; fixes stems showing `tau_xz`). UNVERIFIED. Previously: deployed from `main` after PR #134 merged (verification, token/outage logging, bank-question item cache, Claude default `claude-haiku-5-5`). Smoke test is row 3. Rollback: Edge Functions > learnora-ai > versions. |
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

### 4.0 Google and Apple sign-in

| Item | Status |
|------|--------|
| **Google OAuth client** in Google Cloud Console (OAuth consent screen, Web application client). Authorised redirect URI: the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`. | UNVERIFIED |
| **Google provider enabled** in Supabase Auth → Providers → Google, with the client ID and secret from the step above. Add the app URL to Auth → URL Configuration → Redirect URLs. | UNVERIFIED |
| **Turn the button on** for a build: set `VITE_GOOGLE_SIGNIN=true` in the hosting environment. Leave it unset until the two rows above are done, or the button will fail for everyone. **2026-10-25:** set to `true` on Vercel production, then set back to `false` the same day, because Supabase's auth settings show `google: false` (checked via the public `/auth/v1/settings`). Turn it on again only after the Supabase row is verified. | UNVERIFIED |

Apple sign-in (added 2026-10-23) uses the same code path and needs:

| Item | Status |
|------|--------|
| **Apple Developer Program** membership (paid). In Certificates, Identifiers & Profiles: an App ID with "Sign in with Apple", a **Services ID** (this is the client ID) with the domain and return URL set to the Supabase callback `https://<project-ref>.supabase.co/auth/v1/callback`, and a **Sign in with Apple key** (.p8). | UNVERIFIED |
| **Apple provider enabled** in Supabase Auth → Providers → Apple, with the Services ID and the secret generated from the .p8 key, Team ID and Key ID. The generated secret **expires every 6 months** and must be regenerated, or Apple sign-in stops working. | UNVERIFIED |
| **Turn the button on** for a build: set `VITE_APPLE_SIGNIN=true` in the hosting environment, only after the two rows above are done. | UNVERIFIED |

Code: `OAuthSignInButtons.tsx`, `FinishAccountView.tsx` (DOB and AI-consent
step for Google and Apple sign-ups, `lib/accountDetails.ts`), and the gate in
`OnboardingGate.tsx`. Google and Apple sign-ups must answer the date of birth
and consent before the app opens; email sign-ups already do at the form.

### 4.0a Auth emails (Supabase templates)

| Item | Status |
|------|--------|
| **Paste the auth email templates** into Supabase → Authentication → Email Templates: one file per template in `email-templates/`, subjects in `SUPABASE_SETUP.md` §2. Regenerate them with `node scripts/email-templates.mjs` after editing the script. Until pasted, Supabase sends its default plain emails. | UNVERIFIED |
| **Enable the notification emails** (password changed, email changed) under Authentication → Notifications if they are not already on. | UNVERIFIED |

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
| Radox AI | `RADOX_API_KEY` (optional `RADOX_MODEL`) | **BLOCKED on you.** Code added 2026-10-15: paid backup, before OpenAI, disclosed to students. **Set and live-checked 2026-10-15**: key lists models, `claude-sonnet-5` answers, `response_format` is honoured (JSON mode on, `learnora-ai` v74+). Still unverified: the function's own Radox route inside a real student request. Under-16s are excluded in code (`radoxPermittedForAge`), so the route stays closed for them. |

**Decision:** which providers you are willing to pay for. With Groq as the
only live provider, one outage means no AI at all.

Optional verification tuning (defaults are fine): `QUIZ_VERIFIER_MODEL`
(cheaper checker model), `QUIZ_VERIFY_USER_DAILY` (default 20),
`QUIZ_VERIFY_GLOBAL_DAILY` (default 2000).

### 4.5 Other keys

**6.9 (decided 2026-10-15): age and the Radox terms.** Learnora stays at 13+ for the product. Radox AI's terms say 16 or older, so the Radox route is closed to under-16s in code (`radoxPermittedForAge`), and an unreadable date of birth is closed too. Students aged 13–15 get the other providers only. Still open: whether a personal discounted plan may serve other users' requests at all, since Radox's terms prohibit reselling API access without a written agreement. Ask Radox before relying on it for every student.

**Oak import, as reviewed 2026-10-07** (run in review mode, nothing written): 1,050 questions, all `gcse-maths` (Year 10 and 11, foundation and higher). Four sampled answers hand-checked and correct. 692 contain LaTeX (`$$…$$`); no explanations. **There is no GCSE science from Oak**: the API's science programmes stop at Year 9, so the sciences stay on the 228 Learnora-written questions. Run it yourself, from `webapp/`:

```bash
OAK_API_KEY=… SUPABASE_URL=https://mlvgqwqiynpwpwzqufdf.supabase.co \n  SUPABASE_SERVICE_ROLE_KEY=… node scripts/question-bank/import-oak.mjs --apply
```

Re-running is safe (duplicates are skipped). To undo: `delete from question_bank where source = 'oak';`. Also add the OGL attribution line to the About or Terms page (see `docs/QUESTION_SOURCES.md`).

| Item | Status |
|------|--------|
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
| 6.7 | **The quiz checker can be the model that wrote the quiz.** `secondaryCall` (learnora-ai) tries Gemini, then the first keyed provider in the chain, which today is Groq, the same model that usually generates. Smoke test 2026-10-13: all 6 questions `verified`, `by: groq`, written by Groq. Excluding the generator makes the check independent, but the next keyed provider (GitHub Models) returns empty replies and only one fallback is tried, so most checks would fail: seeded subjects would fall back to bank questions, others would show "unverified". Options: accept self-checks; exclude the generator and let OpenRouter (paid) check; or fix Gemini (503) as the checker. | DECISION |
| 6.8 | **Integrations that need your accounts** (asked for 2026-10-15): **Google Drive import is built** (2026-10-20, "Google Drive" button on the Upload tab; Picker + `drive.file` scope, browser-only, no secret used). To turn it on in production: set `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` (the Google Cloud project number) in Vercel and redeploy; confirm the production origin is an Authorized JavaScript origin on the OAuth client, the API key's referrer restriction allows it, and publish the consent screen from Testing so non-test users can sign in. The OAuth client secret was pasted in chat on 2026-10-20: rotate it, and note nothing reads it yet. UNVERIFIED. Still not built: Classroom import and two-way Google Calendar sync (need Google verification for those scopes); Canvas needs a developer key per school. Live notes *during* a lecture need a streaming speech-to-text provider (key + new edge function). Until then: share-to-Learnora, the capture bar's record-then-notes, and the plan's existing `.ics` export cover these without any setup. | DECISION |
| 6.11 | **Class misconception map privacy review** (built 2026-10-28, flagged off). Before any school or student uses it: is aggregate sharing with a teacher OK for under-16s without a parent's consent (UK Children's Code, GDPR-K, COPPA for anyone under 13)? Are the thresholds right (5 students sharing, beliefs held by 2+)? Does the privacy policy need a section on classes? Who can create a class (anyone, today)? Join codes are 8 characters with no rate limit on guessing. | DECISION |
| 6.12 | **Teacher review of the confusion-pair content** (shipped 2026-10-27, PR #155): 12 pairs, 72 short statements in `webapp/src/lib/confusionPairData.ts`, each meant to be true of one side and false of the other, plus the 7 habit names and moves in `webapp/src/lib/errorHabits.ts` (PR #156). Written by an agent, not a teacher. | DECISION |
| 6.6 | Exam boards beyond the current set (AP/SAT, other GCSE science boards); past papers can only be linked, not hosted (AQA refuses apps) | DECISION |

## 7. Known gaps in what shipped (code, not waiting on you)

- Verification ran against a live model on 2026-10-13 (see Done), but the
  checker was the generating model (6.7). The hint ladder has still only run
  under tests and fixtures.
- Seeded-subject quizzes fall back to the practice bank when every generated
  question is rejected. If a seeded subject has a thin bank, students see
  fewer questions rather than unverified ones.
- Report thresholds (3 reporters for bank, 1 for generated) are guesses; revisit
  after real reports exist.
- **Lecture recording (capture bar, 2026-10-15) has not run against a real
  model.** Only Gemini reads audio (4.4), and it was 503 on the last check.
  Chrome records WebM/Opus, which Gemini does not list as a supported audio
  type; Firefox (Ogg) and Safari (MP4) record formats it does list. Smoke
  test after merge: record 30 s in Chrome on the deployed app and confirm
  notes come back; if WebM is refused, convert to WAV/Ogg in the browser.
- **Share to Learnora** (manifest `share_target`, `public/sw.js`) only shows
  once the app is installed to a phone's home screen, and has not been tried
  on a device. Android Chrome supports it; iOS Safari does not.

## Done

| Date | What |
|------|------|
| 2026-10-13 | AI smoke test (was row 1.3), as learnoratesting@gmail.com: a GCSE Biology practice quiz came from Groq `openai/gpt-oss-120b` in 34 s, 6,092 in / 4,456 out tokens (the checker's tokens are counted in the quiz row; the `verify` row is only the daily-cap counter, with no provider or tokens). 6 of 6 questions `verified` (see 6.7), nothing rejected in `question_review_log`. |
| 2026-10-13 | `CEREBRAS_API_KEY` (was row 1.4): already absent from `supabase secrets list`; no code references it. |
| 2026-10-13 | PR #138 merged (numeric marking, Practice hints, Mock Exam numeric questions, retest/flashcard key leaks); applied `drop_legacy_leaderboard_overload` |
| 2026-10-10 | Oak import applied: 1,050 GCSE Maths questions (OGL v3.0), bank now 1,435; OGL credit added to Terms §6 |
| 2026-10-10 | PR #134 (`learning-engine`) merged; Vercel production deploy succeeded; `learnora-ai` v70 deployed from `main`. CI (`tests` workflow) green. |
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
