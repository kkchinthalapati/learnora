# Feature backlog — student-experience revamp ideas

Written 2026-08-15, after a pass through `webapp/src` and the live test
suite to fix the bugs listed at the bottom. Re-verified 2026-08-21 (see
below) — everything in the original "Quick wins," "Daily-loop,"
"Exam integrity" and "Trust & polish" sections had already shipped by
then, so this file has been trimmed to the one idea that's still
actually open. Full text of the resolved sections is in git history
(this file as of the previous commit) if the reasoning behind any of
them is worth revisiting.

Learnora's core loop is already solid and complete: upload material → AI
generates notes/flashcards/quizzes → weekly AI plan → SM-2 spaced-repetition
review → proctored mock exams → focus/streak tracking → friends leaderboard.
This idea is about *tightening* that loop, not replacing it.

## Still open

- **Weekly plan ↔ actual adherence feedback loop.** The plan generator
  already feeds weak topics and past adherence into new plans (per git
  history). The missing piece from a student's chair: a plain-language "you
  stuck to 60% of last week's plan, mostly missing evening sessions" summary
  *before* generating the next one, not just silently baked into the prompt.
  Seeing the AI's diagnosis builds trust in the plan it hands back. This is
  a real feature (new copy generation + adherence computation surfaced in
  the UI, not a bug fix or a small polish item) — worth scoping deliberately
  rather than folding into a cleanup pass.

## Verified 2026-08-21

A pass specifically to check the items this file had flagged as "worth
checking, not verified broken." Findings:

- **NotesAiSidebar grounding** — fine. Reads the editor's live text via a
  ref and keys the chat session per-material, so it can't answer from a
  different document than the one on screen.
- **Quill contenteditable + shortcuts interaction** — fine.
  `useKeyboardShortcuts` fully excludes any focused `contenteditable`
  element, so there's no collision surface with Quill's own shortcuts.
- **Undo-window + navigate-away** — fine. `useDeferredDelete`'s unmount
  cleanup flushes any pending delete via a ref rather than cancelling it, so
  navigating away inside the 4s window still commits the delete; it can't
  silently come back or leak un-actioned.
- **Command bar discoverability, weak-topic surfacing, streak
  broken-vs-fresh framing, Study Circle "closest pace" framing, the
  proctor grace-period countdown UI, and the proctor audit trail in
  QuizReview** — all already implemented (confirmed by reading the
  current code, not assumed from the commit log).
- **Push notification flow** — exercised by hand against the dev harness
  (`webapp/harness.html`) via a scripted Chromium session: the
  not-configured state (no `VITE_VAPID_PUBLIC_KEY`), the browser-permission
  grant flow, and the denied-permission state all render correctly and
  match the code path that produces them.
- **Accessibility on Friends, Study Circle, and the command bar** — tab
  order and focus-visibility swept across both surfaces (55 focusable
  elements checked); every one had a visible focus indicator. One real gap
  found and fixed: the small header-action links (`NextExamCard`'s "Open
  calendar", `TasksCard`'s "View all", `StudyCircleCard`'s "Full
  leaderboard" — one shared `.link` style in `dashboard.module.css`)
  rendered at ~21px tall, under the WCAG 2.5.8 (AA) 24px minimum and short
  of this app's own `--touch-target-min` convention used everywhere else.
  Fixed with padding offset by an equal negative margin, so the hit area
  grew without shifting any card's visible layout.

Dependency audit: `npm audit` clean (0 known vulnerabilities); safe
in-range updates applied. Full suite (1183 tests), lint, and typecheck
all green after both the dependency bump and the touch-target fix.

---

## Bugs fixed 2026-08-15 (for context, not backlog)

1. `formatRelativeTime` (`lib/date.ts`) rounded 30-89s timestamps up to
   "1m ago" instead of "just now".
2. `useExamProctor` — **the real one**: the grace-period countdown timer
   canceled itself the instant it started (effect depended on state it set
   itself), and separately, `MockExamRunner`'s inline `onTerminate` callback
   changing identity on every render would have re-triggered the same
   teardown. Net effect: a student exiting fullscreen or switching tabs
   during a proctored mock exam was never actually auto-terminated. Fixed
   with a "latest ref" pattern for both.
3. Test-only fixes (no app behavior changed): `usePush.test.ts`'s
   `require()` calls didn't resolve under Vite's ESM test runner (9 tests
   erroring on load); the Friends/Library/SubjectDetailPage delete-confirmation
   tests didn't advance fake timers past the 4s undo window; the
   `useKeyboardShortcuts` contenteditable test relied on a `.focus()` call
   jsdom silently no-ops without an explicit `tabIndex`; `DashboardView`'s
   command-bar test rendered `<DashboardView>` alone instead of alongside
   `<CommandBar>` (which lives in `App.tsx`, not the view, since the
   "global command bar" feature shipped).

Full suite: 1155/1155 passing, lint clean, typecheck clean.
