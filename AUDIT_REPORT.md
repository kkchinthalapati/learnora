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
