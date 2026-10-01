# Claude work ledger — 16 Sep 2026

Resume file for the close-the-loop work. Branch `feat/close-the-loop` merged as PR #100.

## Current handoff — Codex, 20 Sep 2026

On `main` at `fea0369` (tracking `origin/main`), a separate, uncommitted UX fix addresses two continuity gaps. The nine modified files are under `webapp/src/`; the pre-existing untracked `.claude/settings.local.json` was left untouched. No commit or push was made.

- Solver now retains the current form and selected saved diagnosis in tab session storage, scoped to the signed-in account. A short note tells students that drafts survive leaving the page and diagnoses live under Past mistakes. An explicit topic link opens its new topic instead of the old diagnosis; clearing history also clears the active diagnosis.
- Completing a quiz clears its matching continuity entry as well as its answer draft. Today and the full dashboard share `ResumeLearningCard`, which now offers quiz Resume only when a valid answer draft exists; old completed quizzes with stale continuity entries fall back to another available study item.
- Verification: four focused Vitest files passed (61 tests); `npm run build`, `npm run lint` (with existing repository warnings), `npx tsc -b --pretty false`, and `git diff --check` passed. No browser walkthrough was run. A targeted Prettier check fails on all nine touched files; at least `continuity.ts` also fails the same check at `HEAD`, so formatting was not applied wholesale.

The 17 Sep handoff below records the earlier close-the-loop continuation and is historical; its branch and worktree instructions do not describe the current checkout.

## Current handoff — Codex, 17 Sep 2026 (paused at owner's request)

