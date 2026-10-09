# Learnora — Student UX Persona Audit

**Date:** 2026-09-23 · **Branch:** `ux-rehaul` @ `3ee3149` · **Surface:** `webapp/` (Vite dev server)

> ## Status — 2026-09-24: acted on
>
> Every finding below was fixed, improved or deliberately dropped on the
> `ux-rehaul` branch. **Read this report as the "before" picture, not as open
> work.** Summary of what changed:
>
> - **P1s fixed:** one readiness number (Today, Exams, prep modal); a school-
>   aware week plan (exam prep stays on its own day, no past slots, one-tap
>   school hours); plain AI errors with Try again; a free "Why this topic?";
>   Explain it simply / Oral practice start from a topic, with school-level
>   examples.
> - **Also fixed:** AI consent is asked at first use instead of being required
>   at sign-up (with a Settings switch and a server-side check); the Dashboard
>   no longer repeats Today; the predicted grade no longer changes while the
>   page loads (root cause: the forecast didn't wait for the saved week);
>   built-in stand-ins in Oral practice and Explain it simply now say so and
>   never write to the misconception ledger or learning evidence.
> - **Dropped after re-checking:** "quiz progress lost on refresh/Exit" (a
>   resume dialog exists); "wrong timer preset highlighted" (mouse hover in
>   the screenshot).
> - **Newly covered by e2e:** the full 45-minute block ending in the quick
>   check, .txt/PDF uploads and the 10MB limit, Oral practice without a speech
>   API, and consent at first AI use.
> - **Not verifiable here:** the quality of real AI answers (the mock returns
>   canned text) and live speech recognition (unavailable in headless
>   browsers).
>
> **Second pass (2026-09-24, branch `ux-gaps`)** covered what the first pass
> skipped: a phone bottom tab bar; Library opens on Subjects with a line under
> each tab; timer modes renamed ("Focus & breaks", "Flow"); short flashcard
> reviews start straight away; read-aloud off by default in Oral practice;
> the friends ranking is by consistency; a WCAG A/AA scan of 24 screens plus a
> keyboard walk (all fixed, now in e2e); overdue tasks labelled as overdue; the
> mock exam starts when a browser refuses fullscreen; a study-room host's own
> timer starts with the group session; an auto-set focus length explains
> itself. New e2e journeys: a whole review to its recap, a mock exam to its
> score, and coming back after five days. Sections 18–21 below were added then.

## How this was tested (read first)

- **Signed-in screens** were driven in a real Chromium through the dev harness (`/app/harness.html`, fixture student with a Biology exam in 6 days) at **1366×800 desktop** and **390×844 phone**. All 21 main routes were captured full-height at both sizes.
- **Journeys** (sign-up, empty account, Ask AI, Create → quiz, taking a quiz, offline, search, timer persistence) were scripted in Playwright against the repo's `MockBackend`, which lets me force **slow, failing and rate-limited AI** responses.
- **Limits.** AI *content* is canned by the mock, so this report judges the AI's framing, controls, loading and error states, **not answer quality**. Not exercised: real file upload, voice in Viva, push notifications, Stripe, multi-user rooms, and the end of a full 45-minute block (so the promised "four-question check" was **not verified**).
- **Retracted during testing.** Four apparent failures turned out to be problems in my test scripts, not in the app: (1) the "Ask AI" button can be reached; (2) the task "Focus" chip does not freeze the page; (3) Quiz "Exit" is a working link; (4) the low light-mode contrast numbers were artefacts of the theme transition. None of them appears below.

---

## 1. Executive summary

No P0 blockers: a student can sign up, get oriented, study, take a quiz and come back. The top of the funnel is strong: **Today puts one clear action first**, and **Study tools asks what the student's problem is** instead of listing tool names. What hurts students is **trust and consistency**, not missing features:

1. **Today shows two grade predictions for the same exam, and they contradict each other.** The hero says Biology Paper 2 is "projected 6–9". Two cards lower, the exam chip says **"2 readiness"**, which is a grade 2 (the readiness % converted to the student's grade scale). The Exams page shows the same exam as **25%**. An exam-anxious student has no idea which number is true. **P1**
2. **The auto-built week books study during school hours.** Wake-up is 07:30 and the first block is at 07:30, then 08:25 and 09:20, every weekday. **Mon 28 and Tue 29, the two days before the exam, say "Nothing scheduled".** The Plan header on the same screens says "Optimal Focus: Afternoon Flow (3 PM–6 PM)". **P1**
3. **AI failures show raw developer strings.** A server error shows "Internal error" and offline shows "Failed to fetch", as a chat bubble with no retry and no next step. **P1**
4. **"Why this?" under the headline recommendation opens a Pro upsell.** The one explanation a sceptical student would click is paywalled, even though the recommendation itself (including a grade forecast) is shown to free users. **P1**
5. **Study tools ask too many decisions before any learning happens, and the examples are the wrong level.** "Explain it simply" asks for 5 audiences × 5 analogy styles × 3 depths before "Start teaching". Its examples are Quantum Entanglement, Big O, Bayesian Probability and Neural Networks. Viva suggests "Asynchronous Event Loop in JavaScript", and the solver suggests buffer pH and the chain rule. The landing page says "Built for High School & Board Exam Students". **P1**
6. **One thing, many names.** Focus / Timer; My week / Availability / Life Sync / Your availability; Exam traps / Exam trap practice / Set up a stress test / Learn the traps; Study Room / Virtual Study Circle; Explain it simply / Feynman Teaching Studio / Creative Studio; Today vs "the full dashboard". **P2**
7. **The timer's motivational quotes are guilt-based:** "Study while they sleep. Work while they play." and "Push yourself, because no one else is going to do it for you." Progress shows a 7-day streak as **"8 / 365d, 2% consistency"**. **P2**
8. **The header's logout icon signs the student out instantly.** It's an unlabelled icon between Search and the theme toggle, on every screen and on phone. No confirm. **P2**

---

## 2. Persona results

| Persona | Verdict | Evidence |
|---|---|---|
| **A · Power user** | Mostly empowered | ⌘K palette finds tools, navigation, timers and theme. **But "quiz" returns *no results*,** and quizzes aren't indexed at all ("enzymes" finds the notes and deck, not "Enzymes quick check"). The shortcut hint says ⌘K on Windows. |
| **B · Average** | Can complete the core loop | Today → Start → timer works. They will notice Today and Dashboard repeat each other (notebooks, next exam, tasks, "Pick up where you left off" all appear on both). |
| **C · Struggling** | Gets lost in Study tools | 4-step setup screens; "Target Persona", "(VIBE / ROLE)", "Pervasive/High/Frequent" badges; exam-trap content written for undergrads ("Professors pick…", "greedy heuristic", "asymmetric costs"). A wrong quiz answer gets only "Not quite — the correct answer is X", with no *why* and no way to ask. |
| **D · Procrastinator** | Good first 10 s, then friction | Today's CTA is one click, but it lands on a timer that **isn't running**. They have to press Start again, and the offer is 45 min with no shorter option. Flashcard review makes you pick "Card order" (3 strategies) before a 3-card deck. |
| **E · Exam-anxious** | Actively harmed | Contradictory predictions (#1). "This estimate has limited evidence". A red "Topics you keep dropping marks on" box after **one** miss. An empty schedule the day before the exam (#2). |
| **F · Mobile-first** | Workable | No horizontal overflow on any of 21 screens. But the header is **5 unlabelled icons** (help, AI, search, logout, theme) and there's no bottom nav, so everything is behind the top-left hamburger. The timer stacks Start / +5 min / Reset in one thumb column (Reset does confirm — good). Truncated fields: "Non", "Unassigne". |
| **G · Desktop** | Good | Sidebar with sub-items, timer shown in header across pages. At 1280×800 the **Create dialog's submit button is clipped at the bottom edge**. |
| **H · Low tech literacy** | Struggles with vocabulary | Pomodoro, Flowtime, Viva, Feynman, "source", "grounded", "Hybrid", "Lvl 3: Standard", "Brown noise / Alpha waves", "Rebuild: Rates", "Lower-ease cards". Six icon-only header buttons. |
| **I · Tech-savvy** | Notices polish gaps | Dropdowns rendered with a **repeating chevron pattern** across the whole field (Create → Subject, Viva → "Ground in notebook"); duplicated labels "Quick Intuition (2 mins) (2 min)"; stray separators "• medium • •"; a visible OS scrollbar under the AI chat chips; the help panel on Today titled **"Dashboard"**. |
| **K · Distrusts AI** | Mixed | Good: Create says "No source attached. AI may use general knowledge and can be wrong." Bad: **account creation requires agreeing to share study data with Anthropic and Google**, even for a student who only wants the timer; "Why this?" is paywalled; the AI's mode chips (Web / Notebook / Hybrid) don't say which one is active or where answers came from. |
| **L · Over-trusts AI** | At risk | Forecasts are shown as precise-looking grade ranges, and a range can change between visits (see §12). The Create dialog's warning is the only honesty signal, and it's a small grey line. |
| **M · Homework only** | Reachable in 2 clicks, but slowed | Ask AI → type works immediately. Create → Topic → Practice Quiz works, but Flashcards **and** Summary Notes are pre-ticked, so wanting just a quiz means three sequential generations (I watched "Writing summary notes…", then "Writing 10 quiz questions…"). |
| **N · Wants to learn** | Best-served persona | The Study tools framing, Explain-it-simply and the solver are good learning loops. The gap: wrong answers have no explanation, and the four-question check is promised but its link back isn't visible. |
| **O · Returning** | Well served | "Pick up where you left off", a running timer that survives navigation **and a full page refresh**, the solver keeps drafts ("Your draft stays here if you leave this page"). |
| **P · First-time** | Needs up to 5 minutes | Sign-up (6 fields + mandatory AI consent) → **email-confirmation wall** → 5-step wizard (skippable, with a clear summary of what changed). Then the empty Today offers exactly one action, "Add your next exam", which is the right call. |
| **Q · Multitasker** | Mixed | The timer survives everything. A quiz loses the answered question on refresh, and "← Exit" leaves mid-quiz with no warning. |
| **R · 10–20 min** | Poorly served | Today only offers "Start 45 min". The Dashboard has 25/20/45 chips, but Today (the default screen) doesn't. |
| **S · "What do I do?"** | Well served on Today and Study tools | "Study Enzymes next" and "What do you need help with?" are the strongest screens in the product. |
| **T · Over-explorer** | Finds seams | Plan → "Study plan" says **"No plan yet — Generate my week"** while the "Availability" tab next to it already shows a full generated week. Progress → Exam forecast tab moves the tab bar sideways (different container width). |

---

## 3. First-time user test (zero instructions)

| Time | What the student sees | Likely thought | Emotion |
|---|---|---|---|
| 0–30 s (landing) | "Know Your Grade. Own Your Study." Forecasting, focus timer, active recall. Two CTAs: "Try 25m Focus Timer (No Sign-Up)" / "Create Free Account" | "Study app that predicts my grade." Clear. | Curious |
| Sign-up | Name, email, DOB, password ×2, **required** AI-provider consent naming Anthropic and Google | "Why do I have to agree to AI to make an account?" | Wary (K), fine (B) |
| After submit | "Check your email" | Student must switch to email; some won't come back | Impatient |
| Wizard (5 steps) | Goal → areas → AI voice → study times → curriculum list mixing **AP, SAT, CBSE, ICSE, GCSE, IB** | Quick; the curriculum list is long | Reassured (the "You're set up" summary is excellent) |
| Summary | "Created your first subject, **AP Courses subjects**" · "Dashboard trimmed to the 1 area you picked" | Grammar glitch; they will land on **Today**, not "Dashboard" | Slightly confused |
| Empty Today | "Add your next exam to get a next step" — one button | Clear | Confident |
| 2 min | Ask AI panel: greeting only mentions notes/flashcards; ~¼ of the panel is taken by mode chips | "What's Lvl 3? Hybrid?" | Uncertain |
| 10 min | Create dialog, study tools, library with **two search boxes** on one page (header search + notebook search) | "Notebooks vs Subjects vs Files — what's the difference?" | Mildly overwhelmed |

**Mental model after 10 minutes:** "A planner that tells me what to study, plus a bunch of AI tools." That's roughly right. The part that's wrong: "notebook", "subject" and "library" read as three words for "folder".

---

## 4. Core study workflow (exam in 6 days, returning student)

1. **Today:** "Study Enzymes next · Start 45 min on Enzymes". ✅ The strongest single interaction in the product.
2. **Click →** `/timer` at 45:00, **not running**, with the preset "**Light Study (20m)**" highlighted while the clock says 45. Current Task field too narrow to read. Hint: "Good pick — Enzymes is the…". One more click on Start. ⚠️
3. **Timer running →** navigate anywhere: the clock stays in the header; a refresh keeps it. ✅
4. **End-of-block four-question check:** promised in the hero copy; **not verified** (would need a full block).
5. **Quiz (tested separately):** wrong answer → red banner "Not quite — the correct answer is 'Mitochondria'". No explanation, no "Explain this", no "Ask AI about this question". Results: "0 / 2 correct · Topics to review: Cells, Genetics · Work on Cells · Review answers". ✅ The results are good; the per-question feedback is thin.
6. **Progress:** 7-day streak framed as "2% consistency". ⚠️

**Friction count, from Today to studying:** 2 clicks, 0 required decisions. Good. **From Study tools → Explain it simply → teaching:** 4 sections, ~16 options, 2 prefilled fields (Biology / Photosynthesis). A student who just clicks "Start teaching" ends up teaching photosynthesis to a 10-year-old using **cricket** analogies.

---

## 5. Cognitive load audit

| Workflow | Decisions | Clicks | Reading | Worst burden |
|---|---|---|---|---|
| Today → start studying | 0 | 2 | ~70 words of hero copy (mastery, projected range, evidence caveat, check) | Interpretation ("projected 6–9" of what?) |
| Create → quiz on a topic | 3 (source type, kits, subject) | 4–5 | Low | Pre-ticked kits; submit clipped at 800 px |
| Explain it simply | ~4 | 5+ | High (five persona bios) | Decision overload |
| Viva | 4 (topic, notebook, role, goal) | 4+ | High | Jargon labels "(VIBE / ROLE)", "(GOALS)" |
| Timer setup | Up to 12 controls | 1 (defaults work) | Medium | Four modes + 3 presets + 4 number fields + task + note + subject + 5 sounds |
| Flashcard review | 2 (length, order) | 2 | Low | Unnecessary for small decks |
| My week | ~10 | many | High | Four names for one page; preview ignores school |

---

## 6. Navigation & information architecture

- **Today vs Dashboard.** Dashboard isn't in the nav; it's reached from a footer link ("the full dashboard") and by the wizard ("Take me to my dashboard"). It repeats Today's cards. A student can't predict which one holds what. *Recommend:* merge, or turn Dashboard into Progress → "Customize".
- **Plan's tabs** (Study plan / Availability / Tasks / Exams) don't match its sidebar sub-items (My week / Tasks / Exams). "My week" opens the **Availability** tab, whose eyebrow reads "LIFE SYNC" and whose heading reads "Your availability".
- **Library** has five tabs: Notebooks / Subjects / Files & notes / Flashcards / Quizzes. It also has a global search *and* a notebook-only search stacked on one screen.
- **Quizzes and flashcards live in Library, not in Study tools.** "Give me practice questions" (the most common student request) isn't one of the Study tools cards.
- **The page title doesn't follow the context:** during a quiz the header says "Library" (on phone, "Libra…").
- **Pricing gate mismatch:** the landing page lists calendar (.ics) import under **Plus**; the in-app card says "See what **Pro** adds".

## 7. Visual hierarchy

- **Today (desktop):** the eye goes hero → "Start 45 min" → "6 days away". ✅ But "Pick up where you left off → Open" uses the same filled primary style as the hero CTA, so two primaries compete (clearer on phone, where "Open" is full width).
- **Section labels are doubled:** "Due today" › "TODAY'S TASKS"; "Next exam" › "NEXT EXAM"; "Continue" › "Your Study Notebooks". Two headings, one card.
- **Exams cards:** titles wrap to two lines inside wide cards ("Biology / Paper 2"), with stray "•" separators.
- **Exam traps:** six dense cards of equal weight; the "Pervasive / High / Frequent / Common" badges have no legend.
- **Progress:** the year-long heatmap is ~95% empty cells for a student with 8 active days. The empty space dominates the screen and reads as failure.

## 8. Interaction & affordance

- **Task chips "Focus / Tomorrow / Next week":** "Focus" is tinted like a *selected state*, but it's a button (it opens the timer with the task). "Tomorrow" and "Next week" reschedule. They look like a segmented control, but they're three different kinds of action.
- **"2 readiness" chip** opens a detailed modal (25%, three weighted bars, roadmap). The modal is good, but the chip looks like a status label, not a button.
- **"Choose countdown"** is a small grey label that actually switches which exam is counted down.
- **Broken dropdown styling** (repeating chevrons across the field) on Create → Subject and Viva → "Ground in notebook". It reads as a rendering bug.
- **Primary buttons look disabled before input** ("Find my mistake", "Start challenge" are dimmed teal), with no hint about what's missing.
- **Quiz list actions** "Review / Mock Exam / Take Quiz": "Review" comes before the student has taken the quiz, so what it reviews is unclear.

## 9. AI UX

| Aspect | Finding |
|---|---|
| Expectations | The greeting says "Drop your notes or images here and I'll summarise them, or ask me to generate flashcards". That's narrower than what the panel does (tasks, planning, timer). |
| Prompting | The starter chips (What are my tasks? / Plan my study / Create flashcards / Start a timer) are good, but the row **clips off the right edge** with a visible scrollbar. |
| Controls | "🎯 Lvl 3: Standard · Concise ⚡ · 🌐 Web · 📚 Notebook · 🔀 Hybrid · Adjust" take about a quarter of the panel's height and are unexplained. |
| Waiting | "Writing your answer…" appears immediately. ✅ |
| Errors | **Raw "Internal error" / "Failed to fetch".** No retry, no "your message wasn't lost". **P1** |
| Limits | The rate-limit message is plain and honest ("resets at midnight — or Plus/Pro raises the limit"). ✅ |
| Grounding | Create shows "No source attached. AI may use general knowledge and can be wrong." ✅ But the progress card then says **"Building from your source"** when there is no source. |
| Consent | Mandatory at sign-up for *any* use of the app. |

## 10. Accessibility

- **Contrast:** dark and light themes pass on Today's body text (checked with computed styles and a screenshot).
- **Icon-only header controls** have aria-labels ("Help and support", "Log Out", "Toggle Theme"). ✅ For sighted low-literacy students, though, six icon buttons with no text is the problem.
- **Label-in-name mismatch:** the visible "Ask AI" button is named "Ask Learnora AI", so voice-control users who say "click Ask AI" can miss it (WCAG 2.5.3).
- **Colour-only signal:** the readiness chip turns red when the grade is low; its meaning ("2" = grade) isn't in the visible text.
- **Touch targets on phone** are mostly ≥44 px. Exceptions: Viva (10), timer (5), My week (16 elements under 44 px).
- **Reading level:** Exam traps and parts of the Feynman/Viva setup are well above Grade 9.

## 11. Responsive UX

- **Phone:** no horizontal page scroll on any of the 21 routes. ✅ Long pages are very long (Feynman ≈ 3,960 px, Exam traps ≈ 3,400 px). On the timer, settings sit *below* recent sessions (good ordering), but the fields truncate.
- **Laptop (1280×800):** the Create dialog's footer is clipped. The AI chat panel at the default pane height crowds the composer.
- **Desktop 1366:** the timer's left column truncates the task, subject and note fields.

## 12. Error & recovery

| Mistake | Can a normal student recover? |
|---|---|
| Taps the logout icon | Signed out instantly, has to sign in again. **No** undo or confirm. |
| Refreshes mid-quiz | The answer is lost; the quiz restarts at question 1. |
| Clicks "← Exit" mid-quiz | Leaves with no warning. |
| Resets the timer | **Confirm dialog.** ✅ |
| Refreshes mid-timer | Timer continues. ✅ |
| Adds a task offline | Clear offline banner ✅, but **the task doesn't appear until reconnect** (it was saved, and appeared after reconnecting), so students will retype it and create duplicates. |
| AI request fails | Raw error, has to retype manually. |
| Leaves the solver mid-draft | Draft kept, and the page says so. ✅ |
| **Forecast drift** (low confidence) | The same fixture student saw "projected 6–9" on one load and "projected 3–5" on another run the same evening. Needs confirming with fixed data. |

## 13. Emotional / motivational UX

- **Supportive:** "Good pick —", "Let's fix what slipped", the rate-limit wording, the wizard summary ("none of it permanent").
- **Harmful:** the timer's hustle quotes; "2% consistency"; the red "Topics you keep dropping marks on" after one miss; "Nothing has measured Enzymes yet… This estimate has limited evidence" as the first thing read on the main screen; a friends leaderboard ranked by hours (it rewards sitting time, not learning).
- **Slightly patronising:** "Welcome to the quiz. Let's see what you've got!"

## 14. Cross-persona conflicts

| Tension | Who wins now | Accommodate both by |
|---|---|---|
| **Guidance vs speed** (Feynman/Viva setup) | Power user | Defaults *derived from the student's own subject*, with a one-click "Start" right after the topic field; tuck audience/analogy/depth into "Customise". |
| **Transparency vs anxiety** (forecast caveats) | Sceptic | Show one number with a plain confidence word ("rough guess"); put the evidence math behind "Why this?", and make that *free*. |
| **Power vs simplicity** (timer controls) | Power user | Collapse durations/cycles/presets under "Timer settings". The default view: clock, Start, task. |
| **Metrics vs learning** (leaderboard, hours) | Metrics | Rank by topics improved or checks passed, or make the leaderboard opt-in. |
| **Explicit consent vs low friction** | Compliance | Ask for AI consent the first time an AI feature is used, not at sign-up. (This needs a privacy and legal decision, not just a design change.) |

---

## 15. Severity table

| Sev | Finding | Persona | Location | Impact | Recommendation |
|---|---|---|---|---|---|
| P1 | Two contradicting grade predictions for one exam ("projected 6–9" vs "2 readiness"; 25% elsewhere) | E, L, B | Today hero + Next exam chip; Exams | Anxiety, distrust of every number | One readiness figure per exam, in one format everywhere; label the chip "Readiness 25%" or "Grade 2 (est.)" |
| P1 | Week preview schedules weekday study at 07:30–10:00 and nothing on the two days before the exam | E, B, R | Plan › My week | Plan is unusable for school students; they stop trusting "Generate my week" | Default school-hours block for "School exams" students (from the wizard); never leave the days before an exam empty; start after wake-up plus a buffer |
| P1 | Raw AI errors ("Internal error", "Failed to fetch"), no retry | All, esp. C, poor internet | Ask AI panel | Student assumes the product is broken | Human message + Retry button + keep the prompt in the composer |
| P1 | "Why this?" on the main recommendation opens a Pro paywall | K, N, E | Today hero | Can't verify the app's core advice | Free plain-language reason (the 2–3 factors); keep the full trajectory as Pro |
| P1 | Study-tool setup overload + university-level examples | C, D, H, P | Explain it simply, Viva, Solver, Exam traps | Abandonment before any learning | Topic → Start; prefill from the student's own subjects/weak topics; examples matched to the student's curriculum |
| P2 | Naming drift across nav/tabs/headings (Focus/Timer, My week/Availability/Life Sync, Study Room/Virtual Study Circle, Exam traps ×4) | H, P, T | Global | Can't predict where things live | One name per destination; page H1 = nav label |
| P2 | Today and Dashboard duplicate each other | B, P, T | Today / Dashboard | IA confusion | Merge or repurpose Dashboard |
| P2 | "Study plan: No plan yet" next to a full generated week under Availability | T, B | Plan tabs | Contradiction | Treat the preview as the plan, or label it "Preview" and link it to Generate |
| P2 | Header logout is an unlabelled one-tap icon | F, H, J | Global header | Accidental sign-out | Move into the Account menu, or confirm |
| P2 | Guilt-based timer quotes; "2% consistency" framing | C, E, Env 3 | Timer; Progress | Demotivation | Neutral/encouraging copy; measure consistency since the student joined |
| P2 | Quiz: no "why" on wrong answers; refresh/Exit silently lose progress | N, C, Q | Quiz runner | Weak learning loop; lost work | "Why?" / "Ask AI about this" on each answer; persist progress; confirm Exit |
| P2 | Create dialog: submit clipped at 800 px; 2 kits pre-ticked; "Building from your source" with no source | M, G, R | Create | Slow, confusing generation | Sticky footer; pre-tick only what the entry point implies; honest progress text ("2 of 3") |
| P2 | Broken dropdown rendering (repeating chevrons) | I, all | Create › Subject; Viva › notebook | Looks broken | Fix the select's background-repeat |
| P2 | Quizzes not in search; "quiz" → no results | A, R | ⌘K palette | Can't find practice | Index quizzes + "Create a quiz" command |
| P2 | Offline-added task invisible until reconnect | Q, F, Env 6 | Today tasks | Duplicate tasks | Show queued tasks optimistically with a "pending" mark |
| P2 | AI consent mandatory to create any account | K | Sign-up | Sceptics can't even use the timer | Just-in-time consent at first AI use (policy decision) |
| P2 | AI panel's mode chips unexplained and taking ~¼ of the height; starter chips clipped | H, C, P | Ask AI | Clutter, confusion | Collapse modes behind "Adjust"; wrap the chips |
| P2 | "Start 45 min" lands on a stopped timer with the wrong preset highlighted; no shorter option on Today | D, R | Today → Timer | Extra click; mixed signals | Auto-start (or one-tap start), highlight the matching preset, offer 20/45 |
| P3 | Help panel titled "Dashboard" on Today | P | Help | Minor confusion | Match the page |
| P3 | Wizard: mixed AP/SAT/CBSE/GCSE list; "AP Courses subjects" grammar | P | /welcome | Minor | Filter the curriculum list by the region/goal step |
| P3 | Timer/solver fields truncated ("Non", "Unassigne") | F, G | Timer, Solver | Can't read the task | Wider column / stacked layout |
| P3 | Flashcard review asks for card order before 3 cards | D | Review | Extra decision | Skip the setup for decks under ~20 cards |
| P3 | ⌘K shown on Windows; visible label ≠ accessible name for Ask AI | A, a11y | Header | Minor | Platform-aware hint; name "Ask AI" |
| P3 | Solver defaults to "Mathematics & Calculus" for a Bio/Chem/History student | C | Solver | Wrong default | Default to the student's own subjects |
| P3 | Hours-based leaderboard | Motivation | Friends | Chasing sitting time | Rank by progress, or opt-in |
| P3 | Landing (Plus) vs app (Pro) disagree on calendar import | P, K | Plan / Landing | Pricing distrust | Align the copy |

---

## 16. Top fixes (smallest set, biggest effect)

1. **One readiness number, one format, everywhere**, plus a **free "Why this?"** in plain words. This fixes the two biggest trust problems (E, K, L).
2. **Make the week plan school-aware**: a default school-day block from the wizard's "School exams" answer, no study before wake-up + 30 min, never empty the day before an exam.
3. **Human AI error states with Retry**, keeping the student's prompt.
4. **Topic → Start** for Explain-it-simply and Viva, with the extra options folded away and examples drawn from the student's own subjects and curriculum.
5. **A naming pass:** one label per destination, page H1 = nav label; merge Today and Dashboard.
6. **Move logout into Account**, and **replace the guilt quotes and the "2% consistency" metric.**

## 17. Retest plan

- **Readiness:** Today hero, Next-exam chip, Exams card and prep modal all show the same number for the same exam, on free and Pro accounts.
- **My week:** a new "School exams" student with no commitments → no weekday blocks between 08:00 and 15:30; the day before an exam has at least one block. Re-check that "Study plan" and "Availability" agree.
- **AI failures:** re-run with learnora-ai returning 500, 429 and offline → each shows plain text + Retry, and the prompt survives.
- **"Why this?"** as a free user explains the recommendation without an upsell.
- **Explain it simply / Viva:** count the clicks from the nav to the first AI turn (target ≤ 3). Examples match the wizard's curriculum.
- **Create dialog** at 1280×800 and 390×844: submit visible without scrolling; only the relevant kit pre-ticked.
- **Quiz:** refresh after Q1 keeps the answer; Exit mid-quiz confirms; a wrong answer offers an explanation.
- **Search:** "quiz" and a quiz title both return results.
- **Offline:** a queued task shows immediately with a pending state.
- **Phone header:** logout isn't one tap away; no field truncation on the timer.
- **Forecast drift:** load Today three times with fixed fixtures; the projected range must not change.

---

*Sections 18–21 were added on 2026-09-24, in the second pass. They describe
the app as it was **before** either pass, like the rest of this report; the
last column of each table says what happened to each finding.*

## 18. Screen by screen

| Screen | What a student gets right away | What got in the way | Now |
|---|---|---|---|
| Landing | Clear promise, a no-sign-up timer | Nothing major | — |
| Sign-up | Short form | AI consent required to make any account | Asked at first AI use instead |
| Welcome wizard | Skippable, with a summary at the end | Mixed curriculum list; "AP Courses subjects" | Fixed in the first pass |
| Today | One clear next step | Two different readiness numbers; region names repeated inside cards | One number; each region has one heading with a link to the full page |
| Dashboard | Streak, memory, history | Repeated Today card for card | Now only "How am I doing"; links back to Today |
| Library | Everything in one place | Opened on Notebooks; five tabs with no hint of what each holds | Opens on Subjects; each tab has a one-line description |
| Plan / My week | Week built automatically | Study booked in school hours; four names for one page | School-aware; one name |
| Exams | Calendar, countdown | Day cells were buttons containing buttons (screen readers) | Day number is the button |
| Tasks | Quick add, snooze | A task from days ago still read as a plain date | "Overdue since …" |
| Timer | Survives refresh and navigation | Pomodoro/Flowtime jargon; hustle quotes; a focus length that changed with no reason given | Plain names, neutral quotes, and the auto-set length says why, with "Use 25 min" |
| Flashcard review | Keyboard shortcuts, good recap | Two setup choices before a three-card deck | Short decks start straight away |
| Quiz / Mock exam | Clear results | Fixture had no questions; mock exam stuck if fullscreen was refused | Both fixed; covered by e2e |
| Study tools (Explain it simply, Oral practice, Solver, Exam traps) | Asks what the problem is | 4-step setups, university-level examples; Oral practice read every reply aloud | Topic → Start; examples at school level; read-aloud off by default |
| Progress | Charts from real history | "2% consistency" for a seven-day streak; "When you focus best" from too few sessions | Consistency since joining; insight removed until there's enough data |
| Friends | Your circle | Ranked by hours sat | Ranked by consistency, or focus time if chosen |
| Study Room | Presence, group timer | Host's own desk said "Idle" after starting; "Sync My HUD" | Host's timer starts too; "Match my timer" |
| Settings | Everything in one place | Blocked notifications said only "Denied" | Says how to re-allow them |
| Phone (all screens) | No horizontal scroll | Everything behind a hamburger; five icon-only header buttons | Bottom tab bar; logout moved into Account |

## 19. Journey failure map

Where each journey broke, and whether it still does.

| Journey | Step that failed | Why the student stops | Now |
|---|---|---|---|
| First visit → first study block | Sign-up (consent wall) → email confirmation | Leaves to check email; sceptics refuse the consent | Consent moved; email step unchanged (needed for security) |
| Today → 45-min block → quick check | Timer landed stopped; end-of-block check unverified | One more click; unsure anything happens at the end | One-tap start; the end check is covered by e2e |
| "Explain this to me" | 16 options before anything happens | Gives up before the first AI turn | Topic → Start |
| Ask AI when it fails | "Internal error", no retry | Thinks the app is broken | Plain message + Try again, prompt kept |
| Plan my week | Blocks during school; empty days before the exam | Stops trusting the plan | School-aware |
| Revise flashcards | Setup screen before a tiny deck | Friction on the smallest task | Starts straight away |
| Sit a mock exam | Fullscreen refused → stuck on the start screen | Can't sit the exam at all | Starts without fullscreen, says so |
| Come back after a week | Old tasks look current; streak copy shames | Feels behind, closes the app | "Overdue since …"; streak copy neutral |
| Study with a friend | Host shows as idle | Room feels dead | Host's timer starts with the group |
| Use it on a phone | Hamburger for everything | Can't find things one-handed | Bottom tab bar |

## 20. Why a student would leave, and why they'd come back

**Leave:**
- A number they can't trust (two readiness figures, a range that moved between loads). Fixed.
- Setup before learning: every study tool asked several questions first. Fixed for Explain it simply and Oral practice; Exam traps is still denser than the rest.
- Guilt: hustle quotes, "2% consistency", red "keep dropping marks" after one miss. Fixed.
- A plan that ignores school. Fixed.
- Still true: real AI answer quality is unmeasured here (the tests use canned replies), and a slow or wrong AI answer would undo much of the above.

**Come back:**
- Today tells them what to do in one line, and the timer never loses their session.
- The misconception ledger: the app remembers what they got wrong and brings it back. This is the one thing other planners don't do, and it's the strongest reason to return.
- Flashcard review is fast and the recap is encouraging.
- The quick check after a block shows progress on something specific, not hours.

## 21. Mental model after the first week and the first month

**After a week:** "Learnora tells me what to study next for my exam, runs the timer, and quizzes me. The AI can explain things when I'm stuck." They use Today, the timer and flashcards daily; Library and Plan weekly. Before the fixes, the likely wrong beliefs were "Dashboard is Today with more cards", "Notebooks, Subjects and Library are all folders" and "the grade prediction is random". The first two are now addressed by the Dashboard/Today split and Library's per-tab descriptions; the third by the single readiness number.

**After a month:** "It knows my weak spots." This depends entirely on the misconception ledger filling up from quizzes, checks and study tools, which is why built-in stand-ins must never write to it. Risks at this stage: the forecast still says "limited evidence" for topics the student hasn't been checked on, which reads as a failure rather than an invitation; and streak-style metrics can still become the goal. Worth measuring with real students: whether they open "Why this topic?", and whether they act on the ledger's suggestions or ignore them.
