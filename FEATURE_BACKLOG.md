# Feature backlog — student-experience revamp ideas

Written 2026-08-15, after a pass through `webapp/src` and the live test
suite to fix the bugs listed at the bottom. Nothing in this file has been
built — it's a parking lot of ideas for later, written from "I'm a student,
what would make me use Learnora more effectively?"

Learnora's core loop is already solid and complete: upload material → AI
generates notes/flashcards/quizzes → weekly AI plan → SM-2 spaced-repetition
review → proctored mock exams → focus/streak tracking → friends leaderboard.
These ideas are about *tightening* that loop, not replacing it — the app
doesn't need a new pillar feature, it needs the daily-use edges sanded down.

## Quick wins (small, concrete, high value-per-effort)

- **Surface "struggling with" topics outside the AI card.** `AIActionsCard`
  already computes `weakTopics` from quiz history and shows a small pill row
  — but only there. A student skimming the dashboard for "what should I
  study today" has to notice that one card. Consider echoing the top 1-2
  weak topics into the Daily Drill or Next Exam card copy, so the nudge
  shows up wherever the student's eye actually lands.
- **Command bar discoverability.** `CommandBar` (global, Cmd/Ctrl+K) and
  `AIActionsCard`'s buttons (dashboard-only) are two separate entry points
  into the same chat. A first-time student has no obvious way to learn the
  keyboard shortcut exists — there's no `kbd`-style hint anywhere in the UI.
  A one-line "⌘K" hint near the AI card, or in the onboarding banner copy,
  would connect the two.
- **Undo-window consistency check.** The deferred-delete/undo pattern (4s
  window before a folder/deck/quiz/friend delete actually hits the server)
  is good, forgiving UX — but verify what happens if the student navigates
  away or closes the tab inside that window. If the pending `setTimeout`
  lives only in a component's closure, a route change could either lose the
  delete entirely (item silently comes back) or leak it (fires after the
  component watching it is gone, no toast, no confirmation it worked). Worth
  an explicit test for "delete, then navigate before the undo window closes."
- **Daily Drill due-count zero state.** Already fixed once (see
  `DailyDrillCard.tsx`'s comment on the `dueCount ?? 0` bug), but worth a
  once-over on sibling cards (`NextExamCard`, `StreakCard`, `TasksCard`) for
  the same "loading momentarily reads as empty" class of bug — it's an easy
  pattern to reintroduce piecemeal.

## Daily-loop / motivation

- **Weekly plan ↔ actual adherence feedback loop.** The plan generator
  already feeds weak topics and past adherence into new plans (per git
  history). The missing piece from a student's chair: a plain-language "you
  stuck to 60% of last week's plan, mostly missing evening sessions" summary
  *before* generating the next one, not just silently baked into the prompt.
  Seeing the AI's diagnosis builds trust in the plan it hands back.
- **Streak recovery framing.** Streak mechanics are usually a source of
  anxiety once broken ("why bother restarting"). Worth checking whether
  `StreakCard` distinguishes "streak broken" from "no streak yet" in tone —
  a broken 12-day streak and a fresh account showing "0" read very
  differently to the student even if the number is the same.
- **Study Circle framing beyond leaderboard.** `StudyCircleCard` +
  `FriendsView`'s leaderboard is a solid accountability mechanic, but
  leaderboards alone can demotivate students who are behind rather than
  motivate them. Consider a secondary framing — "closest to your pace" or
  "most improved this week" — alongside raw minutes/streak rank.

## Notes & AI

- **`NotesAiSidebar` grounding.** Worth confirming the AI sidebar's answers
  are scoped to the note/material the student has open, not the whole
  library — a student asking "explain this paragraph" needs the AI reading
  the same page they are, not free-associating across every uploaded PDF.
  (Not verified broken — flagging as worth a deliberate check, since it's
  the kind of scoping bug that's invisible until a student notices an answer
  that doesn't fit what they were looking at.)
- **Quill contenteditable + shortcuts interaction.** The
  `useKeyboardShortcuts` contenteditable guard is correct (confirmed while
  fixing its test — see below), but it's worth an explicit pass over which
  global shortcuts exist and whether any of Quill's *own* shortcuts
  (bold/italic/etc.) can collide with app-level ones when the notes editor
  has focus vs. when it doesn't.

## Exam integrity

- **Grace-period UX polish.** Now that `useExamProctor`'s countdown timer
  actually counts down (see bug fix below), it's worth checking the visible
  countdown UI itself: does the student get a clear, calm "5... 4... 3..."
  with an obvious "return to fullscreen" affordance, or just a number? This
  is a stressful moment (a proctored exam about to auto-submit) and the
  copy/visual treatment matters as much as the mechanism now that the
  mechanism works.
- **Proctor audit trail.** For a strict mock exam, consider logging
  *why* an exam was auto-terminated (tab switch vs. fullscreen exit, and
  how many warnings) into the attempt record shown in `QuizReview`, so a
  student reviewing a terminated attempt understands what happened instead
  of just seeing an abrupt "Mock Exam terminated!" toast.

## Trust & polish

- **Push notification coverage.** `usePush`'s test coverage was completely
  broken (see below) until this session — now that it's real again, it'd be
  worth actually exercising the enable/disable/preferences flow by hand
  once, since it's had no working safety net for however long that bug sat.
- **Accessibility follow-through.** The a11y work already done (WCAG touch
  targets, dyslexia-friendly font option, retractable sidebar) is a strong
  foundation — a natural next step is a pass specifically on the newer
  surfaces (Friends, Study Circle, the command bar) to confirm they got the
  same treatment as the original redesign batches.

---

## Bugs fixed this session (for context, not backlog)

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
   erroring); the Friends/Library/SubjectDetailPage delete-confirmation
   tests didn't advance fake timers past the 4s undo window; the
   `useKeyboardShortcuts` contenteditable test relied on a `.focus()` call
   jsdom silently no-ops without an explicit `tabIndex`; `DashboardView`'s
   command-bar test rendered `<DashboardView>` alone instead of alongside
   `<CommandBar>` (which lives in `App.tsx`, not the view, since the
   "global command bar" feature shipped).

Full suite: 1155/1155 passing, lint clean, typecheck clean.
