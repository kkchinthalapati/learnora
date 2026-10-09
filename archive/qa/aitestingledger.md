# AI Testing Ledger

Complete findings and evidence from this session. No live deployment verification is implied.

# LEARNORA STUDENT QA REPORT

Assessment dates: 20–21 September 2026. Mode: read-only product QA; isolated diagnostic artifacts only.

## Executive Summary

**Six defects were reproduced against local application code: four P2 and two P3. None was reproduced on the deployed website.** The most consequential findings are loss of newly typed notes, loss of completed quiz answers after a failed save, and replay of one account's offline study session under another account.

The existing targeted tests passed **183 tests across 12 files**. Seven additional diagnostic cases demonstrate six defects: five expected-behavior assertions fail, while two observation tests pass by explicitly asserting the erroneous behavior. Those two passing diagnostics are evidence of bugs, not successful product behavior.

**This is an incomplete live student audit, not a production sign-off.** The requested Browser connection repeatedly returned `Browser is not available: iab`; discovery returned `[]`. No login was attempted, no screenshots were captured, and no live student content or settings were changed. The provided credentials were not copied into artifacts.

## Environment

| Item | Observed state |
| --- | --- |
| Target | https://learnora-app.vercel.app |
| Repository | `C:\Users\kkchi\OneDrive\Desktop\study-planner-1`; live React application in `webapp/` |
| Branch / HEAD | `main` / `fea0369a6b8b9c72a61d071f317365ebf2c191ae` |
| Remote verification | GitHub branch lookup and subsequent `git ls-remote origin refs/heads/main` returned the same commit |
| Deployed commit | Unknown; repository HEAD was not assumed to identify the Vercel deployment |
| Worktree | Existing changes in continuity, dashboard tests, Solver, QuizRunner, and a work log were preserved. No application files edited by this QA pass |
| Relevant local difference | QuizRunner had an existing import and completion call to `clearQuizProgress`; draft deletion before save also exists in the pinned commit |
| Runtime | Windows PowerShell, Node 24.18.0, Vitest 4.1.10, jsdom; single-worker thread pool |
| Browser | Requested in-app Browser unavailable; no browser version, viewport, or device measurements obtained |
| Backend | GitHub reads available. Live Supabase, storage, RLS enforcement, Stripe, notifications, and AI providers not exercised |
| Test isolation | Existing tests use MSW with unhandled requests treated as errors. Additional diagnostics mock backend/auth/AI boundaries; no production requests are required |
| Changes made | Tests, configurations, JSON evidence, and this report under `C:\Users\kkchi\learnora-qa-20260920` only |

### Application map — repository evidence, not runtime verification

- React 19 / TypeScript / Vite 8, React Router, and TanStack Query. React context owns auth, settings, timer, chat, dialogs, appearance, and overlays.
- Vite/router base is `/app/`; Vercel rewrites app deep links to the SPA. Root marketing content and public handlers are separate. Node 24 is the declared development/build requirement.
- Public auth includes login, signup, verification, recovery, and password reset. Protected routes pass through onboarding before the application shell. Supabase Auth persists and refreshes sessions.
- Main student surfaces: Today, Dashboard, Library, subject folders, notebooks, notes, tasks, exams, Plan, My Week, timer, flashcards/review, quiz/mock exam/review, analytics, and trajectory.
- Study tools: chat, Solver, Feynman, Viva, Exam Detective. Community includes friends and study rooms. Account/settings and Pro welcome are present.
- Supabase provides database access, auth, storage, realtime, and edge functions. Local storage additionally holds drafts, offline work, transcripts, and preferences. Local UI development still points to the configured live Supabase project unless intercepted.
- AI calls pass through `learnora-ai`; web research uses Tavily. Stripe billing and webhook functions exist. Email reminders use Resend; push reminders use VAPID configuration and a service worker. Actual configuration/availability was not established.
- Error handling includes route/overlay boundaries, query/mutation error callbacks, auth recovery, toasts, and optional Sentry monitoring. Relevant environment dependencies include provider API keys, Stripe secrets/prices/webhook secret, Resend, VAPID, cron authorization, allowed origins, Supabase service credentials, and `VITE_SENTRY_DSN`. Secret values were not inspected.
- Automated coverage includes Vitest/component tests, mocked Playwright critical paths, persona suites, and a separately gated live-account suite. The live suite writes real rows and consumes model quota; it was deliberately not run under the read-only policy.

## Coverage

| Classification | Scope |
| --- | --- |
| TESTED — local | Note save/refetch race; quiz failure and remount; offline account-switch replay; lost-response session duplication; active query/auth renewal; AI response-body timeout and cancellation |
| TESTED — existing isolated suites | Auth provider, login, onboarding, tasks, flashcard review, guest migration, billing API mapping, quiz runner, note autosave, AI caller, offline queue, session recovery: 183 assertions passed |
| PARTIALLY TESTED | Persistence and account isolation at client/API boundaries; error UX and selected accessibility semantics in jsdom; cross-feature state transitions under controlled mocks |
| PARTIALLY TESTED — inspection only | Routes, architecture, deployment rules, backend policies, test design, inline AI edit removal, external-service wiring |
| NOT TESTED | Deployed login and onboarding, rendered desktop/mobile UI, real keyboard/touch journeys, browser Back/Forward, real multi-tab/cross-device behavior, live AI teaching, database persistence, payments, reminders, realtime collaboration, uploads/extraction, production console/network, deployment CSP/service worker behavior |

The personas selected for local adversarial cases were slow-connection, distracted, returning/shared-device, impatient, and power users. They were not mechanically applied to every screen.

## Confirmed Bugs

**Confidence convention:** CONFIRMED below means directly reproduced in the stated isolated environment using application code. It does not mean observed in production. Each case reproduced in both its initial successful diagnostic execution and the final evidence run (2/2 controlled runs); live reproduction rate is unknown.

### AS-01 — Offline study session changes owner after account switch

