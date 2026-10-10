# Handoff: Learnora redesign (Today, Session modes, Test & Results, Onboarding/Upload, States, Design system)

Target repo: `kkchinthalapati/learnora`, branch `main`, app in `webapp/` (Vite + React + TS, CSS Modules + CSS custom properties, no component library).

## Overview
Learnora currently exposes about 20 top-level destinations: Today, Dashboard, Library, Plan, Availability, Tasks, Exams, Focus timer, Progress, Trajectory, Study tools, Solver, Feynman, Viva, Exam Detective, Room, Friends, Settings and others. This redesign regroups them around one idea: **every visit is a session with a goal, and every session ends with evidence of learning.** It changes:
1. **Navigation:** reduced to 5 destinations.
2. **Today:** rebuilt around a single next step.
3. **Study tools:** merged into one **Session** screen with 5 modes.
4. **Test runner and results:** confidence ratings, and results grouped by misconception.
5. **Onboarding:** value first (one question → 3-minute lesson → win → 2 settings).
6. **Upload:** visible processing pipeline.
7. **States:** full empty, loading and error states.
8. **Tokens:** one new semantic accent (recall ochre).

## About the design files
The files in `designs/` are **design references built in HTML**. They are prototypes that show the intended look and behaviour, not production code to copy. Recreate them in the existing `webapp/` React + CSS Modules codebase, using its patterns: `Button`, `Chip`, `Card`, `EmptyState`, `Skeleton`, `Modal`, `Icon` (from `components/icons.tsx`), `tokens.css`/`themes.css`, and `text.module.css` roles. Do **not** port the inline styles verbatim. Map every literal onto a token (existing or new, listed below).

To view the references, open any `designs/*.dc.html` in a browser with `support.js` alongside it. `Learnora Redesign.dc.html` is the index. Each screen file shows the artboard (1280×800–840) with a rationale column beside it, and uses tabs/segmented controls to switch states.

## Fidelity
**High fidelity** for colour, type, spacing, hierarchy and copy. Exact hex values and sizes are given below. The artboards are fixed-width desktop layouts (1280px, including the 248px sidebar). Responsive behaviour is described under "Responsive" and is not drawn.

---

## Global changes

### Navigation (`components/Sidebar.tsx`, `Header.tsx`, `MobileTabBar.tsx`, `routes.tsx`)
Reference: `designs/LearnoraSidebar.dc.html`.

- Sidebar width 248px (`--sidebar-width-v2`), bg `#f0ece3`, right border `1px #e2ddd1`, padding 20px 14px, vertical gap 20px.
- Order from top:
  1. **Brand row:** 30×30 teal mark (`#0f766e`, radius 5, Newsreader 600 19px "L"), then "Learnora" (Newsreader 600 22px, -0.015em).
  2. **Search trigger:** full width, 40px tall, bg `#fbfaf7`, border `#e2ddd1`, radius 8, 13px `#625c50` "Search or jump to…", plus a ⌘K kbd (JetBrains Mono 11px). It opens the existing command palette. The **Create button is removed from the sidebar**; Create moves to Library, and the command palette gets a "New…" entry.
  3. **Primary nav (5 items):** Today (`dashboard` icon), Library (`layers`), Study (`target`), Plan (`calendar`), Progress (`activity`). Each row is 40px tall, padding 0 10px, radius 8, gap 12, Instrument Sans 600 14px `#3d3830`, icon 18px. Active state: bg `#e1ece9` plus an inset 3px left bar `#0f766e`. Keep the existing `aria-current` logic.
  4. A 1px divider (`#e2ddd1`), then **"Ask the tutor"**: `sparkles` icon, text `#0b5c55` 600 14px, hover bg `#e1ece9`, kbd hint **⌘J**. It opens the existing chat drawer (`ChatProvider` → `chat.open()`). This replaces the header "Ask AI" button.
  5. A flex spacer, then an optional **"Session paused" card**: border `#cfe0dc`, bg `#fbfaf7`, radius 8, padding 12. It has a mono 11px caps label `#0b5c55`, a 13px 600 topic, and a 12px `#625c50` "Step 3 of 5 · 12 min left". It shows only when a session is paused, and clicking it resumes.
  6. Footer: "Study room & friends" (one item, `users` icon, 13px 500 `#625c50`), then an avatar row (28px circle `#d8d2c4` with initials, name 13px 600, and "Settings" 12px). Settings, Terms and Log out move into the avatar menu / Settings.
