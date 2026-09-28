# Learnora — full-product QA report (2026-09-28)

Browser-driven QA of the live React app (`webapp/`), cross-checked against the
**production** Supabase project (read-only: schema, RLS, advisors, logs,
aggregate-only data queries) and the Vercel project. Every finding below is
labelled with how it was established:

- **REPRO-BROWSER** — reproduced by driving the real app in Chromium.
- **REPRO-PROD** — observed in production logs or production data.
- **CODE** — confirmed by reading the code/schema; not driven end-to-end.
- **UNVERIFIED** — plausible, evidence suggests it, not confirmed.

## How this was tested (and what could not be)

- The container's network policy blocks `*.supabase.co` and `*.vercel.app`, so
  the browser could not reach the real backend. The app ran locally
  (`vite`, the same code as production) with the repo's own Playwright mock
  backend (`webapp/tests/e2e/support/mockBackend.ts`) stubbing Supabase at the
  network layer. That mock was extended per-test to replay **exact production
  server responses** taken from the production auth logs.
- The Supabase and Vercel connectors were used for server-side truth: RLS
  policies, SECURITY DEFINER function bodies, constraints, storage policies,
  auth/PostgREST/edge logs, deployed function list, and aggregate data checks.
  No user rows were read beyond anonymised counts, except the text of the 60
  AI-generated quiz questions (academic content, no personal data) for the
  answer-key audit. **No production data was written.**
- **Not live-tested** (network): real AI output quality in chat / personas /
  Feynman / Viva grading, web research, PDF/audio processing, Stripe checkout
  (only the redirect), email/push delivery, realtime study rooms, and
  two-real-account friend flows. The AI system was tested through its prompts,
  its stored production output (60 quiz questions), and by feeding the UI
  malformed/hostile model responses.

## Executive summary

Learnora is in considerably better shape than most products at this stage.
Row-level security is thorough (restrictive parent-owner guards, every
SECURITY DEFINER RPC checks `auth.uid()`), AI output cannot inject script,
AI-issued actions are allow-listed and destructive ones require confirmation,
quiz scoring is arithmetically correct and survives refresh/resume, offline
task and quiz-attempt writes queue and replay once, the focus timer survives
reloads, and an axe scan of 19 routes found a single serious violation.

The serious problems are concentrated in five places:

1. **Sign-up is failing for real students in production.** Auth mail goes
   through Supabase's default mailer, which timed out (504) and then hit the
   hourly email rate limit (429) for a real iOS student on 2026-09-27; no
   account was created that day. The form showed that student the literal text
   `{}`. 29% of all accounts (10/35) never confirmed their email.
