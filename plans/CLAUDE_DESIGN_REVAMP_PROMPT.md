# Claude Design prompt: Learnora stress-free UI revamp with persona testing

Paste everything below the line into Claude Design. It is self-contained: it
describes the product as it exists in `webapp/` on 2026-10-10, so the designer
does not need the repo. If Claude Design can attach a codebase, attach
`webapp/src` as well and tell it the code wins wherever this prompt and the
code disagree.

---

## 0. Your role and the job

You are a senior product designer and design-systems lead. Your job is a
**complete UI revamp of Learnora**, a study app for school students aged
roughly 13–18. The single goal of the revamp is that **studying in Learnora
feels calm, obvious and stress-free**: a student opens the app, knows within
three seconds what to do next, does it, and leaves feeling better about their
exam than when they arrived.

You will not just draw screens. You will **test every design against a panel
of student personas** (section 5), find where each persona gets stuck,
anxious, confused or bored, and iterate until each one gets through the core
journeys without friction. Show your working: the persona findings are as
much a deliverable as the screens.

Work in this order and do not skip steps:

1. Read this whole prompt.
2. Run a **baseline persona walkthrough** of the current product as described
   in section 3 (you are critiquing the described IA and flows, not
   pixel-perfect screenshots). Produce the friction log (section 6.1).
3. Propose the **design principles and information architecture** (sections 4
   and 7). Keep it to one page.
4. Build the **design system** (section 8).
5. Design the **core screens and flows** (section 9), mobile first, then
   desktop.
6. Run the **persona test rounds** (section 6) on your designs. Iterate at
   least twice. Show what changed between rounds and why.
7. Deliver the **final package** (section 10).

---

## 1. What Learnora is

Learnora is a study workspace: plan your revision, learn from your own
materials, practise with checked questions, review with spaced repetition,
and see honestly how ready you are for your exam.

Its strategic position, in one sentence:

> Learnora finds what a student believes that is wrong, fixes it, and proves
> days later on a new question that it stayed fixed, for their exact exam
> board, in the minutes they have.

What makes it different, and what the UI must make *visible and felt* rather
than hidden in settings:

