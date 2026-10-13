# Handoff: Learnora UI revamp (calm, obvious, stress-free studying)

Target repo: `kkchinthalapati/learnora` → `webapp/` (React + TypeScript + Vite, CSS Modules, tokens in CSS custom properties, served under `/app/`).

## Overview
A full UI revamp of Learnora for students aged 13–18 (UK GCSE, IB sciences, CBSE/ICSE). Goal: a student opens the app, knows within three seconds what to do next, does it, and leaves feeling better. The revamp:
- shows **one next step everywhere** (Today, Practise, Plan, Progress read the same engine),
- starts practice **instantly from bank questions** while AI questions load,
- makes the **mistake loop** visible: mix-up → short re-teach → dated check-back ≥2 days later → "Fixed",
- shows readiness as **ranges with a basis and a next move**, never bare percentages; "untested" is neutral,
- removes guilt mechanics (no overdue counts, auto-replan after a break) and never shows a paywall mid-task.

## About the design files
The files in `design/` are **design references built in HTML** — they show intended look, copy and behaviour. They are **not production code**. Recreate them inside the existing `webapp/` React codebase using its components (`Button`, `Card`, `Chip`, `Modal`, `Sidebar`, `MobileTabBar`, `HintLadder`, etc.), CSS Modules and the token file in this bundle. Do not copy inline styles across; map them to tokens.

Open any `.dc.html` file directly in a browser (keep `support.js` beside them).

## Fidelity
**High-fidelity.** Colours, type, spacing, radii, copy and interaction states are final unless marked as a placeholder (see *Assets and placeholders*). Recreate pixel-accurately with tokens. Copy is final British English; use it verbatim.

## Files
| File | What it is |
|---|---|
| `tokens.css` | **Start here.** All tokens (light, dark, 4 presets, type, space, radius, motion, z). Generated from the design system so values match exactly. Keeps existing names (`--accent`, `--accent-text`, `--success-text`, `--bg`, `--surface`, `--text`, `--text-muted`). |
| `design/Summary.dc.html` | One-page summary + **implementation notes**: restyle/replace table for 20 components, rollout order, backend/product dependencies, CI a11y checks. |
| `design/Screens.dc.html` | Canvas of every screen. Each frame captions its primary action, principles (P1–P10) and the persona findings behind it. Frames tagged **R2** reflect the final iteration. |
| `design/Prototype.dc.html` | Clickable flows J1 (first run), J2 (10-minute gap, mobile + desktop), J3 (wrong → fixed), J6 (back after 9 days). Its logic class is a good reference for state transitions. |
| `design/Design System.dc.html` | Tokens, live AA proof under every preset × mode, type scale, reading mode, all components with states. |
| `design/Research Report.dc.html` | Friction log, principles, IA, **route mapping table** (every current route → new home). |
| `design/Test Report.dc.html` | Persona test rounds; explains why each R2 change exists. |

## Information architecture (unchanged URLs)
Five tabs, always labelled: **Today `/` · Practise `/study` (label changes, URL stays) · Library `/library` · Plan `/plan` · Progress `/analytics` → `/progress`**. Old routes redirect (full table in Research Report §08). Social, rooms, achievements, help → profile menu ▸ More / ⌘K. Settings reduced to 6 sections: You · Look and reading · Study · Reminders · Privacy and data · Plan and usage.

- Desktop: 248 px left sidebar (children only under the active tab); footer "Ask the tutor ⌘J", "Search ⌘K", and on Free one quiet line "Tutor goes today: N of 5".
- Mobile: bottom tab bar (84 px incl. safe area, 11 px labels); floating **"Ask" pill with a text label** (min 44 px), hidden in sessions, sheets and when the keyboard is up.
- Sessions (`/study/:id`) are focus mode: no nav. Top bar = "Save and stop" (only exit), segment progress counted in questions, "Listen" (read-aloud, visible label), reading mode.
- Tutor: 420 px right drawer on desktop (**non-modal**, F6 swaps panes), full screen on mobile.

## Screens (build order = rollout order)

