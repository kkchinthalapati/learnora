# Feature backlog — student-experience revamp ideas

Written 2026-08-15, refreshed 2026-08-24 after re-auditing the items below
against the current `webapp/src` (Concept Graph, PWA Offline Engine,
Streaks 2.0 & Goals, Cross-Device Continuity, Adaptive Learning Engine,
Deep Analytics, Exam Countdown Intelligence, task snooze/recurrence, and the
guided create-flow redesign all landed since the first pass). Most of the
original quick wins are now shipped — see "Resolved since 08-15" below.
Nothing else in this file has been built yet; it's still a parking lot of
ideas, written from "I'm a student, what would make me use Learnora more
effectively?"

Learnora's core loop is solid and complete: upload material → AI generates
notes/flashcards/quizzes → weekly AI plan → SM-2 spaced-repetition review →
proctored mock exams → focus/streak tracking → friends leaderboard, now
wrapped in adaptive mastery tracking, a concept graph, offline support, and
cross-device continuity. These ideas are about *tightening* that loop and
smoothing the newer surfaces, not adding another pillar.

## Resolved since 08-15 (kept for context, not backlog)

- Weak topics now surface in `DailyDrillCard`, `AIActionsCard`,
  `AdaptiveHealthWidget`, and the `ReviewView` session recap — no longer
  buried in one card.
- Command bar discoverability: `OnboardingBanner`, `AIActionsCard`, and
  `CommandBar` itself all show a `⌘K` hint now.
- Undo-window navigate-away is handled and tested: `useDeferredDelete` fires
  the real delete via a callback independent of component lifecycle, with a
  dedicated "navigates away mid-window" test.