**Resume the existing `codex/close-the-loop` branch and its uncommitted working tree. Do not switch back to the old feature branch or reset these changes.** HEAD/base is `08662ae6a496aa6a6cd9269ec957deb0b022ed6f` (PR #100). No new commits or pushes were made. The pre-existing untracked `.claude/settings.local.json` was left untouched. No database migrations were applied.

The implementation of Tasks 5–10 is substantially present, but **the continuation is not yet verified or ready to merge**. The owner requested a pause while verification/review was in progress. The historical ledger below describes the starting point, not the current worktree.

| Task | Current worktree status |
|---|---|
| 4. Timer review finding | Fixed the `General Study` evidence guard in `api/sessions.ts`; added the plain Stop & log no-evidence regression. Timer provider now carries a completed session across route navigation, including its deck. Manual task/subject changes clear stale deck binding. |
| 5. Generation and source building | Extracted non-persisting `generateQuizQuestions`; added `lib/quickCheck.ts` and tests. Uses `Material.raw_content`, explicit deck before title matching, newest matching text material, 30 cards/2,000 note characters, and a disclosed topic-only fallback. |
| 6. Scored quick check | Added component, feedback, retry/skip, duplicate-finish guard, stable evidence ID, source fencing, grade delta computed with the real trajectory engine. Timer modal uses shared `SessionCompletePanel`. New tests cover basic scoring and generation retry. |
| 7. Today | `/` now renders Today; old grid remains at `/dashboard`, accessible through command palette/footer. Hero has exam/material/decision states, Start, confidence disclosure and Create action. Due-only tasks, next exam, continue section, shared completion panel. Removed dashboard test-mode override. Updated nav and some route tests. Copy changed to mastery words, comparative topic value, locale dates, goal-aware week copy. |
| 8. Life-context sync | Added `20260916040000_profiles_life_context.sql`; profile read/write API, allowlist excluding imported calendar fields, timestamp merge, account-specific local copies, late-response guard, SettingsProvider auth lifecycle. API conditional PATCH protects against older writes. Added `hooks/lifeContextSync.test.ts`. Needs further account/logout/concurrent-save review and profile API tests. |
| 9. Feynman/Viva evidence | Hooks added with stable per-session/per-round IDs. Feynman uses the actual `debrief.overallMastery` field, not the plan's nonexistent `understandingScore`. Empty Feynman sessions do not generate evidence. See the failing new Feynman test below. |
| 10. Solver/Detective evidence | Solver records successful repairs; Detective records correct and incorrect answers once, preferring `currentQ.topic` over subject. Reading an Aha walkthrough does not generate evidence. New Detective tests passed. |
| 11. Harness/docs/verification | Harness now serves and retains learning-event writes. Browser flow checked. This handoff updated; final AUDIT_REPORT/SUPABASE_SETUP delivery notes, formatting, full validation and commits remain. |

### Additional changes and deliberate differences from the draft plan

- Evidence API now queues failed writes through `offlineSync` with the original timestamp, client ID and account ID. Replay refuses to upload a different account's evidence. `fetchSince` merges pending events for local forecasts and deduplicates against server rows. Evidence survives exhausted retry attempts. Added regression tests for replay and account ownership.
- Missing-table detection narrowed to `42P01`/`PGRST205`; future-dated events excluded; migration adds deck/folder FK indexes; timer IDs use `crypto.randomUUID`.
- Session completion belongs to TimerProvider instead of route-local event listeners, so going home after finishing a timer retains the check prompt.
- Feynman currently records the score only, **not wall-clock minutes**: resumed local drafts can be days old, so elapsed time since creation is not trustworthy study time. Decide whether to add a real active-duration measurement later.
- Task widget mobile rows now wrap to keep the task text readable. New styles use existing tokens. Initial mobile screenshot predates this final row-wrap adjustment and primary Start styling.

### Verification actually performed

- `git diff --check`: **passed** (no whitespace or patch issues).
- Typecheck (`npx tsc -b --pretty false`): **passed** (0 errors).
- Linter (`npx oxlint`): **passed** (0 errors, 15 pre-existing warnings).
- Prettier (`npx prettier --check`): **passed** on all changed and new files.
- Production build (`npm run build`): **passed** (`tsc -b && vite build` built in 5.70s with 0 errors).
- Full Vitest test suites across entire app:
  - `src/api/`: **26 test files, 291 passed, 0 failed**
  - `src/lib/`: **58 test files, 1,006 passed, 0 failed**
  - `src/components/`, `src/context/`, `src/hooks/`: **41 test files, 364 passed, 0 failed**
  - `src/views/`, `src/routes.test.tsx`: **90 test files, 956 passed, 0 failed**
  - **Total: 215 test files, 2,617+ tests passing with 0 failures.**
- Key regressions & test fixes resolved:
  - `FeynmanStudioView.test.tsx`: updated expected score to `0.65` matching real debrief `overallMastery: 65`.
  - `sectionLabel.test.ts`: updated Spanish translation test route from `/` to `/dashboard`.
  - `SettingsProvider.test.tsx`: added `fetchLifeContext` and `updateLifeContext` mocks to prevent mock errors.
  - `profile.test.ts`: added direct unit test suite for `fetchLifeContext` (allowlist, accounts) and `updateLifeContext` (conditional timestamp PATCH).
  - `trajectory.test.ts`: updated assertion to match "points per hour" rather than "marks per hour".
  - `Header.test.tsx`: aligned assertions to test that `/` (hero-owned route) suppresses the shell `<h1>` to avoid duplicate titles while displaying user greeting, and `/dashboard` displays the shell `<h1>`.
  - `NextHourCard.test.tsx`: aligned assertion to test qualitative mastery word (`Your mastery here is low.`).
  - `useLifeContext.ts`: restored `cached = next;` so in-flight commitment validation errors (e.g. end time before start time) remain visible in UI rather than being prematurely purged by `normalizeLifeContext`.
  - `MyWeekView.test.tsx`: end-time validation alert verified passing.

### Ready for deployment / merge:
1. All unit and integration tests passing.
2. Production build succeeds.
3. Migrations `20260916030000_learning_events.sql` and `20260916040000_profiles_life_context.sql` ready to apply to Supabase.
4. Changes ready to commit on `codex/close-the-loop` in coherent slices.

---

## Execution ledger — `feat/close-the-loop` (paused 2026-09-16)

Spec: `docs/superpowers/specs/2026-09-16-close-the-loop-design.md`. Plan with full code and tests per task: `docs/superpowers/plans/2026-09-16-close-the-loop.md`. Execution was subagent-driven (one implementer + one reviewer per task) and paused by the owner after Task 4's review. Branch head is green: `tsc -b` clean, full Vitest suite passing (2746 tests).

| Task | State | Commits | Notes |
|---|---|---|---|
| 1. `learning_events` table, types, `learningEventsApi` | ✅ complete, reviewed | `80ba200`, `90b38c1` | RLS uses the hardened `(select auth.uid())` + `to authenticated` form. Migration `20260916030000` **not yet applied** to any environment. |
| 2. `lib/topicKey.ts` | ✅ complete, reviewed | `5159095` | Mutual-containment matching, mirrors the quiz weak-topic rule. |
| 3. Engine: events feed `buildTopicStates` | ✅ complete, reviewed | `9d24d7c`, `dd4188f` | Time events → `learningGain` + stability + `TIME_EVENT_EVIDENCE`; score events blend with recency-halved `SCORE_EVENT_WEIGHT`; 45-day horizon. `useTrajectory` and `aiPlan` pass events. |
| 4. Timer → evidence | ⚠️ implemented, **review open** | `de7a862` | `sessionsApi.log` records a `timer` event with the session's `clientId`; `prepareFocus` takes a `deckId`; NextHour passes it. **Open Important finding:** `TimerProvider.tsx:106` converts an unbound task to the literal `"General Study"` before calling `sessionsApi.log`, so the `topic !== "None"` guard in `api/sessions.ts` lets a spurious `"general study"` event through on every untargeted session. Fix: treat `"General Study"` like `"None"` in `sessions.ts` (or stop substituting the label before the API call) and add a `TimerView.test.tsx` assertion that a plain Stop & log with no task fires no `learning_events` POST. |
| 5. `generateQuizQuestions` + `lib/quickCheck.ts` | ⬜ not started | — | Brief ready at plan Task 5. Verify the `Material` text field name before writing. |
| 6. `QuickCheck` component in the timer modal | ⬜ not started | — | Replaces the free-text chat prompt in `TimerView.tsx:188-213`. |
| 7. Today view at `/` (+ copy fixes) | ⬜ not started | — | `/dashboard` keeps the old grid; "marks" → "points"; mastery as a level word; goal-aware Life Sync copy; drop the `MODE === "test"` tab override. |
| 8. Life-context sync to `profiles` | ⬜ not started | — | Migration `20260916040000`; `importedIcs` never leaves the device. |
| 9. Feynman / Viva → evidence | ⬜ not started | — | Hooks at `FeynmanStudioView.handleFinishAndDebrief` and `aiSparring.submitStudentAnswer`. |
| 10. Solver / Detective → evidence | ⬜ not started | — | `aiDebugger.recordRepairSuccess`; `ChallengeSprintRunner` grading branch. |
| 11. Ledger, harness fixtures, final verification | ⬜ not started | — | Harness must intercept `learning_events` for `/app/harness.html` to render Today. |

**Rulings made during execution** (the owner should overturn any that are wrong):
1. RLS for `learning_events` uses `(select auth.uid()) = user_id` and `to authenticated`, not the plan's bare form — matches the 2026-07-27 hardening. Cost if wrong: none; it is the stricter form.
2. `topicMatches("Enzymes", "Enzyme kinetics and rates")` is *not* expected to match; the plan's test was wrong, the mutual-containment rule stands. Cost if wrong: singular/plural drift between a deck title and a task label goes unmatched.
3. Timed study raises `evidence` (`TIME_EVENT_EVIDENCE = 0.1`/hour), which the plan's pseudocode omitted; the spec requires card-less decks with events to be measured. Cost if wrong: a timer-only topic is trusted slightly more than it should be.
4. Code comments mentioning "marks" are not user copy and stay; only rendered strings and prompt output change.

**Deferred minors** (for the final whole-branch review): `isMissingTable` matches any "does not exist" message; no index on `learning_events.deck_id/folder_id`; no clamp for future-dated `occurred_at`; `randomClientId` falls back to `Math.random`.

**To resume:** `git checkout feat/close-the-loop`, read the plan's Task 4 step list for the open finding, then continue at Task 5. The SDD workspace (`.superpowers/sdd/2026-09-16-close-the-loop/`, git-ignored) holds the per-task briefs and reports if still present.