- **Severity / status:** P2 — HIGH / CONFIRMED locally, open.
- **Persona / feature:** Returning student on a shared device; timer/offline synchronization/account isolation.
- **Environment / preconditions:** Real `offlineSync` and `sessionsApi`, mocked authentication and insert boundary. Account A has a queued session with no folder association; account B becomes current before replay.
- **Reproduction:** (1) Set connection offline with A current. (2) Log 20 minutes with A's task and study note. (3) Change current account to B. (4) Restore connection and flush the queue.
- **Expected:** A's queued work remains associated with A; it is not submitted as B's work.
- **Actual:** The insert contains `user_id: "account-B"`, `task: "A private revision"`, `notes: "A study note"`, and `minutes: 20`. The queue then removes the action as successful.
- **Reproduction rate:** 2/2 isolated runs; live untested.
- **Evidence:** [diagnostic](/C:/Users/kkchi/learnora-qa-20260920/auth/auth-state.test.ts), [machine-readable results](/C:/Users/kkchi/learnora-qa-20260920/auth/results.json). The insert body was captured from the actual session API, not generated by a replacement session API.
- **Likely code location / root cause:** [offlineSync.ts](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/lib/offlineSync.ts#L252) checks ownership only for learning-event actions. Session payloads contain no owner; [sessions.ts](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/api/sessions.ts#L32) selects the current user during replay.
- **Student impact:** Private study text can transfer between accounts, and both accounts' study history becomes inaccurate. This is a shared-browser isolation flaw, not evidence of arbitrary access to other users' database rows.
- **Adjacent features / test gap:** Task/card queue entries also lack owner metadata, but their actual effects were not proven. Existing queue tests omit account changes. The inspected ownership policy allows a current-user insert with a null folder, so that policy does not establish original ownership.
- **Smallest safe next check:** Repeat with the full auth provider and two isolated test accounts/backends, including logout, login, and reconnect. Preserve owner identity when queueing before authorizing a fix.

### STATE-01 — Save completion overwrites newer note text

- **Severity / status:** P2 — HIGH / CONFIRMED locally, open.
- **Persona / feature:** Slow-connection/power student; notes autosave.
- **Environment / preconditions:** Actual NotesEditorPane, note query hook, mutation hook, and QueryClient. Controlled delayed notes API; editor adapter implements real content replacement on `setHtml`.
- **Reproduction:** (1) Type `A` and save. (2) Delay that save. (3) Continue typing to `AB`. (4) Release save A and its query invalidation/refetch. (5) Type C into the displayed document and save again.
- **Expected:** Newer text `AB` survives the old save response; the final saved document is `ABC`.
- **Actual:** Refetch replaces `AB` with `A`; subsequent typing submits `AC`. Captured writes: `["A", "AC"]`.
- **Reproduction rate:** 2/2 isolated runs; real Quill/browser untested.
- **Evidence:** [component integration diagnostic](/C:/Users/kkchi/learnora-qa-20260920/notes/note-race.test.tsx), [results](/C:/Users/kkchi/learnora-qa-20260920/notes/results.json).
- **Likely code location / root cause:** [NotesEditorPane.tsx:163](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/views/notes/NotesEditorPane.tsx#L163) resets editor content whenever the note object changes, without protecting dirty text. [useNotes.ts:45](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/hooks/useNotes.ts#L45) invalidates note queries after a save. The real editor's `setHtml` also replaces document contents.
- **Student impact:** Newly written material disappears and can subsequently be permanently omitted from the saved document. The reset also clears visible save status.
- **Adjacent features / test gap:** Background refetches can reach the same reset effect. Existing autosave tests keep a fixed note prop and mock `setHtml` as a no-op, so they miss the interaction.
- **Smallest safe next check:** Use real Quill in an isolated Browser session with delayed PATCH/GET; verify text, selection, undo, and reload. Guard dirty/in-flight editor state before any eventual fix is considered complete.

### STATE-02 — Failed quiz submission discards recoverable answers

- **Severity / status:** P2 — HIGH / CONFIRMED locally, open.
- **Persona / feature:** Distracted/slow-connection student; quiz completion and persistence.
- **Environment / preconditions:** Actual QuizRunner and supporting providers in jsdom; MSW rejects attempt POST with 403. The local runner includes the pre-existing continuity cleanup noted above.
- **Reproduction:** (1) Answer a two-question quiz and verify an in-progress draft exists. (2) Finish with the attempt save rejected. (3) Observe the save warning. (4) Unmount and reopen the quiz.
- **Expected:** Finished answers remain recoverable until saved; provide retry or a durable pending attempt.
- **Actual:** `recoveryDraft: null`, no retry/save-attempt button, no resume prompt; reopening starts at question 1. The unsaved score survives only while the current result view remains mounted.
- **Reproduction rate:** 2/2 isolated runs; live untested.
- **Evidence:** [diagnostic](/C:/Users/kkchi/learnora-qa-20260920/notes/quiz-recovery.test.tsx), [results](/C:/Users/kkchi/learnora-qa-20260920/notes/results.json).
- **Likely code location / root cause:** [QuizRunner.tsx:255](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/views/quiz/QuizRunner.tsx#L255) clears the draft before recording the attempt; failure shows a toast without retaining submission state. This ordering exists in the pinned commit too.
- **Student impact:** A completed assessment cannot be recovered after navigation/reload and does not reach attempt history or downstream learning evidence.
- **Adjacent features / test gap:** MockExamRunner has similar pre-save clearing, including early exit; that adjacent flow is source-supported, not separately reproduced. Existing tests independently check the error toast and draft deletion, without combining save failure and recovery. The global transport retry does not solve a terminal failure.
- **Smallest safe next check:** Add deferred-save, exhausted-network-retry, and mock-exam remount cases to the isolated test before changing draft lifecycle.

### AS-02 — Lost response causes duplicate study-session inserts

- **Severity / status:** P2 — HIGH / CONFIRMED at the client/API boundary, open.
- **Persona / feature:** Slow-connection student; timer synchronization and statistics.
- **Environment / preconditions:** Actual offline synchronization and session API. Simulated database boundary records an insert, loses its response, and marks the client offline. No real database used.
- **Reproduction:** (1) Log a 25-minute session with a stable `clientId`. (2) Commit the first simulated insert but return a failed-response error while offline. (3) Reconnect and flush the queued action.
- **Expected:** One logical session produces one persisted session.
- **Actual:** Two insert payloads are issued, each for 25 minutes. Neither carries an idempotency key or stable row ID; the simulated server stores two rows.
- **Reproduction rate:** 2/2 controlled runs; production database duplication untested.
- **Evidence:** [diagnostic](/C:/Users/kkchi/learnora-qa-20260920/auth/auth-state.test.ts), [results](/C:/Users/kkchi/learnora-qa-20260920/auth/results.json).
- **Likely code location / root cause:** [sessions.ts:16](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/api/sessions.ts#L16) describes `clientId` as shared idempotency, but the session insert omits it and sends it only to learning events. Offline replay resends the insert. Lost acknowledgement is not proof the original write never committed.
- **Student impact:** Duplicate history and potentially inflated study minutes/statistics; timer history can disagree with deduplicated learning evidence.
- **Adjacent features / test gap:** Global mutation retry also treats transport errors as replayable; task creation merits the same lost-acknowledgement test. That task duplication was not executed. Existing retry tests do not simulate commit followed by response loss.
- **Smallest safe next check:** Run against a disposable database with the actual schema and fault injection; enforce a stable idempotency identity across original and replayed session writes in any authorized fix.

### AI-01 — AI timeout and cancellation stop protecting the response body

- **Severity / status:** P3 — MEDIUM / CONFIRMED in the AI request layer, open.
- **Persona / feature:** Impatient/slow-connection student; chat and shared AI caller.
- **Environment / preconditions:** Actual `callEdge`; simulated successful headers followed by delayed body. Network timing is controlled; no real AI call made.
- **Reproduction:** (1) Resolve fetch headers with 200, leaving body pending. (2a) Advance beyond 60 seconds; or (2b) abort the student's Stop signal before releasing the body. (3) Observe request state/result.
- **Expected:** Timeout still bounds the whole response; Stop cancels body consumption and prevents a late answer from being delivered.
- **Actual:** After 60,001 simulated milliseconds, `requestAborted: false`, `settled: false`. After Stop, the request remains un-aborted and a later body resolves normally, invoking `onText` once.
- **Reproduction rate:** Both variants reproduced 2/2 runs; production incidence unknown.
- **Evidence:** [two diagnostic cases](/C:/Users/kkchi/learnora-qa-20260920/runtime/response-body.test.ts), [results](/C:/Users/kkchi/learnora-qa-20260920/runtime/results.json).
- **Likely code location / root cause:** [ai.ts:158](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/api/ai.ts#L158) clears the deadline/removes the abort listener immediately after `fetch`, before `response.text()` or error-body consumption. No final cancellation check protects delivery. ChatProvider's success path also does not re-check cancellation after `callEdge` returns.
- **Student impact:** A narrowly timed stalled download can leave the tool waiting without a working Stop action; a canceled answer can still arrive. This does not establish ordinary model latency or poor teaching quality.
- **Adjacent features / test gap:** Shared AI consumers use this caller. Existing cancellation tests cover waiting for headers, not the headers/body boundary.
- **Smallest safe next check:** An isolated browser endpoint that flushes headers then delays its body; exercise the actual Stop button and timeout.

### AS-03 — Successful token renewal leaves the failed query in error

- **Severity / status:** P3 — MEDIUM / CONFIRMED in query/recovery integration, open.
- **Persona / feature:** Returning student after sleep; authenticated data loading.
- **Environment / preconditions:** Actual application QueryClient, active QueryObserver, and recovery module. First read rejects with 401; mocked refresh succeeds and a subsequent read would return data.
- **Reproduction:** Subscribe to the query, let it fail once, allow successful renewal, and leave the observer active without navigation/focus changes.
- **Expected:** The failed read resumes after renewal and displays data.
- **Actual:** `queryCalls: 1`, `refreshCalls: 1`, `status: "error"`, `data: undefined`.
- **Reproduction rate:** 2/2 controlled runs; live token expiry untested.
- **Evidence:** [diagnostic](/C:/Users/kkchi/learnora-qa-20260920/auth/query-recovery.test.ts), [results](/C:/Users/kkchi/learnora-qa-20260920/auth/results.json).
- **Likely code location / root cause:** [sessionRecovery.ts:81](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/lib/sessionRecovery.ts#L81) discards the renewal result; no refetch is triggered. Query retry excludes 401, and same-user token renewal does not clear the cache in AuthProvider.
- **Student impact:** The current surface remains failed despite renewed authentication. A later refetch trigger is a workaround.
- **Adjacent features / test gap:** Affects reads routed through the shared QueryClient. Existing recovery tests assert refresh results and concurrency, not restoration of the failed query. The diagnostic does not mount the entire auth/UI stack.
- **Smallest safe next check:** Full-provider component test with TOKEN_REFRESHED and a mounted data view; verify bounded retry and no refresh loop.

## Likely / Suspected Issues

### STATE-03 — Removing an AI explanation may delete shifted student text

- **Severity / status:** P3 provisionally / LIKELY, not reproduced.
- **Persona / environment / feature:** Student revising notes after an inline AI explanation; pinned repository inspection only.
- **Preconditions / proposed reproduction:** Insert an explanation, add substantial text before it, then choose Remove AI explanation.
- **Expected:** Only the explanation is removed. **Source-predicted actual:** A fixed index/length is deleted after earlier edits have moved the explanation, potentially deleting unrelated text.
- **Reproduction rate / evidence:** No execution. [NotesEditorPane.tsx:443](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/views/notes/NotesEditorPane.tsx#L443) records offsets; [line 599](https://github.com/kkchinthalapati/learnora/blob/fea0369a6b8b9c72a61d071f317365ebf2c191ae/webapp/src/views/notes/NotesEditorPane.tsx#L599) deletes without relocating/revalidating them.
- **Likely root cause / impact:** Stored numeric positions do not track later document edits; unrelated student writing could be removed and autosaved.
- **Adjacent tests / smallest safe next check:** Current test removes immediately after insertion and checks only that replacement was called. Use real editor content, insert-before, remove, then assert exact surviving text and undo behavior. Severity should be reassessed after that proof.

No ordinary failed-logout credential-retention bug is reported: inspection of the pinned Supabase SDK disproved that initial hypothesis. Cache clearing on account change and guest-import deduplication also exist; their presence was not treated as proof of complete account isolation.

## Student UX Findings

- STATE-01 violates the basic expectation that continuing to type during Save preserves newer work.
- STATE-02 acknowledges save failure but leaves no recoverable submission after leaving the screen.
- AI-01 shows a request-layer path where Stop does not stop delivery.
- No subjective visual preferences or unobserved layout problems are reported as bugs.

## Mobile / Responsive Findings

**Not verified.** No viewport, touch target, overflow, modal, fixed navigation, keyboard-obscuration, or screenshot assessment was possible. A recent Solver tap-target commit and existing mobile test files are source evidence only.

## Accessibility Findings

**Partial, automated only.** The passing quiz suite includes alert/status feedback and locked answer choices; the passing flashcard review suite includes hiding the turned-away face from assistive technology. This does not verify real keyboard navigation, screen-reader announcements, focus movement, contrast, zoom, or touch usability. No new accessibility defect was proven.

## AI / Tutoring Findings

AI-01 is a reproduced request-lifecycle defect. The existing AI caller suite passed its mocked response, retry, refusal, rate-limit, history, and pre-body cancellation checks. Teaching correctness, clarity, context adaptation, trustworthiness, latency, provider fallback, and live rate-limit UX remain **unverified**. No AI answers were generated or graded in this run.

## Runtime / Network Findings

Controlled failures exercised a rejected quiz write, lost session acknowledgement, expired-token read, and stalled AI body. Expected error-path logs were preserved during local runs. These are injected conditions, not production incidents. No live console, request trace, CSP violation, or provider error was observed. A failed web-fetch tool attempt is not evidence of a website outage.

## Persistence / State Findings

AS-01, STATE-01, STATE-02, and AS-02 cover ownership, newer-edit loss, failed-submit recovery, and idempotency. The tests establish client behavior and submitted payloads. They do not verify deployment schema, actual RLS enforcement, data at rest, cross-device propagation, or real multi-tab conflicts.

## Cross-Feature Findings

| Transition | Evidence |
| --- | --- |
| Offline timer → account switch → reconnect | A's content submitted under B in isolated API test |
| Notes save → query invalidation → continued editing | Newer text overwritten; subsequent save contains truncated text |
| Quiz completion → failed save → reopen | Draft absent; starts again at question 1 |
| Timer replay → study history/evidence | Duplicate session insert despite a stable clientId |
| Expired read → successful refresh → current view | Active read remains errored |

No cross-device, notification-destination, live subscription, or realtime interaction was exercised.

## Automated Test Gaps

1. Account identity must be part of offline replay tests, not just queue success/failure.
2. Note tests need actual query invalidation plus an editor that changes content on `setHtml`.
3. Quiz error tests need remount/reload and durable recovery assertions, not only a toast and score.
4. Retry tests need “server committed, acknowledgement lost,” not only pre-commit rejection.
5. AI tests need the interval after headers and before body completion.
6. Auth tests need active-query recovery after successful token refresh.
7. Inline-edit tests need intervening document edits before removal.

Repository tooling discrepancy: `webapp/tests/e2e/README.md` instructs `npm run test:e2e`, `test:e2e:install`, and `test:e2e:ui`, but none exists in the inspected package scripts. This is a confirmed documentation/configuration mismatch, not an additional student-product defect. Use the existing Playwright config directly when the authorized browser/testing setup is available.

### Test execution and evidence

- Existing batch 1: **5 files / 73 passed**, 20.83 seconds — AI caller, session recovery, offline synchronization, note autosave, QuizRunner.
- Existing batch 2: **7 files / 110 passed**, 48.28 seconds — AuthProvider, LoginView, WelcomeView, TasksView, ReviewView, guest migration, billing API. A requested Dialog test path did not exist and was not counted.
- Additional diagnostics: **5 files / 7 cases**, showing six distinct defects. [Auth JSON](/C:/Users/kkchi/learnora-qa-20260920/auth/results.json): 2 observed-defect assertions passed, 1 expected-behavior assertion failed. [Notes/quiz JSON](/C:/Users/kkchi/learnora-qa-20260920/notes/results.json): 2 failed. [AI JSON](/C:/Users/kkchi/learnora-qa-20260920/runtime/results.json): 2 failed for one shared root cause.
- Final `git diff --check` passed. No build, lint, full Vitest suite, or Playwright suite was run. No test failure was repaired or hidden.

Run the isolated diagnostics from the repository's `webapp` directory:

```powershell
.\node_modules\.bin\vitest.cmd run --config C:/Users/kkchi/learnora-qa-20260920/auth/vitest.config.mts --reporter=verbose
.\node_modules\.bin\vitest.cmd run --config C:/Users/kkchi/learnora-qa-20260920/notes/vitest.config.mts --reporter=verbose
.\node_modules\.bin\vitest.cmd run --config C:/Users/kkchi/learnora-qa-20260920/runtime/vitest.config.mts --reporter=verbose
```

These intentionally return nonzero while the documented expected behaviors remain broken. Diagnostic configurations contain machine-specific paths; they are evidence artifacts, not proposed repository changes.

## Verified Working

**Within the passing isolated tests only:**

- Login form trims email, submits supplied credentials to the mocked auth boundary, and exposes bad-credential feedback as an alert.
- AuthProvider follows session events and exits loading when reading a stored session fails.
- Onboarding blocks advancement without required input and writes answers to its controlled settings/context state.
- Tasks show an empty state, order urgent/completed work, and filter the list without changing task records.
- Flashcard review exposes grading after flipping, renders mathematical content, and hides the inactive face from assistive technology.
- Quiz answering locks choices, computes results, preserves in-progress drafts, and exposes save failure. That last success does not imply recovery works; STATE-02 proves otherwise.
- Existing note autosave retry and busy-save scheduling tests pass, while the missing refetch interaction fails.
- Guest migration deduplicates IDs and leaves failed imports pending in its tests.
- Billing mapping treats unknown plans as free; this is not a real payment or entitlement-enforcement verification.

**No live student workflow is listed as verified.**

## Unable To Verify

The in-app Browser was unavailable after initial recovery and after the user's request to retry. No alternative browser was substituted. The [Browser skill](C:/Users/kkchi/.codex/plugins/cache/openai-bundled/browser/26.727.40816/skills/control-in-app-browser/SKILL.md) explicitly states: “An explicit browser request is a hard constraint: use only that browser and never fall back to another browser surface.” The connection failure is the environmental blocker; that instruction constrains fallback.

The requested site login, complete student journeys, visual/mobile/accessibility review, real backend success/failure handling, and live AI assessment therefore remain open. The live-account suite also performs production writes, which conflict with this run's explicit read-only policy. A local UI server alone is insufficient isolation because Supabase configuration points at the real project.

The Learnora checks skill informed focused test execution and the separation of source, simulated, and browser evidence. Prior notes were used for workflow guidance only; no historical result is presented as current verification.

## Highest-Value Follow-Ups

1. Restore the requested Browser connection, then complete deployed read-only login/navigation, desktop/mobile, keyboard, loading/error, and account-state inspection. Record the actual deployment/build identity.
2. Use a genuinely isolated backend or explicitly authorized disposable-account writes for completed creation, quiz, AI, and cross-device journeys. Do not assume localhost is isolated.
3. Prioritize owner-bound offline actions, protection of newer note edits, and durable failed-quiz submissions. Each already has a minimal executable diagnostic.
4. Make session replay idempotent and connect successful auth renewal to bounded failed-read recovery if fixes are authorized.
5. Keep AI timeout/cancellation active through response-body consumption and validate the UI with a delayed-body endpoint.
6. Reproduce inline-explanation removal with real editor selection and edits before deciding its final severity.

### Final coverage review

Important remaining gaps are explicit: actual login/session restoration, realistic phone layouts, real Quill behavior, deployed RLS/storage, live AI quality, uploads/extraction, settings synchronization, notifications, subscription changes, realtime rooms, and production network/runtime evidence. Source existence and passing mocks do not close those gaps. This report establishes actionable local failures while leaving the requested live audit incomplete.


# Session supplements and complete evidence archive

This ledger consolidates the findings from the 20–21 September 2026 session. The preceding report is preserved in full, with evidence links adjusted for this file's repository-root location. The sections below preserve investigation details, rejected hypotheses, operational limitations, exact test commands, and the complete diagnostic sources/configurations/results. This is a historical session record, not a fresh verification of subsequent code or deployment changes.

The original assessment made no application-code changes. This ledger is the separately requested new repository documentation file. Existing user changes were not staged, reverted, committed, or pushed. Account credentials are intentionally excluded: they are not QA findings and were never needed for the executed local reproductions.

## Finding register and confidence evolution

| ID | Initial investigation | Final session status | Scope limit |
| --- | --- | --- | --- |
| AS-01 | Source-supported missing queue ownership | CONFIRMED locally, P2 | Actual session API plus mocked account/insert boundary; no live account transfer attempted |
| AS-02 | Source-supported non-idempotent writes after lost responses | CONFIRMED session replay locally, P2 | Duplicate session insert payloads proven; task duplication and production database behavior remain unverified |
| AS-03 | Source-supported refresh/refetch disconnect | CONFIRMED query integration locally, P3 | Actual QueryClient and active observer; entire browser/auth-provider lifecycle not mounted |
| STATE-01 | Source-supported note replacement on query update | CONFIRMED component integration locally, P2 | Actual component/hooks/query invalidation; faithful replacement adapter, not real Quill/browser |
| STATE-02 | Source-supported premature draft deletion | CONFIRMED quiz component locally, P2 | QuizRunner rejection/remount; analogous MockExamRunner behavior only inspected |
| STATE-03 | Fixed explanation offsets after document edits | LIKELY, provisional P3 | No execution; reassess as P2 if substantial destructive loss is reproduced |
| AI-01 | Timeout/abort cleanup before body read | CONFIRMED request layer locally, P3 | Two timing cases, one root cause; mocked fetch/body and simulated elapsed time |
| TOOLING-01 | Documented npm E2E scripts absent | CONFIRMED static documentation/configuration discrepancy | Developer tooling, excluded from the six student-product defect count |

No P0 or P1 finding was established. No application defect was classified as NOT REPRODUCIBLE merely because the Browser was unavailable. Source-supported leads were upgraded only after local execution, with the environment qualification retained.

## Additional source evidence and adjacent risks

### Authentication, queue isolation, retry, and session history

- One origin-wide queue is stored at `learnora:offline_queue` (`offlineSync.ts:9`).
- `LogSessionPayload` aliases `LogSessionInput`; the input contains minutes, task, folder, timer type, notes, deck, and clientId, but no original account identity (`offlineSync.ts:24–35`, `api/sessions.ts:7–18`).
- Only `recordLearningEvent` actions carry and validate an explicit user ID. Foreign learning-event actions are skipped without consuming their retry budget (`offlineSync.ts:252–257`).
- Session replay invokes `sessionsApi.log(p)` (`offlineSync.ts:274–278`). That API obtains the current user and inserts their user ID (`api/sessions.ts:32–44`).
- `AuthProvider.applySession` clears the query cache and appearance on account identity changes, but does not bind the session queue to the originating account (`AuthProvider.ts:29–36`).
- The inspected `study_sessions_parent_owner_guard` requires the current user's ID and either a null folder or an owned folder. AS-01 deliberately used a null folder; there is no claimed bypass of another account's existing database rows.
- Global query defaults use a 60-second stale time, focus refetch, up to two read retries, and one mutation retry with jittered backoff.
- `requestErrors.ts:48–53,73–74` classifies transport failures as retryable writes; its comments assume missing responses prove requests never landed. A response can instead disappear after a successful commit.
- `useTasks.ts:18–29` and `api/tasks.ts:19–26` were identified as an adjacent non-idempotent create path. No task-duplication test was run, and it is not an additional confirmed defect.
- The documented session clientId is omitted from the session insert and passed only to `learningEventsApi.record` (`api/sessions.ts:58`). The local replay diagnostic supplied the same logical ID, yet two inserts resulted.
- `queryClient.test.ts` exercises retry predicates, including status-code cases described as avoiding replay of processed writes, but does not prove behavior when a committed request loses its response.
- Session recovery refreshes once through a shared in-flight promise. A successful renewal returns true (`sessionRecovery.ts:45–48`); `handleRequestError` discards that result (`81–83`). There is no explicit retry/invalidation of the failed query.
- The configured 401 path is not retried (`queryClient.ts:52–53`), and same-user TOKEN_REFRESHED does not take the account-change cache-clearing branch.
- Additional inspection observed queue retry limits: five attempts; learning-event evidence is retained at the limit, while other action types can be dropped. This was not separately reproduced or promoted to a defect.
- Storage writes/JSON parsing are wrapped in error handling. Silent storage-quota failure remains only a low-confidence hypothesis, not a demonstrated loss case.

### Notes, quiz recovery, and inline edits

- The note replacement effect runs on changes to the note object and calls editor `setHtml`, then sets status idle (`NotesEditorPane.tsx:163–173`).
- Saving HTML invalidates the notes query prefix (`useNotes.ts:45–54`), connecting an ordinary save completion to that replacement effect.
- The real RichTextEditor `setHtml` calls `setContentsFromHtml` (`RichTextEditor.tsx:178–182`). Its programmatic content replacement is distinct from user text changes, so the diagnostic adapter's behavior was cross-checked against the implementation.
- Existing autosave tests supply a stable note object and a no-op `setHtml` (`NotesEditorPane.autosave.test.tsx:51–83,100–112`). They cannot detect the observed save/refetch/editor replacement race.
- Notes autosave debounces at 2,000 ms, waits 300 ms before rechecking a busy save, and schedules one application-level error retry after 3,000 ms. Failed-save tab-close warnings and flush-on-unmount are present. These safeguards do not disprove the separate refetch race.
- Quiz draft saving is disabled once finished (`QuizRunner.tsx:201–205`). Completion clears the draft before recording the attempt (`255–281`), while the result view offers navigation without resubmission (`352–405`).
- Existing save-failure tests assert a score and warning (`QuizRunner.test.tsx:302–315`); separate tests assert clearing on completion (`440–462`). They do not test failed-save remount recovery.
- MockExamRunner uses similar clearing before submission (`250–269`); early exit also clears before saving and navigates away (`296–338`). Neither adjacent path was executed in this session.
- Inline explanation insertion stores a numeric index/length (`NotesEditorPane.tsx:443–473`). Removal deletes that range (`599–613`); ordinary changes (`325–334`) do not transform the recorded positions.
- The existing inline-explanation test removes immediately and asserts that `replaceRange` was called (`NotesEditorPane.test.tsx:197–227`), without asserting the correct surviving text after intervening edits.
- The real editor clamps the deletion range to document bounds but still deletes at the supplied numeric offset (`RichTextEditor.tsx:217–225`). Clamping alone does not establish that the selected range still identifies the explanation.

### AI request handling and live-testing constraints

- `callEdge` uses raw fetch, one default retry, 2,000 ms retry backoff, a nominal 60,000 ms request deadline, and a maximum retained history of 20 messages.
- 4xx responses, including 429, are nonretryable at this layer. Server rate-limit messages under either `error` or `text` are surfaced. Refusal flags are preserved for callers that must not save a refusal as generated study content.
- AI-01 concerns the lifetime of the deadline/abort wiring after headers. It does not claim the edge function streams tokens or that ordinary model calls all hang.
- ChatProvider's cancel callback aborts its controller (`173–175`); that controller's signal reaches `callEdge` (`622–631`). The success path proceeds after the returned text without a fresh cancellation check. This was source-checked, not tested through the rendered Stop button.
- The two diagnostic case names QA-AI-01 and QA-AI-02 are respectively timeout and Stop variants of the single report finding AI-01, not two independently counted product defects.
- The live suite README warns that sessions, quiz attempts, learning events, and misconception records remain in the signed-in account. It recommends a throwaway account and quota budgeting.
- Documented free daily live-test allowances were 15 chat, 3 quiz, and 2 each for debugger, Feynman, sparring, and exam deconstructor. These are documentation-derived values, not verified account limits.
- The live suite requires `LEARNORA_LIVE=1`, test email/password, and optionally `LEARNORA_BASE_URL`; its default is local port 5199. Local UI still connects to the configured real Supabase project.
- Its browser assumptions are desktop Chromium at 1280 × 800, one worker, no retries, a 300-second test timeout, and a 30-second expectation timeout. These are configuration values, not devices/viewport sizes exercised here.
- The mocked E2E config uses a local Vite server, desktop 1280 × 800 and Pixel 7 projects; backend routing stubs Supabase and records unhandled endpoints instead of forwarding them. Stripe hosted-page redirects are intercepted by the fixture. None of those E2E scenarios was run.
- Live AI rubric categories in repository documentation are teaching quality, adaptation, and trust. Suggested real-model journeys include repeated “I don't understand,” correction of wrong answers, unknowable school-specific details, and misconception continuity across tools. All remain unverified here.

## Hypotheses checked and rejected, or mitigated by existing behavior

| Hypothesis | Evidence / disposition |
| --- | --- |
| Ordinary failed logout leaves the current session persisted | Rejected after checking pinned `@supabase/auth-js` 2.111.0 `_signOut`: it removes the current session even when the remote sign-out reports an error; session-read-error exceptions were not exhaustively tested. AuthProvider alone was insufficient evidence for the initial hypothesis |
| Query cache never clears across accounts | Rejected: `AuthProvider.ts:29–36` explicitly clears it when user identity changes |
| Login lacks a pending/double-submit guard | Rejected by source: LoginView has a pending guard and disabled submit |
| Guest-session import lacks deduplication | Rejected: guest UUIDs are row identities, existing IDs are checked, and concurrent migration shares a promise; focused guest migration tests passed |
| Malformed local storage necessarily crashes rendering | Not supported: parsing/storage helpers catch failures; quota-loss hypothesis remains unverified |
| In-progress quizzes have no persistence | Rejected: drafts save locally and flush on React unmount; targeted existing draft/resume tests passed |
| Re-answering a quiz question always appends duplicate answers | Rejected for the inspected path: answer rows replace the earlier entry for that question; the existing answer-integrity case passed |
| Every attempt resubmission necessarily duplicates quiz attempts | Not supported: attempt keys provide deduplication safeguards; this does not fix losing a completed draft after a rejected save |
| Notes autosave abandons every edit when another save is pending | Rejected for the covered scheduling path: busy saves reschedule; existing targeted tests passed |
| Notes save failures have no retry or close warning | Rejected: one application-level retry and a beforeunload warning exist; this is separate from STATE-01 |

Upstream SDK reference used for the logout cross-check: https://github.com/supabase/supabase-js/blob/v2.111.0/packages/core/auth-js/src/GoTrueClient.ts . These dispositions are bounded by the inspected paths; none is a blanket production guarantee.

## Repository and environment observations preserved from the session

- Public repository metadata identified `kkchinthalapati/learnora`, default branch `main`, and the requested Vercel URL as its homepage.
- The pinned commit's title was `fix(solver): make the example chips thumb-sized`. Its message claimed an increase from 26 px to 44 px and a check at 393 px width. Those claims were not independently rendered or measured during this session; no WCAG conformance conclusion was drawn.
- Dependency declarations inspected: React/React DOM ^19.2.7, React Router ^8.3.0, TanStack Query ^5.101.4, Supabase JS ^2.111.0, Sentry React ^10.73.0, KaTeX ^0.16.28, PDF.js ^6.3.289, and Quill 2.0.2. Tooling declares Playwright ^1.62.1, Testing Library React ^16.3.2, jsdom ^30.0.1, MSW ^2.15.0, TypeScript ~6.0.2, Vite ^8.1.1, Vitest ^4.1.10, oxlint ^1.71.0, and Prettier ^3.9.6. Declarations are not a separately audited dependency inventory.
- Package scripts present were dev, build, lint, preview, test, format, and format:check. Build runs TypeScript then Vite; lint uses oxlint.
- Supabase's configured project URL was `https://mlvgqwqiynpwpwzqufdf.supabase.co`; a client publishable key is present in source. It was not reported as a leaked secret. Access control depends on server-side policy.
- Vercel build uses `bash scripts/build.sh` and outputs `dist`. Root maps to landing HTML; `/app` and `/app/*` map to the SPA. Static app assets have long-lived immutable cache headers.
- Deployment headers include CSP, nosniff, referrer policy, frame restrictions, and disabled camera/microphone/geolocation permissions. Their live application and feature impact were not tested; no CSP or voice feature bug was asserted.
- Main initialization installs global error handlers and optional monitoring before React rendering, then registers the service worker after initial render. App has separate route and overlay error boundaries, with silent fallback for overlays.
- Sentry configuration is optional; source describes default PII suppression and token scrubbing. Actual production monitoring/DSN/source-map upload was not verified.
- Source declares free/pro subscription mapping, authenticated Stripe billing calls, and webhook-controlled billing updates; no checkout, payment, portal, cancellation, or real entitlement action occurred.
- README text describes a targeted v2 database migration as not yet applied in that documented work. This historical statement is not evidence of the current deployment's migration status.
- Auth and data APIs, SQL policies/migrations, frontend state providers, note/quiz components, test fixtures, and deployment files were inspected. There was no exhaustive schema audit or penetration test.
- User explicitly stated the repository had no AGENTS.md. None was created or repeatedly searched for.

### Existing worktree state

The local tracked diff observed at the end remained 10 files, 153 insertions and 9 deletions:

```text
claude-16-9-26-work.md
webapp/src/hooks/useContinuity.ts
webapp/src/lib/continuity.test.ts
webapp/src/lib/continuity.ts
webapp/src/views/dashboard/ResumeLearningCard.test.tsx
webapp/src/views/debugger/CognitiveDebuggerView.module.css
webapp/src/views/debugger/CognitiveDebuggerView.test.tsx
webapp/src/views/debugger/CognitiveDebuggerView.tsx
webapp/src/views/quiz/QuizRunner.test.tsx
webapp/src/views/quiz/QuizRunner.tsx
```

An initial status also showed untracked `.claude/settings.local.json`; later status did not. This QA pass did not remove or edit it. Existing worktree changes belong to the user and were not attributed to the QA run. Initial Git status warned that the user's global ignore file could not be accessed; Git still returned the branch, SHA, and tracked changes.

## Tooling limitations and recovery history

1. Initial shell skill/memory reads stalled. A separate browser execution connectivity check timed out twice, reporting `js execution timed out; kernel reset, rerun your request`.
2. Read-only GitHub connector access worked, allowing a pinned-commit investigation while local access was recovering.
3. A web-fetch attempt to the target returned “URL ... is not accessible via this tool.” This was classified as a tool limitation, not a website outage or application bug.
4. The local shell recovered. The Browser runtime then responded with `Browser is not available: iab`; supported discovery returned `[]`.
5. The user asked to retry and later to continue. The explicit in-app Browser selection was retried, including after the continuation, and remained unavailable. No alternative browser, direct auth API login, or credential-store workaround was used.
6. Two independent source reviewers examined auth/state and study persistence. Each returned up to three source-supported leads plus disconfirmed hypotheses. Both later hit service usage limits when asked to help implement isolated diagnostics. The main agent continued and completed the diagnostic execution; agent failure was not treated as application evidence.
7. Creating the external QA directory initially failed with Windows access denied. Directory creation was approved; the requested auth/notes/runtime artifact directories were created. These permission errors were not product findings.
8. The first auth diagnostic run collected no tests because Vitest could not hoist mocks imported from an absolute Vitest entrypoint: “There are some problems in resolving the mocks API.” The diagnostic was corrected to import `vitest` through an alias. Only the subsequent executed cases count as reproductions.
9. Some shell output displayed mojibake/truncation. It was not treated as broken application text. The ledger was assembled from UTF-8 file reads; original diagnostic artifacts are embedded below.
10. No production-data cleanup was necessary because no production records were created, updated, or deleted. No account deletion, logout, configuration change, deployment, commit, push, or merge was performed.

## Exact existing-suite commands

Executed from `C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp`.

### Batch 1 — five files, 73 passed, 20.83 seconds

```powershell
node --version
.\node_modules\.bin\vitest.cmd run src/api/ai.test.ts src/lib/sessionRecovery.test.ts src/lib/offlineSync.test.ts src/views/notes/NotesEditorPane.autosave.test.tsx src/views/quiz/QuizRunner.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
```

Expected injected-error stderr included an AI retry, an offline queue execution “Network disconnect,” and a queued “Failed to fetch” task toggle. Those messages did not indicate failing assertions or production incidents.

### Batch 2 — seven matched files, 110 passed, 48.28 seconds

```powershell
.\node_modules\.bin\vitest.cmd run src/context/AuthProvider.test.tsx src/views/auth/LoginView.test.tsx src/views/onboarding/WelcomeView.test.tsx src/views/tasks/TasksView.test.tsx src/views/review/ReviewView.test.tsx src/components/Dialog.test.tsx src/lib/guestSessionMigration.test.ts src/api/billing.test.ts --pool=threads --maxWorkers=1 --no-file-parallelism --reporter=dot
```

The nonexistent `src/components/Dialog.test.tsx` matched no file; seven actual files ran. There is no claim that a Dialog suite passed. Original existing-suite terminal output was not separately saved as JSON; the counts/timings above are the observed session output.

### Final evidence runs

```powershell
.\node_modules\.bin\vitest.cmd run --config C:/Users/kkchi/learnora-qa-20260920/auth/vitest.config.mts --reporter=json --outputFile=C:/Users/kkchi/learnora-qa-20260920/auth/results.json
.\node_modules\.bin\vitest.cmd run --config C:/Users/kkchi/learnora-qa-20260920/notes/vitest.config.mts --reporter=json --outputFile=C:/Users/kkchi/learnora-qa-20260920/notes/results.json
.\node_modules\.bin\vitest.cmd run --config C:/Users/kkchi/learnora-qa-20260920/runtime/vitest.config.mts --reporter=json --outputFile=C:/Users/kkchi/learnora-qa-20260920/runtime/results.json
```

All three final commands returned exit code 1 because they each contain at least one expected-behavior assertion that currently fails. The two auth-state observation tests deliberately assert the faulty behavior and pass. Their green status must not be reported as product correctness.

## Exact observed diagnostic values

```text
AS-01:
user_id = account-B
task = A private revision
notes = A study note
minutes = 20
flush = { processed: 1, failed: 0, remaining: 0 }

AS-02:
one logical clientId = same-logical-session
simulated rows = server-1, server-2
minutes on each = 25
neither insert contains clientId or client_id
first insert acknowledged as Failed to fetch; queued, then replayed

STATE-01:
typedBeforeResponse = AB
afterRefetch = A
writes = [A, AC]
persisted at simulated notes API = AC

STATE-02:
failedPosts = 1
recoveryDraft = null
retryVisible = false
resumeVisible = false
reopened = Question 1 of 2

QA-AI-01 (AI-01 timeout variant):
elapsedMs = 60001
requestAborted = false
settled = false

QA-AI-02 (AI-01 Stop variant):
requestAborted = false
onTextCalls = 1
result = { value: { text: 'answer delivered after Stop' } }

AS-03:
queryCalls = 1
refreshCalls = 1
status = error
data = undefined
```

## Complete diagnostic artifact contents

The following archive embeds all five diagnostic test files, all three configurations, and all three JSON reports. It makes this ledger self-contained for reviewing the implemented reproductions even if the external QA directory is unavailable. Running the tests still requires the referenced checkout/dependencies and adjustment of machine-specific paths on another computer.


### auth/auth-state.test.ts

Original location: `C:/Users/kkchi/learnora-qa-20260920/auth/auth-state.test.ts`.

````typescript
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ userId: 'account-A', rows: [] as any[], loseResponse: false }));
vi.mock('C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/api/session.ts', () => ({ requireUserId: async () => state.userId }));
vi.mock('C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/supabase.ts', () => ({ supabase: { from: (table: string) => ({ insert: async (rows: any[]) => {
  if (table !== 'study_sessions') throw new Error('Unexpected table: ' + table);
  state.rows.push(...rows.map(row => ({ id: `server-${state.rows.length + 1}`, ...row })));
  if (state.loseResponse) { state.loseResponse = false; Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); return { error: { message: 'Failed to fetch' } }; }
  return { error: null };
} }) } }));
vi.mock('C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/api/learningEvents.ts', () => ({ learningEventsApi: { record: vi.fn(), send: vi.fn() } }));
vi.mock('C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/api/tasks.ts', () => ({ tasksApi: { toggle: vi.fn() } }));
vi.mock('C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/api/flashcards.ts', () => ({ flashcardsApi: { updateReview: vi.fn() } }));
vi.mock('C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/queryClient.ts', () => ({ queryClient: { invalidateQueries: vi.fn() } }));
import { clearOfflineQueue, logSession, flushOfflineQueue, getOfflineQueue } from 'C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/offlineSync.ts';
function online(value: boolean) { Object.defineProperty(navigator, 'onLine', { configurable: true, value }); }
beforeEach(() => { clearOfflineQueue(); state.rows.length = 0; state.userId = 'account-A'; state.loseResponse = false; online(true); });
afterEach(() => clearOfflineQueue());
describe('isolated diagnostics: assertions document observed defects', () => {
  it('AS-01: actual session API assigns queued A history to current account B', async () => {
    online(false);
    expect(await logSession({ minutes: 20, task: 'A private revision', notes: 'A study note' })).toEqual({ queued: true });
    expect(state.rows).toHaveLength(0);
    state.userId = 'account-B'; online(true);
    expect(await flushOfflineQueue()).toEqual({ processed: 1, failed: 0, remaining: 0 });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({ user_id: 'account-B', task: 'A private revision', notes: 'A study note', minutes: 20 });
    console.log('AS-01 observed:', JSON.stringify(state.rows));
  });
  it('AS-02: committed session with lost response is inserted again on replay despite stable clientId', async () => {
    state.loseResponse = true;
    expect(await logSession({ minutes: 25, task: 'General study', clientId: 'same-logical-session' })).toEqual({ queued: true });
    expect(state.rows).toHaveLength(1); expect(getOfflineQueue()).toHaveLength(1);
    online(true);
    expect(await flushOfflineQueue()).toEqual({ processed: 1, failed: 0, remaining: 0 });
    expect(state.rows).toHaveLength(2);
    expect(state.rows.map(row => row.id)).toEqual(['server-1', 'server-2']);
    expect(state.rows.every(row => row.clientId === undefined && row.client_id === undefined)).toBe(true);
    console.log('AS-02 observed:', JSON.stringify(state.rows));
  });
});
````

### auth/query-recovery.test.ts

Original location: `C:/Users/kkchi/learnora-qa-20260920/auth/query-recovery.test.ts`.

````typescript
import { afterEach, expect, it, vi } from "vitest";
import { QueryObserver } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/@tanstack/react-query/build/modern/index.js";
import { queryClient } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/queryClient";
const auth = vi.hoisted(() => ({ refreshSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "renewed" } }, error: null }), signOut: vi.fn() }));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/supabase", () => ({ supabase: { auth } }));
afterEach(() => queryClient.clear());
it("AS-03: active failed query should recover after successful session renewal", async () => {
  const queryFn = vi.fn().mockRejectedValueOnce(Object.assign(new Error("JWT expired"), { status: 401 })).mockResolvedValue(["restored student work"]);
  const observer = new QueryObserver(queryClient, { queryKey: ["qa-session-recovery"], queryFn });
  const unsubscribe = observer.subscribe(() => {});
  await vi.waitFor(() => expect(auth.refreshSession).toHaveBeenCalledTimes(1));
  await new Promise(resolve => setTimeout(resolve, 100));
  const observed = { queryCalls: queryFn.mock.calls.length, refreshCalls: auth.refreshSession.mock.calls.length, status: observer.getCurrentResult().status, data: observer.getCurrentResult().data };
  console.log("AS-03 observed", observed);
  unsubscribe();
  expect(observed.status, "session renewed but the failed active read never restarted").toBe("success");
});
````