- `StreakCard` distinguishes a truly fresh account ("Start your first
  streak today") from a broken streak ("Streak reset — complete a session
  today...") — the anxiety-framing ask is done.
- Weekly plan ↔ adherence feedback loop: `PlanView` shows a plain-language
  completion-% + neglected-subjects recap before the next plan generates
  (`api/aiPlan.ts`'s `weakTopics`/`lastWeekAdherence` context).
- Exam-integrity: the grace-period countdown works (bug fix, still true),
  termination toasts distinguish "Exited fullscreen" vs "Left exam tab", and
  `QuizReview` now shows *why* a mock exam was auto-terminated via a stored
  `proctorTermination` reason — the audit-trail ask is done.
- Quill/global-shortcut collision: `useKeyboardShortcuts` guards on
  `isContentEditable`, confirmed still in place.

## Fixed this session (2026-08-24)

- **`TasksCard` reintroduced the exact "loading flashes as empty" bug** the
  08-15 pass had already fixed once in `DailyDrillCard`:
  `const { data: dueCount = 0 } = useFlashcardsDueCount()` defaults to 0
  whenever `data` is `undefined`, which is also true mid-fetch — so every
  dashboard load briefly hid the "N cards due today" banner even when cards
  were due, and it had no test file to catch it. Fixed to check `isPending`
  explicitly; added `TasksCard.test.tsx`.

## Shipped since 08-24: Life Sync (2026-09-02)

The largest gap this file never named: Learnora knew everything about a
student's *studying* and nothing about their *life*, so every plan it made
was a wish rather than a schedule. `/my-week` now captures the timetable,
sleep window, honest daily capacity and chronotype, imports a real `.ics`
calendar (on-device, never uploaded), and a deterministic scheduler places
due cards, tasks, exam prep and weak topics into the windows that are
actually free — hardest work in the best hours, deadlines never moved.
Surfaces as `TodayTimelineCard` on the dashboard, block reminders, a timed
`.ics` export with alarms, and availability context in the AI weekly plan.

See `LIFE_SYNC.md` for the design, the deliberate limits, and the four known
gaps worth closing next (in-tab-only reminders, no cross-device sync of the
life context, download-not-subscription export, and no a11y pass on
`/my-week` yet).

## Shipped 2026-09-02: Trajectory, and the Pro plan

**Trajectory** (`TRAJECTORY.md`) is the answer to "why are we better than
NotebookLM / Notion / Turbo AI". They are all artifact factories — they optimise
the material. Trajectory owns the outcome: it projects every topic forward to
exam day under real memory decay, against the hours Life Sync says the student
genuinely has, and reports the grade they are heading for, what doing nothing
costs, and what the next hour is worth per topic in points. It is only possible
because we hold both a memory model and a time model, and that combination is
the moat — not the chart.

**Pro** (`STRIPE_SETUP.md`) is built end to end and switches on when the Stripe
keys are set: entitlements table, plan columns with a trigger that stops any
client granting itself Pro, checkout + webhook edge functions, `<ProGate>`,
paywall, Settings → Plan, and plan-aware server-side AI quotas. Nothing that
already shipped free became paid — that rule is written into
`lib/entitlements.ts` where it can be read before it is broken.

## Quick wins (small, concrete, high value-per-effort)

- **Study Circle framing is still leaderboard-only.** `StudyCircleCard` +
  `FriendsView` both render `leaderboardMeta`/raw `rank` and nothing else.
  The original ask stands: a secondary framing ("closest to your pace",
  "most improved this week") alongside rank would help students who are
  behind stay motivated instead of just seeing where they rank.
- **Sibling zero-state sweep, one more pass.** `NextExamCard` correctly
  branches on `isPending`; `TasksCard` didn't until this session. Worth a
  final grep across dashboard cards for any other `data: x = <default>`
  destructure that silently masks a loading state as empty — that pattern
  is easy to reintroduce piecemeal and has now shipped broken twice.

## New surfaces without a polish pass yet

The 08-15 audit's "Accessibility follow-through" ask named Friends/Study
Circle/command bar specifically; a much larger set of surfaces has shipped
since then and none have had a dedicated QoL/a11y pass:

- **Study Room** (`views/room/*`) — presence, reactions, audio ambiance;
  worth checking keyboard reachability of the reaction overlay and desk
  cards, and whether the ambient audio respects a mute/reduced-motion
  preference.
- **Concept Graph** (`views/graph/*`) — a visual graph is an accessibility
  risk by default; worth checking whether `ConceptNodeDrawer` gives
  keyboard/screen-reader users a non-spatial way to reach the same
  information as clicking a node.
- **Achievements Modal / Analytics Dashboard / Exam Prep Modal** — newer
  modals and dense stat views; worth the same touch-target/focus-trap/
  dyslexia-font checks the original redesign batches got.

## Trust & polish

- **Push notification manual QA.** `usePush` has real test coverage again
  (fixed 08-15), but the enable/disable/preferences flow itself hasn't been
  exercised by hand since — worth doing once now that a regression would
  actually be caught.
- **NotesAiSidebar grounding.** Scoped via `buildNotesSystemContext` /
  `prepareDocumentContext` in `lib/notesChatPrompt.ts` — looks intentional
  on inspection, not re-flagging as broken, but hasn't been spot-checked by
  hand against a real multi-material library.

---

## Bugs fixed 2026-08-15 (for context, not backlog)

1. `formatRelativeTime` (`lib/date.ts`) rounded 30-89s timestamps up to
   "1m ago" instead of "just now".
2. `useExamProctor` — the grace-period countdown timer canceled itself the
   instant it started (effect depended on state it set itself), and
   `MockExamRunner`'s inline `onTerminate` callback changing identity on
   every render would have re-triggered the same teardown. Fixed with a
   "latest ref" pattern for both.
3. Test-only fixes: `usePush.test.ts`'s `require()` calls didn't resolve
   under Vite's ESM test runner; several delete-confirmation tests didn't
   advance fake timers past the 4s undo window; `useKeyboardShortcuts`'s
   contenteditable test relied on a `.focus()` call jsdom silently no-ops
   without an explicit `tabIndex`; `DashboardView`'s command-bar test
   rendered `<DashboardView>` alone instead of alongside `<CommandBar>`.

Full suite at last check (2026-08-24): 1455/1455 passing, lint clean,
typecheck clean.
