# Claude work ledger — 16 Sep 2026

Resume file for the close-the-loop work. Branch `feat/close-the-loop` merged as PR #100; pick up on a new branch from `main`.

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
