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
| 3 | Return loop and onboarding | IN PROGRESS: one code change done; delivery BLOCKED on the owner (mail provider secret) |
| 4 | Deeper learning and explain-back | COMPLETED 2026-11-10 in the working tree (not committed, not seen with live AI) |
| 5 | Subjects as learning journeys | COMPLETED 2026-11-11 in the working tree; migration written, NOT APPLIED |
| 6 | Contextual tutor and personalisation | COMPLETED 2026-11-11 in the working tree; migration written, NOT APPLIED |
| 7 | Review, knowledge and progress | COMPLETED 2026-11-11 in the working tree |
| 8 | Consolidation and polish | NOT STARTED (audio consolidation done separately, see the last section) |

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

**Second session, 2026-11-10 (after commit `f1db74b`).**

- **Re-checked production, read-only.** The 2026-11-10 13:05 UTC run again
  answered 500 "No email provider configured"; push again answered "no
  subscriptions". Still blocked on D1.
- **Done: the reminder offer at the end of a lesson.** `ReminderOffer` was
  shown only after the first-run lesson and at the end of a Study session.
  It now also closes Learn's end screen, the place most lessons finish. It
  already hides itself when reminders are on, when the browser cannot take
  push, or for a fortnight after "not now", and offers email only when
  `VITE_EMAIL_REMINDERS=true`, so it cannot promise an email that will not
  arrive.
- **Not done.** Making a failed daily run visible: every option needs either
  a migration or a function deploy, which were not authorised. It stays
  proposed. Until then the check is the query in section D, item 14.

### Phase 4: deeper learning and explain-back

- **Objective.** A student produces the idea, not only recognises it.
- **What exists now.** After the last part of a lesson, under the recap:
  "Can you explain this in your own words?" with a text box. On "Check my
  explanation" the student sees:
  - **What came across**: each part of the lesson they covered, with their
    own words quoted back.
  - **What you left out**: the parts they did not cover, a short nudge for
    each, and "Go over this part again", which reopens that part.
  - **Worth another look**: anything they wrote that the notes show is
    wrong, quoted, and saved to the ledger.
  - **Try again.** There is no score and the word "marks" does not appear.
- **How it is grounded.** The parts are the lesson's own sections, each sent
  with the student's notes for it; the prompt says the notes are the only
  source of what is true.
- **What was reused.** No second marker. `readMarking` and `Marking`
  (`lib/photoMarking.ts`), `holdToAnswer` and `learnSessionKey`
  (`api/learn.ts`), `candidatesFromMarking` for the ledger, and
  `learningEventsApi.record` for evidence. New code is the prompt, the copy
  check and the screen.
- **Rules that keep it honest.**
  - A part counts only if the model's quote is really in the student's text
    (`holdToAnswer`); a "wrong idea" the student never wrote is dropped.
  - Text with a 12-word run lifted from the notes is turned away before any
    call, as is anything under 12 words.
  - **Leaving a part out is recorded as nothing.** Knowing the lesson is
    recorded (score 1) only when every part came across; otherwise the event
    carries no score. A few sentences cannot cover a whole lesson, so a gap
    is not evidence of not knowing.
  - No stand-in: if the tutor cannot be reached or its reply cannot be read,
    the step says so and nothing is recorded.
- **Entitlements.** Free on every plan. It uses the lesson's own session key,
  and `api/learn.ts` states the edge function counts calls with one session
  key once a day, so it should cost no extra allowance. **That billing claim
  was read in a comment, not checked against `ai_request_log`.**
- **The persona Teach mode** (`/study`, Teach) is untouched.
- **Limits.** A lesson with more than 8 parts is read on its first 8. The
  result is kept in the browser with the rest of Learn's progress.
- **Tests.** `api/explainBack.test.ts` (12), `views/lesson/ExplainBack.test.tsx`
  (9), one assertion added to `LearnPanel.test.tsx`: all pass.
- **Browser check** (fixture harness): the invitation rendered on a finished
  lesson; a typed explanation returned "1 of 2 parts came across" with the
  typed words quoted and "Go over this part again" on the other; no console
  errors. Before the harness had a scripted reply the step showed "The tutor
  answered, but not in a way I could read" and recorded nothing, which is the
  intended failure.