- **Route mapping (keep old URLs as redirects):**
  - Today ← `/`, `/dashboard`
  - Library ← `/library/*`, `/folders/:id`, `/notes/:id`, `/notebooks/*`, `/decks/:id`
  - Study ← `/study`, `/solver`, `/feynman*`, `/viva*`, `/exam-detective`. All of these open the Session screen with a mode query (see below).
  - Plan ← `/plan`, `/my-week`, `/tasks`, `/exams`, `/timer`. The timer becomes a session option.
  - Progress ← `/analytics`, `/trajectory`, misconception ledger, achievements
- The header loses Ask AI and the theme toggle (theme moves to Settings → Appearance). The page title stays with the view.
- Mobile (≤768px): the 5 items go in `MobileTabBar`, and Ask becomes a floating 56px teal button, bottom-right, above the tab bar clearance.

### New / changed tokens (`styles/tokens.css`, `themes.css`)
Add these in the webapp-only "Revamp additions" block. This keeps the parity test in `tokens.test.ts` passing.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--recall` | `#b8862e` | `#e0b25c` | Memory/time-sensitive fills: due, fading, guessed |
| `--recall-text` | `#76511b` | `#e0b25c` | Recall as text (≥4.5:1) |
| `--recall-soft` | `#f6ecd9` | `rgba(224,178,92,0.14)` | Trap callouts, warnings about memory |
| `--paper` | `#fbfaf7` | `#1a1915` | Test-room / drawer / top-bar surface |
| `--sidebar-bg` | `#f0ece3` | (existing surface-2) | Sidebar |
| `--hairline` | `#e2ddd1` | `rgba(240,236,228,0.1)` | In-flow dividers and card borders |
| `--hairline-strong` | `#d5cfc2` | `rgba(240,236,228,0.16)` | Control borders |
| `--accent-wash` | `#e1ece9` | `rgba(94,184,173,0.14)` | Active nav, selected option, "Quick answer" chip |
| `--accent-ink` (text) | `#0b5c55` | `#5eb8ad` | Teal as label text |

Existing tokens used as-is: `--bg #f7f5f0`, `--surface #fff`, `--text #1a1815`, `--text-muted #625c50`, `--text-faint #78715f`, `--accent #0f766e`, `--accent-hover #0c5f59`, `--success #1e8e6b` / `--success-text #15634b`, `--danger #c2453a` / `--danger-text #96352d`, `--r-sm 5`, `--r-md 8`, `--r-lg 12`, `--shadow-lg`. Also used: secondary body text `#3d3830`, which should become a new `--text-secondary`.

**Colour rules:**
- Teal is used only for actions, with one filled teal button per screen.
- Ochre is used only for memory work.
- Green and red are used only for verified-correct and wrong answers. Each is always paired with ✓ or ✕ or a text label.
- In-flow cards have no shadow; a hairline border is enough. `--shadow-lg` is used only for drawers, popovers and the artboard.

### Typography
- **Display:** Newsreader 500, 52px/1.02, -0.025em. Today headline, results headline, onboarding.
- **Page title:** Newsreader 500, 36/1.1, -0.02em.
- **Claim / section:** Newsreader 500, 28/1.15, -0.015em. Tutor step headings, card titles (24–30px).
- **Teaching prose:** Source Serif 4, 17/1.65, max 62ch. This is the existing `--font-read`. Use it for all tutor explanations.
- **Body/UI:** Instrument Sans 400, 15/1.55.
- **Label/button:** Instrument Sans 600, 14.
- **Caption:** 12–13px, `#625c50`, or `#78715f` for the least important.
- **Meta label:** JetBrains Mono 11–12px, uppercase, +0.06em. Examples: "STEP 3 · EXPLAIN", "BIOLOGY MIDTERM PRACTICE · 11 OF 16". Add JetBrains Mono to the font imports; it's already referenced for the mono font setting.
- The accessibility font override (`body[data-font-family]`) must continue to override all of these.