### 1. Today (`/`) — Screens §"Today · 1c"
One card answers "what now?".
- Greeting: display serif, 34 px mobile / 44 px desktop, line-height 1.05. Examples: "Morning, Maya." / "Welcome back, Priya." + sub-line "No catching up needed. Your plan now starts from today."
- Next-step card: `--surface`, 1 px `--line`, radius 20 px, padding 20 px (28 px desktop), `--shadow-1`. Contents top→bottom: eyebrow (13 px/600, `--accent-text`, e.g. "Your next step", "A gentle restart", "Check-back ready") with a **time chip** on the right ("8 min ▾": 32–36 px pill, 1 px `--line-strong`, 13 px/600); title (serif 28 px/1.15); one-line reason (16 px/1.5, `--text-secondary`); primary button full width 52 px, radius 14 px, `--accent` / `--on-accent`, label "Start · 8 min"; optional ghost "Something else".
- Check-back variant: card border 2 px `--accent`, `--shadow-2`, adds a sunk quote box "On Monday you thought / “Salt soaks into cells.”", button "Try it · 1 min".
- Below: a single list card (rows 60 px) e.g. "Later today · 8 cards · Maths ratio · 6 min", "Fixing 2 mix-ups · Next check-back on Thursday". No counts in red, no badges.
- Changing the chip re-sizes the step (engine), never adds a second primary button.
- Empty/new user: "Try 5 questions on cells · Start · 5 min" from bank questions; dashed "Nothing to fix yet" card. **Never** "Add material" as the only step.
- Free tier: if ≤2 tutor goes left, show an inline sunk note "Uses 1 tutor go · 2 left today" + ghost "Use cards instead (free)". Otherwise show nothing.
- Loading: skeleton boxes match the heading, card and list box-for-box (no layout jump).
- Desktop: two columns — card max 680 px; right rail 360 px (Later today, Mix-ups mini-list, note that readiness lives on Progress).

### 2. Question flow (`/study/:id`) — Screens §"Question flow", Prototype J2/J3
- Q1 appears at 0 s from the bank. While AI writes more: sunk status strip "Writing 3 more on osmosis, about 20 s. We’ve started you on AQA questions." Generated questions join the queue silently.
- Meta line 13 px `--text-muted` ("Biology · Osmosis · AQA question bank" / "AI-written, general" badge for partly-ready boards).
- Question 19–20 px/1.45, weight 500, **sans only**. Options: full-width rows ≥54 px, radius 14 px, 1 px `--line-strong`, letter key 28 px square (radius 8). Selected: 2 px `--accent`, `--accent-soft` bg, key filled.
- Bottom bar: ghost "I’m stuck" (left) + "Check" (right, 52 px). Check uses `aria-disabled` until an answer is picked; tapping it then says "Pick an answer first."
- Optional confidence tap (Guessing / Fairly sure / Certain) appears in a sheet between pick and Check; skippable; never red/green.
- Hint ladder (sheet on mobile, 400 px side panel on desktop): rule stated first ("Hints are always fine to use. If you use one, we’ll give you a fresh question later so it counts."); rungs Nudge → One step → "Show me how, then one like it"; hints ≤25 words; then "Still stuck? Ask about this question".
- Feedback (bottom sheet, `aria-live="polite"`):
  - Right: `--success-soft` bg, "Right" in `--success-text`, one-sentence why, "Next".
  - Not quite + mix-up: neutral surface (**no red, no cross**). "Not quite. It goes down." → sunk box "Common mix-up" + belief + correction → two-column side-by-side (dashed "What you thought" / accent-soft "What happens") → "Saved to Fixing. We’ll check it on Thursday with a new question." → "Got it, next"; footer "See a picture · Explain more" and "Report a problem". Must fit 640 px tall with the button visible.
  - Right with a hint: "Nicely worked out. You used the nudge, so this one doesn’t count towards “Remembered” yet." Adds a similar question; progress shows an extra dashed segment ("2 of 7").
- After Check, options keep focus (`aria-disabled`), with result in the accessible name ("B: It goes down. Your answer · right").
- Report a problem: sheet with radio rows (answer wrong / not on my syllabus / confusing / something else), optional text, "Send and skip this question", "It won’t count against you."
- Session summary: serif headline "That’s 8 minutes well spent."; three stat tiles (questions done / mix-ups found / with a hint) — **no score**; "What happens next" dated list; primary "Done for now"; ghost "See every question" (score lives there).

### 3. Mistake loop — Screens §"Session end + mistake loop", Prototype J3
- Mix-up card states: **Fixing** (accent-soft badge, check-back date, 2-segment bar re-teach/check-back) → **Check-back ready** (2 px accent border, "Try it · 1 min") → **Fixed** (success-soft card, title rewritten as the corrected belief) / **Not yet** (stays Fixing, new date, no red).
- Check-back screen: header "Not now" (text, not ×) + "Check-back · 1 question"; context box "On Monday you thought **salt soaks into cells**. This is a new question, not the same one."; a new question including a trap option; "No hints on a check-back. That’s what makes it proof."
- Fixed moment: full-screen `--success-soft`, 56 px success circle with tick, "Fixed", serif 40 px corrected belief ("Water moves, not salt."), timeline (Mon thought / Mon re-taught / Thu proved), "That’s 5 mix-ups you’ve fixed." 200 ms fade; no confetti; announced "Fixed: water moves, not salt."
- Progress ▸ Mix-ups: Fixed first (success-soft rows), then Fixing; one-paragraph "How this works".

