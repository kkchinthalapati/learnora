# Learnora UX/UI Audit — Maya Vance, HS Junior (4 APs + SAT)

**Filter for everything below:** does it save me time before Thursday's AP Chem test, or is it productivity theatre?
Source-level read of `webapp/src/`, `supabase/`, and the styles. Companion to Arjun's CBSE Report Card (Artifact `TQGRiBE2VAG952fC8H3Qcm`); where he and I agree I say so and move on.

---

## 1. THE CRITICAL VERDICT

**Dealbreaker (30 seconds, tab closed):** the landing page quotes me prices in rupees and tells me it "Supports UPI (Google Pay, PhonePe, Paytm)". I'm in Ohio. `LandingView.tsx` imports `PLAN_PRICING_INR` directly and hardcodes `"INR"` into every `formatPrice` call, with a literal `₹0` for the free tier. Before I've seen a single feature the app has told me it wasn't built for me. Nothing in Section 2 matters if I never get past that.

Runner-up: the AI examiner personas. Feynman's default strict persona is "Dr. Sharma, strict CBSE board examiner" who docks me for missing "NCERT keywords". Sparring's default is "Tough CBSE Board Examiner". I'm being graded against a syllabus I've never heard of, for an exam I'm not taking.

**The one thing that actually beats Quizlet/ChatGPT:** `NextHourCard`. "Study X next, worth about Y points an hour" computed from my real recall stability and quiz misses, with an honest "low-confidence" label when data is thin. Quizlet can't tell me what to study; ChatGPT will confidently make it up. This is the only screen that answers "what do I do right now" without me having to think. Arjun flagged the same card. He's right.

Honourable mention: the flashcard scheduler. Correct midnight anchoring, same-session relearn on Again. Keep. Don't touch. (Agreed with Arjun.)

---

## 2. MODULE TEARDOWN