- **Outstanding.** Never run against the real model: the quality of its
  reading (too generous, too strict, invented nudges) is unknown. Not seen at
  phone width or in light theme.
- **Next action.** Owner tries it on a real lesson with a real account.

### Phase 5: subjects as learning journeys

- **Objective.** A subject reads as a course with an order, not a pile.
- **What exists now.** A subject's page lists its lessons in order, marks the
  first one not yet practised through as **Next up**, and gives each lesson
  two buttons, move up and move down. Home's "Next: …" under each subject and
  its "is ready when you are" suggestion use the same order.
- **The order.** `materials.position`, counted from 0 in the subject
  (migration `20261111000000_material_position.sql`). A lesson never placed
  has no position and follows the placed ones in the order it was added, so
  an untouched subject reads oldest first. The first move places every
  lesson in the subject; later moves write only the rows that changed.
- **Freedom kept.** Any lesson opens from the list as before. "Next up" is a
  label, not a lock.
- **Before the migration is applied.** Order and "Next up" still work
  (oldest first). The first move fails on the missing column; that is
  remembered and the buttons go away for the session.
- **Not done.** Specification-based topic progression. The catalogue covers
  only AQA GCSE sciences, IB sciences and CBSE, and mapping a student's own
  lessons onto spec topics reliably needs its own design. Deferred, D20.
- **Tests.** `lib/lessonOrder.test.ts` (9), `views/subjects/subjectPath.test.tsx`
  (8), four `setOrder` cases in `api/materials.test.ts`: all pass. The
  migration passes `migrations.test.ts`.
- **Browser check** (harness): the Biology page showed "Next up" on its
  lesson. The fixture subjects have one lesson each, so **the move buttons
  were not seen or pressed in a browser**.
- **Next action.** Owner applies the migration, then moves a lesson.

### Phase 6: contextual tutor and personalisation

- **Found.** The Ask tutor builds a line about the page the student is on.
  It still matched the pre-overhaul routes (`/notes/:id`, `/folders/:id`), so
  on a lesson's page (`/lessons/:id`) and a subject's page (`/subjects/:id`)
  it was told "User is on the general dashboard."
- **Fixed.** On a lesson's page the tutor is now given the lesson's title,
  its subject, the part of Learn the student reached on that device, and the
  lesson's notes, with the instruction to say when something is not covered
  by them. On a subject's page it is given the subject's name. If the notes
  cannot be read it is told so, rather than left to guess.
- **Entry points.** Not merged. The lesson's Tutor tab already only opens
  the Ask drawer with three starter questions, so there is one tutor; the
  tab, the drawer and the tutor call are doors to it. Removing the tab is a
  Phase 8 navigation decision.
- **Memory between conversations** (new, small):
  - **What is kept.** One row per lesson the student asked the tutor about:
    lesson title, subject, how many conversations, last time. Nothing they
    typed, nothing the tutor replied, no judgement about them.
  - **How it is used.** Up to six earlier lessons are named to the tutor,
    with instructions not to recite them, not to claim to remember what was
    said, and not to infer how well the student knows them.
  - **Control.** Settings > Privacy and AI > "What your tutor remembers":
    the full list, Remove on each, "Forget all of it", and a switch (synced
    setting `tutorMemory`, on by default). Off means nothing is read or
    written.
  - **Where.** Table `tutor_memory` (migration
    `20261111010000_tutor_memory.sql`, RLS own rows only, deleted with the
    lesson and the account). Until it is applied the list is kept in the
    browser under the account's id, so it does not cross devices.
  - **Also updated.** The data export includes `tutor_memory`; the privacy
    notice has a paragraph describing it.
- **Not done.** Cross-device chat transcripts; summaries of what was
  discussed. Both would mean storing what students write, which the brief
  for this phase ruled out without a stronger reason.
- **Tests.** `lib/tutorMemory.test.ts` (11), `api/tutorMemory.test.ts` (7),
  `views/settings/TutorMemoryCard.test.tsx` (6), five cases added to
  `lib/chatPrompt.test.ts`; the existing chat suites pass.