### auth/results.json

Original location: `C:/Users/kkchi/learnora-qa-20260920/auth/results.json`.

````json
{"numTotalTestSuites":3,"numPassedTestSuites":2,"numFailedTestSuites":1,"numPendingTestSuites":0,"numTotalTests":3,"numPassedTests":2,"numFailedTests":1,"numPendingTests":0,"numTodoTests":0,"snapshot":{"added":0,"failure":false,"filesAdded":0,"filesRemoved":0,"filesRemovedList":[],"filesUnmatched":0,"filesUpdated":0,"matched":0,"total":0,"unchecked":0,"uncheckedKeysByFile":[],"unmatched":0,"updated":0,"didUpdate":false},"startTime":1789953810431,"success":false,"testResults":[{"assertionResults":[{"ancestorTitles":["isolated diagnostics: assertions document observed defects"],"fullName":"isolated diagnostics: assertions document observed defects AS-01: actual session API assigns queued A history to current account B","status":"passed","title":"AS-01: actual session API assigns queued A history to current account B","duration":11.327099999999973,"failureMessages":[],"meta":{},"tags":[]},{"ancestorTitles":["isolated diagnostics: assertions document observed defects"],"fullName":"isolated diagnostics: assertions document observed defects AS-02: committed session with lost response is inserted again on replay despite stable clientId","status":"passed","title":"AS-02: committed session with lost response is inserted again on replay despite stable clientId","duration":9.570599999999558,"failureMessages":[],"meta":{},"tags":[]}],"startTime":1789953812299,"endTime":1789953812320.5706,"status":"passed","message":"","name":"C:/Users/kkchi/learnora-qa-20260920/auth/auth-state.test.ts"},{"assertionResults":[{"ancestorTitles":[],"fullName":"AS-03: active failed query should recover after successful session renewal","status":"failed","title":"AS-03: active failed query should recover after successful session renewal","duration":179.48610000000008,"failureMessages":["AssertionError: session renewed but the failed active read never restarted: expected 'error' to be 'success' // Object.is equality\n    at C:/Users/kkchi/learnora-qa-20260920/auth/query-recovery.test.ts:16:89\n    at file:///C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:20"],"meta":{},"tags":[]}],"startTime":1789953814107,"endTime":1789953814286.486,"status":"failed","message":"","name":"C:/Users/kkchi/learnora-qa-20260920/auth/query-recovery.test.ts"}]}
````