| Module | Verdict | Why (one breath) |
|---|---|---|
| Dashboard | **REVAMP** | 14 cards on "All". Focus tab is right; "All" is a wall. |
| Timer | **KEEP** (+1 field) | Best-engineered thing here. Needs an end-of-session note. |
| Exams | **KEEP** | Readiness badges are useful. Fix the tiny pencil (Arjun's find). |
| Notes / PDFs / Notebooks | **REVAMP** | 1,490-line studio, three overlapping surfaces, stuck-processing bug. |
| Flashcards | **KEEP** | Scheduler is correct. Leave it alone. |
| AI Study Lab | **MERGE** | Four tools, four chat UIs, seven redirect routes, region-locked personas. |

### Dashboard — REVAMP
`DashboardView.tsx` imports fourteen card components (Streak, ActivityRings, NextHour, NextExam, Tasks, TodayTimeline, Focus, Resume, SessionHistory, StudyCircle, DailyDrill, MisconceptionLedger, AIActions, RecentNotebooks). The "Focus & Tasks" default tab is the correct instinct. But the "All" tab is a gamified junk drawer, and half of it (StudyCircle, Achievements, ActivityRings) is Duolingo cosplay that costs me scroll time and gives me nothing back before Thursday.
- Keep: `NextHourCard`, `NextExamCard`, `TasksCard`, `TodayTimelineCard`, `ResumeLearningCard`.
- Demote to a "More" drawer or kill: `StudyCircleCard`, `ActivityRingsCard`, `StreakCard` (four widgets inside one card), `SessionHistoryCard`.
- The skip-onboarding path should not show nine empty-state cards. Arjun called it a waiting room. Same.

### Timer — KEEP
`TimerView.tsx` has Pomodoro / Countdown / Stopwatch / Flowtime, stores the real end timestamp so it survives tab death, logs sessions that finished while the phone slept, and works signed out. This is the one module I'd trust at 11pm. Two asks: an optional one-line "what I actually covered" field on session end (Arjun's #5, still true), and the `FocusStudyHUD` buttons get the same 44px mobile targets every sibling screen already has.

### Exams — KEEP
`ExamsView.tsx` is 404 lines and does the job: three fields, native date picker, difficulty bar, readiness badge. The `DayDetailModal` edit pencil is ~24px while the list version is 44px. Same fix Arjun listed. Nothing else needed.

### Notes / PDFs / Notebooks — REVAMP
This is where the bloat lives. `NotebookStudioView.tsx` is 1,490 lines. Then there's a separate `notes/` view (`NotesEditorPane`, `NotesAiSidebar`, `InlineAiToolbar`, `StudyBuddyGutter`, `StudyBuddyCard`, `InlineDiffPreview`) AND a `library/` view AND `folders/:folderId`. That's three or four front doors to "my stuff". I want one: upload, pick what to generate, get it back.
- The processing-status-in-localStorage bug Arjun ranked #1 is still the biggest silent failure in the app. Phone at school, laptop at home is my whole life. Move status to the `materials` row in Supabase.
- No scanned-PDF warning in the upload flow. Half my APUSH readings are photocopies of photocopies.
- "Study Buddy" gutter comments in my notes are the definition of theatre. I did not ask a cartoon to annotate my own notes.

### Flashcards — KEEP
`DeckCardsView.tsx` + the scheduler. Again/Hard/Good/Easy. Midnight anchoring. Same-session relearn. Nothing to say. This is the bar the rest of the app should clear.

### AI Study Lab — MERGE
`StudyLabView.tsx` is a 188-line launcher for three cards (Solver, Feynman, Viva) plus a side link to Exam Detective. Behind it: `/ai-tutor`, `/solver`, `/debugger`, `/exam-detective`, `/premortem`, `/exam-traps`, `/feynman`, `/viva`, `/sparring`, plus redirect aliases. Nine routes for "talk to the AI about a problem". Each has its own chat shell, its own message bubbles, its own loading state.
- Pedagogy is genuinely good (Arjun is right that the Feynman/Viva prompts are real, separate instructions). Keep the modes.
- Build one `ConversationShell` component; make Solver / Feynman / Viva / Sparring / Detective modes of it, not apps.
- Kill `/premortem` and `/exam-traps` as routes (they're aliases). Kill `/debugger` as a separate top-level entry.
- Region-locked personas (see Section 3) must be fixed before this module is usable outside India.

---

## 3. GLOBAL ARCHITECTURE ROAST

There is a good `lib/region.ts` sitting **uncommitted** in the working tree that already describes the right model: `RegionProfile { currency, locale, privacy, presetIds, framework, timeZonePrefixes }` with the comment "adding a market is adding a row, never a branch." That's the correct design. The problem is that `HEAD` doesn't use it yet, and the app still has `is this India?` branches everywhere.

### What's hardcoded today (committed on `main`)

| File | Line(s) | Assumption |
|---|---|---|
| `webapp/src/lib/entitlements.ts` | 426 | `tz.includes("Kolkata")` → Indian pricing. Timezone as nationality. |
| `webapp/src/lib/entitlements.ts` | 436–473 | `PLAN_PRICING_INR` is a parallel object; `getPlanPricing()` is a two-way `isIndianLocale()` branch. Only INR and GBP exist. No USD, EUR, AUD, CAD. |
| `webapp/src/views/marketing/LandingView.tsx` | 4–13, 202, 289–293 | Imports `PLAN_PRICING_INR` directly, hardcodes `"INR"`, literal `₹0`, UPI badge for every visitor on Earth. |
| `webapp/src/components/PaywallModal.tsx` | 171, 188 | `isIndian ? "INR" : "GBP"`; UPI copy. |
| `webapp/src/views/settings/BillingTab.tsx` | 203 | Same binary. |
| `webapp/src/api/aiFeynman.ts` | 250–260, 829, 850, 1512, 1695–1782 | "Strict CBSE Examiner (Dr. Sharma)", "NCERT keywords", "full marks", "1 mark" hardcoded in prompts AND in the local fallback reactions. |
| `webapp/src/api/aiSparring.ts` | 67–72 | Default persona "Tough CBSE Board Examiner". |
| `webapp/src/views/sparring/SocraticSparringView.tsx` | 188 | Fallback title is literally "Tough CBSE Board Examiner". |
| `webapp/src/lib/onboarding.ts` | 78–120 | CBSE / ICSE presets listed first, before GCSE, AP, IB. Ordering is a region choice masquerading as a constant. |
| `webapp/src/lib/onboarding.ts` | 313–319 | Exam-board picker: GCSE, A-Level, IB, AP, SAT, ACT, Other. No CBSE here (inconsistent with presets), no HSC, no Abitur, no Bac. |
| grading vocabulary (Feynman, analytics copy) | various | "marks", "full marks", "dropping marks". US says points/credit; IB says levels 1–7; AP says 1–5. |
| `supabase/migrations/20260830000000_add_notebooks.sql`, `hooks/useNotebooks.ts` | header comments | Legacy NCERT seed data referenced (comment-only now, but the mental model leaked into schema history). |

### How to make it universal (concrete, not vibes)

1. **Commit and wire `lib/region.ts`.** Make `RegionProfile` the single source. Delete `isIndianLocale()` and every `isIndian ? A : B` ternary. Add `US`, `EU`, `AU`, `CA`, `INTL` rows with real currencies and a `paymentHint` that's `undefined` for card-only markets.
2. **Pricing table keyed by ISO 4217, not by nationality.** `PLAN_PRICING: Record<Currency, PlanPricing>`; `getPlanPricing(region.currency)`. Stripe already supports multi-currency prices; `supabase/functions/stripe-billing` should pick the price ID by currency, not by a client-side timezone sniff.
3. **Framework-parameterised prompts.** Every examiner persona takes `region.framework`: `boardLabel`, `syllabusLabel`, `fullCreditLabel`. "Strict CBSE Examiner who checks NCERT keywords for full marks" becomes "Strict {boardLabel} examiner who checks {syllabusLabel} terminology for {fullCreditLabel}". Add frameworks for AP (College Board / CED / "full credit"), IB (IBO / subject guide / "level 7"), SAT (College Board / "800"). The persona name ("Dr. Sharma") becomes a per-framework field or is dropped.
4. **Grading scale as data.** `GradeScale { id, label, min, max, bands[] }`. AP 1–5, IB 1–7, US letter/percent, UK 9–1, India percent. `examReadiness.ts` and `analyticsEngine.ts` emit a normalised 0–1 and render through the scale; copy stops saying "marks".
5. **Onboarding presets ordered by `region.presetIds`,** not by file order. The board picker at `onboarding.ts:313` and the preset list at `:78` must be the same enum. Add chapter-level presets per framework later; that's a content problem, not an architecture one.
6. **Timezone is a clock, not a passport.** `Settings.timezone` drives scheduling only. Region detection = onboarding answer > settings override > `navigator.language` region subtag > timezone prefix, in that order, and it's a hint the user can change in Settings.
7. **Privacy regime as a field, not an `if`.** FERPA (US minors, which is me), GDPR, DPDP, PIPEDA. Drives consent copy and data-export wording. `region.ts` already has this shape; use it.
8. **Multi-tenant hook:** a `tenant_id` / `school_id` column on profiles now, so a US district or an IB school can later pin `region` + `framework` + `gradeScale` for all its students instead of each kid guessing. Zero UI needed today; just don't paint yourself into a corner.

---

## 4. ACTIONABLE ROADMAP LEDGER

Priority: **P0** = I'd bounce without it. **P1** = costs me real time this week. **P2** = bloat/cleanup. Alignment column references Arjun's Report Card (Artifact `TQGRiBE2VAG952fC8H3Qcm`) sections A–E.

| # | Pri | Area | File(s) | Change | Aligns with |
|---|---|---|---|---|---|
| 1 | P0 | Region | `webapp/src/lib/region.ts` (uncommitted) | Commit it. Add `US/EU/AU/CA/INTL` profiles with currency, locale, privacy, presetIds, framework. | New (global) |
| 2 | P0 | Pricing | `webapp/src/lib/entitlements.ts` | Delete `isIndianLocale()`, `PLAN_PRICING_INR`. Key pricing by currency; `getPlanPricing(region)`. | New |
| 3 | P0 | Landing | `webapp/src/views/marketing/LandingView.tsx` | Drop direct `PLAN_PRICING_INR` import, hardcoded `"INR"`, `₹0`, UPI badge. Render from region. Name AP / IB / SAT next to GCSE / CBSE in the boards line. | Arjun E-4 (mirror: surface *every* board, not just CBSE) |
| 4 | P0 | Paywall / Billing | `webapp/src/components/PaywallModal.tsx`, `webapp/src/views/settings/BillingTab.tsx` | Replace `isIndian ? "INR" : "GBP"` with `region.currency`; `paymentHint` from profile. | New |
| 5 | P0 | Stripe | `supabase/functions/stripe-billing/`, `stripe-webhook/` | Pick price ID by currency sent from client; validate against allowed set server-side. | New |
| 6 | P0 | AI personas | `webapp/src/api/aiFeynman.ts`, `webapp/src/api/aiSparring.ts`, `webapp/src/views/sparring/SocraticSparringView.tsx` | Parameterise every persona and fallback string on `region.framework` (`boardLabel`, `syllabusLabel`, `fullCreditLabel`). Remove "Dr. Sharma", "NCERT", "CBSE", "full marks" literals. | Arjun B (Study Lab), generalised |
| 7 | P0 | Notes status | `webapp/src/lib/materialProcessing.ts`, `supabase/migrations/` (new), `webapp/src/hooks/useMaterials*` | Add `processing_status` enum column on materials (`pending/done/skipped/failed`). Stop reading it from localStorage. | Arjun E-1 (agree, #1 silent failure) |
| 8 | P1 | Onboarding | `webapp/src/lib/onboarding.ts`, `webapp/src/views/onboarding/WelcomeView.tsx` | Order presets by `region.presetIds`. Unify the board picker (`:313`) with the preset ids (`:78`). Move "which exam" to step 1 or 2, not step 6 of 7. | Arjun E-4 |
| 9 | P1 | Grading | `webapp/src/lib/examReadiness.ts`, `webapp/src/lib/analyticsEngine.ts` | Introduce `GradeScale`; normalise scores to 0–1; render through scale. Purge "marks" copy. | New |
| 10 | P1 | Dashboard | `webapp/src/views/dashboard/DashboardView.tsx`, `DashboardCustomizeModal.tsx` | "All" tab → max 6 cards by default. Move StudyCircle / ActivityRings / SessionHistory / Achievements behind "More". Skip-onboarding path uses the Focus layout. | Arjun B (Dashboard: Improve) |
| 11 | P1 | Timer | `webapp/src/views/timer/TimerView.tsx`, `FocusStudyHUD.tsx` | Optional note field on session end (persist to session row). 44px mobile targets on HUD buttons. | Arjun E-5, C-2 |
| 12 | P1 | Exams | `webapp/src/views/exams/DayDetailModal.tsx`, `exams.module.css` | Edit pencil to 44×44 minimum. | Arjun C-1, E-2 |
| 13 | P1 | Upload | `webapp/src/lib/pdfText.ts` + upload modal | Surface the scanned-PDF warning in the upload flow, not only elsewhere. | Arjun B (Library) |
| 14 | P1 | Solver | `webapp/src/api/aiSolver*` / `supabase/functions/learnora-ai/` | Resolve JSON-vs-Markdown prompt contradiction for the solver request type. | Arjun E-3 |
| 15 | P2 | Study Lab | `webapp/src/views/study-lab/`, `feynman/`, `sparring/`, `debugger/`, `exam-detective/`, `routes.tsx` | One shared `ConversationShell` (bubbles, composer, loading, error). Modes, not apps. Remove `/premortem`, `/exam-traps` aliases; fold `/debugger` into Solver. | Arjun B (Study Lab: Merge shells) |
| 16 | P2 | Notes bloat | `webapp/src/views/notebooks/NotebookStudioView.tsx` (1,490 lines), `notes/StudyBuddy*` | Split studio into panes; kill Study Buddy gutter annotations (theatre). Decide one front door: Library or Notebooks, not both plus Folders. | New |
| 17 | P2 | Settings | `webapp/src/views/settings/` | Password re-check on "Wipe All Data". Add Region + Framework selector so detection is overridable. | Arjun B (Settings) |
| 18 | P2 | Schema | `supabase/migrations/` | `profiles.region`, `profiles.framework_id`, `profiles.grade_scale_id`, nullable `profiles.tenant_id`. | New (multi-tenant) |
| 19 | P2 | Legacy shell | `js/`, `index.html`, `style.css` | Already redirect-only per CLAUDE.md. Delete once `terms/reset/verify` are in `webapp/`. | New |
| 20 | P2 | Copy | global | Replace "marks" with `fullCreditLabel` / "points"; "board exam" with `boardLabel`. | Arjun D, generalised |

### What I'd ship first, in order, if Thursday were real
1. Items 1–5 (region + pricing). Otherwise Americans never see item 6.
2. Item 6 (personas). Otherwise the AI grades me against NCERT.
3. Item 7 (processing status). Otherwise my notes get stuck between phone and laptop.
4. Item 10 + 11 (dashboard diet, timer note). These are the two screens I'd live in.
5. Everything else.

**Bottom line:** the engine is better than the paint. The scheduler, the timer, and the "study this next" math are ahead of Quizlet. But the app introduces itself in rupees and grades me like a CBSE examiner, and no amount of Feynman pedagogy survives that first screen. Fix the region layer and the rest of this ledger becomes a polish list instead of a rescue.

— Maya

---

## 5. EXECUTION STATUS (2026-09-16 — ledger complete)

All 20 items applied on `audit/maya-feedback`. `tsc` clean; Vitest 2683 pass. The 12 failures in `MaterialPanel.test.tsx` and `NotesAiSidebar.test.tsx` are pre-existing (identical on the pre-change baseline) and untouched here.

| # | State | Notes / follow-ups |
|---|---|---|
| 1–4 | ✅ | `lib/region.ts`; `PLAN_PRICING_BY_CURRENCY` (GBP/USD/INR/EUR/AUD/CAD); landing, paywall, billing render from region. |
| 5 | ✅ | Client sends `currency`; `stripe-billing` validates against allowlist, reads `STRIPE_PRICE_{PLAN}_{PERIOD}_{CUR}` (GBP falls back to the unsuffixed var); webhook maps every variant. **Ops:** create per-currency Stripe prices and set the secrets before non-GBP checkout works. |
| 6 | ✅ | Personas templated on `getFramework()` (Settings override > region). Feynman reads it lazily now (Proxy), not at module load. |
| 7 | ✅ | `materials.processing_status/_error/_updated_at` (migration `20260916000000`); client syncs the row, prefers it when newer. Open: cross-device *retry* still needs `requestPayload` persisted (localStorage only). |
| 8 | ✅ | Presets per region; board picker is on step 1 (goal) already; `region`/`consent` on answers. |
| 9 | ✅ | `lib/gradeScale.ts` — `GradeScale`, `normaliseScore`, `renderGrade`, override via Settings. Engines still emit percentages internally by design; `renderGrade` is now wired at the render sites (`NextHourCard`, `TrajectoryView`, 2026-09-16). Remaining: analytics views. |
| 10 | ✅ | "All" tab default hides rings / streak / community (six cards); "More (n hidden)" opens the customize modal. |
| 11 | ✅ | `study_sessions.notes` (migration `20260916010000`); "What did you cover?" field on the timer; HUD buttons 44px on coarse pointers. |
| 12 | ✅ | `dayItemEditBtn` 44×44. |
| 13 | ✅ | Scanned-PDF warning under the chosen file in the Create dialog. |
| 14 | ✅ | New `solver` JSON mode in `learnora-ai`; `aiDebugger` no longer sends the Markdown-only `rewrite` mode with a JSON schema. |
| 15 | ✅ (partial) | `components/conversation/ConversationShell` (bubble, composer, typing, error, scroll-pinned log); adopted for Sparring bubbles. `/premortem`, `/exam-traps` routes removed. Open: migrate Feynman / Solver / Detective onto the shell's `Composer` + `ConversationShell`. |
| 16 | ✅ (partial) | Study Buddy gutter, card and hook deleted from Notes and Notebook Studio. Front door decision: **Library** (`/library`) — Notebooks stays a workspace reached from it; Folders is its subject page. Open: split `NotebookStudioView` (now ~1,440 lines) into `SourcesDesk` / `Canvas` / `ToolsRail` components. |
| 17 | ✅ | Wipe requires the password (`authApi.verifyPassword`); Region, Exam framework and Grade scale selectors in Preferences, persisted to `profiles`. |
| 18 | ✅ | `profiles.region / framework_id / grade_scale_id / tenant_id` (migration `20260916020000`). |
| 19 | ✅ | `js/`, `vendor/`, `i18n.js`, root `index.html`, `terms/verify/reset-password.*` deleted; `build.sh`, `vercel.json` (`/terms` → app), site links and the root `tests/` that read them updated. |
| 20 | ✅ | "dropping marks" → "losing credit"; Feynman fallbacks use `fullCreditLabel`. |

## 6. Follow-up audit of merged PR #97 (2026-09-16)

Baseline: `046e8a885bded7091f28421d49ba5a92d09cbebc`, the merge of PR #97. Its original PR description says documentation only, but the merged change also modifies the app and database schema. Section 5 records that PR's execution report; the findings below supersede its completion claims for these workflows.

Publication was interrupted by a usage limit. Before resuming, this follow-up was reconciled with `472e2254a1b603e07a3be4dd71afaec5372f73b1` (merged PR #98). That PR independently delivered the build repairs and creation-test cleanup described below, plus command history and grade displays. Those upstream changes are retained; this follow-up adds the curriculum/state persistence fixes and scanned-PDF regression coverage.

Maya's test case remains a US high-school junior balancing AP classes and SAT preparation, using a phone at school and a laptop at home. This pass follows curriculum selection, source creation and recovery, notes editing, and recorded study sessions.

| Priority | Finding | Follow-up implementation |
|---|---|---|
| P0 | The merged source fails TypeScript checks: the Solver mode is absent from `EdgeMode`, removed Study Buddy code leaves unused editor state, and a timer fixture lacks the new note fields. | Complete the Solver client contract, remove the unused state, and update the fixture. |
| P1 | Region/framework preferences are written to profiles but never restored. The selectors write remotely before Save Changes and silently swallow failures. | Restore validated profile pins after sign-in, protect edits from late responses, clear pins on account changes, and save the three choices together with visible sync errors. |
| P1 | Selecting SAT during onboarding does not change examiner vocabulary; SAT, ACT and A-Level are absent as independent framework choices. | Add these framework definitions, apply the chosen framework to saved settings and the profile, and honor explicit region preferences in onboarding. |
| P1 | Pending and completed status writes race, cache invalidation can beat the final row update, and the Notes editor ignores the server status. | Serialize writes per material, flush before success invalidation, refresh pending rows, use the newer status in the editor, and refresh notes after a processing-state change. |
| P1 | A device without the local record cannot distinguish intentionally omitted notes from missing output. | Persist the existing `skipped` status when notes were deliberately omitted and render that explanation on another device. |
| P1 | Timer coverage notes are saved only to Supabase, disappearing from the local history used offline and from guest-account imports. | Preserve notes in local session history and guest imports, show them in recent sessions, and use them as the topic for the post-session quick check. |
| P1 | Creation tests stop at a stale submit-button label, and drafts leak between tests. | Match the current visible label, isolate drafts, and verify the scanned-PDF warning. All 21 creation tests now exercise their intended flows. |

### Verification

- **239 tests passed across 20 focused files after integrating PR #98**: Solver; settings hydration and preferences; onboarding helpers and wizard; material synchronization and polling; source creation; Notes route, editor, sidebar and autosave; timer, study-room integration, local history and guest imports; command palette; dashboard and trajectory grade displays. The earlier pre-integration run passed 193 tests across 16 files.
- `npm run build` passed, including application and test TypeScript projects and the production Vite build. Existing large-bundle warnings remain.
- `npm run lint` passed with 14 existing warnings. Prettier passed for all changed source/test files; `git diff --check` passed.
- Validation used a clean temporary copy with `npm ci` from the committed lockfile because a native dependency was locked in the workspace. Workspace dependencies were restored from that install; their versions match the lockfile and the locked binary matches the validated copy.
- The browser runtime reported no available browsers. These are source and automated component-flow findings, not visual browser QA or a live two-device test.

### Remaining work from the original roadmap

- Deploy and verify PR #97's Supabase migrations and per-currency Stripe configuration. This follow-up adds no migration and does not change production services.
- Persist the original generation options for cross-device retries. Status sync is not a durable background job: closing the generating tab or racing retries on two devices still needs a server job/ownership design.
- The timer note is captured before logging; editing an already-finished session remains separate work.
- PR #98 wired grade-scale presentation into the dashboard and trajectory. These remain heuristic forecasts, not official AP or SAT scores. The remaining conversation-shell adoption and notebook-studio split are still incomplete.
- The framework remains an account-wide default. Per-course AP/SAT overrides would support Maya's mixed workload more directly.

---

## 7. SECOND PASS — Maya Vance, after PRs #98 and #99 (2026-09-16)

**Baseline:** `bcf79fe` (merge of #99). `tsc -b` clean. Vitest 211 files / 2723 tests green. This pass is a browser walkthrough of the signed-in app (`/app/harness.html`, desktop 1280px and phone 375px) plus a source read of everything the walkthrough touched. Same filter as before: does it save me time before Thursday's AP Chem test.

### 7.1 What #97–#99 actually fixed

Credit where due. The passport problem is gone: no rupees, no Dr. Sharma, no NCERT. The framework I pick now survives a sign-in on a second device (#99). The timer asks what I covered. Grade forecasts render in my scale on the two screens I'd read them on (#98). The processing-status bug that stranded my notes between phone and laptop is fixed at the row level. I can get past the landing page. That was the whole ask of pass one, and it landed.

### 7.2 The verdict this time

**The app has a thesis and the app doesn't believe it.** `lib/trajectory.ts` opens with the best product statement in the repo: *"every other tool is an artifact factory... none of them own the outcome."* Then the UI is organised exactly like an artifact factory. Library has five tabs of artifacts (Notebooks / Subjects / Files & notes / Flashcards / Quizzes). Study Lab has four tools. Plan has four tabs. The Dashboard has four tabs times fourteen cards times a Customize modal, and the sidebar has six destinations with children. And the one screen that *owns the outcome* — "Study Enzymes next, 45 min, here's why" — is on **tab 2** of the dashboard. Not the default tab. On my phone, it is a horizontal swipe I don't know exists (see 7.4, mobile).

I opened the app twelve times during this walkthrough. Not once did the first paint tell me what to do. It told me the date, gave me a paragraph ("Check what is due, open your notebooks, or continue your last study block"), two buttons ("Choose a study exercise", "Customize"), a tab strip, a notebooks shelf, and then a 25-minute Pomodoro button next to a countdown. The Pomodoro button is not attached to a topic. The countdown is not attached to an action. Quizlet doesn't do better than this, but Quizlet isn't claiming to.

### 7.3 The loop is open (the finding that matters)

Follow the one thing the app is for — "what should I do right now" — end to end:

| Step | What happens | Evidence | Where it breaks |
|---|---|---|---|
| 1. Forecast | `useTrajectory` builds topic states from **decks, cards, quiz attempts, lifeContext** | `hooks/useTrajectory.ts:39-44`, `lib/trajectory.ts:195` | "A deck is the unit of a topic... a topic with no cards has nothing to project." Until I've made flashcards, NextHour is silent. I take notes and do past papers; I don't make cards on day one. |
| 2. Start | NextHour's "Start 45 min on Enzymes" calls `prepareFocus()` and navigates to `/timer` | `NextHourCard.tsx:42-45` | Fine. This is the one hand-off that works. |
| 3. Session | Timer runs; `TopicValueHint` says "Enzymes is worth 49.3 **marks** an hour" | `views/timer/TopicValueHint.tsx:63`, `lib/trajectory.ts:633` | "marks" survived ledger #20. Also 49.3 is a raw-percent-per-hour figure shown to a student whose scale is AP 1–5. Meaningless number, wrong unit. |
| 4. End | Timer logs `study_sessions{minutes, task, folder_id, notes}` | `api/sessions.ts:25` | Logged — and **never read by the forecast**. An hour of timed study on Enzymes changes nothing in step 1. The module I trust most is invisible to the model. |
| 5. Check | "Quick check" opens the chat drawer with a free-text prompt: *"Give me a fast 3-question multiple-choice check on ${topic}"* | `TimerView.tsx:201-212` | Not grounded in my cards or notebook. Not scored. Writes nothing. The answer I give to question 2 evaporates. |
| 6. AI tools | Feynman, Viva, Solver, Detective each run a real pedagogy | `api/aiFeynman.ts:444`, `aiSparring.ts:224`, `aiDebugger.ts:45`, `aiExamDeconstructor.ts:711` | Sessions, traces, repairs and disarmed traps are **localStorage**. Phone at school, laptop at home: two different histories. Misconceptions do go to Supabase (`misconceptions` table) — and `trajectory.ts` never reads them. |
| 7. Availability | The forecast's "hours you actually have" comes from `lifeContext` | `lib/lifeContext.ts:27` — `learnora_life_context_v1`, localStorage by design ("readable synchronously on first paint") | My week exists on one device. The forecast on my phone and the forecast on my laptop are computed from different availability. "Learnora doesn't know your week yet" greets me on every new device. |
| 8. Back to 1 | — | — | Nothing from steps 3–7 moves the number in step 1 except flashcard reviews and quiz attempts (and attempts only *penalise*, `trajectory.ts:248`). |

So: the engine is real, the CTA is real, and the loop is open on both ends. Studying doesn't count as evidence, and the evidence that is collected doesn't sync. #99 fixed cross-device sync for exactly one of the nine localStorage silos (material processing). The other eight are listed below.

**Local-only state that should follow the account** (from `grep learnora_` on `src/`):
`learnora_life_context_v1` (my week — feeds the forecast), `learnora_feynman_sessions`, `learnora_cognitive_traces_v1`, `learnora_micro_repairs_v1`, `learnora_disarmed_traps_v1`, `learnora_trap_immunity_radar_v1`, `learnora_study_goals`, `learnora_unlocked_achievements`, `learnora_daily_progress_v1`, `learnora_settings` (three of its fields were pinned to `profiles` in #99; the rest — coach style, detail level, AI language — still reset per device), `learnora_dashboard_layout_v1`. Sparring sessions go through `saveSparringSession` (`aiSparring.ts:224`) to the same place.

### 7.4 Everything else I hit, by screen

**Dashboard (`views/dashboard/DashboardView.tsx`)**
- NextHourCard renders only in the `insights` and `all` tabs (`:224`, `:278`). Default is `focus` (`:52`). The best card in the app is not on the home tab.
- `if (import.meta.env.MODE === "test") return "all"` (`:51`). Tests exercise a tab users don't land on. `DashboardView.test.tsx` is testing a layout nobody sees by default.
- "Your recent answers put current mastery around 1." (`NextHourCard.tsx:74`). Grade-scale rendering of a *mastery* number. On GCSE this reads "around 1"; on AP it will read "around 1" too. A mastery isn't a grade. Show it as a level ("low", "building", "solid") or don't show it.
- Adjacent cards disagree on units: NextExam says "25% Ready", NextHour says "projected range 6–9". Same exam, two scales, one screen.
- Three "start" affordances on one tab: "Start a focus session (25m Pomodoro)" (FocusCard, no topic), "Start 45 min on Enzymes" (NextHour, topic-bound), "Choose a study exercise" (header, → Study Lab). Pick one.
- "Tell us when your **lectures, shifts and training** are" (`TodayTimelineCard`). I'm sixteen. Lectures are for the university persona; the copy doesn't read `onboarding.goal`.
- `dashboardDate()` hardcodes `"en-GB"` (`:31`). A US student reads "Wednesday 16 September" while the rest of the app formats by browser locale. Last `en-GB` literal outside `region.ts`.
- **Mobile (375px):** the tab strip is `overflow-x: auto; scrollbar-width: none` (`dashboard.module.css:68-81`). "Activity & Peers" and "All" are off-screen with no affordance. First actionable content (the notebooks shelf) is ~900px below the fold, under a date, a paragraph, two full-width buttons and the tab strip.

**Timer (`views/timer/`)** — still the best module. Two leaks: "marks an hour" (above), and the post-session check being an unscored chat prompt. The "What did you cover?" note from #99 is captured but only used as the chat topic string.

**Onboarding (`lib/onboarding.ts`)** — presets are mutually exclusive. "AP Courses" (`:167`) *or* "SAT / ACT Prep" (`:184`). I am both. #99's own follow-up list names per-course framework as open; the preset model is the same problem one layer up. The AP preset's milestones are "Midterm" and "AP Exams" — nothing models the *unit test on Thursday*, which is the thing that actually drives what I study this week.

**Library (`views/library/`)** — five tabs plus `/notebooks` plus `/folders/:id`. Pass one said "one front door" and Section 5 says the decision was Library. The tabs inside Library are the same four doors, one level down.

**Study Lab (`views/study-lab/`)** — the launcher copy is good ("Start with the problem you have, not the name of a tool"). Then it presents four tools by name. Only Sparring is on `ConversationShell` (ledger #15 still partial). Feynman (`aiFeynman.ts`, 2064 lines) and Sparring (893) each carry their own persona, session, storage and scoring stacks.

**Settings** — eight sections. "Interactive Report" and "CSV Export" are the second card on the first tab. I have never once wanted to export a CSV of my study logs at 11pm.

**Plan** — "Optimal Focus: Afternoon Flow (3 PM – 6 PM)" is shown as a fact on the harness account with no week set up. If it's a default, say so.

### 7.5 What "beast mode" should mean

Not another twenty-row ledger. The previous ledger was right and it's done. The remaining structural cleanups (#15 shell migration, #16 studio split) are real but they're refactors — I wouldn't notice them on Thursday.

The one change that would make me pick this over ChatGPT-plus-Quizlet: **close the loop, and make the closed loop the home screen.**

1. **Home = one decision.** Replace the four-tab dashboard with a *Today* screen whose first paint is the NextHour decision, the reason, and one Start button. Everything else (tasks due today, next exam, notebooks) is below it, in that order. No tabs. No Customize modal. The "All" grid is what Progress is for.
2. **Sessions are evidence.** `study_sessions` already has `minutes`, `folder_id`, `task`, `notes`. Map a session to a topic (deck or folder) and feed `minutes` into `buildTopicStates` as learning gain via the existing `learningGain()` — the engine already has the function, it's only ever called inside the simulation.
3. **The quick check is a real check.** Replace the chat prompt with 3–5 questions generated from the cards and notebook of the topic just studied (the `learnora-ai` edge function already has quiz and solver modes), scored, written as a `quiz_attempt` with `weak_topics` — which is the one input the forecast already consumes. Then re-render NextHour on the same screen: "Enzymes moved 3 → 4. Next: Titration."
4. **The evidence follows the account.** One `learning_events` table (`user_id, topic_key, source, score, minutes, occurred_at, payload jsonb`) that Feynman, Viva, Solver, Detective, quick-check and the timer all append to, replacing the localStorage silos for *outcomes* (drafts and UI preferences can stay local). `life_context` moves to `profiles` (jsonb) with the same last-write-wins, offline-cached pattern #99 used for framework pins.
5. **Feynman and Viva move the number.** A Feynman debrief that scores a concept, and a Viva round, each append a `learning_event` with a 0–1 score for the topic. `buildTopicStates` reads events alongside cards. The AI Study Lab stops being a side quest.

That's it. Five moves, one loop. After it, the app's first screen says what its best file says: your next hour is worth this much, here, go — and it's right, because everything you did yesterday on any device counted.

— Maya