- **Browser check** (harness): on a lesson's page the request to the tutor
  contained "User is on the lesson "Enzymes and rates of reaction" in
  Biology. Here are the lesson's notes: …". The Settings card rendered with
  its switch and "Nothing is remembered yet". **The list filling in after a
  conversation was not seen**: the harness does not keep unknown tables.
- **Next action.** Owner reads the privacy paragraph, applies the migration.

### Phase 7: review, knowledge and progress

- **What exists now.**
  - **Progress opens on "What you know"**: each subject, one sentence of
    counts in words ("2 secure, 1 starting to slip."), then its topics, each
    with a state (Secure, Right so far, Still learning, Starting to slip)
    and what that rests on ("4 questions right over 2 days"). A topic that
    needs something links to it: Check it, Go over it, Try new questions. A
    secure topic has no button.
  - **History** (the time charts) is one tab along, unchanged.
  - **A subject's exam row says how ready the student is, in a word**
    (existing `lib/examReadiness.ts` tiers), or "too little answered yet to
    say how ready". Never the number.
- **Where it comes from.** The existing knowledge model, which the tutor
  already read. No new model, no new data. A topic with no answered question
  is not listed. A topic is filed under the subject most of its answers
  came from; topics that cannot be placed are listed last as "Other topics".
- **Decisions.** No percentages or grades on this tab. The "Mistakes" tab
  keeps its name (it is the precise record). No knowledge graph.
- **The Review destination.** Not built as its own page. Home's Today and
  `/study` are the review entry, and "What you know" now leads into the same
  sessions. A fourth top-level destination is a Phase 8 navigation decision.
- **Tests.** `lib/understanding.test.ts` (11),
  `views/analytics/UnderstandingPanel.test.tsx` (7), `ProgressView.test.tsx`
  updated (4), two readiness cases in `subjects.test.tsx`: all pass.
- **Browser check** (harness): Progress opened on What you know, listing
  Biology with two topics and "Go over it" links; the subject page showed
  the readiness line. No console errors.
- **Outstanding.** Topic labels come from whatever the question called its
  topic, so near-duplicates ("Enzymes", "Enzyme action") can appear as two
  rows. Not seen with a real account's volume of answers.
- **Next action.** Owner looks at it on an account with real history.

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

Everything above was committed as `f1db74b` (19 files). Everything below is
uncommitted.