- **Mistake loop / misconception ledger.** When a student picks a wrong
  answer that reveals a specific wrong belief ("heavier objects fall
  faster"), Learnora logs that belief, shows a short re-teach, and later
  retests it on a *new* question at least 2 days later. Only then is it
  "fixed". Every AI tool reads and writes this same ledger.
- **Hint ladder.** Stuck on a question → nudge → one step → full worked
  solution. Hints never leak the answer early. A hint-assisted correct
  answer earns no mastery credit, and reaching the worked solution counts as
  wrong, so the student cannot game their own progress.
- **Honest uncertainty.** "Untested" is never shown as "weak". Readiness
  predictions show confidence bands and say what they are based on ("from
  your recent quizzes, flashcard reviews and study time"). No flattering
  percentages.
- **Exam-weighted priorities.** Study time is tied to marks: "this topic is
  worth more marks and is fading, do it first".
- **Spaced repetition** (FSRS scheduler) for flashcards.
- **Privacy discipline.** Students consent before first AI use; their data
  only goes to disclosed AI providers.

Reality check you must design for:

- Very few active users today (tens, not thousands). The data behind every
  prediction is thin. **Empty and low-data states are the default
  experience**, not an edge case. Design them first-class.
- AI calls can be **slow (10–30 s) and sometimes fail** while the app falls
  back across providers. Waiting and failure states must be calm, honest and
  never block the student from doing something useful meanwhile.
- Students are often broke. There is a genuinely complete **free tier**, a
  cheaper **Plus** (more AI headroom) and **Pro** (highest headroom plus a
  few exclusive features such as Trajectory and calendar sync). Paywalls must
  never ambush a student mid-question or make them feel punished.
- Markets: UK GCSE (AQA/Edexcel/OCR sciences and maths), IB sciences, and
  Indian CBSE/ICSE students (Class 9–10). Design for both a UK teenager on
  an iPhone and an Indian student on a low-end Android on patchy mobile data.

---

## 2. Tech and constraints the design must respect

- Web app: React + TypeScript + Vite, CSS Modules, design tokens in CSS
  custom properties. Served under `/app/`. Installable PWA with an offline
  banner and offline flashcard review.
- **Every visual decision must be expressible as tokens.** Hand back a token
  table that maps cleanly onto CSS variables (colour, type, space, radius,
  shadow, motion, z-index).
- **Theming is a real feature students use.** Light and dark mode, plus
  accent presets: default (deep teal `#0f766e`), original, minimal,
  monochrome, ocean, breeze, forest, hacker (bright green), lavender,
  cyberpunk, ruby, warm, sunset, and a custom theme studio. Your system must
  stay AA-accessible under every preset. Use separate tokens for an accent
  used as a *fill* (≥3:1 against its surroundings) and as *text* (≥4.5:1),
  and do the same for success/warning/danger. The current code already
  splits `--accent` / `--accent-text` and `--success` / `--success-text` for
  exactly this reason; keep that split.
- Current visual language (you may evolve or replace it, but justify the
  change): warm paper background `#f7f5f0`, white surfaces, deep teal accent,
  serif display headings (Newsreader), sans body, Instrument Sans for
  numbers, JetBrains Mono for code, soft low shadows, a little glass blur.
  A previous redesign deliberately **flattened all gradient buttons** because
  "a gradient-filled primary button is the single most legible generated-UI
  tell". Do not bring back decorative gradients, glows or glassmorphism for
  their own sake.
- Accessibility floor (tested in CI today, so non-negotiable): WCAG 2.2 AA
  contrast in light *and* dark, visible focus rings everywhere, touch
  targets ≥44×44 px, full keyboard operation, screen-reader labels on every
  icon button, `prefers-reduced-motion` respected.
- Layout: desktop has a left sidebar; mobile has a bottom tab bar with a
  floating "Ask the tutor" button. A command palette (⌘K) exists. A tutor
  chat opens as a right-hand drawer on desktop.
- Performance: screens load lazily behind skeletons. Design skeleton states
  that match each screen's real shape. No layout jump when data arrives.

---

## 3. The current product: information architecture and screens

### 3.1 Primary navigation (5 destinations)

| Tab | Route | What lives there |
|---|---|---|
| **Today** | `/` | Hero card with "your next step" (e.g. "Fix this · 8 min", "Practise · 5 min", "A mixed check", "Pick up where you left off", "I have longer"), a prediction line, today's plan, a mistake-loop section, a session-complete panel, a right rail. "Rebalance" action. |
| **Library** | `/library`, `/library/:tab` | Tabs: folders/subjects, materials (notes, uploads), flashcard decks, quizzes, notebooks. Search. Subject detail page `/folders/:id`. Notes editor `/notes/:id` (rich text). Notebook studio `/notebooks/:id` with web-source import. |
| **Study** | `/study` | "Choose how to study", framed by how the student feels: "I don't get it yet" (step-by-step teach), "I want to reason it out" (Socratic, with hints; oral practice with mic), "I want to solve problems" (mixed practice with confidence rating; timed exam traps), "I think I understand it" (explain it to someone new / Feynman), "I want to keep it from fading" (due flashcards, ~10 min). Input: "A topic, a question you got wrong, a line from your notes". Starts a session at `/study/:sessionId` in one of five modes: Teach, Explain, Socratic, Practice, Recall. |
| **Plan** | `/plan` | The study plan. Children: Availability (`/my-week`, "Life Sync": when you're free and when you're sharpest), Tasks (`/tasks`), Exams (`/exams`, exam detail, a placement check), Focus timer (`/timer`). |
| **Progress** | `/analytics` | Study heatmap, retention insights, fading topics. Child: Trajectory (`/trajectory`, Pro): projection to exam day, mastery ladder per topic (Seen → Recalled → Applied → Explained), confidence bands, a "drift" counterfactual (what happens if you stop). |

Also reachable: quiz runner `/quiz/:id`, mock exam `/quiz/:id/mock-exam`,
quiz review `/quiz/:id/review`, flashcard review `/review/:deckId`, deck
editor `/decks/:id`, Feynman debrief, friends `/friends` and invite links,
study rooms `/room/:id`, achievements, Settings (account, appearance with
theme studio, preferences, notifications, privacy, security, billing with an
AI usage meter, danger zone), Help centre, Welcome-to-Pro, and public auth
pages (login, signup, forgot/reset password, verify email, terms, privacy).
Marketing pages: landing, about, contact, developers.

### 3.2 Onboarding today

1. Sign up → verify email.
2. **Study profile wizard**: exam or board ("Syllabus built in" / "Supported"
   / "My board isn't listed" / "Any subject, in your words"), confidence per
   subject (Not confident / Getting there / Confident), session length
   (Short bursts / A focused block / Long, deep sessions), current habits
   (Re-reading notes, Flashcards, Past papers, Practice questions, Making
   notes, Worked examples, Talking it through), style (Practice first /
   Scheduled), device context (Shared computer), → "Plan for the next seven
   days" → "Save and open my plan".
3. **Welcome screen**: tutor voice ("Straight to the point" / "Explain it
   fully"), create a first subject ("Create it and finish" / "Finish without
   one"), a "Where to start" list that points to Settings ▸ Preferences,
   Dashboard ▸ Customize, Plan ▸ Availability, Plan ▸ Exams.

### 3.3 Learning components inside sessions and quizzes

Confidence picker (rate how sure you are before seeing the answer), hint
ladder panel, mastery ladder, misconception repair card, trap callout,
wrong-answer note ("why your answer was wrong"), explain-my-mistake, step
plan, tutor turn / student turn chat bubbles, numeric answer input, source
attribution (which of your notes this came from), report-a-problem on a
question, AI error card, "Pending" state while the AI works.

### 3.4 Known problems (from the team's own audit)

Treat these as hypotheses to confirm or reject in your baseline walkthrough:

- **Too many destinations for the user base.** ~34 view areas. Five separate
  tools all diagnose wrong beliefs in different ways (Debugger, Feynman,
  Sparring, Pre-mortem, Exam Detective). Students can't tell them apart.
- **Several independent "what should I do next" engines** feed different
  screens, so advice can contradict itself between Today, Plan and Progress.
  The UI should present **one** next step, everywhere.
- **The mistake loop rarely completes.** 33 misconceptions logged, 0
  resolved in production. The delayed retest may be invisible or
  high-friction. Making "come back in 2 days and prove it's fixed" feel
  satisfying is a top design opportunity.
- **Very few quizzes are taken** (single digits, all time). Practice must be
  one tap from anywhere and start instantly (from the question bank) while
  AI-generated questions load.
- **Slow AI.** Quiz generation can take ~25 s. Never show a spinner with
  nothing to do.
- **Onboarding promises boards the content doesn't fully cover** (e.g. CBSE
  is offered, but there is no CBSE syllabus behind it yet). Design honest
  "partially supported" states.
- **Mastery labels can over-claim** ("Applied" after five correct MCQs).
  Labels and progress visuals must not promise more than the evidence shows.
- Welcome screen sends people into Settings menus by path ("Settings ▸
  Preferences"), which is a symptom of setup being scattered.

---

## 4. What "stress-free" means here (design principles)

Use these as acceptance criteria. Every screen in your final package should
cite which principles it serves.

1. **One obvious next step.** Every screen has at most one primary action.
   Today answers "what now?" in one sentence plus one button, with a time
   cost ("8 min").
2. **Time-boxed, never open-ended.** Every activity states how long it
   takes and can be stopped at any point without losing progress ("Save and
   stop — you did 4 of 6, that counts").
3. **No guilt mechanics.** No broken-streak shaming, no red overdue counts
   piling up, no "you're behind". After a missed week, the app greets you,
   quietly re-plans, and offers the smallest possible restart.
4. **Honest, not flattering, not scary.** Readiness is shown with
   uncertainty and a reason, framed as "what to do about it", never a bare
   percentage. "Untested" looks neutral, not red.
5. **Mistakes are useful, not punishing.** Wrong answers get warm,
   specific, short feedback. The misconception ledger is framed as "things
   you've fixed / things you're fixing", a trophy case of corrected beliefs.
6. **Calm visual density.** Generous whitespace, few colours at once, one
   accent, semantic colours only where they carry meaning, no badges for the
   sake of badges, no notification-dot anxiety.
7. **Progressive disclosure.** Beginners see the core loop (Today → practise
   → fix mistakes → review). Advanced tools (Trajectory, notebooks, study
   rooms, Feynman, exam traps) appear when they're relevant or when asked
   for, not all at once.
8. **Waiting is productive.** While AI works, show progress honestly and
   offer something to do (a due flashcard, a bank question).
9. **Readable for everyone.** Short sentences, plain words a 13-year-old
   knows, dyslexia-friendly reading mode, no walls of text, maths and
   diagrams rendered cleanly.
10. **Respect for the student's wallet and privacy.** Limits are visible
    before you hit them, never mid-task; free tier never feels crippled;
    consent is clear and one-time.

---

## 5. The persona panel

Test with all of these. Give each a face-free avatar (initial + colour) and
keep them consistent through the whole package. For each, note device,
context, goals, fears, and their "quit trigger" — the moment they would close
the app for good.

1. **Aarav, 15, CBSE Class 10, Pune.** Low-end Android, 5.5" screen, patchy
   4G, shares the phone with a sibling in the evening. Board exam in 4 months,
   parents watching marks closely. Needs numeric and competency-style
   questions, NCERT language. Quit trigger: slow loads, data-heavy pages, or
   realising his syllabus isn't really there.
2. **Maya, 16, UK GCSE (AQA Combined Science + Maths), Leeds.** iPhone, uses
   the app in 10-minute gaps (bus, lunch). Mock exams in 3 weeks. Quit
   trigger: anything that takes more than two taps to start practising.
3. **Jordan, 14, Year 9, ADHD.** Gets distracted easily, skims, abandons long
   explanations, loves visuals and quick wins. (This is the team's existing
   beta-tester persona: "bro what does this even mean".) Quit trigger: a wall
   of text or a setup form.
4. **Sofia, 17, IB Diploma (HL Chemistry, HL Biology), high-achiever with
   exam anxiety.** Laptop, long evening sessions, checks readiness
   obsessively. Quit trigger: a scary readiness number with no explanation;
   being told she's "weak" at a topic she simply hasn't tested yet.
5. **Liam, 15, GCSE, dyslexic.** Uses text-to-speech sometimes, struggles
   with dense paragraphs, serif body text and justified layouts. Quit
   trigger: long questions with no reading aids.
6. **Priya, 16, ICSE Class 10, returning after missing 9 days** (illness).
   Feels behind and guilty. Quit trigger: a dashboard full of overdue
   counts and red.
7. **Sam, 17, A-level student who works part-time.** Very irregular
   availability, studies late at night in dark mode, on the free tier and
   cannot pay. Quit trigger: a paywall mid-session, or the AI quota running
   out without warning.
8. **Noor, 15, blind, screen-reader user (VoiceOver/TalkBack).** Fully
   keyboard/gesture navigation. Quit trigger: unlabeled icon buttons,
   focus traps in modals, charts with no text alternative.
9. **Ben, 13, Year 8, first ever revision app.** Doesn't know what a
   "flashcard deck", "spaced repetition" or "misconception" is. Quit trigger:
   jargon.
10. **A parent (secondary persona), glancing over a child's shoulder.** Wants
    to know "is my kid actually doing work and is it helping?" without it
    becoming surveillance. Only test that the Progress view is legible and
    reassuring to a non-student; do not design a parent account.

---

## 6. Persona testing method

### 6.1 Baseline (current product)

For each persona, walk these journeys through the **current** IA from
section 3 and log friction:

- **J1 First run:** land → sign up → onboarding → first useful action.
- **J2 The 10-minute gap:** open app → study something useful → close,
  in under 10 minutes.
- **J3 Get a question wrong:** answer wrong → understand why → get the
  misconception logged → (2 days later) get retested → see it marked fixed.
- **J4 Stuck mid-question:** use hints without feeling stupid or gaming it.
- **J5 "Am I ready?":** check readiness for the next exam and decide what to
  do.
- **J6 Come back after a break:** reopen after 9 days away.
- **J7 Add my own material:** upload/paste notes → turn them into practice.
- **J8 Hit a limit:** reach the free AI limit, or an AI request fails/stalls.
- **J9 Plan my week:** set availability and exam dates, get a plan, adjust it.
- **J10 Make it mine:** change theme / dark mode / reading preferences.

Friction log format, one row per issue:

| Persona | Journey | Step | What they see | What they think/feel (in their voice) | Severity (blocker / major / minor) | Principle violated | Fix idea |

Then summarise: top 10 issues across all personas, ranked by severity ×
number of personas affected.

### 6.2 Test rounds on your designs

Round 1 after your first full set of screens; Round 2 after iterating.
For each persona × journey, give:

- **Task success** (completed / completed with struggle / failed)
- **Taps or steps** to complete
- **Time-to-first-useful-action** (estimate in seconds)
- **Stress score 1–5** (1 = calm, 5 = would quit), with one sentence in the
  persona's own voice explaining it
- **Comprehension check:** could they explain in their own words what the
  screen wanted them to do?

Show a **persona × journey heatmap** of stress scores for Baseline, Round 1
and Round 2 side by side. Target for the final round: no cell above 2, and
J2 completed in ≤2 taps from app open for every persona.

Be adversarial. Role-play each persona honestly, including impatience,
skimming and misreading. Don't let the designer in you excuse the design.
Where personas conflict (Sofia wants detail, Jordan wants none), resolve it
with progressive disclosure or a preference, and state the trade-off.

---

## 7. Information architecture to propose

Propose a simplified IA. Strong starting hypothesis (challenge it if testing
says otherwise):

- **Today** — one next step, today's short plan, things you're fixing.
- **Practise** (replaces "Study") — one entry point. The student says how
  they feel or what they want ("I don't get it", "test me", "I keep getting
  this wrong", "keep it fresh"), and Learnora picks the mode. Merge the five
  diagnostic tools into this one flow; they become modes, not destinations.
- **Library** — subjects and the student's own material.
- **Plan** — exams, availability, tasks, focus timer in one calm calendar.
- **Progress** — readiness per exam, fixed mistakes, retention; Trajectory
  as a deeper layer.

Social (friends, study rooms) and achievements: keep reachable but out of the
primary nav. Settings: reduce to what students actually change, and move
first-run choices into onboarding so the welcome screen never sends people
into menus.

Deliver: sitemap, nav model (desktop sidebar, mobile tab bar, command
palette, tutor entry point), and a table mapping every current route to its
new home (kept / merged / moved / hidden behind progressive disclosure).

---

## 8. Design system to deliver

- **Principles page** (section 4, in your words, with do/don't examples).
- **Colour:** neutral ramp, one accent ramp, semantic ramps (success,
  warning, danger, info), each with fill/text/soft/on-fill tokens; light
  and dark; proof of AA for every text/background pair; show the system
  under 4 presets (default teal, hacker green, lavender, monochrome).
  Use colour sparingly: red only for genuine errors, never for "untested" or
  "behind".
- **Type:** scale (display, headings, body, small, numeric), line heights,
  max line length (~65ch for reading), a **reading mode** (larger, sans,
  more spacing, dyslexia-friendly) toggle. Justify keeping or dropping the
  serif display face.
- **Space, radius, elevation, motion:** tokens with names and values.
  Motion: short, purposeful, with reduced-motion fallbacks.
- **Iconography:** one consistent set, always with text labels in primary
  navigation.
- **Components** (each with states: default, hover, focus, active, disabled,
  loading, error, empty, and mobile/desktop variants): button (primary,
  secondary, ghost, danger), icon button, input, numeric/maths input, select
  and combobox, toggle, chip, badge, card, list row, tabs, segmented
  control, modal/sheet, drawer, toast, inline feedback, skeleton, empty
  state, progress (time-boxed session progress, not a guilt bar), confidence
  picker, hint ladder, question card (MCQ, numeric, short answer), answer
  feedback (correct / wrong + misconception repair / hint-assisted),
  misconception card ("fixing" → "retest due" → "fixed"), mastery/readiness
  indicator with uncertainty, flashcard (front/back, rating), session
  summary, AI-is-working state, AI-failed state, paywall/limit notice,
  consent prompt, offline banner, tutor chat bubbles with source
  attribution.

---

## 9. Screens and flows to design

Mobile (390 px) and desktop (1440 px) for each, light and dark for the
starred ones, plus empty / low-data / loading / error variants where
relevant.

1. ★ **Today** — new user (no data), active user, returning-after-a-break
   user, exam-in-3-days user.
2. **Onboarding** — sign up, board/subject picker with honest support
   levels, a 2-minute placement check (≤12 questions) that ends with "here's
   where you're starting" instead of a score, first plan.
3. ★ **Practise entry** — the single "how are you feeling about it?" chooser.
4. ★ **Question flow** — MCQ, numeric, confidence tap, hint ladder, correct
   feedback, wrong feedback with misconception repair, hint-assisted
   feedback, report a problem.
5. **Session end** — summary that celebrates effort and fixed beliefs, shows
   what's scheduled next, never a harsh score.
6. ★ **Mistake loop** — "things you're fixing" list, retest-due prompt (make
   coming back in 2 days feel like a mini-quest), "fixed" moment.
7. **Flashcard review** — including offline.
8. **Tutor chat** — drawer on desktop, full screen on mobile, with grounding
   in the student's own notes and visible sources.
9. **Library** — subjects, a subject page, add material (upload / paste /
   web source), notes editor in reading mode.
10. **Plan** — week view with availability, exams, tasks; "I missed some
    days" auto-replan; focus timer.
11. ★ **Progress** — readiness per exam with uncertainty and the reason
    behind it, fixed mistakes, retention/fading topics, a parent-legible
    summary; Trajectory as a drill-down.
12. **AI waiting and failure** — 25-second quiz generation with something
    useful to do meanwhile; provider failure with a calm fallback to bank
    questions.
13. **Limits and upgrade** — usage meter, approaching-limit notice, limit
    reached (between tasks, never mid-question), plan comparison (Free /
    Plus / Pro) that makes free feel complete.
14. **Settings** — slimmed down; appearance with theme presets, dark mode,
    reading mode, reduced motion.
15. **Auth pages and landing page hero** — consistent with the new system.

For each screen: annotate the primary action, which principles it serves,
and which persona findings drove its design.

---

## 10. Final deliverables

1. **Baseline friction log** and top-10 issues (section 6.1).
2. **Principles + IA** with the route mapping table (sections 4, 7).
3. **Design system** with full token table ready to drop into CSS custom
   properties, and component sheet (section 8).
4. **Screens and flows** (section 9), clickable prototype for J1, J2, J3
   and J6 at minimum.
5. **Persona test report:** Round 1 and Round 2 results, the stress
   heatmaps (Baseline / R1 / R2), what changed between rounds and why, and
   any open trade-offs.
6. **Implementation notes for engineers:** which existing components to
   restyle vs replace (Button, Card, Chip, Modal, PageHeader, Sidebar,
   MobileTabBar, EmptyState, Skeleton, InlineFeedback, HintLadder,
   ConfidencePicker, MasteryLadder, MisconceptionRepair, WrongAnswerNote,
   PaywallModal, TurboChat, CommandPalette), a suggested rollout order that
   ships value early (start with Today + question flow + mistake loop), and
   anything that needs a product or backend change rather than just UI.
7. **A one-page summary** a non-designer can read in two minutes.

### Rules

- Don't invent features the product doesn't have and pass them off as
  existing. If you propose something new (e.g. placement check, reading
  mode, auto-replan), label it **NEW** and keep it small.
- Don't invent data. Use realistic but obviously sample content (GCSE
  biology "osmosis", CBSE physics "Ohm's law", IB chemistry "le Chatelier"),
  and show low-data states honestly.
- Write all UI copy yourself, in plain, warm, short British-English
  sentences a 13-year-old understands. No exclamation-mark hype, no
  "Awesome job!!", no emoji confetti.
- Keep every decision traceable to a principle or a persona finding.