### auth/vitest.config.mts

Original location: `C:/Users/kkchi/learnora-qa-20260920/auth/vitest.config.mts`.

````typescript
export default {
  root: 'C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp',
  resolve: { alias: { vitest: 'C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/vitest/dist/index.js' } },
  test: { environment: 'jsdom', include: ['C:/Users/kkchi/learnora-qa-20260920/auth/*.test.ts'], pool: 'threads', maxWorkers: 1, fileParallelism: false, execArgv: ['--no-experimental-webstorage'] },
};
````

### notes/note-race.test.tsx

Original location: `C:/Users/kkchi/learnora-qa-20260920/notes/note-race.test.tsx`.

````tsx
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { NotesEditorPane } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/views/notes/NotesEditorPane";
import { useNotesByMaterial } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/hooks/useNotes";

const state = vi.hoisted(() => ({
  saved: "original", writes: [] as string[], release: undefined as undefined | (() => void),
}));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/api/notes", () => ({
  notesApi: {
    fetchByMaterial: vi.fn(async () => [{ id: "note-1", user_id: "user-1", material_id: "material-1", html_content: state.saved, markdown_content: "", created_at: "2026-09-20T00:00:00Z" }]),
    updateHtml: vi.fn(async (_id, html: string) => {
      state.writes.push(html);
      if (state.writes.length === 1) await new Promise<void>(resolve => { state.release = resolve; });
      state.saved = html;
    }),
  },
}));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/hooks/useStudyPackage", () => ({ useRetryStudyPackage: () => ({ isPending: false, mutate: vi.fn() }) }));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/materialProcessing", () => ({ useMaterialProcessing: () => ({ status: "completed" }) }));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/context/settings", () => ({ useSettings: () => ({ settings: { aiLanguage: "English" } }) }));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/context/toast", () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/views/notes/NotesAiSidebar", () => ({ NotesAiSidebar: () => null }));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/components/RichTextEditor", async () => {
  const React = await import("react");
  return { RichTextEditor: ({ ref, initialHtml, onUserChange }) => {
    const [html, setHtml] = React.useState(initialHtml);
    React.useImperativeHandle(ref, () => ({
      setHtml, getHtml: () => html, getPlainText: () => html,
      onSelectionChange: () => {},
    }));
    return <textarea aria-label="Student note" value={html} onChange={event => {
      setHtml(event.target.value); onUserChange?.(event.target.value);
    }} />;
  } };
});
function Harness() {
  const { data } = useNotesByMaterial("material-1");
  return data ? <NotesEditorPane materialId="material-1" materialTitle="Biology" folderId={null} note={data[0]} /> : <p>Loading</p>;
}
beforeEach(() => { state.saved = "original"; state.writes = []; state.release = undefined; });
afterEach(cleanup);
it("STATE-01: a save/refetch must preserve text typed during that save", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={qc}><MemoryRouter><Harness /></MemoryRouter></QueryClientProvider>);
  const editor = await screen.findByRole("textbox", { name: "Student note" }) as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: "A" } });
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(state.writes).toEqual(["A"]));
  fireEvent.change(editor, { target: { value: "AB" } });
  expect(editor.value).toBe("AB");
  await act(async () => { state.release!(); });
  await waitFor(() => expect(qc.isFetching()).toBe(0));
  await waitFor(() => expect(qc.isMutating()).toBe(0));
  const afterRefetch = editor.value;
  fireEvent.change(editor, { target: { value: `${editor.value}C` } });
  fireEvent.click(screen.getByRole("button", { name: "Save", exact: true }));
  await waitFor(() => expect(state.writes).toHaveLength(2));
  console.log("STATE-01 observed", { typedBeforeResponse: "AB", afterRefetch, writes: state.writes, persisted: state.saved });
  expect(afterRefetch, "earlier save response replaced newer student text").toBe("AB");
  expect(state.saved).toBe("ABC");
});
````