### Spacing
4px base, using the existing `--s-*`. Page padding 40px 48px. Two-column main + right rail with a 48px gap; the rail is 300px. Section gap inside a column is 32–36px. Cards have padding 24 (or 20 for compact).

### Radius
5 for chips/segments, 8 for buttons/inputs, 12 for containers, pill for chips only.

### Motion
- 140ms for state changes (hover, select) and 260ms for spatial changes (drawer slide, step advance), both using the existing `--ease cubic-bezier(.16,1,.3,1)`. No spring or bounce (don't use `--ease-spring` in the new work).
- There is one celebration: when a mastery step is gained, the ladder segment fills left-to-right over 400ms.
- The streaming cursor is a 7×15 teal block with an opacity pulse of 1s.
- Everything goes inside `prefers-reduced-motion`.

### Buttons (`components/Button.module.css`)
- **Primary:** flat `#0f766e` (remove the 135° gradient and the sheen), white 600 14–15px, height 44–48px, radius 8. Hover `#0c5f59`. Focus: 2px outline `#0f766e`, offset 2. Loading: inline spinner plus a verb ("Saving"). Disabled: bg `#d9d4c9`, text `#78715f`.
- **Secondary:** white, border `#d5cfc2`. Hover bg `#f0ede5`, border `#9cc6c0`.
- **Quiet (= ghost):** text `#625c50`, hover bg `#ece8df`.
- **Destructive:** text `#96352d`, hover bg `#f7e6e3`. Always two-step: an inline confirm naming what will be lost ("Delete 3 sessions and 42 cards?"), followed by a 10s undo toast. The existing `useDeferredDelete` supports this.

### New shared components
- **MasteryLadder:** four equal segments (height 6–8, gap 3–4, radius 1–2) labelled Seen / Recalled / Applied / Explained.
  - A filled segment is `#0f766e`; an empty one is `#e2ddd1`.
  - If the topic is fading, the highest reached segment is `--recall` instead.
  - The level text sits at the right, 12px `#625c50` (e.g. "Applied · fading").
  - Mastery moves only on checks, never on time spent. Map it from `lib/trajectory` `masteryLevel()` and the FSRS state.
- **TutorTurn:** padding-left 14–18, 2px left border `#0f766e`, Source Serif 4 16–17px. Optional parts: a mono meta label on top, a Newsreader claim heading, prose of up to 3 sentences, a structured block (steps grid / table), a TrapCallout, a "Go deeper" `<details>`, and a check at the end.
- **StudentTurn:** bg `#1a1815`, text `#f7f5f0`, radius 12 12 2 12, padding 10–12 × 14–16, 14–15px, right-aligned, max-width 70–85%.
- **TrapCallout:** bg `--recall-soft`, radius 6, padding 12×14. Bold label "Common trap" in `--recall-text` 13px 700, then 14px body text.
- **HintLadder:** a row of pill chips (32px tall, border `#d5cfc2`): "Nudge", "Bigger hint", "Show me, then quiz me", preceded by "Stuck?" 600 13px.
- **ConfidencePicker:** three 32px segments, "Guess" / "Fairly sure" / "Certain". Selected: border teal, bg `--accent-wash`, 600. Optional, and labelled as optional.
- **StepPlan:** a vertical list of 18px circles. Done: filled teal with ✓. Current: teal ring with row bg `--accent-wash` and 600 text. Upcoming: ring `#cfc8b9`, text muted.

---

## Screens

### 01 Today (`designs/Learnora Today.dc.html`) → `views/today/TodayView.tsx`, `TodayHero.tsx`
- **Purpose:** answer "what should I do now?" with one button.
- **Layout:** sidebar, then main (padding 40 48) as a grid of `minmax(0,1fr) 300px` with a 48px gap.
- **Left column:**
  - Mono meta line: "Wed 30 Sep · Biology midterm in 14 days".
  - Display headline, max 14–16ch.
  - A **next-step card**: bg white, border `#e2ddd1`, radius 12, padding 24, grid `1fr auto` aligned to the end. Contents:
    - mono label (mode · subject)
    - Newsreader 28 topic
    - 5-segment session progress (44×4 each)
    - a 15px muted reason
    - a primary 48px button, with a caption under it: "Your notes and chat are saved"
  - Then **"Also worth doing today"**: up to 3 rows. Each row is 56px tall, top/bottom hairlines, and a grid of `10px 1fr auto auto` holding:
    - an 8px dot (ochre for recall items, muted for tasks)
    - the label (15 500)
    - a mono time estimate
    - a teal 600 text action
  - These are rows, not cards.
- **Right rail:**
  - "Biology midterm": a MasteryLadder for each topic (5 shown), plus the caption "Seen → Recalled → Applied → Explained. Each step needs evidence from a check, not time spent."
  - "This week": 7 × 26px squares. A study day is teal, today has a teal outline, others are `#ece8df`. Then "4 study days so far. Your goal is 5."
  - **No streak counter.** This replaces the daily streak with a weekly study-day goal (experimental; A/B test it).
- **Scenarios, chosen by the existing `chooseNextStep` / trajectory logic:**
  1. **Returning** (an unfinished session exists)
     - Headline: "Pick up where you left off, {firstName}."
     - Card: "Resume · 12 min left". The reason names the step and the misconception being watched.
  2. **Short on time** (the student picks 10 minutes, or it's inferred)
     - Headline: "Ten minutes is enough to keep things from fading."
     - Card: a mixed recall session with an ochre label.
     - A link to resume the unfinished session instead.
  3. **After a rough test** (a recent quiz with misconceptions)
     - Headline: "Yesterday's test showed us two things to fix."
     - A numbered list (01/02) inside one card. Each row has a title, a one-line diagnosis and an action ("Fix this · 8 min" primary for the first, secondary for the second).
     - Footer line: "You got 11 of 16 right. Glycolysis and the Krebs cycle held up." with a link to the results.
  - **Empty:** no exam/material → the onboarding card. **All done** → "You're clear for today." plus one optional stretch link.
- **Ask drawer:** right side, 420px, bg `#fbfaf7`, left border `#d5cfc2`, shadow `-16px 0 40px -16px rgba(24,20,14,.2)`, with a scrim `rgba(26,24,21,.12)` over the content.
  - **Header:** "Ask" (Newsreader 20) with a context line: "Knows you're on Today · Biology midterm".
  - **Thread:**
    - Student bubble.
    - Tutor turn that asks for a guess first: "Before I answer: what happens to the electrons…?"
    - Caption: "A guess is fine. Answering first makes the explanation stick better."
    - Chips: "I'm not sure, give me a hint" / "Just explain it". The student can always skip ahead.
    - A dashed source row: "Will use: Bio ch. 9 notes (PDF, p. 12–18)".
  - **Composer:**
    - Chips "Quick answer" (active) and "Open as session". The second promotes the chat into a Session.
    - Input 48px, focus ring `0 0 0 3px rgba(15,118,110,.18)`.
    - Send is a 36px teal square with the `send` icon.
  - Esc closes the drawer; ⌘J toggles it.

### 02 Session + modes (`designs/Learnora Session.dc.html`) → new `views/session/SessionView.tsx`
It absorbs `CognitiveDebuggerView` (Solver), `FeynmanStudioView`, `SocraticSparringView` (Viva) and the Exam Detective sprint. Route: `/study/:sessionId?mode=explain|socratic|practice|teach|recall`. `/study` with no id shows the existing StudyLab mode picker, restyled to match.

- **Chrome:** no sidebar (focus mode).
- **Top bar:** 64px, bg `#fbfaf7`, bottom hairline.
  - **Left:** "Save & leave" (quiet, `x` icon). It autosaves and returns to Today.
  - **Title block:** Newsreader 19 objective, plus a 12px muted "Goal: explain how the proton gradient makes ATP · from Bio ch. 9 notes".
  - **Right:** mode segmented control. Container `#ece8df`, padding 3, radius 8. Segments are 34px, 13px 600, and the selected one is white with `shadow-sm`. Labels: Explain / Socratic / Practice / Teach / Recall.
- **Body:** grid of `260px 1fr`.
  - **Left panel** (padding 24, right hairline):
    - "PLAN · 5 STEPS" with a StepPlan.
    - "WATCHING FOR" with the misconception from the ledger ("ATP synthase placed in the outer membrane. You did this on 12 Sep.").
    - At the bottom: "Grounded in: [source link]" and "Autosaved 14:02".
  - **Centre column:** max 820px, padding 32 56.
  - **Bottom composer:** top hairline, bg `#fbfaf7`.
    - Input 52px with mic and send buttons. The placeholder is per mode.
    - A row of quiet actions: Simpler · Example · Skip step, plus "Something wrong? Flag this answer" on the right.
- **Mode-specific centre content**, all within the same shell:
  - **Explain:** TutorTurn with the meta label "Step 3 · Explain" and a claim heading ("The chain pumps protons. ATP synthase lets them back."). Then:
    - A 3-column steps grid (bordered, mono labels "1 · CARRY / 2 · PUMP / 3 · FLOW").
    - TrapCallout.
    - "Go deeper" details.
    - A **check card** (border `#cfe0dc`) with a question and three option buttons (40px, hover border teal).
    - Rule: the tutor never goes more than about 150 words without a check.
  - **Socratic:** a mono label "Question 2 of ~4", a Newsreader 28 question (max 30ch), then the turns alternate. The HintLadder is always visible. Viva = Socratic with voice input on by default.
  - **Practice:** a mono label "Problem 3 of 6 · mixed with Krebs cycle" and "No timer" on the right, a Source Serif 19 problem, and a 120px min answer box. Then "Check my answer" (primary), "Hint (costs nothing)" (quiet) and the ConfidencePicker. Problems are interleaved across topics. Exam traps = a Practice preset with a timer.
  - **Teach (Feynman):**
    - A persona card (40px circle `#ece3d0` with Newsreader initial `#76511b`, name 13 600, 14px description). Personas are shown as initials, not emoji.
    - Student explains, then persona questions.
    - A **gap chips** row: "Skipped: proton gradient" (ochre soft) and "Covered: electron carriers" (teal wash).
  - **Recall:** centred.
    - Mono counter "7 / 18 · mixed".
    - Card 560px wide, min 240px tall, radius 12, centred text. It has an ochre topic label, a Newsreader 28 prompt, and "Say it or type it before revealing."
    - Three 48×130 buttons: Forgot / Hard / Got it, mapped to FSRS ratings.
    - Keys 1·2·3 rate the card and Space reveals it.
- **States:**
  - Streaming: the teal block cursor, a "Stop" secondary button and a "Reading Bio ch. 9, p. 14" caption.
  - AI failure: shown inline in the thread (see States).
  - Leaving mid-session keeps the plan and position, and the sidebar then shows the "Session paused" card.

### 03 Test & Results (`designs/Learnora Test & Results.dc.html`) → `views/quiz/QuizRunner.tsx`, `MockExamRunner.tsx`, `QuizReview.tsx`
- **Test runner:** full screen, no sidebar or drawer, bg `#fbfaf7`.
  - **Top bar:** 60px.
    - Title (Newsreader 19) plus "16 questions · closed book".
    - Right side: a mono timer ("23:41 left"), "Hide timer" (secondary sm) and "Pause & save".
  - **Question navigator:** 36×36 squares, mono 12px, radius 6.
    - Answered: bg `#e1ece9`, border `#9cc6c0`, text `#0b5c55`.
    - Current: border `#1a1815` 1.5px.
    - Unanswered: white with border `#e2ddd1`.
    - Flagged: a 9px ochre dot at the top-right.
    - Summary on the right: "9 answered · 1 flagged · 6 to go".
  - **Question:** a centred 680px column.
    - Mono "QUESTION 10 OF 16" and a "Flag for review" button (`--recall-text`).
    - Source Serif 21/1.5 stem.
    - Options are 56px rows, grid `28px 1fr`, with a 26px key badge A–D. Selected: border teal 1.5px, bg `#eef5f3`, badge filled teal.
    - ConfidencePicker (optional).
  - **Footer:** 72px.
    - "← Previous" (secondary) and "Saved on this device and in your account".
    - Right side: "Submit test…" (quiet) and "Next →" (primary).
  - **Keyboard:** A–D select, ←/→ navigate, F flags.
  - **Edge cases:**
    - Submitting with blanks → an inline list of the unanswered questions, not a modal.
    - Offline → a persistent dark bar. Answers are saved locally and Submit is disabled until reconnected.
    - Timer ends → auto-submit.
  - `useQuizDraft` / `attemptKey` already provide persistence and idempotency.
- **Results:** sidebar plus main (`1fr 300px`).
  - Mono meta "BIOLOGY MIDTERM PRACTICE · 11 OF 16". The score is **a caption, not a hero**.
  - Display 44px headline stating the finding: "Energy yield is solid. One idea about membranes is costing you marks."
  - **"Confident but wrong" card:**
    - Label `--danger-text` 13 600, plus "Q4, Q9, Q13".
    - Source Serif 17 diagnosis.
    - Primary "Fix it · 8 min Socratic" (opens a Session in Socratic mode, pre-filled via `CognitiveBridge`) and secondary "Review the 3 questions".
    - The grouping comes from `misconceptions` / the ledger.
  - **"By concept" rows:** 52px, grid `1fr 140px 150px`.
    - Concept name.
    - Per-question 18px squares: green = correct, ochre = correct but guessed, red with ✕ = wrong.
    - A status note in the matching text colour (Secure / 1 lucky guess / Misconception / Misread column).
  - **Rail:**
    - "Mastery changes" (e.g. Krebs "Applied → Explained" in `--success-text`).
    - "Compared with last attempt" ("8 → 11 correct. Your guesses dropped from 6 to 2…").
    - "Scheduled for you" (flashcards on Friday, re-test on Monday) with a "Change plan" link.
  - **All correct:** "Nothing to fix. Next re-test in 9 days."

### 04 Onboarding & Upload (`designs/Learnora Upload & Onboarding.dc.html`) → `views/onboarding/WelcomeView.tsx`, `components/create/*`
- **Shell:** no sidebar. A 64px top row holds the brand and a 3-step progress indicator (28×4 bars).
- **Step 1, "What are you studying right now?"** Two columns, 64px gap, padding 48 96.
  - **Left:**
    - Display 56px headline.
    - 17px muted sub: "Give us one topic, or drop in your notes. You'll get a short lesson built from your material in about a minute."
    - A 56px focused input with an inline "Start" button.
    - Example chips: "Or try: Quadratic equations / Causes of WW1 / Supply & demand".
  - **Right:** a 420px drop zone, 1.5px dashed border `#b9b1a1`, radius 12, faint diagonal stripe background, `upload-cloud` icon.
    - Text: "Drop notes, slides or a worksheet" and "PDF, images or docs, up to 200 pages. Only you can see them, and you can delete them at any time."
  - **No account or preference questions before the first lesson.** This reverses the current wizard, which creates a subject and exam first.
- **Step 2, first lesson (about 3 minutes):**
  - Mono label, then a TutorTurn asking for a guess ("Quick one first: where do you think the cell gets most of its ATP?") and "No penalty for guessing. It tells us where to start."
  - Result rows: "✕ Your guess" (bg `#fbf0ee`, border red) and "✓ Answer" (bg `#eef6f2`, border green).
  - A Source Serif explanation that treats the wrong guess as normal.
  - "Show me how →".
- **Step 3, small win:**
  - Mono label "4 MINUTES · FIRST CHECK PASSED" in `--success-text`.
  - Headline "You can now explain where most ATP comes from."
  - A MasteryLadder moving Seen → Recalled (animated once).
  - "We'll ask you this again in 2 days…"
  - **Right card (380px):** "Two questions so we can plan with you". Exam date input, a session-length segmented control (10 min / 25 min / 1 hr+), primary "Save and see my plan" → Today, and a "skip for now" link.
- **Upload processing:** grid `1fr 420px`.
  - **Left:**
    - Filename (Newsreader 34) plus a meta caption.
    - A 6-column page thumbnail grid (3:4 aspect, radius 4, mono tags "read" / "unreadable" / "…").
    - An ochre notice: "Couldn't read p.11 … Replace this page or continue without it."
  - **Right:**
    - "WHAT LEARNORA IS DOING", a pipeline StepPlan: Reading text ✓ → Finding topics ✓ → Writing recall questions (in progress, "32 of about 50 · you can start now") → Linking to your exam.
    - "Found 6 topics" as editable chips, and "Filed under Biology · change".
    - A full-width primary "Start learning from this". Learning starts before processing finishes: "Flashcards will finish building in the background."
    - Uses `material_processing_status` (migration `20260916000000`).
  - **Edge cases:** blank PDF, over 200 pages (range picker), wrong type (ochre drop zone naming the type received), duplicate ("You uploaded this on 12 Sep. Open that one?"), and a processing failure (file kept, safe retry).

### 05 States (`designs/Learnora States.dc.html`)
Each state message answers four things: what happened, what was kept, what to do, and whether retrying is safe.
- **Empty (Library):** "Your notes become lessons, quizzes and flashcards." plus "Add material".
- **Empty (Progress, no weak topics):** "Nothing is fading right now." plus the next due topic and "Challenge me anyway".
- **Empty (Today, all done):** "You're clear for today." plus an optional stretch.
- **Loading (Today):** a Skeleton that reserves the headline, card and caption layout: "Working out your next step…".
- **Tutor streaming:** partial serif text with the teal cursor, "Stop", and a source caption.
- **Generating a test:**
  - Headline "Building 16 questions from 3 topics".
  - Segmented progress.
  - "Questions 1–9 are ready. You can start now, and the rest will arrive before you reach them."
  - "Start test" is enabled early.
- **AI unavailable:** an inline card in the thread.
  - "The tutor didn't answer that one." and "The AI service is busy. Your message is saved below, so nothing was lost, and retrying won't send it twice."
  - "Try again" and "Switch to flashcards meanwhile".
- **Offline in a test:** a dark bar `#1a1815` with an ochre dot: "You're offline. Answers are being saved on this device. Submit will be available again once you reconnect." Extend `OfflineBanner`.
- **Upload failed:**
  - Card border `#e0c28e`: "We couldn't find any text in Scan_004.pdf".
  - Actions: "Upload page photos" and "Remove file" (destructive text).
- **Flag an answer:**
  - "Thanks. What looks wrong?" with chips: Contradicts my notes / Factually wrong / Confusing.
  - "The tutor will re-check this against [source] and say whether it was wrong. Nothing you've answered will be marked against you."

### 00 Design system (`designs/Learnora Design System.dc.html`)
Contains the colour roles, type specimens, spacing uses, radius/elevation/motion rules, button state matrix, learning components and the copy rules table. Update `webapp/DESIGN.md` to match.

---

## Interactions & behaviour summary
- ⌘K opens the command palette; ⌘J toggles the Ask drawer.
- In a session: 1/2/3 rate a card, Space reveals it, and Enter sends.
- In a test: A–D select, ←/→ navigate, F flags.
- Autosave everything: session position, the drawer thread, test answers. "Save & leave" never asks for confirmation.
- A drawer chat can be promoted to a session ("Open as session"). This carries the thread and context via `CognitiveBridge`.
- Mastery moves only when checks are passed. A guessed-correct answer does not advance it and is rescheduled.
- The mastery animation plays once per step gained. No confetti.
- Notifications (not drawn) are conservative: only an unfinished session (once, next day), due cards when more than 15 are due, and test results ready. No streak-loss notifications.

## State (new or changed)
- `session`: `{ id, objective, sourceRefs[], mode, plan: Step[], currentStep, watchingFor: misconceptionId?, status: active|paused|done, updatedAt }`. Persist it server-side. The sidebar paused card and Today's "Resume" read from it (see `useContinuity` / `lib/continuity.ts`).
- `answer.confidence: 'guess'|'fairly'|'certain'|null` on quiz attempts. It drives "Confident but wrong" and the ochre "guessed" marks.
- `topicMastery: 0–4` plus a `fading` flag, derived from quiz/FSRS evidence.
- `weeklyGoal: { targetDays, studiedDays[] }` (experimental).
- `drawer: { open, contextRoute, thread }`.
- The upload pipeline stages come from `material_processing_status`.

## Responsive (not drawn)
- **≥1280:** as drawn.
- **1024–1279:** the right rail moves below the main column. The session left panel collapses to a "Plan" popover button in the top bar.
- **768–1023:** the sidebar becomes the 72px rail (the existing `railCollapsed`). The drawer becomes a 100%-height sheet of 420px or 90vw, whichever is smaller.
- **<768:**
  - Bottom tab bar with the 5 items and a floating Ask button.
  - Today stacks into headline → card → rows → mastery.
  - The session mode control becomes a horizontally scrollable segment row under the title.
  - The test runner goes full screen, with the question navigator as a bottom-sheet grid and sticky Prev/Next buttons above the safe area.
  - Controls are at least 44px tall, and inputs at least 16px.

## Priorities
1. **Must have:**
   - The 5-item navigation and redirects
   - Today with a single next step
   - The Session shell with the 5 modes (reusing the existing AI endpoints: `aiFeynman`, `aiSparring`, `aiDebugger`, `aiQuiz`)
   - Error states that say what was preserved
2. **High value:** ConfidencePicker plus results grouped by misconception, the MasteryLadder, and upload pipeline visibility.
3. **Polish:** the recall ochre tokens, the mastery animation, and a copy pass.
4. **Experimental (A/B):** the weekly study-day goal instead of streaks, asking for a guess first by default in the drawer, and the Teach-mode gap chips.

## Assets
- **Icons:** all come from the existing `webapp/src/components/icons.tsx` (`dashboard`, `layers`, `target`, `calendar`, `activity`, `sparkles`, `search`, `users`, `x`, `send`, `mic`, `upload-cloud`, `book-open`). No new icons.
- **Fonts:** Instrument Sans, Newsreader, Source Serif 4 (all already used) and JetBrains Mono (add the import).
- **Images:** none. Page thumbnails are CSS placeholders; use real renders of the PDF pages.

## Research grounding (cite in PR descriptions)
- Bastani et al., PNAS 2025, https://doi.org/10.1073/pnas.2422633122. Unguarded GPT-4 practice hurt later unaided performance, and a hint-based tutor reduced this harm. This is the basis for asking for a guess first and for the hint ladder.
- Rohrer et al., 2020. Interleaved practice: 61% vs 38%, d = 0.83 (IES summary). This is the basis for mixing topics in Practice and Recall.
- Streak and loss-aversion guidance is from industry sources, not peer review. Treat the weekly goal as an experiment.

## Files
- `designs/Learnora Redesign.dc.html`: index, principles, IA map, session loop, priorities, sources
- `designs/Learnora Design System.dc.html`: tokens and components
- `designs/Learnora Today.dc.html`: Today (3 scenarios) and the Ask drawer
- `designs/Learnora Session.dc.html`: Session shell and the 5 modes
- `designs/Learnora Test & Results.dc.html`: test runner and results
- `designs/Learnora Upload & Onboarding.dc.html`: onboarding steps 1–3 and upload processing
- `designs/Learnora States.dc.html`: empty, loading and error states
- `designs/LearnoraSidebar.dc.html`: shared sidebar (imported by Today and Results)
- `designs/support.js`: runtime needed to open the `.dc.html` files in a browser
