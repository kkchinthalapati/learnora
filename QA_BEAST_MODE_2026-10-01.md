# Learnora — post-redesign QA, product audit and improvement plan (2026-10-01)

This audit covers the app **after the 2026-09 redesign** (commits `edaac70` to
`5907c55`, merged in #121). That redesign shipped five-destination navigation,
Today built around one next step, the Ask drawer, one Session screen with five
modes, confidence ratings with results grouped by misconception, and a new
value-first first run at `/welcome`. The previous audit
(`QA_BEAST_MODE_2026-09-28.md`) predates all of this, so none of these
surfaces had been tested. Earlier findings are referenced only where the
redesign reintroduced or interacted with them.

## How this was tested

- **Browser-driven.** The real `webapp/` ran under Vite in Chromium,
  driven by Playwright. The backend was the repo's own network-level mock,
  `tests/e2e/support/mockBackend.ts`. The container's network policy blocks
  `*.supabase.co`, so the live backend could not be reached. Scripted AI
  replies were used to put each screen into known states: good answers,
  one-question answers, malformed answers, 429 refusals and offline
  fallbacks.
- **Production, read-only.** The Supabase connector was used for aggregate
  queries and edge-function logs. No student content was read and nothing
  was written.
- **Viewports:** 1280×800, 375×812 and 320×640 for every route, and 375 and
  320 for the Session screen and the Ask drawer.
- **Accessibility:** axe (WCAG 2.1 A/AA) on 10 redesigned surfaces, plus a
  keyboard tab-order walk through a Session.
- **Not live-tested:** real model output quality. No provider key is
  available here, and prod has had **zero AI requests since 2026-09-26**.
  AI behaviour was therefore judged from the prompts, the parsers, the
  fallbacks and the production error logs.

Confidence labels: **CONFIRMED** means reproduced in the browser, or seen in
production logs or data. **CODE** means confirmed by reading the code but not
driven end to end. **LIKELY** and **SUSPECTED** mean the evidence suggests it
but it is not confirmed.

---

## Executive summary

The redesign has the right ideas: one next step, five learning modes framed
around what the student needs, confidence ratings, and results grouped by
misconception. It is also accessible (axe was clean on 9 of 10 surfaces) and
responsive almost everywhere. But the **learning loop the redesign promises
is broken at nearly every joint**, and the **core Session screen cannot be
used on a phone**.

1. **The Session screen is unusable on phones.** On a 375px or 320px screen
   the page is 565px wide. Three of the five modes, "Not yet", the step text
   and the tutor chat's **Send** button are off-screen. This affects every
   mode and every topic. (MOB-01, P0)
2. **The privacy policy and consent text name the wrong AI providers.** A
   student agrees to share data with "Anthropic's Claude and Google's
   Gemini". Production logs show requests going to **Cerebras, Groq, Mistral
   and GitHub Models**, and the audience is 13+. (PRIV-01, P0)
3. **Free students get one Explain session a day, and the other modes break
   partway through.** Quotas are metered per AI *call*. Explain makes 2
   `debugger` calls (the free allowance is 2/day). Socratic makes 5
   `sparring` calls (allowance 2/day). Teach makes 1 + N `feynman` calls
   (allowance 2/day). When the quota runs out, Socratic and Teach **silently
   switch to canned, topic-agnostic content**. (QUOTA-01, AI-10)
4. **The app writes false misconceptions.** Typing "photosynthesis" into
   Explain wrote 3 rows to the misconception ledger, 2 of them "BLOCKING".
   They now sit under *Mistakes to Review* and are fed to the tutor as things
   "this student has previously got wrong". (LRN-01)
5. **Evidence is wired backwards.** Time on a timer counts as mastery: 45
   minutes with no check moved Enzymes from "Not started" to "Recalled". A
   quiz on the same topic does not count, because Today only knows about
   flashcard decks. Missed quiz questions are promised to "come back in
   Recall", but Recall never sees them. (DATA-10, DATA-11, LOOP-01)
6. **The first run is not a lesson.** It is two multiple-choice questions.
   "Show me how →" shows nothing. The generic quiz prompt forces the "check"
   question onto a *different* concept than the one just introduced. The
   student is then told they "Recalled" the idea, and Today immediately
   disagrees with "Not started". (EDU-01, EDU-03, DATA-12)
7. **New accounts lose their student level.** The redesigned first run never
   asks for it and writes nulls. The fix that stopped GCSE students being
   quizzed at university level (`studentLevel()`) now falls back to the
   region default for every new student. (AI-11)

**North-star check.** *Understand → practise → find gaps → fix them → come
back with continuity.*

- **Understand:** partial. Explain works, but it is capped at once a day on
  free and pollutes the ledger.
- **Practise:** works, but its results don't count toward mastery.
- **Find gaps:** over-reports. It invents misconceptions.
- **Fix:** the retry after a reveal "fixes" the gap by copying the shown
  answer.
- **Come back:** sessions live in one browser, and the Recall promise is
  unfulfilled.

---

## Test coverage

| Area | What was exercised | Result |
|---|---|---|
| Sign-up page | Copy, consent text | PRIV-01, P3 copy |
| First run `/welcome` | Example chips, typed topic, whitespace, garbage AI reply, 1-question reply, right/wrong paths, past and future exam date, session length, skip, skip after error, reload | EDU-01/03, UX-10, DATA-12, AI-11 |
| Today | Seeded student, new student, after timer block, after quiz, after Explain, "Only have 10 minutes?", "Why Enzymes?", 375 and 320 | DATA-10/11/14, UX-11, MOB-02, EDU-05 |
| Study hub | Topic entry, all five mode links | OK |
| Session · Explain | Full run, "Not yet", step advance, check step wrong → "Try it again", Save & leave → Resume, second session same day (429), mobile | MOB-01, LRN-01, QUOTA-01, EDU-02/04 |
| Session · Socratic | 4 answers on the free plan; quota runs out after answer 1 | QUOTA-01, AI-10 |
| Session · Practice / Teach / Recall | Start states and template fallback | AI-10, A11Y-11 |
| Quiz runner | Confidence, wrong answer, double-click Next, reload mid-quiz (Resume), results, review, Progress and Today afterwards | LOOP-01, DATA-11, P3 items |
| Ask drawer | Empty, whitespace, double Enter, conceptual question, NAVIGATE, table + LaTeX + ADD_QUIZ confirm, 12k-char input, reload persistence, context payload | AI-12, AI cost notes |
| Library / Subject / Notes / Deck / Review / Notebook studio | Crawl at 3 widths | UX-12, P3 |
| Plan / Tasks / Exams / Availability / Timer | Crawl, timer run with a fake clock (45 min) | UX-13, DATA-13 |
| Progress / Trajectory | Before and after Explain and quiz | DATA-14, LRN-01 |
| Settings / Friends / Room / 404 / bad quiz id | Crawl | OK (realtime is network-blocked) |
| Accessibility | axe on 10 surfaces, tab order in Session | A11Y-10/11/12 |
| Production (read-only) | Quiz attempt shapes, usage aggregates, ai_request_log by tool, edge-function provider errors | PRIV-01, AI-13, DATA-13 |

---

## Confirmed bugs (prioritised)

### P0

**MOB-01 · Session screen overflows on every phone · CONFIRMED (browser, 375 and 320)**

- **Steps:** At a 375px width, open
  `/study/new?mode=explain&topic=enzymes`. Any mode and any topic does the
  same.
- **Actual:** `document.scrollWidth` is 565, against a 375 viewport. These
  are off-screen: the Practice, Teach and Recall mode buttons, "Not yet",
  "Something wrong? Flag this answer", the chat **Send** button (x=500), and
  the right side of every tutor turn ("Could you say this step back in one
  se…"). The session title is not shown at all. Screenshot:
  `j10-375-explain.png`.
- **Root cause:** In `views/session/session.module.css`, `.shell` is a grid
  whose single implicit column sizes to its content. The topbar's `.modes`
  group (5 buttons, 393px) has no shrink and no scroll, so the column is
  564px wide and `.body`, `.centre` and the composer inherit that width.
- **Fix:**
  - Set `.shell { grid-template-columns: minmax(0, 1fr) }`.
  - At `max-width: 767px`, either turn `.modes` into a horizontally
    scrollable segmented control (`overflow-x: auto`), or collapse the five
    modes into a single "Mode ▾" menu.
  - Add `/study/:id` to `tests/e2e/mobile.spec.ts` with a
    `hasHorizontalOverflow()` assertion. That suite never covered Session.

**PRIV-01 · AI provider disclosure does not match where student data goes · CONFIRMED (prod logs + code)**

- **What students are told:** The sign-up consent text (`SignupView.tsx:187`),
  `AiConsentBridge.tsx:19`, `PrivacyTab.tsx:95`, `PrivacyView.tsx:100-116`
  and `privacy.html` all say AI goes to Anthropic's Claude and Google's
  Gemini, and that "We do not allow Anthropic or Google to train".
- **What happens:** The fallback chain in `learnora-ai/index.ts:180+` is
  Gemini → Cerebras → Groq → Cloudflare → GitHub Models → Mistral →
  OpenRouter → NVIDIA → OpenAI → Anthropic. Production function logs from
  2026-09-25 show requests reaching **Cerebras (402), Groq (429, with a
  5,567-token request), GitHub Models (empty completion) and Mistral (429)**.
  Those keys are configured, and student prompts were sent to those
  providers.
- **Why it matters:** The repo's own `AI_PROVIDERS.md` flags Mistral's free
  "Experiment" tier for its training opt-in. Gemini is described there as
  "Free tier", and Google's free-tier terms permit training on inputs. That
  contradicts the "we do not allow Google to train" claim (**LIKELY**: the
  tier of the configured key is not visible from here). The audience
  includes 13–17-year-olds.
- **Fix:** Do one of the following:
  - (a) Restrict the chain to disclosed providers on paid or no-training
    tiers, or
  - (b) Update every consent surface and the privacy policy to list each
    sub-processor, with its training status, and re-prompt existing users
    for consent.

  Also remove dead keys. Cerebras returns 402 on every call, so it adds a
  failed round trip to every request.

### P1

**QUOTA-01 · Session modes are metered per AI call, so free sessions cannot finish · CONFIRMED (browser)**

- **Explain:** `diagnoseCognitiveGap` and `generateMicroRepair` both bill
  `debugger` (free: 2/day). One complete Explain session uses the whole day.
  A second Explain session the same day showed: "You've used today's
  allowance for this tool on the free plan." The "I don't get it yet" door,
  the most important one for a struggling student, opens once a day.
- **Socratic:** `startSparringSession` plus one `submitStudentAnswer` per
  round bills `sparring` 5 times (free: 2/day). Answer 2 onward got a 429.
- **Teach:** `generateApprenticeDraft` plus each
  `evaluateTeachingExplanation` bills `feynman` (free: 2/day).
- **Fix:** Bill a *session start* per mode, and let follow-up calls inside a
  session ride on it, up to a per-session cap. Alternatively, pool the
  session modes under one "study session" quota sized to sessions, not
  calls. Show the remaining sessions on the Study hub *before* the student
  starts.

**LRN-01 · Explain mode writes fabricated misconceptions to the ledger · CONFIRMED (browser)**

- **Steps:** Study → type "photosynthesis" → Explain.
- **Actual:** Three `misconceptions` rows are inserted: "What photosynthesis
  makes" (critical), "Where the energy comes from" (moderate) and "Energy
  can change form" (critical). They have subject "General" and are labelled
  "Found by the Step-by-step solver". Progress → Mistakes to Review shows
  two of them as **BLOCKING**. The student never answered anything.
- **Root cause:** Explain reuses the Solver's root-cause *debugger*. The
  prompt says "Mistake/Problem: photosynthesis" and instructs that levels 1
  and 3 are "severed". Then `candidatesFromStackTrace` records every severed
  or shaky layer.
- **Impact:** False weak topics flow into the chat context, the plan,
  readiness and Today. Students who use Explain the most look the weakest.
- **Fix:** Give Explain its own "teaching ladder" prompt with no status
  field. Record ledger rows only when the student gets something wrong
  (a wrong check answer, or a "Not yet" twice on a step). Delete rows whose
  only evidence is an Explain diagnosis.

**AI-10 · Quota or AI failure silently swaps in canned, topic-agnostic tutoring · CONFIRMED (browser + code)**

- **Socratic** after a 429 shows the banner "Learnora's AI isn't available
  right now, so these are built-in practice questions…". The banner is
  wrong: the AI is available and the *daily limit* was hit. The questions
  are generic, for example "what happens if the external boundary changes?
  Does your reasoning still hold if we push this to the extreme?" for
  enzymes (`aiSparring.ts:461`). The session then ends with "What you
  missed goes on your misconception ledger in Progress", which contradicts
  the banner's "aren't saved to your progress".
- **Teach** with an unusable reply uses a template with **no banner at
  all**. Leo "learned" that the topic "multiplies forever without any
  slowing down… only happens on ideal sunny days" (`aiFeynman.ts:815`). The
  first question, "If enzymes is as simple as that, what stops it from
  blowing up like an overfilled balloon?", and the three plan steps are
  templated too.
- **Fix:**
  - Never present template content as tutoring. On a 429, say "You've used
    today's free Socratic sessions. They reset at midnight", and offer Recall
    or Practice, which are cheap.
  - On a parse failure, retry once and then show an honest error.
  - Delete the fabricated Teach draft.

**DATA-10 · Time on a timer counts as mastery evidence · CONFIRMED (browser)**

- **Steps:** Today → "Start 45 min on Enzymes" → let the timer finish
  (simulated clock) → do *not* take the quick check → return to Today.
- **Actual:** Enzymes goes from **Not started → "Recalled · fading"**.
  Directly underneath, the screen says: *"Each step needs evidence from a
  check, not time spent."*
- **Root cause:** `TIME_EVENT_EVIDENCE * minutes/60` in `trajectory.ts`
  (`applyEvents`).
- **Fix:** Time can tighten the forecast's confidence band, but the mastery
  ladder must only move on scored events. Write a unit test: a time-only
  event never changes `topicMastery().rung`.

**DATA-11 · Quiz results never count as mastery evidence; Today only knows flashcard decks · CONFIRMED (browser + code)**

- **Steps:** Take "Enzymes quick check" (1 of 2 correct). The results page
  reads: "One idea about Enzymes is costing you marks."
- **Actual on Today:** "Nothing has measured Enzymes yet." The Progress rung
  stays "Not started".
- **Root cause:** In `trajectory.ts:280-340`, topics are flashcard decks.
  Quiz attempts only *subtract* (a `weak_topics` penalty), and correct
  answers add nothing. A topic with no deck does not exist on Today at all.
- **Second defect:** The penalty matches by substring
  (`key.includes(topic) || topic.includes(key)`). A weak topic "pH"
  penalises a deck titled "Photosynthesis" (CODE).
- **Fix:**
  - Build topics from decks **and** quiz question topics, normalised to one
    key.
  - Feed every scored quiz answer in as a score event (right and wrong).
  - Match topics on normalised whole tokens, not substrings.

**LOOP-01 · "Wrong and guessed questions come back in Recall" is false · CONFIRMED (code + browser)**

- **Claim:** The quiz results rail (`TestResults.tsx:205`) promises that
  wrong and guessed questions come back in Recall and that Today will put
  them in front of the student.
- **Actual:** No quiz code creates cards or queue items. Recall
  (`recall.ts`, `pickRecallCards`) draws only from due flashcards. Today
  showed the same "Review 3 flashcards" before and after the quiz.
- **Fix:** On attempt save, upsert one card per wrong or guessed question
  into a per-subject "Missed questions" deck. Use the stem as the front and
  the correct choice plus feedback as the back, due now. Those cards then
  flow into Recall, Today and the forecast automatically.

**EDU-01 · The first-run "lesson" teaches nothing · CONFIRMED (browser + prompt)**

- **Promise:** The screen says "You'll get a short lesson built from it in
  about a minute."
- **Actual:**
  - Q1 is a guess.
  - The answer is revealed, with feedback if the model wrote any.
  - The button **"Show me how →"** jumps straight to Q2. There is no
    explanation step.
  - Q2 is meant to "check the idea landed". But the generic quiz prompt it
    reuses demands that "Every single question MUST cover a completely
    DIFFERENT concept" (quoted from the payload). So the check covers
    something never shown.
- **Fix:**
  - Give first run its own prompt that returns `{ hookQuestion,
    explanation (≤120 words, one example), checkQuestion on the same idea }`.
  - Render the explanation behind "Show me how".
  - Don't reuse the quiz generator's diversity rules here.

**EDU-02 · Explain's "Try it again" retries the question it just answered, and the retry counts as mastery · CONFIRMED (browser + code)**

- **Steps:** At the check step, pick a wrong answer. The correct option is
  marked "(correct answer)" and the explanation is shown. Then press "Try it
  again".
- **Actual:** `onRetry={() => save({ chosen: undefined })}` re-enables the
  same four options. Picking the now-revealed answer calls
  `recordRepairSuccess`, which writes a learning event with `score: 1` for
  the root concept.
- **Fix:** After a miss, generate a *different* item on the same concept,
  or a transfer question, or let the student explain it in their own words.
  A post-reveal pick must never write evidence.

**AI-11 · New accounts have no student level; the tutor never had one · CONFIRMED (browser + code)**

- **Actual:** `FirstRunView.markDone` writes `EMPTY_ANSWERS`. The browser
  confirmed `examType: null, goal: null, region: null`. `studentLevel()`
  therefore returns the region pair (for example "GCSE / A-Level"), which is
  the exact situation its own comment describes ("asked a GCSE student about
  Purkinje fibres").
- **Wider gap:** Only `aiSparring.ts` uses `studentLevel` at all. Tutor chat
  (`chatPrompt.ts`), quiz generation, Explain, Practice and Teach send no
  level or age, even though date of birth is collected at sign-up.
- **Fix:**
  - Add one optional chip row to the first-run win screen: "What are you
    studying for? GCSE · A-Level · IB · AP · University · Other".
  - Pass `levelRules(level)` into chat context, quiz generation and the
    session prompts.
  - Derive an age band from date of birth as a fallback.

### P2

| ID | Finding | Evidence | Fix |
|---|---|---|---|
| **UX-10** | After an AI failure on first run, the error card promises "Nothing is lost by skipping: your topic is kept and you can start a lesson from Study any time." "Skip to my plan" discards the topic: there is no row, no localStorage entry, and the Study input is empty. | CONFIRMED browser (`j2b`) | Save the topic as a pending objective. Prefill the Study hub and Today's hero with "Start your lesson on *X*". |
| **EDU-03** | If the model returns 1 question, first run uses Q1 again as the "check" (`questions[1] ?? questions[0]`) after its answer has been revealed. That is a guaranteed pass, and the ladder shows "Recalled". | CONFIRMED browser (`j1c`) | Require 2 questions (retry once) or skip the check step. |
| **DATA-12** | The mastery ladder disagrees with itself. The first-run win screen hard-codes rung 2 "Recalled". Today shows the same topic as "Not started" a second later. The rung names are thresholds on one number, not types of evidence: "Recalled" means mastery is `low`, and "Applied" means `building` (`mastery.ts:rungFor`). | CONFIRMED browser + code | Compute first run's rung from a real recorded event. Either rename the rungs to what they measure, or make each rung require its matching kind of evidence (recall = flashcard or recall check, apply = practice problem, explain = Teach). |
| **AI-12** | The tutor can't navigate to the redesign's destinations. `pathForNavigateTarget` knows dashboard, tasks, exams, timer, library, plan and settings, but not study, progress, trajectory or review. A reply of "Sure, taking you there `<NAVIGATE>progress</NAVIGATE>`" did nothing. The APP LAYOUT text also says the Library has "four sections: Folders, Materials, Flashcards and Quizzes". The live tabs are Subjects, Files & notes, Flashcards, Quizzes and Notebooks. | CONFIRMED browser (`j7`) | Add `study`, `progress` (`/analytics`), `trajectory`, `review` and `today`. Update the layout text. Add a test that every Sidebar destination has a NAVIGATE key. |
| **DATA-13** | Focus sessions started from Today are saved with `folder_id: null`, even when the topic is a Biology deck. The per-subject time table undercounts. **Production: 4 of 6 sessions in the last 30 days have no subject.** | CONFIRMED browser + prod | `prepareFocus` already gets `deckId`, so resolve the deck's `folder_id` and save it. |
| **UX-11** | Today's main button, "Start 45 min on Enzymes", lands on a dense timer page (presets, sounds, study room, quotes) with no material and no session. After the block, the hero still says "Study Enzymes next. Nothing has measured Enzymes yet" and offers the same 45 minutes again. | CONFIRMED browser (`j5`) | Make the block a **Session** (Explain or Practice on the topic, with the timer as a quiet chrome element). After it ends, the hero acknowledges it and moves on. |
| **DATA-14** | Status claims contradict each other across screens. Progress says "Nothing is fading. Every topic you've studied is holding." while Today lists 3 due cards and "Enzymes is fading". Progress → Subject table says "On track" for Biology Paper 2 in 6 days, while Exams shows readiness 25%. The "Distribution" column is a percentage of the largest subject (100% / 97% / 47%), so it reads as if it sums past 100. | CONFIRMED browser | Use one source (forecast or readiness) for "fading" and "on track". Relabel Distribution as "vs. most-studied" or show a real share. |
| **EDU-04** | Explain asks "Could you say this step back in one sentence?" but the only controls are "I've got it" and "Not yet". There is nowhere to say it, so it is self-report and no retrieval happens. | CONFIRMED browser | Add a one-line answer box. Grade it cheaply (keywords, or a chat call batched with the next step). |
| **EDU-05** | "Why Enzymes?" says "An hour on Enzymes adds about **48 points** to your predicted score", with "only a little quiz and flashcard data". A precise number on thin evidence, and the unit is undefined. | CONFIRMED display, LIKELY misleading | Below an evidence threshold, show a qualitative reason ("biggest gap before Paper 2"). Show points only with a range. |
| **SESS-01** | Sessions are stored only in the browser. "That session isn't on this device. Sessions are saved in the browser you studied in." Laptop and phone have no shared continuity, and Today's Resume card only appears on the original device. | CONFIRMED copy + code | Persist sessions in a `study_sessions_v2` table (objective, mode, plan, step, mode data), keeping localStorage as a write-through cache. |
| **AI-13** | The provider chain is fragile, and AI behaviour isn't observable. On 09-25: Cerebras returned 402 on every call, Groq returned 429 (8k TPM limit against a 5.5k-token prompt), GitHub Models returned empty, Mistral returned 429. The model also differs from request to request, so the tutor's voice and quality change mid-conversation. `ai_request_log` has only `id, user_id, mode, created_at, tool`: no provider, model, latency, outcome or tokens. | CONFIRMED prod | Log the provider, model, latency, ok/fail and token counts. Remove dead providers. Pin one primary model per mode, and fall back only on errors. |
| **MOB-02** | On Today at 375px, the floating Ask button covers the right-hand action of the first "Also worth doing" row (the "Review" button is clipped). | CONFIRMED screenshot | Add bottom padding equal to the button height plus a gutter, or dock Ask in the tab bar. |
| **UX-12** | Pre-redesign tool names are still on screen: Subject page "Feynman Practice / Step-by-step solver / Common Exam Traps"; Notes "AI Tutor: Solver, Explain, Viva"; Progress "Found by the Step-by-step solver"; Notebook "Voice Study Partner, Socratic sparring with Alex & Jordan". | CONFIRMED browser | Map every link to `sessionHref(mode)` and the five mode names. Add one label map for `origin_tool`. |
| **UX-13** | There are two planners under Plan. *Study plan* says "No plan yet… Generate my week" (AI, uses quota). *Availability* already shows a complete deterministic "Your next 7 days". | CONFIRMED browser | Use one plan: the deterministic schedule by default, with "Ask AI to rearrange" as an optional extra. |
| **A11Y-10** | `document.title` is "Learnora" on every route. That fails WCAG 2.4.2, and multiple tabs can't be told apart. | CONFIRMED | Set a per-route title ("Today · Learnora", "Explain: photosynthesis · Learnora"). |
| **A11Y-11** | The Recall rating key fails colour contrast (axe, serious; `._ratingKey_…`). | CONFIRMED axe | Use the `--recall-text` token. |
| **A11Y-12** | The Session "Ask about this step" input reports `outline: none` on keyboard focus. | LIKELY (no outline detected; a border change wasn't checked) | Use `--shadow-focus` like the buttons. |

### P3

- **The sign-up side panel still sells the old product:** "Focus timer, Task
  manager, Exams, AI study assistant". **CONFIRMED.**
- **The Notes page has a dead "Podcast: Listen & learn — soon" tile.**
  **CONFIRMED.**
- **Library dates come in three formats:** "Created Sep 10, 2026",
  "Added 9/26/2026" and "Created: 9/26/2026". **CONFIRMED.**
- **First-run error copy says "Couldn't generate a quiz"** inside something
  called a lesson. **CONFIRMED.**
- **First run says "That's a common first guess"** for any wrong option,
  including absurd ones. **CONFIRMED.**
- **Confidence order differs between screens.** In the Quiz runner, the
  student rates confidence *before* choosing, and a click grades
  immediately. In Practice, they rate after choosing and before "Check my
  answer". Practice's order is the better one, so the Quiz runner should
  match it. **CONFIRMED.**
- **One Socratic answer produced two identical ledger rows** ("substrate
  binding"). **SUSPECTED:** this could be a mock artifact.
- **`compareAttempts` recounts `answers_json` instead of using the stored
  `score`.** Any older-shape attempt would show a fake "0 → N"
  improvement. All 3 production attempts have the current shape, so this is
  hardening only. **CODE.**
- **Dev only:** reloading `/app` (without a trailing slash) gives a Vite 404.
  Production rewrites it. **CONFIRMED (dev).**

### Test-data debt (not user-facing, but it hides bugs)

- `src/dev/fixtures.ts` `quizAttempts` uses an obsolete
  `answers_json: [{ selected }]` shape. The harness and e2e runs therefore
  show "Quizzes taken: 0. None have been attempted" in the tutor context,
  and "0 → 1 correct" on results, even though a real attempt exists.
- The mock's `AI_TOOL_QUOTAS` has drifted from the server (pro sparring 40
  vs 25, and no `plus` tier).

---

## AI findings (summary)

| ID | Pri | Finding |
|---|---|---|
| AI-10 | P1 | Canned or templated tutoring shown as real (Socratic, Teach). The quota-reached state is mislabelled as "AI unavailable". |
| LRN-01 | P1 | The debugger prompt is reused for teaching, which turns every topic into a "mistake". |
| AI-11 | P1 | No student level or age in tutor, quiz, Explain, Practice or Teach prompts. New accounts have none at all. |
| EDU-01 | P1 | The first run reuses the quiz prompt. The DIVERSITY rule contradicts the "check the idea landed" instruction sent alongside it. |
| AI-12 | P2 | The NAVIGATE map and APP LAYOUT text are stale after the redesign. |
| AI-13 | P2 | Model roulette across 10 providers. No per-request provider or model logging. |
| AI-14 | P2 | **Conflicting style instructions (CODE).** For the same reply: the server's default STUDY STYLE "concise: prioritise dense key points"; the client's tutor persona "break down step by step… never rush"; "Aim for 2–6 sentences"; and "Be conversational, supportive, and concise". The Ask drawer's settings chip says "Short" while Settings says Medium. Pick one source of truth per setting. |
| AI-15 | P3 | **Cost (CONFIRMED payload).** Every chat turn resends roughly 9.3–9.6k characters of app context (about 2.4k tokens), plus the full history. That's acceptable today. Prompt caching or trimming CAPABILITIES on non-workspace screens would cut it about 40%. |

What is good:

- Guess-first in the Ask drawer.
- Honest "no performance data" rules.
- Fenced untrusted content.
- Confirmation before the AI runs actions.
- The flag-this-answer re-check.
- The quiz verifier and tone rules from the last audit are still in the prompt.

## Educational quality (summary)

**Strongest:**

- The Study hub is framed by need ("I don't get it yet", "I want to reason
  it out").
- Recall's "say it or type it before revealing".
- Results with "confident but wrong" and "lucky guess" buckets.
- Socratic's hint ladder ("Nudge → Bigger hint → Show me, then quiz me").

**Weakest:**

- Self-report checks (EDU-04).
- Retry after reveal (EDU-02).
- A first lesson without teaching (EDU-01).
- Rung names that overclaim (DATA-12).
- Precise "points" claims on thin data (EDU-05).
- Template fallbacks (AI-10).

The common thread is that **too many of the evidence-writing paths accept
self-report, time, or a post-reveal pick as proof of learning**, while the
honest evidence (quiz answers) is ignored.

## Performance

Nothing new or meaningful was found in the browser. Route loads under the
dev server were sub-second, and no idle polling was seen. AI latency in
production is inflated by dead providers: Cerebras answers 402 first on
every request (AI-13). PERF-02 from the last audit (unbounded list queries)
was not re-measured.

## Security / privacy

PRIV-01 (above) is the only new confirmed item. No secrets were rendered
client-side, beyond the publishable Supabase key, which is expected. The
earlier audit's RLS and storage fixes were not re-audited.

## Data / state findings

These are DATA-10 to DATA-14, SESS-01, LRN-01, LOOP-01 and UX-10 above.
State persistence otherwise held up:

- A quiz reloaded mid-question offers Resume and Start Over.
- A Session survives "Save & leave" and resumes from Today.
- The Ask transcript survives a reload.
- Double Enter in Ask sends once.
- Double-clicking Next in the quiz advances once.

---

## Root causes (systemic)

1. **RC-1 · The quota model predates sessions.** The redesign made learning
   multi-turn (sessions), but billing is still per call with 2/day micro-
   quotas. That single cause produces QUOTA-01, AI-10 and the misleading
   fallbacks.
2. **RC-2 · Old tools were rewired, not redesigned.** Explain is the
   Debugger, Socratic is the Viva sparring engine, Teach is Feynman, and
   first run is the quiz generator. Their prompts, statuses, billing keys and
   ledger side-effects came along unchanged. This is behind LRN-01, EDU-01,
   UX-12, AI-12 and the stale `origin_tool` labels.
3. **RC-3 · There is no single evidence model.** Mastery (decks plus time),
   readiness, the forecast, "fading", the ledger and student evidence each
   read different rows with different rules. Quiz answers are evidence in
   one place and penalties in another. Time counts in one place and not in
   another. Behind DATA-10, DATA-11, DATA-12, DATA-14 and LOOP-01.
4. **RC-4 · Promises in copy aren't backed by code.** "Your topic is kept",
   "come back in Recall", "Show me how", "evidence from a check, not time",
   "taking you there", and the privacy provider list. Each of these is a
   sentence written before or without the feature that makes it true.
5. **RC-5 · The new surfaces aren't covered by e2e or mobile tests.** The
   mobile spec doesn't open `/study/:id`, and the fixtures use outdated row
   shapes, so the harness can't catch RC-3.

---

## Missing features (by student value)

| ID | Pri | Feature | Student problem it solves |
|---|---|---|---|
| FEAT-01 | F1 | **Missed-question cards.** Quiz, Practice and Explain misses become Recall cards automatically (LOOP-01). | "I got it wrong and never saw it again." |
| FEAT-02 | F1 | **Server-synced sessions** (SESS-01). | Starting on a laptop at school and finishing on the bus. |
| FEAT-03 | F1 | **One evidence ledger.** Every scored event (quiz answer, practice problem, recall rating, explain check, teach score) is one `learning_events` row keyed by normalised topic. Mastery, forecast, fading and the tutor context all read it (RC-3). | Screens agree, so the student trusts the next step. |
| FEAT-04 | F1 | **Session-based free plan.** For example, 3 study sessions a day across any mode, with remaining sessions shown on the Study hub. | Free students can finish what they start. |
| FEAT-05 | F2 | **Level capture** in first run and Settings, used by every prompt (AI-11). | Questions pitched at the right exam. |
| FEAT-06 | F2 | **Report this question** on quiz and Practice items. Disputed items are excluded from evidence. | Wrong AI keys stop marking students wrong (carried over from AI-01 of the last audit; still missing). |
| FEAT-07 | F2 | **Topic-first Today for students with no exam.** A new student without an exam gets only "Add your next exam". | Students who just want to learn something. |
| FEAT-08 | F3 | **"Explain it back" free-text checks** in Explain and Recall, graded cheaply. | Real retrieval instead of self-report. |

## Product opportunities

- **Make the study block a Session.** Today → "Start 25 min on Enzymes"
  opens Practice on the topic, with the timer in the top bar. It ends with
  the 4-question check already promised, and the hero updates afterwards.
  This alone closes UX-11, DATA-10 and DATA-13.
- **Misconception-first revision.** The ledger already exists. With honest
  inputs (LRN-01 fixed), "Fix it · 8 min Socratic" can become Today's
  default hero whenever a confident-but-wrong item is less than 48 hours
  old.
- **Calibration feedback.** Confidence is now captured. Show the student
  their calibration ("you were certain on 4 and right on 2"). It's cheap,
  and it is one of the most effective metacognition interventions.

---

## Master backlog

| ID | Pri | Type | Finding | Recommended change | Impact | Effort | Deps |
|---|---|---|---|---|---|---|---|
| MOB-01 | P0 | BUG | Session 565px wide on phones | `minmax(0,1fr)` shell; scrollable or collapsed mode control ≤767px; e2e mobile check | Core flow usable on phones | S | — |
| PRIV-01 | P0 | SECURITY/PRIVACY | Undisclosed AI sub-processors, training claims | Restrict chain or disclose plus re-consent; drop dead keys | Legal and trust | S–M (policy) | Owner decision |
| QUOTA-01 | P1 | PRODUCT/BUG | Per-call quotas break sessions | Bill per session start; per-session cap; show remaining | Free plan usable | M | Edge fn + client |
| AI-10 | P1 | AI QUALITY | Canned tutoring shown as real; 429 mislabelled | Honest quota/error states; delete Teach template | Trust | S | QUOTA-01 |
| LRN-01 | P1 | DATA INTEGRITY | Explain fabricates misconceptions | Teaching prompt for Explain; record only on wrong answers; clean up rows | Correct weak topics everywhere | M | — |
| DATA-10 | P1 | DATA INTEGRITY | Time counts as mastery | Time affects confidence only, never rung | Honest progress | S | FEAT-03 |
| DATA-11 | P1 | DATA INTEGRITY | Quiz answers ignored by mastery/Today | Topics from quizzes too; score events per answer; token matching | Today reflects quizzes | M | FEAT-03 |
| LOOP-01 | P1 | MISSING/BUG | Missed questions never reach Recall | Missed-questions deck per subject | Closes the loop | M | — |
| EDU-01 | P1 | EDUCATIONAL | First run has no lesson; check tests another idea | Dedicated first-run prompt with explanation and same-idea check | First impression | S | — |
| EDU-02 | P1 | EDUCATIONAL/DATA | Retry after reveal counts as mastery | New item after a miss; no evidence for post-reveal picks | Honest repair | S | — |
| AI-11 | P1 | AI QUALITY | No student level | Level chip in first run; `levelRules` in all prompts; DOB fallback | Right difficulty | S–M | — |
| UX-10 | P2 | BUG | "Topic is kept" is false | Persist pending objective; prefill Study and Today | Recovery | S | — |
| EDU-03 | P2 | BUG | 1-question reply = free pass | Require 2 or skip check | Accuracy | XS | EDU-01 |
| DATA-12 | P2 | DATA/UX | Ladder contradictions; rung names | Real event from first run; rename or evidence-type rungs | Trust | M | FEAT-03 |
| AI-12 | P2 | BUG | NAVIGATE / layout stale | Add destinations; test vs Sidebar | Tutor actions work | XS | — |
| DATA-13 | P2 | BUG | Sessions without subject (prod 4/6) | Resolve folder from deck | Subject stats right | XS | — |
| UX-11 | P2 | UX | Study block is just a timer | Block = Session with timer chrome | Core loop | M | MOB-01 |
| DATA-14 | P2 | DATA | Contradictory "fading" / "on track" / distribution | One source; relabel | Trust | S | FEAT-03 |
| EDU-04 | P2 | EDUCATIONAL | Self-report check | One-line answer box | Retrieval | S | — |
| EDU-05 | P2 | EDUCATIONAL | "48 points" overclaim | Qualitative below threshold; ranges | Honesty | XS | — |
| SESS-01 | P2 | MISSING | Sessions device-local | Server table + cache | Continuity | M | — |
| AI-13 | P2 | TECH/AI COST | Fragile chain; no observability | Log provider/model/latency/outcome/tokens; prune; pin per mode | Reliability, cost | S | PRIV-01 |
| AI-14 | P2 | AI QUALITY | Conflicting style instructions | One resolved style block | Consistency | S | — |
| MOB-02 | P2 | UI | Ask button covers row actions | Bottom padding / dock | Mobile | XS | — |
| UX-12 | P2 | UX | Old tool names | Rename/route to modes; `origin_tool` labels | Coherence | S | — |
| UX-13 | P2 | UX | Two planners | Merge | Less confusion | M | — |
| A11Y-10 | P2 | A11Y | Constant page title | Per-route titles | WCAG 2.4.2 | XS | — |
| A11Y-11 | P2 | A11Y | Recall key contrast | Token | WCAG 1.4.3 | XS | — |
| A11Y-12 | P3 | A11Y | Session input focus | Focus ring | WCAG 2.4.7 | XS | — |
| FEAT-03 | F1 | ARCH | No single evidence model | `learning_events` as the single source | Fixes RC-3 | L | — |
| FEAT-04 | F1 | PRODUCT | Session-based free plan | See QUOTA-01 | Retention | M | QUOTA-01 |
| FEAT-05..08 | F2–F3 | FEATURE | See Missing features | — | — | S–M | — |
| P3 items | P3 | POLISH | Copy, dates, dead tile, confidence order | — | Polish | XS each | — |
| TD-01 | P3 | TECH DEBT | Obsolete fixtures; mock quota drift | Update fixtures; import quotas from one module | Tests catch RC-3 | XS | — |

---

## Implementation batches (coherent, not just priority order)

Batch A and the policy part of Batch B can run in parallel. Batch C should
come before or alongside Batch D, because D's fixes depend on C's evidence
model.

### Batch A · "Session works on a phone" (1–2 days)

MOB-01, MOB-02, A11Y-10/11/12, plus a mobile e2e test for `/study/:id`.
These are all layout and token changes, and none touches data.

### Batch B · "Honest AI" (2–4 days)

PRIV-01 (needs an owner decision first), AI-13 logging and pruning, AI-10,
AI-12 and AI-14. These all live in the edge function and the prompt and
fallback layer. Ship the logging first, so the effect of the other changes
can be seen.

### Batch C · "One evidence model" (1–2 weeks; the big one)

FEAT-03, DATA-10, DATA-11, DATA-12, DATA-14, EDU-02, LRN-01 and DATA-13.

- Introduce or extend `learning_events` as the single place scored evidence
  is written.
- Make trajectory and mastery read topics from decks plus quiz topics.
- Stop time, self-report and post-reveal picks from counting.
- Give Explain a teaching prompt that doesn't write to the ledger.
- Add a one-off cleanup migration for ledger rows sourced only from
  Explain diagnoses (reversible: soft-delete them with a flag).

### Batch D · "Close the loop" (1 week)

LOOP-01 / FEAT-01, UX-11 (the block becomes a Session), SESS-01 / FEAT-02,
UX-10 and EDU-04. This batch depends on C so that missed-question cards
and session results write evidence correctly.

### Batch E · "Free plan by sessions" (3–5 days)

QUOTA-01 / FEAT-04. This needs coordinated edge-function and client changes
and a pricing decision. Do it before the next growth push. Until then,
raise `debugger`, `sparring` and `feynman` free quotas to at least the
number of calls in one session (Explain 2→4, Socratic 2→6, Teach 2→5) as a
stop-gap.

### Batch F · "First run that teaches" (2–3 days)

EDU-01, EDU-03, AI-11 / FEAT-05, and the P3 first-run copy.

---

## Acceptance tests

- **MOB-01:** At 320, 375 and 414px, for each of the 5 modes,
  `scrollWidth <= clientWidth + 1`. The Send button, all five modes (visible
  or reachable by horizontal scroll inside the control), "Not yet" and
  "Flag" are within the viewport.
- **PRIV-01:** Every provider whose key is set in production appears in the
  privacy policy and the consent copy with its training status. A
  unit/contract test fails if `BUILTIN_PROVIDERS` contains an id that isn't
  in a `DISCLOSED_PROVIDERS` list.
- **QUOTA-01:** A free account can complete an Explain session (diagnose,
  then 3 steps, then the check), a 4-round Socratic session and a Teach
  session with 3 explanations, all on the same day, with no 429. The
  N+1th *session* is refused, with a message naming the session limit and
  the reset time.
- **AI-10:** With the edge function returning 429, Socratic and Teach show
  no generated questions, critiques or drafts. They show the limit message
  plus a Recall/Practice fallback. A grep test finds no hard-coded tutor
  speech in `aiSparring.ts` or `aiFeynman.ts`.
- **LRN-01:** Starting Explain on "photosynthesis" and finishing it with
  every step marked "I've got it" and a correct check inserts **0**
  `misconceptions` rows. A wrong check answer inserts at most 1 row, for the
  concept that was tested.
- **DATA-10:** A 45-minute timer on a topic with no scored events leaves the
  rung at "Not started".
- **DATA-11:** After a quiz with 2/2 correct on topic *T* (with no deck),
  Today and Progress list *T* with a rung of at least "Recalled". A weak
  topic "pH" does not change a deck titled "Photosynthesis".
- **LOOP-01:** After a quiz with 1 wrong and 1 guessed answer, the next
  Recall session contains both items, and Today's memory row count rises
  by 2.
- **EDU-01:** First run shows an explanation (≤120 words, containing at
  least one example) between Q1 and Q2. Q2's topic label equals Q1's. A
  1-question reply triggers one retry and never reuses Q1.
- **EDU-02:** After a wrong check answer, "Try it again" presents a
  different question. No `learning_events` row with `score: 1` is written
  for a post-reveal answer.
- **AI-11:** A new account choosing "GCSE" on the win screen gets
  `STUDENT LEVEL: GCSE` in the chat context, the quiz prompt and the Explain
  prompt. An account that skips it gets an age-band fallback derived from
  date of birth.
- **UX-10:** After "Skip to my plan" on a failed first run, the Study hub
  input is prefilled with the topic, and Today shows "Start your lesson on
  *topic*".
- **AI-12:** For every Sidebar destination, `pathForNavigateTarget(key)`
  returns its path. "Take me to my progress" lands on `/analytics`.
- **DATA-13:** A block started from a deck in folder *F* is saved with
  `folder_id = F`.
- **DATA-14:** Progress never says "Nothing is fading" while Today shows a
  fading or due item. "On track" is never shown for an exam with readiness
  below 50% and 14 days or fewer remaining.
- **SESS-01:** A session started in browser A resumes at the same step in
  browser B for the same account.
- **A11Y-10:** Each route sets a unique `document.title`.

## Regression test plan (after the batches land)

- **Mobile:** Re-run `tests/e2e/mobile.spec.ts`, extended to `/study/:id`
  in all 5 modes, Today, and the Ask drawer, at 320, 375 and 414px.
- **Critical path:** `tests/e2e/critical-path.spec.ts` and `journeys.spec.ts`
  (sign-in, quiz to results, review to recap, return after days away).
- **Evidence model:**
  - `trajectory.test.ts`, `mastery.test.ts`, `studentEvidence.test.ts`, and
    a new `learningEvents` contract test.
  - Re-seed fixtures with current row shapes (TD-01) so the harness shows
    real numbers.
- **AI:**
  - `chatPrompt.test.ts` (level, NAVIGATE keys, layout text).
  - `tests/quiz-quality.test.js`, plus a new first-run prompt test.
  - The edge-function quota tests (`tests/quota-parity.test.js`), updated
    for per-session billing.
  - A content-safety suite run against any new prompts.
- **Ledger:**
  - Misconception insertion from each mode: Explain (none unless wrong),
    Practice (wrong answers), Socratic (missing points from real feedback
    only, deduplicated), Teach (not from local scoring).
  - The SEC-02 shared-device test from the last audit (per-user storage),
    because sessions move to the server.
- **Privacy:** The disclosed-provider contract test, and a manual check of
  the sign-up consent text, Settings › Privacy, `/privacy` and
  `privacy.html`.
- **Accessibility:** axe on the same 10 surfaces, plus per-route title
  checks.
