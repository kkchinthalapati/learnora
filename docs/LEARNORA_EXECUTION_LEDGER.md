# Learnora execution ledger

The source of truth for the product-evolution plan (Phases 0 to 8). Update it
as work happens, not at the end. Dependencies a person must act on (secrets,
deploys, migrations) also go in `WAITINGONLEDGER.md` at the repo root.

Started 2026-11-10 on branch `daily-return`. Nothing in this ledger has been
committed, pushed or deployed.

---

## A. Phase tracker

| # | Phase | Status |
|---|---|---|
| 0 | Safety, baseline and understanding | COMPLETED 2026-11-10 |
| 1 | Core correctness and trust | COMPLETED 2026-11-10 (one fix; four reports not reproducible) |
| 2 | The warm learning Home | COMPLETED 2026-11-10 (not yet seen on production) |
| 3 | Return loop and onboarding | PREPARED, BLOCKED on the owner (mail provider secret) |
| 4 | Deeper learning and explain-back | NOT STARTED |
| 5 | Subjects as learning journeys | NOT STARTED |
| 6 | Contextual tutor and personalisation | NOT STARTED |
| 7 | Review, knowledge and progress | NOT STARTED |
| 8 | Consolidation and polish | NOT STARTED |

### Phase 0: safety, baseline and understanding

- **Objective.** A safe starting point and a record of what was already there.
- **Working tree at the start.** Branch `daily-return`, level with
  `origin/main` (0 commits ahead). 48 modified and 74 untracked files from
  earlier work (boardroom, founder gate, `/slack`, learner signals, podcast,
  tutor call, cookie banner, audits). None were reverted, staged or committed.
- **Baseline tests.** `npx vitest run` in `webapp/`: 391 files, 5,293 tests,
  **12 failed, 5,281 passed**, 1,085 s. The failures, all present before any
  Phase 1 or 2 change took effect in the files they test:
  - `components/FounderGate.test.tsx`: redirects unauthenticated user to /login
  - `lib/founderAuth.adversarial.test.tsx`: three FounderGate boundary cases
  - `routes.test.tsx`: founder slack routing, redirects signed-out users to /login
  - `lib/learnerSignals.sql.test.ts`: three learner_signals migration cases
  - `migrations.test.ts`: `20261109000000_learner_signals.sql` says how to revert it
  - `styles/drift.test.ts`: `views/slack/slackWorkspace.module.css` over its drift baseline
  - `components/RichTextEditor.test.tsx`: draws a stored card and saves only its source
  - `views/dashboard/DashboardView.test.tsx`: AI actions card, What next?
- **Caveat on the baseline.** It ran for 18 minutes and the first Phase 1 edit
  (`lib/mathSyntax.ts`) landed two minutes in. None of the 12 failures is in a
  file that edit touches.
- **Decision.** The 12 failures belong to uncommitted earlier work and are out
  of scope; they are listed in section D.
- **Next action.** None.

### Phase 1: core correctness and trust