### notes/quiz-recovery.test.tsx

Original location: `C:/Users/kkchi/learnora-qa-20260920/notes/quiz-recovery.test.tsx`.

````tsx
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router";
import { server } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/test/mocks/server";
import { SUPABASE_URL } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/supabase";
import { mockAuthSession } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/test/mockSession";
import { fakeSession, renderWithAuth } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/test/auth";
import { Storage } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/storage";
import { QuizRunner } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/views/quiz/QuizRunner";

function mountQuiz() {
  return renderWithAuth(<MemoryRouter initialEntries={["/quiz/quiz-qa"]}>
    <Routes><Route path="/quiz/:quizId" element={<QuizRunner />} /></Routes>
  </MemoryRouter>, { session: fakeSession() });
}
beforeEach(() => { localStorage.clear(); mockAuthSession("user-1"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("STATE-02: completed quiz must retain recoverable answers after rejected save and remount", async () => {
  let failedPosts = 0;
  server.use(
    http.get(`${SUPABASE_URL}/rest/v1/quizzes`, () => HttpResponse.json([{
      id: "quiz-qa", user_id: "user-1", title: "QA biology", material_id: null, folder_id: null,
      questions_json: [
        { id: "q1", question: "Which organelle makes ATP?", choices: ["Mitochondrion", "Nucleus"], correctIndex: 0 },
        { id: "q2", question: "Which gas do plants consume?", choices: ["Carbon dioxide", "Helium"], correctIndex: 0 },
      ], created_at: "2026-09-20T00:00:00Z",
    }])),
    http.post(`${SUPABASE_URL}/rest/v1/quiz_attempts`, () => {
      failedPosts++;
      return HttpResponse.json({ message: "permission denied" }, { status: 403 });
    }),
  );
  const first = mountQuiz();
  await screen.findByText("Question 1 of 2");
  await userEvent.click(screen.getByRole("button", { name: "Mitochondrion" }));
  await userEvent.click(screen.getByRole("button", { name: /Next Question/ }));
  await waitFor(() => expect(Storage.get("learnora_quiz_draft_quiz-qa")).not.toBeNull());
  await userEvent.click(screen.getByRole("button", { name: "Carbon dioxide" }));
  await userEvent.click(screen.getByRole("button", { name: /See results/ }));
  await screen.findByText(/couldn't save this attempt/);
  const recoveryDraft = Storage.get("learnora_quiz_draft_quiz-qa");
  const retryVisible = screen.queryByRole("button", { name: /retry|save attempt/i }) !== null;
  first.unmount();
  mountQuiz();
  await screen.findByText("Question 1 of 2");
  const resumeVisible = screen.queryByText(/Resume where you left off/) !== null;
  console.log("STATE-02 observed", { failedPosts, recoveryDraft, retryVisible, resumeVisible, reopened: "Question 1 of 2" });
  expect(recoveryDraft, "finished answers were deleted despite failed persistence").not.toBeNull();
});
````

### notes/results.json

Original location: `C:/Users/kkchi/learnora-qa-20260920/notes/results.json`.

````json
{"numTotalTestSuites":2,"numPassedTestSuites":0,"numFailedTestSuites":2,"numPendingTestSuites":0,"numTotalTests":2,"numPassedTests":0,"numFailedTests":2,"numPendingTests":0,"numTodoTests":0,"snapshot":{"added":0,"failure":false,"filesAdded":0,"filesRemoved":0,"filesRemovedList":[],"filesUnmatched":0,"filesUpdated":0,"matched":0,"total":0,"unchecked":0,"uncheckedKeysByFile":[],"unmatched":0,"updated":0,"didUpdate":false},"startTime":1789953810515,"success":false,"testResults":[{"assertionResults":[{"ancestorTitles":[],"fullName":"STATE-01: a save/refetch must preserve text typed during that save","status":"failed","title":"STATE-01: a save/refetch must preserve text typed during that save","duration":266.6921000000002,"failureMessages":["AssertionError: earlier save response replaced newer student text: expected 'A' to be 'AB' // Object.is equality\n    at C:/Users/kkchi/learnora-qa-20260920/notes/note-race.test.tsx:62:77\n    at file:///C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:20"],"meta":{},"tags":[]}],"startTime":1789953817157,"endTime":1789953817423.6921,"status":"failed","message":"","name":"C:/Users/kkchi/learnora-qa-20260920/notes/note-race.test.tsx"},{"assertionResults":[{"ancestorTitles":[],"fullName":"STATE-02: completed quiz must retain recoverable answers after rejected save and remount","status":"failed","title":"STATE-02: completed quiz must retain recoverable answers after rejected save and remount","duration":979.8538999999992,"failureMessages":["AssertionError: finished answers were deleted despite failed persistence: expected null not to be null\n    at C:/Users/kkchi/learnora-qa-20260920/notes/quiz-recovery.test.tsx:51:89\n    at file:///C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:20"],"meta":{},"tags":[]}],"startTime":1789953814229,"endTime":1789953815208.854,"status":"failed","message":"","name":"C:/Users/kkchi/learnora-qa-20260920/notes/quiz-recovery.test.tsx"}]}
````

### notes/vitest.config.mts

Original location: `C:/Users/kkchi/learnora-qa-20260920/notes/vitest.config.mts`.

````typescript
import base from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/vite.config.ts";
const repo = "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp";
export default {
  ...base,
  root: repo,
  resolve: { alias: Object.fromEntries([
    "vitest", "react", "react-dom", "react-router", "@tanstack/react-query",
    "@testing-library/react", "@testing-library/user-event", "msw",
  ].map(name => [name, `${repo}/node_modules/${name}`])) },
  test: {
    ...base.test,
    include: ["C:/Users/kkchi/learnora-qa-20260920/notes/*.test.tsx"],
    maxWorkers: 1,
    fileParallelism: false,
  },
};
````

### runtime/response-body.test.ts

Original location: `C:/Users/kkchi/learnora-qa-20260920/runtime/response-body.test.ts`.

````typescript
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { callEdge, REQUEST_TIMEOUT_MS } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/api/ai";

vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/supabase", () => ({
  SUPABASE_URL: "https://qa.invalid",
  supabase: { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "local-test-token" } } }) } },
}));
vi.mock("C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/src/lib/queryClient", () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function delayedBody() {
  let resolveBody!: (value: string) => void;
  let startedBody!: () => void;
  const started = new Promise<void>(resolve => { startedBody = resolve; });
  const body = new Promise<string>(resolve => { resolveBody = resolve; });
  let requestSignal!: AbortSignal;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    requestSignal = init.signal;
    return { ok: true, status: 200, text: () => { startedBody(); return body; } };
  }));
  return { started, resolve: (text: string) => resolveBody(text), signal: () => requestSignal };
}

it("QA-AI-01: deadline must still abort after headers arrive while response body stalls", async () => {
  const delayed = delayedBody();
  let settled = false;
  const result = callEdge({ history: [{ role: "user", content: "Explain fractions" }] }, undefined, 0);
  void result.then(() => { settled = true; }, () => { settled = true; });
  await delayed.started;
  await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1);
  const observed = { elapsedMs: REQUEST_TIMEOUT_MS + 1, requestAborted: delayed.signal().aborted, settled };
  console.log("QA-AI-01 observed", observed);
  delayed.resolve('{"text":"late answer"}');
  await result;
  expect(observed.requestAborted, "the AI deadline was removed before reading the body").toBe(true);
});

it("QA-AI-02: Stop must abort body consumption and reject a late answer", async () => {
  const delayed = delayedBody();
  const stop = new AbortController();
  const onText = vi.fn();
  const result = callEdge({ history: [{ role: "user", content: "Explain fractions" }] }, onText, 0, stop.signal);
  await delayed.started;
  stop.abort();
  const wasAborted = delayed.signal().aborted;
  delayed.resolve('{"text":"answer delivered after Stop"}');
  const value = await result.then(value => ({ value }), error => ({ error: error.message }));
  console.log("QA-AI-02 observed", { requestAborted: wasAborted, onTextCalls: onText.mock.calls.length, result: value });
  expect(wasAborted, "external cancellation was disconnected after response headers").toBe(true);
  expect(onText).not.toHaveBeenCalled();
});
````

### runtime/results.json

Original location: `C:/Users/kkchi/learnora-qa-20260920/runtime/results.json`.

````json
{"numTotalTestSuites":1,"numPassedTestSuites":0,"numFailedTestSuites":1,"numPendingTestSuites":0,"numTotalTests":2,"numPassedTests":0,"numFailedTests":2,"numPendingTests":0,"numTodoTests":0,"snapshot":{"added":0,"failure":false,"filesAdded":0,"filesRemoved":0,"filesRemovedList":[],"filesUnmatched":0,"filesUpdated":0,"matched":0,"total":0,"unchecked":0,"uncheckedKeysByFile":[],"unmatched":0,"updated":0,"didUpdate":false},"startTime":1789953810530,"success":false,"testResults":[{"assertionResults":[{"ancestorTitles":[],"fullName":"QA-AI-01: deadline must still abort after headers arrive while response body stalls","status":"failed","title":"QA-AI-01: deadline must still abort after headers arrive while response body stalls","duration":16.115600000000086,"failureMessages":["AssertionError: the AI deadline was removed before reading the body: expected false to be true // Object.is equality\n    at C:/Users/kkchi/learnora-qa-20260920/runtime/response-body.test.ts:39:90\n    at file:///C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:20"],"meta":{},"tags":[]},{"ancestorTitles":[],"fullName":"QA-AI-02: Stop must abort body consumption and reject a late answer","status":"failed","title":"QA-AI-02: Stop must abort body consumption and reject a late answer","duration":3.7370999999998276,"failureMessages":["AssertionError: external cancellation was disconnected after response headers: expected false to be true // Object.is equality\n    at C:/Users/kkchi/learnora-qa-20260920/runtime/response-body.test.ts:53:87\n    at file:///C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/@vitest/runner/dist/chunk-artifact.js:1903:20"],"meta":{},"tags":[]}],"startTime":1789953812376,"endTime":1789953812395.737,"status":"failed","message":"","name":"C:/Users/kkchi/learnora-qa-20260920/runtime/response-body.test.ts"}]}
````

### runtime/vitest.config.mts

Original location: `C:/Users/kkchi/learnora-qa-20260920/runtime/vitest.config.mts`.