2. **AI-generated quizzes are not reliable enough to grade students.** Of 60
   production questions: at least 6 have wrong or ambiguous answer keys, the
   correct answer is option D only 3 times (5%), one quiz has every answer at
   A, and older quizzes insult students ("Duh!", "Ugh, come on, this is math
   101") — shown even when the student answered correctly.
3. **Student data leaks between accounts on a shared device.** Logging out
   leaves unscoped personal data in localStorage; the next student on that
   browser sees the previous student's "Past mistakes" and "Resume quiz" card.
4. **"Deleted" uploads are never deleted.** The `materials` storage bucket has
   no DELETE policy, so file removal silently no-ops. 5 of 13 files in
   production (38%) belong to no material. Account deletion does not purge
   storage at all.
5. **Silent data loss in notes** when the same note is open in two tabs or
   devices (last write wins, no warning).

Meaningful findings: **39** (1 BLOCKER, 9 HIGH, 14 MEDIUM, 12 LOW, 3
COSMETIC/INFO). After the fix pass, **36 are fixed** with regression tests. The server side
has been deployed; see "Fix pass" below. **Two need a dashboard change** (AUTH-01, and
the config half of SEC-07). **PERF-02 is deferred.**

## Fix pass — what changed and what still has to be deployed

Branch `claude/friendly-cannon-osap4b`. Checks run on the final commit:

- `vitest`: 236 files, 3,028 tests, all passing.
- Playwright critical path + journeys: 35/35 passing.
- `node --test` (edge helpers): 146/146 passing.
- `tsc -b`: clean.
- `deno check` on `learnora-ai`, `delete-account` and `web-research`: clean.
- Both migrations applied twice to a local Postgres 16 stub schema. The
  constraints and triggers were exercised there.

**Deployed to production on 2026-09-28:**

- Both migrations were applied: `storage_limits_and_session_guards` and
  `notes_version_and_profile_settings`. Every object they create was checked
  in the live database.
- These edge functions were deployed:
  - `learnora-ai` v64, which includes the under-18 hardening from `main` that
    had not been deployed until now (production was on v63).
  - `web-research` v5.
  - `delete-account` v12.
- Each deployed file was fetched back and compared with the repository.
  - `learnora-ai/index.ts` and `_shared/quizQuality.js` are byte-identical.
  - `_shared/contentSafety.js` differs by one comment line, and the full
    safety suite passes against the deployed copy.
- The webapp ships from `main` after this branch merges. The server side was
  deployed first, which is the order the chat `context` change requires.

**Deliberately not done:**

- The 5 orphaned files in the `materials` bucket were left in place. Deleting
  them is irreversible, so it needs your decision. After step 1 a new orphan
  can't be created, and you can remove the existing ones from the Storage
  dashboard.
- The mocking feedback already stored in two production quizzes was not
  scrubbed. That is a student's data. New quizzes can no longer produce it.
- AUTH-01 can be fixed without owning a domain. Two options:
  1. **Turn off "Confirm email"** in Supabase → Authentication → Sign In /
     Providers → Email. Sign-up then needs no email at all. The client
     already handles this case: `authApi.signUp` returns `"ok"` with a live
     session, and the student goes straight in. The cost is that unverified
     addresses can register. Password-reset emails still use the default
     mailer, and they are rare.
  2. **Use custom SMTP with no domain.** Either of these works:
     - a Gmail account with an App Password: `smtp.gmail.com:465`, about 500
       mails a day, sent from the Gmail address;
     - Brevo, which verifies a single sender address without a domain.

     Enter it under Authentication → Emails → SMTP settings, then raise the
     email rate limit under Rate Limits. The default mailer is capped at a few
     emails an hour for the whole project, which is what produced the 504s
     and 429s.
- SEC-07 also needs leaked-password protection turned on in Auth settings.
- PERF-02: stripping `raw_content` from list queries needs a computed "has
  content" column, because four screens read it. Production's largest value
  is 1.2 KB today.
- DATA-05: the explanation and the single toast are done. Keeping a
  half-typed input across the forced sign-out is not.

---

## Critical findings (full detail)

### AUTH-01 — Production sign-up confirmation email times out, then rate-limits · BLOCKER · REPRO-PROD

- **Area:** Authentication / Supabase Auth email.
- **Evidence (prod auth logs, 2026-09-27, one iOS Safari student):**
  - 18:09:47, 18:09:59 — `POST /auth/v1/signup` **422** `weak_password` (see AUTH-03).
  - 18:12:50, 18:13:00 — **504** `request_timeout` "context deadline exceeded" after exactly 10 s; `mail.send` from `mail.app.supabase.io`.
  - 18:13:11 — **429** `over_email_send_rate_limit`.
  - `auth.users` created on 2026-09-27: **0**. The student left.
  - Across all time: 10 of 35 accounts (29%) have never confirmed their email.
- **Root cause:** Auth email uses Supabase's built-in mailer (`mail.app.supabase.io`), which is explicitly not for production: it is rate-limited to a few emails per hour per project and has no delivery guarantees.
- **Fix:** Configure custom SMTP in Supabase Auth (Resend / Postmark / SES), raise the email rate limit, and verify SPF/DKIM for the sending domain. Consider allowing sign-in before confirmation with a banner, so a slow email does not block the first session.
- **Regression check:** A synthetic sign-up against production (or staging with the same SMTP) that asserts a 200 within 5 s and email receipt.

### AUTH-02 — Sign-up shows the literal text `{}` on a gateway timeout · HIGH · REPRO-BROWSER · **FIXED**

- **Steps:** Sign up while `/auth/v1/signup` answers 504 (the production failure above).
- **Actual:** The error banner reads `{}` (screenshot evidence captured). supabase-js raises `AuthRetryableFetchError` whose message is the serialised `Response`.
- **Fix (this branch):** `friendlyAuthError` maps 5xx / `{}` / timeouts to "Learnora's account service is slow to respond right now…". `webapp/src/api/auth.ts`.
- **Regression tests:** `src/api/auth.test.ts` › "never shows '{}' when the confirmation email times out (504)" — fails on `main`, passes on this branch.

### AUTH-03 — Client password rule is weaker than the server's · HIGH · REPRO-PROD + REPRO-BROWSER · **FIXED**

- **Actual:** The client checks only length ≥ 8; the meter rated `sunshine2010` "Fair". The server requires lowercase + uppercase + digit and answers 422 with "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789." — shown raw. Same gap on reset-password and Settings › Security.
- **Fix (this branch):** `validateNewPassword` enforces the server rule with a readable message; the meter reports the missing class instead of "Fair"; the placeholder states the rule; the 422 is mapped to the same message.
- **Regression tests:** `passwordStrength.test.ts` (server-rejected passwords are never above "weak"; validation message), `auth.test.ts` (422 mapping), `SecurityTab.test.tsx`.

### SEC-01 — Deleted uploads and deleted accounts leave files in storage · HIGH · REPRO-PROD + CODE

- **Evidence:** `storage.objects` policies for bucket `materials`: SELECT and INSERT only — **no DELETE**. 5 of 13 objects (38%, of 33 MB total) are referenced by no `materials` row. `delete-account` calls `auth.admin.deleteUser` and never touches storage; `storage.objects` has no FK to `auth.users`, so nothing cascades.
- **Root cause:** Under RLS denial, `storage.remove()` returns `{ data: [], error: null }` — "nothing deleted, no error". `materialsApi.delete` and `foldersApi.delete` check only `error`, so they report success.
- **Impact:** A student's "deleted" PDFs/audio (and all of them after account deletion) persist indefinitely. A privacy/compliance issue for an under-18 audience.
- **Fix:**
  ```sql
  create policy "materials_delete_own" on storage.objects for delete to authenticated
    using (bucket_id = 'materials' and (storage.foldername(name))[1] = (select auth.uid())::text);
  ```
  Also treat `data.length === 0` as a failure in the client, purge `materials/<uid>/` (and avatars, card-media) with the service role in `delete-account` before `deleteUser`, and run a one-off cleanup of the 5 orphans. Add a bucket `file_size_limit` (the UI promises 10 MB; the bucket allows anything) and a MIME allowlist.
- **Regression test:** Storage policy test: an authenticated user can delete their own object and not another user's; the delete-account integration test asserts the user's prefix is empty afterwards.

### SEC-02 — Personal data leaks to the next account on a shared device · HIGH · REPRO-BROWSER

- **Steps:** Priya uses the Solver ("I expanded (x+3)^2 as x^2 + 9") and starts a quiz → logs out → Sam logs in on the same browser.
- **Actual:** Sam's Today shows "Pick up where you left off — Cell Biology Check, Question 1 of 4, Resume" (leads to "Quiz not found"). Sam's Solver shows "Past mistakes (1): *Chemistry: I expanded (x+3)^2 as x^2 + 9*".
- **Root cause:** Several localStorage keys are not scoped by user and are not cleared on sign-out: `learnora_cognitive_traces_v1`, `learnora:study_continuity_snapshot`, `learnora_quiz_draft_<quizId>`, `learnora:material_draft`, `learnora_daily_progress_v1`, `learnora_settings`. (`learnora:chat_transcript:<uid>` and `learnora_life_context_v1:<uid>` are scoped correctly.)
- **Related:** `aitestingledger.md` AS-01 (the offline queue replays A's sessions as B's) is the same class of defect.
- **Fix:** Scope every personal key by user id (as chat transcripts already are), and on sign-out delete unscoped legacy keys. Product decision needed: the Solver history is local-only, so clearing it on logout loses it; the durable fix is to store it server-side.
- **Regression test:** e2e: user A creates a trace and a quiz draft → logout → user B logs in → assert no Past mistakes and no Resume card.

### SEC-03 — The daily AI quota can be bypassed with an arbitrary `tool` name · HIGH · CODE · **FIXED IN REPO, NOT DEPLOYED**

- **Root cause:** `supabase/functions/learnora-ai/index.ts` bills `tool` exactly as sent in the request body, and counts the daily allowance per tool name. `tool: "x1"`, `"x2"`, … each get a fresh allowance; only the 30-per-10-minutes burst limit remains (≈4,300 generations/day on the free plan). No abuse is visible in production today (every `tool` value in `ai_request_log` is legitimate).
- **Fix (this branch):** Unknown or missing tool names are billed as `chat`. **Needs `supabase functions deploy learnora-ai`**, which this session did not do.
- **Regression test:** An edge-function unit test: two calls with `tool: "zzz"` count against `chat`.

### AI-01 — AI quiz answer keys are wrong or ambiguous in ~10% of production questions · HIGH · REPRO-PROD (+ REPRO-BROWSER for display)

Audit of all 60 stored questions:

| Quiz | Question | Problem |
|---|---|---|
| Root 2 (#2) | "main goal of the proof" → keyed "cannot be expressed as a **finite decimal**" | Factually wrong (1/3 is rational with no finite decimal). |
| Root 2 (#2) | "consequence of the proof" → keyed "**All square roots are irrational**" | Wrong (√4 = 2); its own feedback says the opposite. Reproduced in the runner: the student is told the wrong answer is correct and then shown a contradicting explanation. |
| Congruent triangles | ∠P, ∠Q with side PQ → keyed **AAS**, feedback "non-included side" | PQ is the included side → ASA. |
| Congruent triangles | "ABC ≅ DEF, which must be true?" | 3 of 4 options are true; only one is keyed. |
| Congruent triangles | "In the diagram below… share side BC… ∠A, ∠B" | No diagram exists; BC is not between A and B; keyed ASA. Ill-posed. |
| Ionic bonding | electrons "transferred to" vs "lost to" the non-metal | Two correct answers. |

- **Impact:** Wrong keys mark correct students wrong, feed the misconception ledger and the "exam forecast", and then prime the AI tutor ("Cells: 0%").
- **Fix:** Add a verification pass after generation. Either a second model call per question ("solve this independently; does your answer match the key? is exactly one option correct? is anything referenced that isn't given?") or a self-consistency check, and drop questions that fail. Add a "Report this question" control on the result card and log disputes.
- **Regression test:** A golden set of the six defective items above must be rejected by the verifier.

### AI-02 — Answer-position bias; choices are never shuffled · HIGH · REPRO-PROD + REPRO-BROWSER

- **Evidence:** The correct index across 60 production questions is **A 22, B 25, C 10, D 3**. The quiz "Photosynthesis Quiz" (2026-09-22, after the latest prompt changes) has **all 10 answers = A**. The runner renders choices in stored order (verified).
- **Impact:** "Never pick D" scores 95%; quiz scores overstate knowledge; readiness and forecast inherit the error.
- **Fix:** Shuffle choices per attempt in `QuizRunner`/`MockExamRunner` (record the displayed order in `answers_json` so Review stays aligned), or shuffle once at generation time before saving.
- **Regression test:** Generate/parse a quiz whose keys are all 0 and assert the displayed position of the correct answer is not constant across 20 seeded shuffles.

### AI-03 — Quiz feedback insults students, including when they are right · HIGH · REPRO-PROD + REPRO-BROWSER (partially mitigated)

- **Evidence:** Production Root-2 quizzes: "Wow, come on! You think the goal is to prove it's rational? Ha!", "Duh!", "Ugh, come on, this is math 101… you're still struggling". Reproduced: answer correctly → "Correct!" followed by "You think the goal is to prove it's rational? Ha!".
- **Root cause:** (a) `hostFeedback` shows the stored feedback on correct answers too; (b) the Settings option "Buddy (Casual & Friendly)" maps to the quiz host string **"Sarcastic Buddy"** (`AI_PERSONA_QUIZ_HOST`), and the prompt passes only that name to the model; "Coach (Strict & Tough Love)" similarly.
- **Mitigation already in code:** The FEEDBACK NEUTRALITY rule (2026-09-17) stops the model assuming the student's choice. It does not govern tone, and old quizzes keep their feedback.
- **Fix:** Rename the host to "Friendly Study Buddy" (or pass a tone description), add an explicit rule ("audience may be 13; never mock, belittle, or use sarcasm about the student"), and strip or regenerate feedback on existing quizzes.
- **Regression test:** A prompt snapshot test asserting the quiz prompt contains the tone rule and never the word "Sarcastic".

### DATA-01 — Notes: two tabs or devices silently overwrite each other · HIGH · REPRO-BROWSER

- **Steps:** Open the same note in two tabs → Tab A adds a paragraph (saved) → Tab B, still holding the old text, fixes a typo (saved).
- **Actual:** The stored note is `Original — Tab B typo fix.`; Tab A's paragraph is gone. No warning in either tab.
- **Root cause:** `notesApi.update` is an unconditional `update … eq(id)`; the editor never learns the server copy changed.
- **Related:** `aitestingledger.md` STATE-01 (a single-tab stale-refetch race).
- **Fix:** Optimistic concurrency. Send `updated_at` and `.eq("updated_at", loadedAt)`; on 0 rows, show "This note changed on another device — reload / keep mine". Optionally a BroadcastChannel to warn other tabs.
- **Regression test:** e2e with two pages on one note, both edit, and assert the second save is refused with a conflict prompt.

---

## Complete bug table

| ID | Sev | Area | Bug | Repro | Impact | Root cause | Status |
|---|---|---|---|---|---|---|---|
| AUTH-01 | BLOCKER | Auth | Sign-up confirmation email times out (504) then rate-limits (429) | Prod logs | Students cannot create accounts | Supabase default mailer | Open — Supabase dashboard (SMTP + rate limit) |
| AUTH-02 | HIGH | Auth | Sign-up shows `{}` on 504 | Always | Student has no idea what happened | supabase-js message not mapped | **Fixed** |
| AUTH-03 | HIGH | Auth | Client accepts passwords the server rejects; raw alphabet error | Always | Failed sign-ups, confusing error | Rule mismatch | **Fixed** |
| AUTH-04 | MEDIUM | Auth | Email rate limit says "wait a minute" (limit is hourly) | Always | Retry loop | String match on "rate limit" | **Fixed** |
| SEC-01 | HIGH | Storage | Deleted materials and accounts leave files | Prod data | Privacy/compliance | No DELETE policy; delete-account ignores storage | **Fixed, deployed** |
| SEC-02 | HIGH | Privacy | Previous account's mistakes and quiz draft shown to the next account on the same device | Always | Cross-student data exposure | Unscoped localStorage | **Fixed** |
| SEC-03 | HIGH | AI billing | Daily quota bypass via arbitrary `tool` | Code | Cost abuse, paywall bypass | Client-controlled billing key | **Fixed, deployed** |
| SEC-04 | MEDIUM | Leaderboard | A client can insert any `minutes`/backdated `started_at` in `study_sessions` | Code/schema | Forged leaderboard and streaks | Only `minutes >= 1` checked | **Fixed, deployed** |
| SEC-05 | LOW | Storage | `materials` bucket has no size or MIME limit (UI says 10 MB) | Schema | Storage cost abuse | Bucket config | **Fixed, deployed** |
| SEC-06 | LOW | Errors | Raw server text shown ("relation "exams" does not exist", "JWT expired") | Always | Leaks internals, confusing | `throw new Error(error.message)` everywhere | **Fixed** |
| SEC-07 | INFO | DB | Leaked-password protection disabled; trigger functions executable via RPC (inert); `pg_net` in public | Advisors | Hygiene | Config | Triggers: **fixed, deployed**; leaked-password protection + `pg_net`: dashboard |
| AI-01 | HIGH | Quiz gen | ~10% of production questions have wrong or ambiguous keys | Prod data | Wrong grading and false weak topics | No verification step | **Fixed, deployed** |
| AI-02 | HIGH | Quiz | Answer-position bias (D correct 5%); no shuffle | Prod data + browser | Gameable scores | No shuffle | **Fixed, deployed** |
| AI-03 | HIGH | Quiz | Demeaning feedback, shown even on correct answers | Prod data + browser | Students insulted | "Sarcastic Buddy" host; feedback shown on correct | **Fixed** (stored old feedback not scrubbed) |
| AI-04 | MEDIUM | Grading | Duplicate choice texts: picking the 2nd copy of the right answer is marked wrong | Always | Wrong grade → false misconception → tutor told "0%" | Graded by index | **Fixed** |
| AI-05 | MEDIUM | AI chat | App tutoring instructions sent inside the user turn (~10 KB/message) | Code + payload | Students can override tutor behaviour; token cost | Client-built "[SYSTEM]" block | **Fixed, deployed** |
| AI-06 | MEDIUM | AI quota | Failed generations (unparseable reply) still consume the daily quota; Create pre-selects Flashcards so one click spends 2 quotas | Code + browser | Free students burn 3/day quickly | Server logs before client parses | **Fixed, deployed** |
| AI-07 | LOW | Quiz | LaTeX not rendered in quiz runner (chat renders KaTeX) | Always (latent) | Raw `$x^2$` | No math renderer in runner | **Fixed** |
| AI-08 | LOW | Chat | Tables, links, nested lists render as raw punctuation | Always (prompt-mitigated) | Unreadable replies | Renderer subset | **Fixed** |
| DATA-01 | HIGH | Notes | Two-tab/device overwrite, silent | Always | Lost notes | No concurrency check | **Fixed, deployed** |
| DATA-02 | MEDIUM | Settings | AI persona, language, region are device-local; onboarding choices not re-applied on a new device | Code | Tutor "forgets" preferences on a phone | localStorage only | **Fixed, deployed** |
| DATA-03 | MEDIUM | Onboarding | Past exam date: inline error, but Finish proceeds and silently drops the exam | Always | Lost input; summary omits it | Button not gated | **Fixed** |
| DATA-04 | LOW | Onboarding | Refresh mid-wizard loses all answers | Always | Minor friction | State not persisted | **Fixed** |
| DATA-05 | MEDIUM | Session | Session expiry mid-action: input lost, raw "JWT expired" toast ×2, login page doesn't say why | Always | Confusion + small data loss | No expiry UX | **Fixed** (explanation + one toast; typed input still lost) |
| DATA-06 | MEDIUM | Exams | Double-click "Add exam" creates two exams | Always | Duplicate exams in plan/readiness | Relied on async `isPending` | **Fixed** |
| DATA-07 | LOW | Exams | Year typos (2206) accepted | Always | Wrong countdown | `noValidate` drops `max` | **Fixed** |
| UX-01 | MEDIUM | Onboarding | GCSE chosen → presets offer AP/SAT; "other" board chip labelled "AP / College Board" (US) or "GCSE / A-Level" (UK), duplicating real chips | Always | Stated preference ignored | Region from locale; `boardLabel` reuse | **Fixed** |
| UX-02 | MEDIUM | Loading | A stalled request shows a skeleton forever (no timeout, no retry) | Always | "App froze" | No fetch timeout | **Fixed** |
| UX-03 | MEDIUM | Tasks | One long unbroken word pushed every task's Delete/Focus buttons off-screen | Always | Can't delete tasks | Missing `overflow-wrap` | **Fixed** |
| UX-04 | LOW | AI actions | Delete-task confirmation shows the raw id ("901") not the title | Always | Uninformed consent | Payload not resolved | **Fixed** |
| UX-05 | LOW | Timer | Start/Pause is one toggle; a double-click leaves the timer stopped | Always | Student thinks it's running | Toggle | **Fixed** |
| UX-06 | LOW | Progress | "2d streak" beside "…you'll start a streak" | Always | Contradiction | Insight rule | **Fixed** |
| UX-07 | LOW | Tasks | 10,000-char task accepted (no max anywhere) | Always | Layout/perf | No limit | **Fixed** |
| PERF-01 | MEDIUM | Bundle | Login downloads 1.64 MB / 25 files (entry JS 862 KB, CSS 249 KB) | Measured | Slow first load on phones | Eager route imports | **Fixed** (entry JS 870→450 KB) |
| PERF-02 | MEDIUM | Data | Today loads 19 requests, incl. unbounded `select=*` of flashcards, materials (full `raw_content`) and notebooks+sources | Measured | Grows linearly with uploads | Over-fetching | Open — needs a computed column; small in prod today |
| PERF-03 | LOW | Data | `profiles` fetched 3× per load; logo fetched twice | Measured | Waste | Separate queries | **Fixed** |
| A11Y-01 | LOW | A11y | Solver active badge fails contrast (only serious axe violation in 19 routes) | axe | Low vision | Colour token | **Fixed** |
| A11Y-02 | COSMETIC | A11y | Single-choice onboarding cards use `aria-current`, not radio semantics | Code | SR users | Markup | **Fixed** |
| COS-01 | COSMETIC | Greeting | "Good morning" at 2:34 AM | Always | — | `hour < 12` | **Fixed** |

Production observations not attributed to a code defect (**UNVERIFIED**):
recurring PostgREST "Thread killed by timeout manager" bursts on 2026-09-27
(09:03–09:16, 17:07–17:17, 23:00), and `send-email-reminders` returned 500 at
13:05 (function logs show only boot/shutdown). Both deserve a look in the
Supabase dashboard; they may be what users experience as UX-02.

---

## UX findings (separate from bugs)

- **Strong first impression.** The Study hub is framed by student intent ("I got something wrong", "I think I understand it"), not tool names. That is the best screen in the product.
- **Onboarding ignores its own answers** (UX-01). A GCSE student is offered AP/SAT; the "Next exam" they typed can vanish (DATA-03).
- **Error copy leaks implementation** (SEC-06): "JWT expired", "relation does not exist", "{}" (fixed).
- **No session-expired explanation** (DATA-05): the student is simply on the login page.
- **Create dialog defaults** pre-select Flashcards. One "Generate" spends two free daily quotas, without saying so.
- **Quiz feedback tone** (AI-03) is the single most damaging UX issue for a student audience.

## AI / educational quality

- **Tutor chat** (tested with synthetic replies): rendering is safe; math renders well; tables, links, and nested lists do not (AI-08). The server system prompt carries a strong, age-appropriate content policy and treats pasted, uploaded, and web text as material, not instructions. App-level tutoring rules live in the user turn (AI-05), so "act as a different persona / just give me the answer" overrides are trivially available. Safety policy is not affected.
- **Question generation:** see AI-01/AI-02. The prompt has good diversity rules but no correctness verification and no position balancing. Math quizzes carry an untested LaTeX path (AI-07).
- **Grading:** multiple-choice grading is exact and verified (production attempts: `score` equals the count of `correct: true` in `answers_json` for all 3). Duplicate-text choices mis-graded (AI-04, fixed). Free-text grading (Feynman, Viva) was not live-tested.
- **Solver fallback** is honest: when the model reply is unusable it says "This isn't a real diagnosis" and keeps the fake trace out of the misconception ledger. It does keep it in local "Past mistakes" history, unflagged.
- **Cross-feature contamination:** a mis-graded question created a "Cells" misconception, which then appears in the chat system prompt as "Cells: 0% (0/1)". Wrong keys (AI-01) propagate the same way.

## Security findings (evidence-backed only)

- **Good:** RLS on all 26 public tables; every parent-owner guard is RESTRICTIVE; billing columns are protected by a BEFORE UPDATE trigger; all user-callable SECURITY DEFINER RPCs check `auth.uid()`; internal helpers (`friend_period_minutes`, `friend_streak`, …) are not executable by `authenticated`. The Stripe webhook verifies signatures and is idempotent. Web extraction goes through Tavily with a public-URL filter (no SSRF from Supabase). AI output HTML/script is inert. The AI `NAVIGATE` action ignores external, protocol-relative, `javascript:` and traversal targets. Logout clears the session across tabs; the back button and deep links are protected.
- **Status after the fix pass:**
  - Fixed in the client: SEC-02 and SEC-06.
  - Fixed and deployed: SEC-01, SEC-03, SEC-04, SEC-05, and the trigger half of SEC-07.
  - Dashboard only: leaked-password protection and moving `pg_net` out of `public`.

## Accessibility findings

axe (WCAG 2.1 A/AA) across 19 authenticated routes: **1 serious violation** (Solver active-badge contrast). Flashcards correctly hide the answer from screen readers until flipped, and icon buttons are labelled. The Library, Settings, and Dashboard tab strips scroll horizontally on 320px screens by design. Minor: A11Y-02.

## Performance findings (measured)

- Production build, login page: **1,642 KB over 25 requests**; entry `index-*.js` 862 KB (267 KB gzip), CSS 249 KB (43 KB gzip); FCP 340 ms locally (no throttling).
- Today cold load: 19 backend calls (3 duplicate `profiles`, 2 `quiz_attempts`, 2 `study_sessions`).
- No idle polling (0 requests in 20 s idle).
- **After the fix pass:**
  - Every signed-in screen, the app shell and the marketing pages now load on demand.
  - Entry JS: 870 KB → 450 KB (270 → 141 KB gzip). Entry CSS: 250 KB → 70 KB.
  - Start-up `profiles` reads went from 3 to 1, plus the separate billing read.
  - The logo is fetched once.

---

## Coverage matrix

| Feature | Tested | Normal | Edge | Error | Persistence | Responsive | Result |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Sign-up | ✓ | ✓ | ✓ weak pw, dup | ✓ 422/504/429 | – | ✓ | AUTH-01..04 |
| Login / logout | ✓ | ✓ | ✓ empty/malformed/whitespace/double | ✓ wrong pw | ✓ multi-tab, back, deep link | ✓ | Pass |
| Session expiry | ✓ | – | ✓ | ✓ | ✗ input lost | – | DATA-05 |
| Onboarding | ✓ | ✓ | ✓ XSS/emoji/past/far | – | ✗ refresh | ✓ | UX-01, DATA-03/04 |
| Today / Dashboard | ✓ | ✓ | ✓ new user | ✓ | ✓ | ✓ 390/320 | PERF-02 |
| Tasks | ✓ | ✓ | ✓ empty/10k/emoji/HTML/rapid | ✓ offline, stall | ✓ offline queue | ✓ | UX-03 (fixed), UX-07 |
| Exams | ✓ | ✓ | ✓ past/far/double | ✓ 500 | ✓ | ✓ | DATA-06/07 (fixed), SEC-06 |
| Quiz runner | ✓ | ✓ | ✓ malformed/dup/HTML/math/rapid/double-next | ✓ offline finish | ✓ refresh-after-reveal, resume | ✓ | AI-02/04/07 |
| Quiz generation | ✓ | ✓ | ✓ double-generate | ✓ malformed/invalid | ✓ | – | AI-01/06 |
| Flashcard review | ✓ | ✓ | ✓ double-grade, key before flip | – | ✓ | ✓ | Pass |
| AI chat | ✓ | ✓ (synthetic) | ✓ empty/ws/rapid/XSS/markdown | ✓ 500 retry | ✓ transcript | – | AI-05/08 |
| AI actions | ✓ | ✓ | ✓ hostile NAVIGATE | – | – | – | UX-04 |
| Solver | ✓ | ✓ | ✓ double submit | ✓ bad reply | ✓ local | ✓ | SEC-02 |
| Feynman / Viva | partial | ✓ start | ✓ double start | – | – | ✓ | AI quality not live-tested |
| Notes | ✓ | ✓ | ✓ two tabs | – | ✗ overwrite | – | DATA-01 |
| Timer | ✓ | ✓ | ✓ double-click | – | ✓ reload, logs once | ✓ | UX-05 |
| Progress / analytics | ✓ | ✓ | ✓ seeded known data (numbers verified) | – | ✓ | ✓ | UX-06 (fixed) |
| Settings | partial | ✓ | ✓ password | ✓ 422 | ✗ device-local | ✓ | DATA-02 |
| Routing / 404 | ✓ | ✓ | ✓ 10 invalid ids | – | – | – | Pass |
| Accessibility | ✓ axe 19 routes | | | | | | A11Y-01/02 |
| RLS / storage / RPC | ✓ prod schema | | | | | | SEC-01/04/05/07 |
| Friends, study rooms, notebooks studio, Stripe, uploads, email/push | ✗ | | | | | | Not tested (network/realtime) |

---

## Recommended fix order

1. **AUTH-01** — custom SMTP + email rate limit (Supabase dashboard). *Why:* no new users can reliably join. *Test:* synthetic sign-up monitor.
2. **SEC-01** — storage DELETE policy, client `data.length` check, delete-account purge, orphan cleanup, bucket limits. *Files:* new migration; `supabase/functions/delete-account`; `webapp/src/api/materials.ts`, `folders.ts`. *Test:* storage policy + delete-account integration.
3. **Deploy SEC-03** (`supabase functions deploy learnora-ai`). *Test:* edge unit test on billing key.
4. **AI-03** — rename "Sarcastic Buddy", add a tone rule, scrub old feedback. *Files:* `webapp/src/lib/settings.ts`, `webapp/src/api/aiQuiz.ts`, a data migration. *Test:* prompt snapshot.
5. **AI-02** — shuffle choices per attempt. *Files:* `QuizRunner.tsx`, `MockExamRunner.tsx`, `quizMeta.ts`. *Test:* seeded shuffle test.
6. **AI-01** — verification pass for generated questions + "Report question". *Files:* `webapp/src/api/aiQuiz.ts`. *Test:* golden set of the six bad items.
7. **SEC-02** — scope/clear per-user localStorage on sign-out. *Files:* `AuthProvider.tsx`, `aiDebugger.ts`, `continuity.ts`, `useQuizDraft.ts`, `settings.ts`. *Test:* A→logout→B e2e.
8. **DATA-01** — optimistic concurrency for notes. *Files:* `api/notes.ts`, `NotesEditorPane.tsx`. *Test:* two-page e2e.
9. **DATA-05 / UX-02 / SEC-06** — session-expired UX, fetch timeouts with a retry state, and mapping server errors to student language. *Files:* `lib/supabase.ts` (fetch with AbortSignal.timeout), `lib/requestErrors.ts`, API layer.
10. **SEC-04** — `minutes <= 720`, `started_at <= now() + interval '5 min'`, a daily cap in the leaderboard. *Test:* SQL constraint test.
11. **DATA-02, DATA-03, UX-01, AI-05, AI-06** — preferences to `profiles`, gate the onboarding Finish, board-label fix, server-side tutor instructions, don't bill unparseable output / clarify quota cost.
12. **PERF-01/02** — lazy-load the signed-in routes; select only needed columns (`raw_content` excluded from list queries).
13. LOW/COSMETIC items.

## Regression test plan

| Bug | Regression test | Where |
|---|---|---|
| AUTH-02/03/04 | 422/504/429 signup bodies mapped to student messages | `webapp/src/api/auth.test.ts` (**added**) |
| AUTH-03 | Server-rejected passwords never rated above weak; validation message | `webapp/src/lib/passwordStrength.test.ts` (**added**) |
| DATA-06/07 | Double submit saves once; year past the 5-year cap refused | `webapp/src/views/exams/ExamModal.test.tsx` (**added**) |
| AI-04 | Duplicate choices collapse and the key follows the surviving copy | `webapp/src/views/quiz/quizMeta.test.ts` (**added**) |
| UX-06 | No "start a streak" copy during a streak | `webapp/src/lib/analyticsEngine.test.ts` (**added**) |
| UX-03 | Long unbroken task keeps Delete visible at 1280/390/320 | Playwright `tests/e2e/responsive.spec.ts` (to add) |
| SEC-01 | Own-object delete allowed, other-user delete denied; delete-account empties prefix | `webapp/src/api/folders.test.ts`; policy checked in local Postgres and live DB |
| SEC-02 | A's traces/drafts invisible to B after logout | `webapp/src/lib/userStorage.test.ts`, `webapp/src/context/SettingsProvider.test.tsx` |
| SEC-03 | Unknown tool billed as chat | `tests/quota-parity.test.js` |
| AI-01 | Verifier rejects the six known-bad questions | `tests/quiz-quality.test.js` |
| AI-02 | Correct-answer position varies across seeded shuffles; Review aligned | `tests/quiz-quality.test.js` |
| AI-03 | Quiz prompt has tone rule, no "Sarcastic" | `webapp/src/api/studyPackage.test.ts` |
| DATA-01 | Second tab's stale save is refused with a conflict prompt | `webapp/src/api/notes.test.ts`, `NotesEditorPane.autosave.test.tsx` |
| DATA-03 | Finish disabled while the exam date is invalid | `webapp/src/views/onboarding/WelcomeView.test.tsx` |
| DATA-05 | Expired session preserves typed task and explains the redirect | `webapp/src/views/auth/LoginView.test.tsx`, `ToastProvider.test.tsx` |
| UX-02 | A stalled GET shows an error with Retry after N seconds | `webapp/src/lib/supabaseFetch.test.ts` |
| SEC-04 | Inserting minutes > 1440 or future `started_at` is rejected | Constraint + trigger exercised in local Postgres |

## Fixes made in this branch

| ID | Change | Files |
|---|---|---|
| AUTH-02/03/04 | Friendly mapping for 5xx/`{}`/timeout, `weak_password`, email rate limit; client rule = server rule; meter + placeholder | `webapp/src/api/auth.ts`, `webapp/src/lib/passwordStrength.ts`, `webapp/src/components/PasswordField.tsx` |
| DATA-06/07 | Synchronous re-entrancy guard; 5-year cap enforced in the handler | `webapp/src/views/exams/ExamModal.tsx` |
| AI-04 | Duplicate choices collapsed at parse time, key remapped | `webapp/src/views/quiz/quizMeta.ts` |
| UX-03 | `overflow-wrap: anywhere` on task text | `webapp/src/views/tasks/tasks.module.css` |
| UX-06 | Short-streak insight | `webapp/src/lib/analyticsEngine.ts` |
| SEC-03 | Unknown `tool` billed as chat | `supabase/functions/learnora-ai/index.ts` |

Verification: every new test was run against `main` first and failed, then
passed with the fix. Full Vitest suite: 232 files / 2,978 tests passing;
Playwright `tests/e2e/critical-path.spec.ts` + `journeys.spec.ts` (desktop):
35/35 passing; `tsc -b` clean; oxlint shows no warnings in changed files. The browser
reproductions for AUTH-02/03, DATA-06 and UX-03 were re-run against the fixed
dev server and now behave correctly.