| File | What changed | Why | Tested | Risk |
|---|---|---|---|---|
| `webapp/src/api/explainBack.ts`, `.test.ts` | New: parts, copy check, prompt, `checkExplanation`, `explainBackScore` | Phase 4 | Yes, unit | Reading quality with the live model unknown |
| `webapp/src/views/lesson/ExplainBack.tsx`, `.test.tsx` | New: the invitation and the result | Phase 4 | Yes, unit and browser (harness) | None found |
| `webapp/src/views/lesson/LearnPanel.tsx` | End screen mounts `ExplainBack` and `ReminderOffer`; `explainBack` added to stored progress | Phases 3 and 4 | Yes, 13 Learn tests | File also carries earlier uncommitted work |
| `webapp/src/views/lesson/LearnPanel.test.tsx` | One assertion: the invitation is on the end screen | Phase 4 | Yes | None |
| `webapp/src/views/lesson/learn.module.css` | `.explainBack`, `.explainTitle`, `.explainLabel` appended | Phase 4 | Browser | File also carries earlier uncommitted work |
| `webapp/src/dev/harness.tsx` | Scripted reply for explain-back | So the result can be looked at without a live model | Browser | Dev only |
| `supabase/migrations/20261111000000_material_position.sql` | New: `materials.position` | Phase 5 | `migrations.test.ts` | Not applied; not run against a database |
| `webapp/src/lib/lessonOrder.ts`, `.test.ts` | New: order, move, changed rows | Phase 5 | Yes, unit | None found |
| `webapp/src/api/materials.ts`, `.test.ts` | `setOrder`, `isOrderSupported` | Phase 5 | Yes, unit | N small writes per move, not one transaction |
| `webapp/src/hooks/useMaterials.ts` | `useSetLessonOrder`, optimistic | Phase 5 | Through the Subject tests | None found |
| `webapp/src/api/types.ts` | `Material.position` | Phase 5 | Typecheck | None |
| `webapp/src/views/lesson/LessonRows.tsx` | Optional `rowExtras` (a note and controls per row) | Phase 5 | Yes | Shared by Home and Subjects; default behaviour unchanged |
| `webapp/src/views/subjects/SubjectView.tsx`, `subjects.module.css`, `subjectPath.test.tsx`, `subjects.test.tsx` | Ordered path, Next up, move buttons; readiness word on the exam row | Phases 5 and 7 | Yes, unit; browser in part | Move buttons unseen in a browser |
| `webapp/src/lib/homeToday.ts` | Next lesson follows the stored order | Phase 5 | Yes | None |
| `supabase/migrations/20261111010000_tutor_memory.sql` | New table with RLS | Phase 6 | `migrations.test.ts` | Not applied; RLS not exercised against a database |
| `webapp/src/lib/tutorMemory.ts`, `api/tutorMemory.ts`, tests | New: the memory, its prompt line, server and browser storage | Phase 6 | Yes, unit | None found |
| `webapp/src/lib/chatPrompt.ts`, `.test.ts` | Lesson and subject pages recognised | Phase 6 | Yes | None found |
| `webapp/src/context/ChatProvider.tsx` | Loads the lesson's notes, title and subject; reads and writes the memory | Phase 6 | Existing chat suites; browser | Three more reads before a reply on a lesson page; file also carries earlier uncommitted work |
| `webapp/src/lib/settings.ts`, `context/SettingsProvider.tsx` | Setting `tutorMemory`, synced | Phase 6 | Yes | None |
| `webapp/src/views/settings/TutorMemoryCard.tsx`, test, `PrivacyTab.tsx`, `PrivacyTab.test.tsx`, `settings.module.css` | The card and its place | Phase 6 | Yes, unit and browser | None found |
| `webapp/src/lib/dataExport.ts` | `tutor_memory` exported | Phase 6 | Existing export tests | None |
| `webapp/src/views/privacy/PrivacyView.tsx` | Paragraph on the tutor's memory | Phase 6 | n/a | **Legal text: needs the owner's read** |
| `webapp/src/test/mocks/handlers.ts` | Default handlers for `tutor_memory` | Tests | Yes | Test only |
| `webapp/src/lib/understanding.ts`, `.test.ts` | New: per-subject understanding in words | Phase 7 | Yes, unit | Topic labels can near-duplicate |
| `webapp/src/views/analytics/UnderstandingPanel.tsx`, test, `ProgressView.tsx`, `ProgressView.test.tsx`, `progress.module.css` | New first tab | Phase 7 | Yes, unit and browser | `/analytics` now opens on a different tab |
| `webapp/DESIGN.md`, `WAITINGONLEDGER.md` | Progress tabs; two migration rows | Rulebook and ledger | n/a | None |

---

## C. Verification ledger

| Category | Status | Evidence |
|---|---|---|
| Source inspection | Done for Phases 0 to 3 | Sections above |
| Unit tests | Done | 39 Home tests, 76 maths tests pass; full suite 5,320 passed, 11 failed, all 11 pre-existing (section E) |
| Integration tests | Not run | No Playwright run this session |
| Build | Done | `npm run build` succeeded 2026-11-10 |
| Browser / runtime | Partial | Harness: Home with things due, Start into the adaptive run; explain-back invitation, a result, and the unreadable-reply failure. Not seen: Home continue row, nothing-due states, new student, light theme; explain-back with the live model |
| Mobile / responsive | Partial | Home at 375 px in the harness: no horizontal scroll. Explain-back not looked at on a phone width |
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
14. Reminder health check, until a failed run is made visible:
    `select status_code, left(content, 90), created from net._http_response
    where created > now() - interval '2 days' order by created desc;`
15. Explain-back costs no extra allowance (read in `api/learn.ts`, not
    measured). Check `ai_request_log` after one real use.
16. How well the live model reads an explanation. Try a strong, a partial
    and a wrong explanation on a real lesson before promoting the step.

**Decisions taken in Phase 4, open to reversal.**