````typescript
import { defineConfig } from "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/vitest/dist/config.js";

export default defineConfig({
  root: "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp",
  resolve: {
    alias: {
      vitest: "C:/Users/kkchi/OneDrive/Desktop/study-planner-1/webapp/node_modules/vitest/dist/index.js",
    },
  },
  test: {
    environment: "jsdom",
    include: ["C:/Users/kkchi/learnora-qa-20260920/runtime/*.test.ts"],
    pool: "threads",
    maxWorkers: 1,
    fileParallelism: false,
    execArgv: ["--no-experimental-webstorage"],
  },
});
````


---

# CONTINUATION — 21 September 2026 — Live deployed session

This section is appended. Nothing above was deleted or rewritten. Where this
session's live evidence contradicts a historical local finding, the historical
text is left intact and the correction is recorded here.

## Executive assessment

**The Browser blocker from the previous session is resolved.** The in-app
Browser connected on the first attempt, the deployed application was logged
into through the visible form, and live student journeys, persistence,
rendered layout, real-keyboard accessibility, contrast and production console
traffic were exercised for the first time.

**The deployed build was positively identified**, closing the previous
session's largest environmental gap.

Headline results:

- **STATE-02 reproduced live and is worse than recorded.** On the deployed
  build a completed 10-question quiz whose attempt save is rejected shows the
  student a **success message and a score, with no error, no warning, no retry
  and no recovery**. The draft is deleted and the attempt never reaches the
  database. This is promoted **P2 to P1**.
- **STATE-01 partially reproduced and partially disproved.** In the real Quill
  editor the newer text *does* visibly vanish, reliably. But it was **re-saved
  and survived a reload**; the permanent data loss asserted locally did **not**
  occur on the deployed build. Downgraded **P2 to P3**.
- **Three new CONFIRMED production defects** found that no local test could
  have caught: every web font is blocked by the site's own CSP; notebook card
  titles are invisible in the dark theme; and the mobile navigation drawer
  stays in the keyboard tab order while off-screen.

This remains an incomplete audit. Timer/AS-02, AS-03, AI-01's Stop button,
STATE-03, uploads, payments, notifications, realtime and cross-device sync were
**not** exercised and are listed as NOT TESTED below.

## Environment and deployment identity

| Item | Observed |
| --- | --- |
| Date / session | 21 September 2026, live production QA |
| Target | https://learnora-app.vercel.app |
| **Deployed commit** | **fea0369a6b8b9c72a61d071f317365ebf2c191ae** (Vercel deployment dpl_2wvo8DF1k4qWqnPUxf5RmUV2QDY3, target production, state READY, githubCommitRef main) |
| Deployment identity source | Vercel API, project prj_kR0tYsmIAhOB40d3zbkd7Hw1JhhU |
| **Repo HEAD vs deployed** | **Identical.** The previous session's source line references therefore describe the live build |
| Uncommitted worktree | 10 modified files (QuizRunner, continuity, CognitiveDebugger, tests) are **NOT deployed**. Live behaviour reflects the committed fea0369 versions |
| Browser | In-app Browser pane, Chromium 152.0.7977.76, dpr 1.5 |
| Viewports exercised | 533x551 (pane native), 1280x800, 375x812, plus theme toggling |
| Account | the supplied shared QA test account (address intentionally not recorded here), existing and onboarded |
| Account state at start | 5 notebooks, 7 notes, 8 cards due, 1 library source, 2 subjects (Lol, maths), **0 tasks, 0 exams, 0 study sessions, 0 quiz attempts, 0 active days** |
| Authorization used | Full QA-prefixed writes, AI within free daily allowance, disposable second signup — all granted by the user this session |
| Second account | **Not created.** Effort was spent on higher-yield live work; AS-01 remains not live-reproduced |

### Tooling limitation that shaped method

Under viewport emulation the pane's click coordinate frame (800x500) does not
match the emulated CSS viewport (1280x800), so ref-targeted real clicks miss
their target. **This is an artifact of the test harness, not an application
defect, and is explicitly not reported as one.** Work was done at the pane's
native size where real clicks land correctly; programmatic .click() and the
real keyboard were used under emulation. Real keystrokes and real clicks were
used for every assertion where event trust matters.

read_network_requests captured documents and static assets but not XHR/fetch,
so Supabase traffic was observed by instrumenting window.fetch in the page
instead.

## Coverage

| Classification | Scope |
| --- | --- |
| **TESTED — deployed browser** | Login through the form; session persistence across full reloads; route sweep (Today, Library, Plan, Progress, notes, quiz); library tab panels; source-creation dialog incl. validation and modal a11y; live AI generation end to end; quiz run of 10 questions incl. answer locking and live-region feedback; rendered layout at 3 viewports; dark/light theme; real-keyboard tab order; contrast measurement; production console |
| **TESTED — live backend persistence** | Note text persisted and re-read after reload; quiz attempt **proved absent** from the database via Progress after a blocked save; generated note/quiz/deck persisted and re-read in a fresh page load |
| **TESTED — isolated browser reproduction** | STATE-02 (rejected attempt save, request-local injection); STATE-01 (gated note PATCH, real Quill, two timings) |
| **PARTIALLY TESTED** | AI teaching quality (one generation + 10 generated items + one explanation graded); mobile layout (dashboard only); accessibility (one dialog, one nav, one quiz surface) |
| **NOT TESTED** | Timer/focus and **AS-02**; **AS-03** token renewal; **AI-01** Stop button and delayed body; **STATE-03** inline explanation removal; **AS-01** account switch; uploads/extraction; tasks/exams/Plan CRUD; flashcard review; Study Lab tools; community/study rooms; notifications; payments/Stripe; cross-device and multi-tab; service worker/app update; password recovery, profile and account deletion |

## New confirmed bugs

### VIS-01 — The site's own CSP blocks every web font

- **Severity / confidence / status:** P3 — MEDIUM / **CONFIRMED (deployed browser)** / open.
- **Persona / feature:** Every student, every screen; typography and the
  Atkinson Hyperlegible accessibility face.
- **Environment:** Deployed fea0369, any route, any viewport, both themes.
- **Reproduction (100%, every page load):** Open any page and read the console.
- **Expected:** The deferred Google Fonts stylesheet is promoted from
  media="print" to media="all" once it loads, and the branded faces apply.
- **Actual:** Console logs `Executing inline event handler violates the
  following Content Security Policy directive 'script-src 'self''. The action
  has been blocked.` Measured in the live page: the stylesheet is still
  media="print", and `[...document.fonts].filter(f => f.status === 'loaded')`
  is **empty**. A heading resolves to
  `"Instrument Sans", Inter, system-ui, -apple-system, "Segoe UI", sans-serif`
  and therefore renders in Segoe UI.
- **Evidence:** Production console error, repeated on every navigation; live
  DOM and document.fonts inspection.
- **Root cause (CONFIRMED, not inference):** webapp/index.html:55 uses
  `onload="this.media='all'"`. The deployment's CSP sets `script-src 'self'`
  without 'unsafe-hashes', and CSP does not permit inline event handlers
  under that policy. The <noscript> fallback does not fire because scripting
  is enabled.
- **Student impact:** The entire product renders in fallback system fonts, so
  the shipped visual design is not what students see. Notably
  **Atkinson Hyperlegible** — a legibility face requested in the same
  stylesheet — can never load, so any setting relying on it cannot work.
- **Adjacent / test gap:** No test asserts that the font stylesheet is promoted
  or that CSP permits the techniques used in index.html. Nothing exercises
  the deployed CSP at all.
- **Smallest safe next check:** Confirm whether any appearance setting offers a
  dyslexia-friendly font, and whether it depends on this stylesheet.

### VIS-02 — Notebook card titles are invisible in the dark theme

- **Severity / confidence / status:** P2 — HIGH / **CONFIRMED (deployed browser)** / open.
- **Persona / feature:** Every student using the default dark theme; Dashboard
  "Continue" row and Library notebook grid.
- **Environment:** Deployed fea0369, body.dark-theme (the theme the account
  loaded in). Reproduced at **both 375 px and 1280 px** — not mobile-specific.
- **Reproduction (100%):** Log in with the dark theme active and look at the
  notebook cards on Today or Library.
- **Expected:** Notebook titles are readable.
- **Actual:** The card background stays hard-coded rgb(255,255,255) while the
  title colour follows the dark theme to rgb(240,236,228). Measured contrast
  **1.18:1** against WCAG AA's 4.5:1 — the titles are effectively invisible.
  A screenshot at 1280x800 shows three notebook cards rendering as blank white
  rectangles.
- **Root cause (CONFIRMED by theme toggle):** Toggling to the light theme
  changes the title to rgb(26,24,21) on the same white card and it becomes
  readable. The card surface does not participate in dark theming; the text
  does. Emulating prefers-color-scheme: dark changed nothing, so this is the
  app's own theme, not an OS-scheme mismatch.
- **Student impact:** A student in the default theme cannot read which notebook
  is which and must click blind. This is the primary route into their own
  material.
- **Adjacent:** The same white-card-in-dark-theme surface drives most of the
  contrast failures below.
- **Test gap:** No test renders these cards under the dark theme or asserts
  contrast.

### VIS-03 — Further dark-theme contrast failures on the dashboard

- **Severity / confidence / status:** P3 — MEDIUM / **CONFIRMED (deployed browser)** / open.
- **Method note:** Measured with alpha compositing up the ancestor chain, and
  with gradient-backed elements **excluded** — an initial pass produced false
  positives on gradient buttons ("Add", "Resume"), which were verified as white
  on rgb(22,105,97) and are **not** defects. **18** genuine failures remain in
  the dark theme versus **1** marginal failure in the light theme.
- **Worst genuine cases:**
  - `Progress` and `full dashboard` render in **rgb(0,0,238) — the browser's
    default unstyled link colour** — on rgb(13,12,10), **2.08:1**. These
    anchors appear to receive no CSS at all.
  - `Review now`, `View all`, `Open calendar`, `Open notebook`: teal
    rgb(95,179,163) on white/mint, **2.25–2.48:1**.
- **Student impact:** Primary navigation affordances are hard to read in the
  default theme; the two unstyled links also look foreign to the design.
- **Smallest safe next check:** Find why those two anchors receive no styling —
  an unstyled link usually means a missing class, not a colour-token choice.

### A11Y-02 — The closed mobile nav drawer stays in the keyboard tab order

- **Severity / confidence / status:** P2 — HIGH / **CONFIRMED (deployed browser, real keyboard)** / open.
- **Persona / feature:** Keyboard-only, switch-control and screen-reader
  students on a phone; global navigation.
- **Environment:** Deployed fea0369, 375x812.
- **Reproduction (100%):** Load /app at phone width with the drawer closed
  and press Tab from the top of the page.
- **Expected:** A closed off-canvas drawer is removed from the tab order and
  from the accessibility tree.
- **Actual:** The drawer sits at left: -248px to right: -33px — entirely
  off-screen — but its container has **no inert, no aria-hidden, and
  visibility: visible**. **10** controls remain focusable with tabIndex 0.
  After four real Tab presses focus is on the Today nav link measured at
  left: -248, right: -33. It has a 2px solid focus outline, but the outline
  is off-screen, so **the focus indicator simply disappears**.
- **Student impact:** A keyboard user must tab through ten invisible controls
  before reaching page content, with no visible focus the whole way — the
  classic "where did my focus go" failure. Screen-reader users hear a full
  navigation menu announced as though it were present.
- **Adjacent / test gap:** jsdom cannot detect this; it needs layout. No test
  asserts drawer inertness.
- **Smallest safe next check:** Whether opening the drawer traps focus and
  restores it on close — untested.

### A11Y-01 — Unlabelled slider in the source-creation dialog

- **Severity / confidence / status:** P4 — LOW / **CONFIRMED (deployed browser)** / open.
- **Detail:** In "Start with a source" then Fine-tune generation, the range input
  #material-card-count (min 5, max 30, value 12) is visible and keyboard
  focusable (tabIndex 0) but has **no aria-label, no aria-labelledby, no
  wrapping <label> and no label[for]**. A screen reader announces a slider
  with a number and no indication of what it controls.
- **Verified not a defect nearby:** the three study-kit checkboxes *do* have
  wrapping labels and are correctly named; the "Topic" tab is named by its text
  content. Neither is reported.

## Updated status of every prior finding

| ID | Prior status | **Live status this session** |
| --- | --- | --- |
| **STATE-02** | P2, CONFIRMED locally | **CONFIRMED live, promoted to P1.** Reproduced end to end on the deployed build; the live failure UX is *worse* than the local diagnostic described — see below |
| **STATE-01** | P2, CONFIRMED locally | **PARTIALLY CONFIRMED live, downgraded to P3.** The visible revert reproduces reliably in real Quill; the permanent loss does **not** — see below |
| **AS-01** | P2, CONFIRMED locally | **NOT RETESTED.** No second account was created; no live account-switch replay attempted. Remains local-only evidence |
| **AS-02** | P2, CONFIRMED locally | **NOT RETESTED.** Timer never exercised; 0 sessions were logged this session |
| **AS-03** | P3, CONFIRMED locally | **NOT RETESTED.** No expired-token read was induced |
| **AI-01** | P3, CONFIRMED locally | **NOT RETESTED against the Stop button.** One incidental datum: a generation ran ~140 s across staged steps without a client-side abort, which is consistent with the deadline not bounding long work, but it is *not* the headers-then-delayed-body case and proves nothing about AI-01 |
| **STATE-03** | P3 provisional, LIKELY, never executed | **STILL NOT REPRODUCED.** No inline explanation was inserted or removed |
| **TOOLING-01** | CONFIRMED doc/config mismatch | Unchanged; not revisited |