- **Objective.** Fix only what can be reproduced from the current source.
- **Verified and fixed.**
  - **Doubly escaped maths.** `$I = \\dfrac{12}{4}$` reached KaTeX with two
    backslashes, which TeX reads as a line break followed by the letters
    "dfrac". `splitMath` now reads exactly two backslashes before a known
    command of four letters or more as one (`repairDoubledCommands`). Covers
    cards saved before the decoder fix (`ab1c81b`) and a model that escapes
    its own reply twice (the earlier audit's F-17 and F-20).
- **Investigated, not reproducible in current source (no change made).**
  - **Numeric answer-key leak.** Every renderer that maps `choices` to
    buttons either branches on `answerType === "numeric"` (quiz runner, mock
    exam, practice, quick check, exam placement) or only receives questions
    with two or more choices (retest pool `isMultipleChoice`, onboarding
    placement, Learn, first run, explain-mistake). Quiz review shows the key
    only after the attempt. The 2026-11-10 audit repeated an older note; the
    leak was closed on 2026-10-13.
  - **Tell-apart ends without a summary (F-22).** `TellApartView` has a
    `done` phase with a result screen and a Done button before it navigates.
  - **Local fallbacks recording evidence.** Teach skips the ledger when
    `scoredBy === "local"`; Socratic records only when `!next.offline`;
    Explain throws on a degraded diagnosis before anything is recorded; the
    retest has no stand-in question at all.
  - **Check-back.** Retest questions come from the bank or one AI call, never
    a template, and exclude questions already tied to the mistake.
- **Tests.** `lib/mathSyntax.test.ts` (new, 6 tests) plus the existing
  `markdownToReact` and `quillMath` suites: 76 passed.
- **Outstanding.** The fix was not looked at in a browser against a stored
  legacy card. Quiz grading was read, not exercised end to end with a live AI.
- **Next action.** None.

### Phase 2: the warm learning Home

- **Objective.** Home reads as the student's own space and leads into the
  existing adaptive session.
- **What Home is now**, top to bottom:
  1. **Greeting.** A static `<h1>`: "Good evening, Priya." First name only;
     no name saved means "Good evening." (never the email's local part). The
     next exam is one quiet sentence under it.
  2. **Continue.** One outlined row: lesson title, its subject, and "Part 3
     of 5" when Learn was started on this device. Absent when there is
     nothing to resume.
  3. **Today.** One sentence and one action, decided in `lib/homeToday.ts`:
     - things due: "4 cards and 2 ideas are worth another look today." with
       **Start session**, which starts the same run `/study` would
     - nothing due, a session is possible: "Nothing is due today. A short
       session on Biology is ready when you are."
     - nothing due, a lesson in progress: "Nothing urgent today. Continue
       where you left off."
     - nothing due, nothing in progress: "Nothing urgent today.
       Photosynthesis is ready when you are." with **Open lesson**
     - new student: "Add a topic, your notes or a lecture below, and your
       first lesson starts here."
     A quiet link to `/study` sits beside the action. The existing rows
     (cards due, pair to tell apart, check-backs and repairs) follow.
  4. **Learn something new.** The existing capture bar, at normal size.
  5. **Your subjects.** Up to four real subjects with "Next: lesson" and an
     exam countdown when one is set.
  6. **Recent lessons.** The existing list, six rows.
- **Decisions.**
  - No time estimate anywhere: nothing measures how long a student's cards
    or checks take.
  - No percentages on Home. The continue row's ring shows parts done.
  - "Next" lesson is the earliest-added one whose cards are not all
    practised. Lessons have no stored order; Phase 5 owns that.
  - The idea count is every due ledger row. The list under it shows at most
    three repairs and three check-backs (existing cap), so the count can be
    higher than the rows shown.
  - "Fix these" is gone from Home. "Mistakes" became "Things to revisit" as
    the Subject page's section heading only. The lesson tab and the Progress
    tab keep "Mistakes": they are the precise record, and their labels are
    used by tests and deep links.
  - The typed, looping heading and its highlighter stroke are retired;
    `webapp/DESIGN.md` 0.3 and 0.8 say so, with the reason.
  - No new engine: Home calls `resolveFocus`, `planSession`, `startRun` and
    `activityHref` from `lib/adaptiveSession.ts`, as `/study` does.
- **Tests.** `views/home/HomeView.test.tsx` (12), `lib/homeToday.test.ts`
  (16), `lib/learnPosition.test.ts` (4), `lib/greeting.test.ts` (3 added):
  39 passed. `tsc -b` clean. Style guards (`src/styles`): 217 passed, 1
  failed (the pre-existing slack drift).
- **Browser check** (fixture-backed `/app/harness.html`, no production
  traffic): Home rendered with greeting, exam line, Today, capture, subjects
  and lessons; no console errors; 375 px wide with no horizontal scroll;
  **Start** opened `/study/new?mode=practice&topic=…&misconception=…&run=…`
  and landed on step 1 of the adaptive run.
- **Outstanding.** See section D: the continue row and the nothing-due
  states were tested in jsdom, not in the browser; light theme not looked at.
- **Next action.** Owner review of Home, then commit.

### Phase 3: return loop and onboarding (preparation only)

- **Objective.** Find out exactly why nothing brings a student back.
- **Verified on production, read-only, 2026-11-10** (project
  `mlvgqwqiynpwpwzqufdf`; SQL aggregates and the functions list):
  - `send-email-reminders` (v16) runs daily at 13:05 UTC. Its last run,
    2026-11-09, answered **500 "No email provider configured: set
    RESEND_API_KEY, or SMTP_USER and SMTP_PASS"**. `email_notification_log`
    has **0 rows**: no reminder email has ever been sent.
  - `send-push-reminders` (v6) runs daily at 13:00 UTC and answered 200
    "no subscriptions". `push_subscriptions` has **0 rows**.
  - `cron.job_run_details` says "succeeded" for both, every day. That status
    only means the HTTP request was queued, so the failure is invisible
    unless someone reads `net._http_response`.
  - Five accounts have email preferences; all five have both reminders on.
  - Deployed v16 and v6 predate the check-back change on `main`
    (2026-11-05): once mail works, the email still would not lead with a due
    check-back until both functions are redeployed from `main`.
  - Accounts: 47 total, 37 confirmed, 16 with onboarding answers, 5 signed
    in during the last 7 days, 10 whose last sign-in is more than a day
    after sign-up. **None created on or after 2026-11-05, and none has an
    `onboarding_trail`**, so there is no drop-off data to read yet.
- **Source findings.**
  - The function returns before reading preferences when no provider is set,
    so preferences are respected (nothing is sent) but nothing is logged.
  - A check-back has a real destination: `/check-back/:misconceptionId`.
  - The end-of-lesson prompt offers "Email me" only when
    `VITE_EMAIL_REMINDERS=true`; unset, it offers push only.
- **Blocked on the owner.** Section D, items 1 to 4.
- **Proposed Phase 3 code work (not started).**
  1. Make a failed daily run visible: an alert or a row when the function
     answers non-200, since cron reports success either way.
  2. After the first real send, confirm a preference turned off suppresses
     the next run.
  3. Leave onboarding alone until about 10 new accounts have a trail.
- **Next action.** Owner sets the mail secret; then redeploy and verify.

---

## B. Change log

| File | What changed | Why | Tested | Risk |
|---|---|---|---|---|
| `webapp/src/lib/mathSyntax.ts` | `repairDoubledCommands`, applied to every maths body in `splitMath` | Doubly escaped TeX drew a line break and the command's letters | Yes, unit | A real line break directly followed by letters spelling a 4+ letter command would be altered; not valid authoring, and covered by tests for the near cases |
| `webapp/src/lib/mathSyntax.test.ts` | New | Regression tests | Yes | None |
| `webapp/src/lib/greeting.ts`, `greeting.test.ts` | `homeGreeting` added; `getGreeting` untouched | Static greeting without emoji | Yes, unit | None |
| `webapp/src/lib/learnPosition.ts`, `.test.ts` | New: reads which part of Learn a lesson is on | "Part 3 of 5" on Home without loading Learn | Yes, unit | Position is per browser; stale by one visit if notes were edited |
| `webapp/src/views/lesson/LearnPanel.tsx` | Storage key now imported from `lib/learnPosition` | One definition of the key | Yes, existing 64 Learn and route tests | File already carried earlier uncommitted work; only two lines are mine |
| `webapp/src/lib/homeToday.ts`, `.test.ts` | New: Today's message and action, next lesson, Home subjects | Every Home state testable without rendering | Yes, unit | "Next lesson" is a heuristic until lessons have an order |
| `webapp/src/views/home/HomeView.tsx` | Rewritten around greeting, Continue, Today, capture, subjects, lessons | Phase 2 | Yes, unit and browser | Largest change in the set |
| `webapp/src/views/home/HomeView.test.tsx` | New | Phase 2 states | Yes | Hooks are mocked, so data loading itself is not exercised |
| `webapp/src/views/home/home.module.css` | Left-aligned column; continue row; Today block; typing styles removed | Phase 2 | Browser, desktop and 375 px | Light theme not looked at |
| `webapp/src/views/home/TypingHeading.tsx` | Deleted | Replaced by the static greeting; no other user | `tsc -b` clean | None |
| `webapp/src/views/subjects/SubjectView.tsx` | Section heading "Mistakes" to "Things to revisit" | Language | Existing subject tests pass | None |
| `webapp/src/views/today/MistakeLoopSection.tsx` | One comment corrected | It named the old Home heading | n/a | None |
| `webapp/src/routes.test.tsx` | Home's `<h1>` matched by greeting pattern | Heading changed | Yes | None |
| `webapp/DESIGN.md` | Rules 0.3 and 0.8 updated with the reason | The rulebook requires it | n/a | None |
| `WAITINGONLEDGER.md` | Dated note under section 3 | Production was checked 2026-11-10 | n/a | None |
| `docs/LEARNORA_EXECUTION_LEDGER.md` | New | This ledger | n/a | None |

---

## C. Verification ledger

| Category | Status | Evidence |
|---|---|---|
| Source inspection | Done for Phases 0 to 3 | Sections above |
| Unit tests | Done | 39 Home tests, 76 maths tests pass; full suite 5,320 passed, 11 failed, all 11 pre-existing (section E) |
| Integration tests | Not run | No Playwright run this session |
| Build | Done | `npm run build` succeeded 2026-11-10 |
| Browser / runtime | Partial | Harness: Home with things due, Start into the adaptive run. Not seen: continue row, nothing-due states, new student, light theme |
| Mobile / responsive | Partial | 375 px in the harness: no horizontal scroll, layout intact |
| Production | Not done | Nothing deployed. Phase 3 facts were read from production; no app change has been seen there |

---

## D. Deferred work and decisions needed

**Needs the owner (external).**

1. **Mail provider secret.** Set either `SMTP_USER` and `SMTP_PASS` (Gmail
   app password, 400 a day cap) or `RESEND_API_KEY` and `EMAIL_FROM` on the
   Supabase project. Resend needs the domain (`WAITINGONLEDGER.md` 5.1).
2. **Redeploy `send-email-reminders` and `send-push-reminders` from `main`**
   so reminders lead with a due check-back.
3. **Set `VITE_EMAIL_REMINDERS=true` in Vercel** only after one real email
   has arrived.
4. **Commit or split the uncommitted work.** Now 56 modified, 1 deleted and
   81 untracked files. Phase 1 and 2 changes are listed in section B so they
   can be committed on their own.

**Needs a decision.**

5. Rename the lesson tab and Progress tab from "Mistakes"? Left as is.
6. Should the Today count match the rows listed (raise the three-row cap, or
   count only what is shown)?

**Postponed on purpose.**

7. A "this week" line on Home: needs a definition of what is counted.
8. Onboarding changes: wait for drop-off data.
9. The 12 failing tests from earlier uncommitted work (Phase 0 list).
10. `views/dashboard/*` and `lib/nextStep.ts` are unreachable: Phase 8.

**Unverified assumptions.**

11. Whether the drop-off tracking on `main` is what Vercel is serving.
12. What `learnora-ai` v83 and v84, `web-research` v9 and v10, and
    `delete-account` v16 contain; `WAITINGONLEDGER.md` lists older versions.
13. The harness could not generate the session's first quiz ("The tutor
    didn't answer that one"); with real AI this step is unverified here.

---

## E. Handoff notes

**State at the end of this session (2026-11-10).** Phases 0, 1 and 2 are
done in the working tree; Phase 3 is investigated and blocked on item D1.
Nothing is committed.

**Full test suite after the changes.** See the line below; filled in when
the run finished.

- `npx vitest run`: 395 files, 5,331 tests, **11 failed, 5,320 passed**,
  931 s. All 11 are in the Phase 0 baseline list; no new failure. The
  twelfth baseline failure (`DashboardView.test.tsx`, What next?) passed on
  this run, so it is flaky rather than broken.
- `npm run build` (`tsc -b && vite build`): succeeded. Only the existing
  warning about chunks over 500 kB.

**Resume here.**

1. Owner reviews Home (`npm run dev --prefix webapp`, then
   `/app/harness.html` for fixtures) and commits section B's files.
2. Owner does D1, then D2; then verify one real reminder and do D3.
3. Phase 3 code work as listed under Phase 3.
4. Do not start Phase 4 until a reminder has been delivered: the explain-back
   step ends by promising a return visit.