17. A part left out is recorded as nothing rather than as a miss.
18. Explain-back is free on every plan.
19. The step sits on the lesson's end screen only; it is not asked after
    each part, where the paid typed exam question already is.

**Added in the third session (Phases 5 to 7).**

20. Specification-based topic progression on a subject's page: deferred.
    Needs a reliable mapping from a student's own lessons to spec topics.
21. **Apply two migrations** (owner): `20261111000000_material_position.sql`
    and `20261111010000_tutor_memory.sql`. Neither has been run against a
    database; `WAITINGONLEDGER.md` section 2 has what to verify after.
22. **Read the new privacy paragraph** in `views/privacy/PrivacyView.tsx`
    before it ships. The static `privacy.html` at the repo root was not
    changed and may need the same sentence.
23. Tutor memory is **on by default**. Decision for the owner: default off
    for under-16s, or for everyone.
24. Near-duplicate topic names on "What you know" ("Enzymes" and "Enzyme
    action"). Merging them needs a rule that will not merge different topics.
25. Email reminders: left alone at the owner's instruction (2026-11-11).
    D1 to D3 still stand.
26. Not seen in a browser: the lesson move buttons, the tutor memory list
    with rows in it, anything at phone width for Phases 4 to 7.

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
   step ends by promising a return visit. (Superseded: the owner asked for
   the next phases on 2026-11-10 and Phase 4 was built. The step makes no
   promise of a return; the reminder offer beside it only appears when a
   reminder can actually be delivered.)

**State after the second session (2026-11-10).** Phase 4 is done in the
working tree, uncommitted. Phase 3 has one code change and is otherwise
blocked on D1. Phases 5 to 8 are not started.

- `npx vitest run`: 397 files, 5,352 tests, **15 failed, 5,337 passed**.
  Twelve are the Phase 0 baseline list. The other three
  (`TutorChat.test.tsx`, two cases; `ExamDetailView.test.tsx`, one) are in
  files this work did not touch, and all 71 tests in those two files passed
  when run on their own straight afterwards. Treated as timeouts under load
  on this OneDrive folder, not as regressions, but that is an inference: the
  full suite was not run a second time.
- `LearnPanel.test.tsx` "teaches with cards" also failed intermittently
  (twice in five runs) on a 1 s wait for the lazily loaded card library,
  before and after the Phase 4 change.
- `npm run build`: succeeded.

**Resume here (second session).**

1. Owner tries explain-back on a real lesson (D15, D16), then commits the
   second table in section B.
2. D1 to D3 for reminders, unchanged.
3. Phase 5 (subjects as journeys) is next. It needs one decision first:
   whether lesson order may be stored, which means a migration. (Answered
   2026-11-11: yes.)

**State after the third session (2026-11-11).** Phases 5, 6 and 7 are done
in the working tree, uncommitted, with two migrations written and not
applied. Phase 4 is still uncommitted too. Phase 3's delivery is parked at
the owner's instruction. Phase 8 is not started.

- `npx vitest run`: 404 files, 5,434 tests, **11 failed, 5,423 passed**.
  Ten are in the Phase 0 baseline list. The eleventh
  (`lib/localSessions.test.ts`, "caps the stored history") is in a file this
  work did not touch and passed, 12 of 12, when run on its own straight
  afterwards; treated as a timeout under load, by inference.
- `tsc -b`: clean. `npm run build`: succeeded.

**Resume here (third session).**

1. Owner applies the two migrations (D21) and reads the privacy paragraph
   (D22), then tries: move a lesson; ask the tutor on a lesson and look at
   Settings > Privacy and AI; open Progress on an account with history.
2. Commit the second table in section B (Phases 3 to 7).
3. Phase 8 (consolidation) is next: navigation to Home, Subjects, Review,
   You; the lesson's tab count; Library and Notebook Studio; dead code
   (`views/dashboard/*`, `lib/nextStep.ts`); founder tools out of the
   student app. Each is a remove, hide or merge decision, so it should
   start from a short list the owner approves, not from code.

---

## Audio: calls, podcasts and voices (2026-11-11, fourth session)

Asked for by the owner: consolidate the call and podcast features, make
everything customisable, and learn from Turbo AI without copying it.

**What Turbo AI does** (looked at on the owner's signed-in Premium account,
read only; nothing generated, answered or changed there):
- **Podcast tab:** language, two speaker slots chosen from named voices
  with a portrait, a one-line character and a sample, length Short (3 to 5
  min) or Long (8 to 10 min), and free-text instructions.
- **Lesson pages:** each page has "Read this page out loud" and "Ask
  Turbo". Its voice mode ("Talk to Turbo") lives inside the same lesson
  tutor panel as typed chat.
- **Lesson settings:** only "Reset progress".
- **Their home:** a "What do you want to learn?" box with Record, Upload and
  YouTube, then "Jump back in". That is the shape Learnora's old Home had;
  Phase 2's greeting-first Home already moved away from it.

**What Learnora now does, and where it goes further:**
- **One set of voices everywhere** (`lib/voicePrefs.ts`): the tutor's voice
  and speed, and the podcast's two voices, chosen once (on the call
  screen, in the podcast setup, or in Settings → Study → Voice and
  listening) and used by the call, spoken replies in Ask and podcasts.
  They are the device's real voices, with a "Hear it" preview, and they
  fall back to the best match on a device that lacks the chosen one.