### STATE-02 — live reproduction detail (promoted to P1)

- **Preconditions:** QA-created 10-question quiz
  46e9cb65-8158-453f-80d9-d87e065e961c; account had **0 quiz attempts**.
- **Steps:** Answered all 10 questions with real clicks and programmatic
  advancement. Confirmed the draft
  learnora_quiz_draft_46e9cb65-... held **all 10 answers**. Injected a
  request-local failure returning **403** for
  POST .../rest/v1/quiz_attempts (page-scoped fetch override; **no production
  service was altered**). Pressed **See results** with a real click.
- **Actual:**
  1. The blocked request was recorded:
     https://mlvgqwqiynpwpwzqufdf.supabase.co/rest/v1/quiz_attempts?columns=...
  2. The only live-region message was
     **"Finished! You got 2 out of 10. Let's fix what slipped."** — a
     *success* message.
  3. **No error anywhere.** /fail|error|couldn|not saved|unable|retry/i
     tested against the whole document body returned **false**. No toast
     elements existed. Available actions were only
     "Work on Light-Dependent Reactions", "Review answers", "Back to Quizzes" —
     **no retry and no save action**.
  4. The draft was **deleted**: localStorage.getItem(draftKey) === null.
  5. Reopening the quiz after a full reload started at **"Question 1 of 10"**
     with {"index":0,"answers":[]}.
  6. **Persistence proof:** Progress still reports **"0 quiz attempts"**.
- **Why P1:** The student loses a completed assessment in full, is told they
  succeeded, is shown a score, and is given no error, no retry and no way back.
  Silent total loss of finished work combined with a false success indicator is
  a more severe class than the "acknowledges save failure" behaviour the local
  diagnostic recorded.
- **Divergence from the local finding:** The local run observed a save warning.
  The deployed build showed **none**. Treat the live observation as
  authoritative for production.

### STATE-01 — live reproduction detail (downgraded to P3)

- **Preconditions:** QA-created note f195ec60-f06c-4266-82fb-63775b83d7dd,
  2,670 characters, real Quill (.ql-editor + .ql-toolbar present).
- **Method:** Page-scoped fetch gate holding PATCH .../rest/v1/notes until
  released, letting GETs through. Text entered with **real keystrokes**.
- **Run 1:** Typed AAAAA, autosave fired and was held (UI showed "Saving").
  Typed BBBBB, editor read ...AAAAABBBBB. Released save A: **editor
  reverted to ...AAAAA; BBBBB vanished from the document.**
- **Run 2 (tighter timing, releasing before the 2 s debounce):** Typed CCCCC,
  held its save, typed DDDDD, released within 400 ms: editor reverted from
  ...CCCCCDDDDD to ...CCCCC.
- **Where the local finding does not hold:** In both runs a queued save still
  carried the newer text, so releasing it restored the content. After typing
  EEEEE and a **full page reload**, the note read
  **...AAAAABBBBBCCCCCDDDDDEEEEE** — every character survived. The local
  diagnostic's ["A", "AC"] permanent-loss outcome did **not** occur live.
- **What is still real:** Text the student just typed disappears from the
  editor mid-session, reliably (2/2), with the caret position disturbed. That
  is a genuine defect worth fixing, but it is a **transient display** fault on
  this build, not data loss. **P2 to P3.**
- **Honest limit:** I did not find a live timing that loses data. I cannot
  prove no such timing exists — only that the two timings I ran recovered.

## Likely / suspected

### SUSP-01 — Notes stuck in "Processing..."

- **Severity / confidence:** P3 provisional / **SUSPECTED**.
- **Observation:** Three pre-existing notes
  (b944a0d8..., 7a45451c..., 2f86c126...), all titled "Testing of this random
  Science Textbook Chapter", render with a persistent **"Processing..."** badge in
  the Library list. They are pre-existing student records, so I did not open,
  retry or modify them.
- **Why it matters if real:** A permanently stuck processing state is a
  deceptive status — the student waits for material that will never arrive, with
  no failure message and no retry.
- **Smallest safe next check:** Read those rows' status/updated_at in the
  database (read-only) to see whether processing genuinely stalled, and whether
  any UI path offers a retry.

## Student UX findings

- **The quiz result screen is the most dangerous surface found.** It reports
  success without knowing whether anything was saved (STATE-02).
- Generation is slow but honestly narrated: staged messages progressed
  "Reading your material and writing notes..." then "Writing 10 quiz questions..."
  over roughly **140 seconds**, with a Cancel control present throughout. Long,
  but not deceptive.
- Minor: submitting the source dialog with an empty box returns the good error
  *"That text is a bit short to study from. Add at least a paragraph."* but
  pairs it with a **"Retry Failed Stages"** button, although no stage ran. Mildly
  misleading; **P4, not pursued**.

## Verified working — live observations

Each of these was observed on the deployed build, not inferred:

- **Login** through the visible form with the supplied account; redirect to
  /app; correct personalised greeting.
- **Session persistence** across many full page loads and direct deep-link
  navigations — no re-authentication was ever required.
- **Empty-form login submit** is blocked by native validation; no request fired.
- **Source dialog accessibility is genuinely well built:** aria-modal="true",
  aria-labelledby set, focus moved into the dialog on open, **Escape
  dismisses**, and **focus returned to the triggering "Start with a source"
  button**. This is a real, verified accessibility success.
- **Source validation** rejects a too-short source client-side without spending
  an AI call.
- **Live AI generation** produced a coherent note, a 10-question quiz and a
  flashcard deck from a pasted source, persisted them, and they survived a
  reload in a fresh page load.
- **AI teaching quality (small sample, positive):** the generated question
  *"Why do plant leaves usually appear green..."* is scientifically correct, and
  its explanation both gives the right mechanism (chlorophyll absorbs blue and
  red, reflects green) **and addresses each distractor individually**. Ten
  generated items were on-topic and syllabus-plausible. **One good generation
  does not establish general reliability.**
- **Quiz answer semantics:** after answering, all four choices become
  disabled, the correct choice is marked, and feedback is delivered in a
  role="status" live region — so it is announced.
- **No horizontal overflow** at 375 px: document.documentElement.scrollWidth
  equalled the 375 px viewport.
- **Touch targets:** only three controls measured under 44 px on the mobile
  dashboard, two of which are inline text links inside a sentence (a permitted
  exception); the third is a 42 px card row. No touch-target defect is claimed.
- **Production console is otherwise clean** — the only recurring error is
  VIS-01's CSP message. No unhandled rejections, no failed asset loads, no 4xx/5xx
  on documents or static assets were observed during the sweep.

## Test records created, and cleanup status

All created under the granted authorization, all QA-prefixed, all in the test
account. **Nothing pre-existing was modified or deleted.**

| Record | Identity | Status |
| --- | --- | --- |
| Note | QA-20260921 Photosynthesis — f195ec60-f06c-4266-82fb-63775b83d7dd | **Retained.** Contains the appended race markers AAAAABBBBBCCCCCDDDDDEEEEE |
| Quiz | QA-20260921 Photosynthesis Quiz — 46e9cb65-8158-453f-80d9-d87e065e961c | **Retained** |
| Flashcard deck | generated alongside the above | **Retained** |
| Quiz attempt | — | **None persisted.** The single attempt was deliberately blocked; Progress still reads 0 attempts |
| Theme setting | toggled light then back | **Restored to dark**, the value found at login |
| AI spend | one generation (notes + quiz + flashcards) | Within the authorized free allowance |

Records were **retained rather than deleted** so the evidence remains
inspectable. They are disposable and can be removed on request. No study
session, task or exam was created; no pre-existing student work was touched.

## Final coverage review

**Which critical journey was only inspected in source?** The **timer/focus**
journey — it was never started, so **AS-02** (duplicate session inserts) and all
session-history aggregation remain local-only evidence. **Tasks, exams and Plan**
CRUD were likewise never exercised.

**Which operation appeared successful without persistence proof?** None that I
reported as working — persistence was re-read after reload for the note and the
generated material, and the quiz attempt's *absence* was positively proven via
Progress. The untested surfaces are simply untested.

**Which phone, keyboard, failure or recovery path remains open?** Phone layout
beyond the dashboard (Library, notes, quiz, timer, AI panels, dialogs at 320 px);
whether the mobile drawer traps and restores focus when opened; keyboard
operation of the quiz and the editor; and every AI failure path — Stop, timeout,
rate limit, quota exhaustion.

**Which cross-feature transition could lose work or expose another account's
state?** **AS-01** is the open account-boundary risk and was not live-tested; a
second disposable account was authorized but not created. The quiz-save-reopen
transition is now proven to lose work (STATE-02).

**Which claims exceed the evidence?** Stated plainly: AI quality rests on a
single generation and one graded explanation. STATE-01's live runs recovered the
data, so I do not claim live data loss — nor do I claim it is impossible.
Accessibility findings come from the accessibility tree, real keyboard input and
computed styles; **no screen reader was run**, so no screen-reader compatibility
claim is made.

## Highest-value remaining work

1. **Fix and verify STATE-02 first.** It is the only P1: silent loss of a
   completed assessment behind a success message.
2. **VIS-01 is a one-line, whole-product fix** — the font stylesheet promotion
   is blocked by the app's own CSP on every page load.
3. **VIS-02** makes the main route into a student's own material unreadable in
   the default theme.
4. **Live-test the timer** to settle AS-02, and induce a real expired-token read
   for AS-03 — both need only the authorization already granted.
5. **Exercise the real Stop button** against a delayed-body endpoint for AI-01.
6. **Create the authorized second account** and run the AS-01 account-switch
   replay — the only account-isolation finding with no live evidence.
7. **STATE-03** remains entirely unexecuted and should be reproduced with real
   editor content before its severity is settled.

---

# CONTINUATION 2 — 21 September 2026 — Remaining reproductions

Same deployed build (`fea0369a`, Vercel `dpl_2wvo8DF1k4qWqnPUxf5RmUV2QDY3`), same
account, same in-app Browser. This round closed the reproductions the first
continuation listed as NOT TESTED. All fault injection was **page-scoped**
(`window.fetch` override in the tab); **no production service was altered**.

## Result summary

| ID | Status after this round |
| --- | --- |
| **AS-02** | **CONFIRMED live against the real database.** Promoted from client-boundary evidence to end-to-end proof |
| **AI-01** | **CONFIRMED live. Promoted P3 to P2.** Worse than recorded — but one half of the original claim is **disproved** |
| **AS-03** | **CONFIRMED live**, exactly as predicted. Stays P3 |
| **STATE-03** | **NOT REPRODUCIBLE** — blocked by a new, more serious defect (AI-02) that supersedes it |
| **AS-01** | **Still not live-reproduced**, and its premise is now in doubt — see OFFLINE-01 |
| **AI-02** | **NEW — CONFIRMED, P2** |
| **OFFLINE-01** | **NEW — CONFIRMED, P2** |
| **ANL-01** | **NEW — CONFIRMED, P3** |

## AS-02 — Duplicate study sessions (CONFIRMED live, P2)

- **Method:** Page-scoped interceptor for `POST /rest/v1/study_sessions` that
  **performs the real request** (so the server genuinely commits), then throws
  `TypeError('Failed to fetch')` to the client — a true
  "server committed, response lost", not a pre-commit failure.
- **Journey:** One real 1-minute pomodoro focus block started with a real click
  and allowed to complete.
- **Actual — both requests reached the real Supabase and both returned 201:**

  | # | `started_at` | minutes | server status |
  | --- | --- | --- | --- |
  | 1 | `2026-09-21T11:20:51.355Z` | 1 | **201 Created** |
  | 2 | `2026-09-21T11:20:52.811Z` | 1 | **201 Created** |

- **Payload (both):** `{user_id, task:"General Study", folder_id:null, minutes:1,
  timer_type:"pomodoro", started_at, notes:null}` — **no `clientId` and no
  idempotency key of any kind**, confirming the ledger's source analysis that
  `api/sessions.ts` omits it from the session insert.
- **Database proof:** Progress went from **1 completed session / 0h 1m** to
  **3 completed sessions / 0h 3m** after a single 1-minute session.
- **Note:** the two payloads differ in `started_at` by 1.4 s, so even a
  server-side dedupe on payload equality would not catch this.
- **Student impact:** Study statistics silently inflate. A student's logged time
  can be multiples of what they actually studied whenever the network drops a
  response.

## AI-01 — AI timeout and cancellation (CONFIRMED live, promoted P3 to P2)

Two independent findings came out of this, and they point in opposite
directions. Both are reported.

### Disproved: a cancelled answer does NOT reach the student

With a delayed body released **after** Stop, the late text
(`LATE ANSWER AFTER STOP: …`) **never appeared** — the panel showed
*"Stopped. Ask again whenever you're ready."* The local diagnostic's concern
that "a canceled answer can still arrive" does **not** reproduce in the
deployed chat UI. Delivery-side cancellation is correct.

### Confirmed and worse: the deadline never bounds a stalled body, and Stop is inert