### 4–6. First run, Progress, Plan/Library/Settings, AI states, limits, auth, landing
See the corresponding sections of `Screens.dc.html`; each frame lists layout, copy and the principle it serves. Key rules:
- **Board picker**: every option shows support ("Ready" in `--success-text` or "Partly ready" outline badge); selecting a partly-ready board expands one sentence of honesty + "Tell me when CBSE is ready". Includes ICSE and "Not doing exams yet (Year 7–9)".
- **2-minute check**: ≤12 questions, auto-advance, includes "I haven’t learnt this yet" (records *untested*). Partly-ready boards use cached general questions + per-chapter "How sure are you?" (no AI wait). Ends on "Here’s where you’re starting." (You know this / Worth a look first / Not learnt yet, and that’s fine), then exam picked from the board’s papers + 10/20/30 min, then straight into practice.
- **Progress**: plain 3-line "This week" strip first (parent-legible: time, "mistakes corrected, and proved right days later", next). Readiness: "Likely a 5 or 6" + band (solid likely, dashed possible) + basis + "Updated after Tuesday’s session" + "Best move". Under ~20 answers show "Not enough to go on yet" with a 20-segment counter. Every chart: `role="img"` + sentence `aria-label` + "Show as a table".
- **Plan**: day list by default (each block one labelled row, current block outlined with Start); "When I’m free" sheet (tap slots, this week only); "I missed some days" auto-replan with "Looks good" / "Undo, keep my old plan".
- **AI waiting**: real steps + p50 estimate, never a looping bar; offer a due card meanwhile; after 30 s "Taking longer than usual…". **AI failed**: "That’s on our side… didn’t use a tutor go", primary = fallback that always works (cards/bank).
- **Limits**: checked only at session start; a started session always completes. Start sheet warns when ≤2 left ("This uses your last tutor go for today. The whole session is covered."). Limit reached appears only after save, free options first, upgrade is one underlined link. Plan comparison is a page (`/upgrade`), never a modal.

## Interactions & behaviour
- Motion tokens: `--dur-fast 140ms` (hover/press/toggle), `--dur-base 200ms` (feedback, tint), `--dur-slow 320ms` (sheet, drawer, card flip); `--ease-out cubic-bezier(0.2,0,0,1)` for arrivals. Reduced motion → 80 ms fades; AI pulse stops. No spring overshoot.
- Sheets: focus to title, Tab trapped, Esc/close returns focus to opener; drag-to-dismiss plus explicit close.
- Toasts: 6 s (10 s with Undo), pause on hover/focus, `role="status"`, above tab bar.
- Offline: neutral banner "You’re offline. Cards still work." with a "Saved offline" badge; reviews sync silently.
- Desktop shortcuts in sessions: A–D pick, H hints, ⌘↵ check, 1–4 rate cards, Space flip.
- Touch targets ≥44×44 everywhere; chips 40 px with 8 px gap.

## State management (new / changed)
- `nextStep` (from one server engine): `{ kind: 'welcome_back'|'check_back'|'exam_close'|'resume'|'fix_new'|'practise'|'cards'|'clear', title, reason, minutes, cost?: {tutorGoes}, action }`. Rule order is in Research Report §07.
- Session queue: `bankQuestions[]` immediately + `generated[]` streamed; `results[{right, hinted, mixupId?, confidence?}]`; `stopped`.
- Mix-up ledger item: `{ id, belief, correctedBelief, state: 'fixing'|'check_back_ready'|'fixed', spottedAt, reTaughtAt, checkBackAt, verifiedByTeacher }`.
- Readiness: `{ likely:[lo,hi], possible:[lo,hi], basis: {questions, cardWeeks}, updatedAt, bestMove }` or `{ insufficient: true, answers, needed: 20 }`.
- Usage: `{ tutorGoesLeft, dailyAllowance, resetsAt }` exposed to client.
- Prefs: `readingMode`, `textSize`, `reduceMotion`, `confidenceTap`, `readAloudAuto`, `theme`, `accentPreset`.