- **Podcasts made the student's way** (`lib/podcastStyle.ts`):
  - **Format:** Conversation, Solo lesson, or Debate. In a debate a
    challenger defends the most common wrong idea, using this student's own
    recorded mistake when there is one, and the host settles it with an
    example.
  - **Length:** Quick, Standard or Deep dive.
  - **Focus:** the whole lesson, only the parts missed in Learn, or a
    custom instruction. The instruction is quoted to the model as the
    student's words, never as rules.
  - **Recall breaks:** the episode asks the listener a question, shows a
    countdown of 6 seconds, then gives the answer, with "Show it now" to
    skip the wait. The answer stays hidden in the transcript until it has
    been given.
- **Nothing is written until the student asks.** The player used to write
  an episode as soon as it opened, which spent part of the lesson's
  allowance. Each episode is kept per set of choices.
- **Calls:** they keep their five personalities and four kinds of call, and
  gain the voice choice.
- **Settings → Study → Voice and listening:** every audio choice in one
  card.

**Fixed along the way:** in Phase 6 the tutor waited for its memory read
before building every reply, and on a lesson page it read the notes, the
lesson and the subject one after another. All of these now run in
parallel. This is what had pushed `TutorChat.test.tsx` past its time limit.

**Decisions:**
- Voices and audio choices stay on the device, because the voices are the
  device's own.
- Language is not a podcast option, because it follows the app's language
  setting, as before.
- No portraits or invented names for voices: the device's voices are
  listed by their real names.

**Tests:** `lib/voicePrefs.test.ts` (7), `lib/podcastStyle.test.ts` (13),
`api/podcast.test.ts` (+5), `views/lesson/PodcastPlayer.test.tsx` (9). One
real bug was caught: a backslash lost in an edit made the recall answer's
whitespace regex remove every letter "s".

**Browser check (harness):**
- The setup listed this machine's voices.
- "Only the parts I missed" showed the missed part.
- The episode showed "Conversation · about 6 min · 1 recall break", with
  its answer hidden.
- A voice chosen in Settings was the one shown on the call screen.
- At 375 px there was no horizontal scroll.
- Not heard: the audio itself was never played aloud in the harness.

**Ownership:** `api/podcast.ts`, `lib/callStyle.ts`, `PodcastPlayer.tsx`,
`TutorCall.tsx` and their tests were already uncommitted earlier work
before this session. Committing this work means committing them too.

**Full suite after this work:**
- `npx vitest run`: 407 files, 5,468 tests, **14 failed, 5,454 passed**.
  - 11 are the Phase 0 baseline failures.
  - `DashboardView`'s "What next?" is the known flaky one.
  - The other three are `TutorChat` (two) and `ChatMessage` (one). They
    pass when their files run on their own, but under the full suite's load
    they miss their one-second waits. They passed in the full run after
    Phase 7, so this work may have made them slower. Unresolved.
- `tsc -b`: clean. `npm run build`: succeeded.

**Phase 8** is still not started.