- **Method (faithful):** Interceptor resolves headers `200` immediately and
  returns a `ReadableStream` body that never completes. Critically, the stream
  is **wired to the request's `AbortSignal` and errors on abort**, exactly as
  real `fetch` behaves — an earlier, unfaithful version of this test was
  discarded because its stream ignored abort.
- **Control observation:** `POST /functions/v1/web-research` **did** abort at
  **20,010 ms**, and the UI recovered and advanced to the next stage. So
  deadlines are armed on that path and the harness is sound.
- **Defect:** `POST /functions/v1/learnora-ai` with headers delivered and body
  pending ran for **153,749 ms** with **zero aborts recorded**. The documented
  60,000 ms deadline never fired.
- **Stop is inert in this phase:** Two real clicks on the Stop button produced
  **no abort at all** (`aborted: [20010]` throughout — only the earlier
  web-research entry). The UI stayed on *"Still writing your answer…"* with the
  Stop button visible, and **`Send message` remained `disabled`**.
- **Student impact (why P2, not P3):** The chat becomes permanently unusable.
  The student sees a spinner, a Stop button that does nothing when pressed, and
  a composer they cannot type into. The only escape is reloading the page. This
  is materially worse than the local finding, which framed it as a late answer
  arriving.
- **Root cause confirmed as predicted:** the deadline/abort wiring is released
  once `fetch` resolves headers, so nothing bounds or cancels body consumption
  on the main AI caller path.

## AS-03 — Renewal does not restart the failed read (CONFIRMED live, P3)

- **Method:** Created a real task, then injected a single **401
  `{"message":"JWT expired","code":"PGRST301"}`** on `GET /rest/v1/tasks`, with
  the token-refresh endpoint passed through to the real service. Refetch was
  triggered by genuine client-side navigation (Plan then back to Tasks) —
  synthetic `focus` events do not drive TanStack's focus manager and were
  abandoned as a trigger.
- **Observed request sequence — exactly two entries:**
  1. `TASKS GET -> injected 401`
  2. `REFRESH POST` (real, succeeded)
  …and **no third entry**. `taskGets: 1`, `refreshCalls: 1`.
- **UI:** *"Could not load your tasks. JWT expired"* shown persistently **over
  the stale cached task list**, which remained rendered — an error banner and
  stale data at the same time.
- **Still failed 20+ seconds later**, with no further reads and **no refresh
  loop** (the bounded behaviour is correct; only the recovery is missing).
- **Student impact:** After waking a laptop, the visible screen stays broken
  even though the session was silently renewed. Navigating away and back is the
  workaround.

## AI-02 — Inline "Explain selected text" silently discards a successful answer (NEW, CONFIRMED, P2)

- **Persona / feature:** Any student using the notes selection toolbar.
- **Reproduction:** Select a paragraph in a note with a **real triple-click**
  (the toolbar only appears for a genuine pointer selection), then click
  **💬 Explain** with a real click.
- **The AI call succeeds.** Instrumented network capture:
  `POST /functions/v1/learnora-ai` → **200**, body
  `{"text":"**Meaning**\nTemperature dictates the amount of kinetic energy—the
  energy of motion—within plant cells. Because photosynthesis relies on chemical
  reactions mediated by enzymes like RuBisCO, t…"}` — a correct, well-formed
  explanation.
- **Nothing is shown.** The explanation text appears **nowhere in the page**
  (searched the whole `body.innerText`); the editor length was **2,688
  characters before and after**; no "Remove AI explanation" control was created;
  no popover, no `role="status"`, no `role="alert"`, **no error of any kind**.
- **Reproduction rate:** no insertion in **3/3** attempts; **1/1** attempts
  where the 200 response was captured and then demonstrably discarded.
- **Student impact:** The student selects text, asks for an explanation, waits,
  and receives absolutely nothing — no explanation and no error. Every retry
  spends another AI call against their daily allowance for no result.
- **Why this supersedes STATE-03:** STATE-03 predicted that *removing* an inline
  explanation after editing preceding text would delete unrelated writing. On
  this build **an inline explanation can never be inserted in the first place**,
  so there is nothing to remove. STATE-03 is **NOT REPRODUCIBLE** here, for a
  concrete and documented reason rather than for lack of trying.
- **Smallest safe next check:** Whether the response is dropped because the
  stored Quill selection range is lost when the toolbar closes — the same
  offset-tracking area STATE-03 implicates.

## OFFLINE-01 — An offline study session is shown as logged, then silently lost (NEW, CONFIRMED, P2)

- **Method:** Set `navigator.onLine` to `false` and dispatched `offline`, with
  an interceptor counting any `POST /rest/v1/study_sessions`. Ran a real
  1-minute focus block to completion.
- **Actual:**
  - **`postAttempts: 0`** — no request was ever attempted.
  - **`localStorage['learnora:offline_queue']` was `null`**, and there was no
    other queue key, **no IndexedDB database at all**, and empty
    `sessionStorage`. Nothing was queued anywhere.
  - The timer nonetheless listed the session in **"Recent sessions — 3 shown:
    General Study, 1 min · 21 Sept, 17:08"**, exactly as it lists real ones.
  - After restoring connectivity and reloading, Progress still read
    **3 completed sessions / 0h 3m** — the 17:08 session **does not exist**.
- **Student impact:** A student who studies on a train watches the timer run
  down, sees the session listed as logged, and loses it entirely. As with
  STATE-02, the interface reports success it has not earned.
- **Caveat (method fidelity):** connectivity was simulated by overriding
  `navigator.onLine`. If the app trusts that property — which the absence of any
  POST attempt strongly suggests — this is precisely what a real offline student
  experiences. Behaviour under genuine network-level offline was not separately
  confirmed.
- **Consequence for AS-01:** AS-01 assumes a queued session is replayed later
  under whichever account is current. On this build the timer path **created no
  queue entry at all**, so AS-01's premise may be unreachable through the timer
  UI. AS-01 remains **not live-reproduced**, and re-checking whether
  `learnora:offline_queue` is ever populated should come **before** any further
  account-switch work.

## ANL-01 — Progress contradicts itself on one card (NEW, CONFIRMED, P3)

With three sessions logged **today**, the Progress page simultaneously shows
**`Active Days: 1`** and **`Current Streak: 0 days`** / **`Longest Streak:
0 days`** inside the same card. A student who studied today is told their streak
is zero. This is an internal self-contradiction on a single screen, not merely a
mismatch with expectation.

Minor adjacent copy defect, **P4**: the summary reads **"1 completed sessions"**
(and "3 completed sessions") with no singular form.

## SUSP-02 — Repeated identical reads of the same note (SUSPECTED, P4)

While a single note was open, instrumented capture recorded **11 identical
`GET /rest/v1/materials?select=*&us…` requests** returning the same row within a
short window. This may be ordinary invalidation, but it is worth a look as a
possible refetch storm. Not reported as a confirmed defect.

## Additional verified-working observations

- **Task creation works** end to end: a real task was created via the form and
  rendered immediately ("1 open · 0 completed").
- **Auth routes redirect correctly when signed in:** requesting `/app/signup`
  while authenticated redirected to `/app` rather than showing a signup form.
- **Timezone handling is correct:** a session stored as
  `2026-09-21T11:20:51Z` displayed as **"21 Sept, 16:51"**, a correct UTC+05:30
  local rendering.
- **The web-research stage times out and recovers gracefully** at ~20 s,
  advancing the UI to the next stage rather than hanging.
- **Cancellation is honoured at delivery** — see the disproved half of AI-01.
- **Timer reset/phase handling** behaved correctly: Reset returned a persisted
  SHORT BREAK phase to FOCUS and applied the new duration.

## Records created this round

| Record | Status |
| --- | --- |
| Task `QA-20260921 AS-03 probe task` | **Retained** (open, no due date) |
| Study sessions | **3 rows totalling 3 minutes**, of which **2 are AS-02 duplicates** deliberately produced by the lost-response test. Retained as evidence |
| AI calls | 1 chat message (stalled by design, no answer returned) + 1 inline Explain (200, discarded by the app) |
| Offline session | **None persisted** — that is the OFFLINE-01 finding |
| Notes / quizzes | None new; the existing QA note and quiz were reused |

Nothing pre-existing was modified or deleted. No second account was created. All
records are disposable and can be removed on request.

## Revised highest-value remaining work

1. **STATE-02** (P1) — unchanged, still the most severe.
2. **AI-02** (P2) — students are paying AI calls for nothing, on a core feature.
3. **OFFLINE-01** (P2) — offline study time is lost while being reported as saved.
4. **AI-01** (P2) — bound the deadline across body consumption and keep the
   abort wired so Stop works; currently the chat can lock permanently.
5. **AS-02** (P2) — give the session insert the stable `clientId` its own
   source comments already promise.
6. **VIS-02 / A11Y-02** (P2) — unchanged from the first continuation.
7. **AS-03** (P3) — connect successful renewal to a bounded refetch.
8. **AS-01** — first establish whether `learnora:offline_queue` is ever
   populated on this build (see OFFLINE-01); only then run the account-switch
   replay with a second account.

### Still NOT TESTED after this round

Uploads and extraction; exams and Plan generation; flashcard review; the Study
Lab tools (Solver, Feynman, Viva, Exam Detective); community and study rooms;
notifications; payments and Stripe; cross-device and multi-tab; the service
worker and app-update path; password recovery, profile changes and account
deletion; and phone-width layout beyond the dashboard.

---

# FIX APPLIED — 21 September 2026 — VIS-02 / VIS-03 contrast

**Scope note:** this is a *local repository* change, committed nowhere and
deployed nowhere. Production `fea0369a` still exhibits every defect recorded
above. The QA findings are left exactly as written.

## Root cause (one mechanism, not a palette choice)

A custom property whose value is `var(--other)` is substituted using the
computed value of `--other` **on the element the alias is declared on**. The
themes re-declare their ramps on `body.dark-theme` and on the
`body[data-theme-color=…]` presets — **never on `:root`**.

`tokens.css` declared its derived aliases inside `:root`:

```css
:root {
  --card-bg: var(--surface);      /* resolves against :root's --surface */
}
```

So `--card-bg` resolved against `:root`'s `--surface: #ffffff` and then
inherited that **literal white** down the whole tree. The dark theme's
`--surface: #141310` never got a look in. Meanwhile `--text` *is* declared on
`body.dark-theme`, so it correctly became `#f0ece4` — bone white text on a
hard-coded white card, **1.18:1**.

This also explains VIS-03's teal links at ~2.5:1: they were being measured
against a white card instead of `#141310`, where the same teal clears AA
comfortably. One mechanism produced most of the 18 failures.

Corroborating evidence that this had already been felt: `themes.css` repeated
`--shadow-accent: 0 0 0 1px var(--accent-ring)` verbatim inside
`body.dark-theme`. That duplication exists only to beat the frozen `:root`
copy — a workaround for this bug rather than a fix for it.

## Change

| File | Change |
| --- | --- |
| `styles/tokens.css` | Moved the theme-derived aliases out of `:root` into a new `body` block: `--accent-text`, `--primary`, `--primary-hover`, `--gradient-primary`, `--border`, `--card-bg`, `--card-bg-subtle`, `--card-border`, `--card-border-hover`, `--card-shadow`, `--card-shadow-hover`, `--shadow-accent`. Geometry/timing/type scales stay in `:root` |
| `styles/themes.css` | Removed the now-redundant `--shadow-accent` duplicate |
| `views/today/today.module.css` | `.primaryLink` used a hard-coded `color: white` on the accent fill → `var(--accent-on)` (ink in dark mode, per the ramp's own design note). Added `.footer a` — those two inline links carried **no class at all** and were rendering in the UA default `#0000ee` |
| `styles/tokens.test.ts` | **New guard:** no `:root` alias may reference a token that any theme re-declares. This is the rule that was broken |
| `styles/contrast.test.ts` | Added `body` to its cascade model, between `:root` and `body.dark-theme` |

### Why the existing contrast test did not catch this

`contrast.test.ts` flattens `:root` + `body.dark-theme` into **one map** and
then resolves `var()` chains against that merged map. That models a world in
which aliases re-resolve per theme — i.e. it asserts the behaviour we *want*,
not the one the browser produced. It therefore resolved `--card-bg` → dark
`--surface` and passed throughout. Its model is now correct because the CSS
matches it. The new structural guard in `tokens.test.ts` is what actually
fails on a regression.

## Verification — measured in a real browser, not inferred

Local dev server, signed in, same instrumented contrast scan used to find the
defect (alpha-composited, gradient-backed elements excluded):

| Element | Before | After |
| --- | --- | --- |
| Notebook titles (Maths / Chemistry / Math) | **1.18:1** | **15.77:1** |
| `Progress` / `full dashboard` links | **2.08:1** (`rgb(0,0,238)`) | **7.88:1** |
| `Add your next exam` label | **2.48:1** | **7.37:1** |
| **Dashboard failures, dark theme** | **18** | **0** |
| **Dashboard failures, light theme** | 1 marginal | **0** |

`--card-bg` now computes to `#141310` on a dark body and `#ffffff` on a light
one. A screenshot confirms the notebook cards render dark with readable titles,
where production shows blank white rectangles.

Full suite: **2816 tests across 222 files pass**. Lint clean (only pre-existing
warnings in unrelated files). Production build succeeds.

**Not addressed by this change:** VIS-01 (CSP blocking the web fonts) and
A11Y-02 (off-screen drawer in the tab order) are unrelated and still open.