Backend/product dependencies (engine, evidence-gated mastery in `lib/mastery`, check-back scheduling + reminder, bank-first sessions, pre-written hint ladders, board support levels, server AI progress steps, start-of-session limit reservation, placement, auto-replan) are listed with what each blocks in `Summary.dc.html` → "Needs product or backend work".

## Design tokens
Use `tokens.css` verbatim. Summary:
- **Neutrals (light / dark)**: bg `#f7f5f0`/`#0d0c0a` · surface `#ffffff`/`#161511` · surface-sunk `#f2efe8`/`#1e1c18` · surface-raised `#ffffff`/`#211f1a` · line `#e2ddd1`/`#2c2924` · line-strong `#8f8778`/`#6b655a` · text `#1a1815`/`#f0ece4` · text-secondary `#3d3830`/`#cbc4b8` · text-muted `#625c50`/`#a8a094`.
- **Accent (teal default)**: fill `#0f766e`/`#5fb3a3` · hover `#0b5f58`/`#7cc6b8` · text `#0f766e`/`#6fc2b2` · soft `#e2efec`/`#16302b` · on-accent `#ffffff`/`#0d0c0a`. Presets hacker, lavender, mono override only the `--accent*` group (values in `tokens.css`).
- **Semantic** (fill · text · soft · on), light: success `#17805f #15634b #e3f1ea #fff`; warning `#b7791f #76511b #f7ecd8 #1a1815`; danger `#c2453a #96352d #f8e5e2 #fff`; info `#3d6aa8 #2f5286 #e6edf6 #fff`. Dark values in `tokens.css`. Fill ≥3:1, text ≥4.5:1 on bg/surface/soft — keep the fill/text split.
- **Colour rules**: red only for real errors/destructive actions; never for untested/behind. Untested = dashed `--line-strong` + `--text-muted` copy. Warning = heads-up before a limit only.
- **Type**: Newsreader (display/H1/H2 only, ≥22 px, never in questions/answers/notes); Instrument Sans (body, UI, tabular numbers); Atkinson Hyperlegible (reading mode only, lazy-load); JetBrains Mono (code only). Scale: display 44/1.05 (mobile 34) · h1 32/1.15 (28) · h2 24/1.25 (22) · h3 19/1.35 sans 600 · question 19/1.45 sans 500 · body-lg 18/1.55 · body 16/1.55 (max 65ch) · small 14/1.45 · caption 13/1.4 (minimum) · num-xl 40/1 tabular.
- **Reading mode** (`[data-reading="on"]`): Atkinson for body + headings, body 19 px / 1.75, letter-spacing 0.01em, word-spacing 0.08em, measure 60ch, never justified, no italics.
- **Space** (4 px base): 0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64.
- **Radius**: sm 10 · md 14 · lg 20 · xl 28 · full 999. (Buttons 12–14, cards 14–20, sheets 20–22.)
- **Shadow**: e1 `0 1px 2px rgba(24,20,14,.06)` · e2 `0 4px 12px -2px rgba(24,20,14,.10)` · e3 `0 16px 40px -12px rgba(24,20,14,.18)` (dark variants in file). Most surfaces flat + hairline. **No glass blur, no gradients, no glows.**
- **Z**: base 0 · raised 1 · sticky 100 · nav 200 · ask 300 · drawer 400 · modal 500 · toast 600 · tooltip 700.

## Assets and placeholders
- **Icons**: designs use Lucide (CDN) as a stand-in. Use the app’s own `components/icons` set (24 px grid, 1.75 stroke). Primary nav always has text labels; icon-only buttons need `aria-label` + tooltip. No sparkle icon for AI.
- **Images**: landing hero product shot and the mix-up "See a picture" diagram are empty slots — supply real assets.
- **Placeholders to replace**: plan prices (£3.99 / £7.99) and allowances (5 / 30 tutor goes); exam weights ("about 12% of Paper 2"); spec refs ("AQA 4.1.3.2"); "140 board questions"; AI-consent wording about providers/retention (check against real agreements); default reminder time 17:00.
- All names, questions, dates and stats are sample content.

## Acceptance checks
- J2: from app open to first question ≤2 taps for every persona; first question visible in <2 s on 4G.
- No screen has more than one primary button.
- AA contrast for every pair in every preset × mode (120 pairs; reuse the list in Design System §01).
- No paywall or limit notice ever appears while a question is on screen.
- Screen reader: every icon button labelled, charts have text + table, answer options stay focusable after Check, drawer is non-modal, sheets restore focus.
