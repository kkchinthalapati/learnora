# Learnora Migration Ledger — Vanilla JS → React

Standalone tracking doc, separate from `REACT_MIGRATION.md` (the step-by-step
build log for the migration itself). This one is a status/bugs/refactor/design
audit — use it to track progress on cleanup and revamp work, not to re-derive
migration history (that lives in `REACT_MIGRATION.md`).

**Audited:** 2026-08-01. Every claim below was checked against current file
contents, not copied from memory — file:line references are spot-verified.

**Updated:** 2026-08-01, after a working session that closed Step 25 (the
Notes AI study sidebar) and the AI edge function's CORS allow-list. Sections 1,
2, 3 and 6 are amended below; the stale entries this doc itself carried — Step
23 listed as high-impact when it had already shipped, and the `OnboardingBanner`
refactor — are corrected in place rather than left to be re-derived.

---

## 1. Migration Status

**Fully migrated (Steps 1–26 of `REACT_MIGRATION.md`):** scaffold, design
tokens, shared primitives (Modal/Toast/Icon/Button/EmptyState/Skeleton),
Supabase client + auth + protected routes, the API/TanStack Query layer for
all 11 entities, the universal CreateModal, Settings, Tasks, Exams, Timer,
Library + Subject detail, Dashboard, Notes editor (Quill wrapper), the AI
layer, Weekly Plan, Quiz runner + review, Turbo chat, Flashcard review, the
auth wall, `/verify` `/reset-password` `/terms`, the production cutover
mechanism (`vercel.json` + Vite `base`), the App Shell, i18n (Step 23), the
`createStudyPackage` pipeline, and the Notes AI study sidebar (Step 25).

**Nothing is left vanilla-only as tracked port work.** Step 25 closed the last
of it on 2026-08-01: `views/notes/NotesAiSidebar.tsx` + `lib/notesChatPrompt.ts`
port `sendNotesChat` (`js/ai.js:1388-1512`), the quiz-me/flashcard quick
actions and the split-pane layout beside the editor. What remains is not
*porting* — it is the route-by-route cutover (section 6) and the loose ends in
section 2.

**Deliberately kept vanilla-only (a decision, not a gap):**
- `js/datepicker.js` — a 300-line custom calendar overlay. Both `ExamPanel`
  and `TaskPanel` use a plain `<input type="date">` instead: functionally
  equivalent, fully accessible, just visually different.
- The "Cinematic Boot Sequence" splash (`js/ui.js:1259-1272`) — `ProtectedRoute`
  uses a plain skeleton instead.
- The blocking "AI is thinking…" full-app `inert` overlay (`js/ui.js:435-501`)
  — per-feature pending states (button spinners, the chat's typing indicator)
  stand in for it instead.

**DOM-manipulation check — no offenders found.** Searched `webapp/src` for
`document.querySelector`/`getElementById`/direct `classList`/`style` writes
outside of what a real DOM node legitimately requires. Every hit is
intentional and centralized:
- `main.tsx` — the one `getElementById("root")` mount point, standard Vite/React.
- `OverlayStackProvider.tsx` — a reference-counted `document.body.style.overflow`
  scroll-lock, a deliberate port of the vanilla `ModalManager`'s behavior.
- `lib/appearance.ts` — one `applyAppearanceToDom()` function that sets
  document-level theme attributes; the React equivalent of the vanilla theme
  engine, not scattered DOM poking.
- Quill-wrapper tests reach into the editor's real DOM node — expected, since
  Quill itself isn't a React component.

One minor exception, not currently tracked anywhere: `OnboardingBanner.tsx:62`
does `document.getElementById("dash-task-input")?.focus()` to focus an input
that lives in a sibling component, instead of going through a ref/callback.
Works, low risk — listed under Refactoring below.

---

## 2. Incomplete Work

Carried forward from `REACT_MIGRATION.md`'s "Known loose ends" (only the
still-open items — most of that section is already struck through as
closed):

- The docked mini-timer can sit on top of a view's bottom-left controls (quiz
  completion/review screens) — inherited from the vanilla's own
  `position: fixed` timer, not new.
- ~~The AI edge function's CORS allow-list lists `http://localhost:3000` but
  not `http://localhost:5173`~~ — fixed 2026-08-01:
  `supabase/functions/learnora-ai/index.ts`'s `DEFAULT_ALLOWED_ORIGINS` now
  includes `http://localhost:5173` and `http://127.0.0.1:5173` (distinct
  origins to a browser; Vite prints whichever the host resolves to).
  **Needs a function redeploy to take effect** — the running deployment still
  serves the old default list, so `ALLOWED_ORIGINS` remains the no-redeploy
  workaround until then. Never affected tests (MSW intercepts at the network
  layer).
- Steps 11-13's real-browser verification passes are still owed (Library's
  four tabs, a subject workspace, the dashboard's cards, Quill's toolbar) —
  no browser driver was available in those sessions. Step 18 later found
  Playwright's Chromium is actually installed locally; that recipe should be
  reused rather than re-declaring it impossible. **Step 25 (2026-08-01) proved
  the approach works**: it drove a real browser against `npm run dev` and
  checked the notes view at desktop and 375px in both themes. The technique
  that unblocked it is worth reusing — every interesting route is behind the
  auth wall, so with no test account it mounted the view directly in a
  throwaway harness entry (`devharness.html` + a `src/devharness.tsx` that
  wraps the component in the App provider stack with fake props), then deleted
  it. Anything needing *real* data still needs a real session.
- ~~No route has actually been cut over~~ — Settings was cut over 2026-08-01
  (`REACT_MIGRATION.md` Step 26): `#settings` now redirects to `/app/settings`
  and the vanilla view is deleted. Every other route (Tasks, Exams, Timer,
  Library, Dashboard, Notes, Plan, Quiz, Review) still belongs to the vanilla
  app — this is the first cutover, not the last.
- The Supabase auth redirect allow-list doesn't include `/verify` /
  `/reset-password` under `/app` — an external config change (Authentication →
  URL Configuration), can't be fixed from this repo.
- The sign-up "check your inbox" screen's cross-tab confirmation case
  (confirming in a different browser) is untested.
- `ResetPasswordView`'s "link expired" check is a 3-second heuristic
  ("nothing happened yet = bad link") — can misfire as a false "expired" on a
  slow connection. Reading the URL's `error`/`error_description` hash params
  directly would be the deterministic fix.
- `npm run format:check` fails on 33 pre-existing files even on an LF
  checkout — a real formatting backlog underneath the Windows CRLF issue, not
  only a line-ending problem.
- `api/dataAdmin.ts`'s `exportCSV` (Blob + anchor-click download) has no
  automated test — real-browser-only DOM interaction, nothing meaningful to
  assert under jsdom.
- Three copies of `learnora.jpg` exist (root, `webapp/public`,
  `webapp/src/assets`) — each serves a different need (vanilla, favicon,
  bundled import), harmless at 62KB, worth collapsing only if the vanilla app
  is ever retired.
- `MaterialPanel`'s inline "+ New folder" selects the new folder via local
  state rather than waiting for cache invalidation — intentional (avoids a
  flash where the folder is briefly unselectable), just worth knowing if a
  future "create inline from a select" needs the same trick.
- **New, not previously tracked:** `OnboardingBanner.tsx:62`'s
  cross-component `getElementById` focus call (see section 1).
- **Found 2026-08-01:** `src/hooks/useLiveClock.test.ts` fails on any machine
  whose locale formats time as 12-hour — it asserts `toContain("14:07")` and
  gets `"02:07 PM"`. Pre-existing and locale-dependent, not a code bug: the
  test hard-codes a 24-hour expectation instead of pinning a locale (or
  asserting on the formatter's own output). It is the *only* failing test in
  the suite, so it currently makes a green run look red. Fix by passing an
  explicit locale to the formatter under test.

**Corrections to `REACT_MIGRATION.md`'s ledger — applied 2026-08-01,** now
that this session was editing that doc anyway (the previous audit noted them
but left the source doc untouched by request):
- "The dashboard's Focus-Session quick-starts are not wired up" was stale —
  `FocusCard.tsx` already calls `startFocusPreset()`. Struck through there.
- The full-gap-ledger's "i18n still open" was stale — Step 23 closed it.
  Struck through there.

---

## 3. Bug Fixes Needed

Short list — the audit found no migration-introduced regressions, no broken
event handlers, no stale closures, and no missing `useEffect` cleanups in
`webapp/src`. What's actually here is carried over from the vanilla, not
introduced by the port:

- The timer logs a task's *text*, not its id, so renaming a task orphans the
  attribution on past study sessions. Worth switching to the id next time
  anyone touches the `study_sessions` schema.
- The mini-timer/quiz-review z-index overlap (also listed above as incomplete
  work — it's cosmetic but is a real visual bug).
- `ResetPasswordView`'s expiry heuristic can false-positive on slow
  connections (also listed above).
- `useLiveClock.test.ts`'s hard-coded 24-hour assertion (see section 2) — a
  test bug rather than an app bug, but it is the one red line in an otherwise
  green suite, which is its own cost.

**Fixed in the 2026-08-01 session, and worth knowing it was a real bug:** the
vanilla's notes sidebar shared one `AI.chatHistory` array with the workspace
chat, so a question asked beside a document became context for the floating
panel on an unrelated view. The React port (Step 25) gives the sidebar its own
transcript keyed on the material. Listed here because the vanilla still has
this behaviour on every route that hasn't been cut over.

---

## 4. Refactoring Opportunities

- `OnboardingBanner.tsx`'s `document.getElementById("dash-task-input")?.focus()`
  → pass a ref down, or lift the focus call into a shared dashboard context,
  next time that file is touched.
- The `npm run format:check` backlog (33 files) → one dedicated
  `npm run format` commit, plus a repo-wide line-ending decision
  (`.gitattributes` forcing LF, or Prettier's `endOfLine: "auto"`).
  **Confirmed 2026-08-01, and confirmed as needing its own commit:** running
  `npm run format` during the Step 25 work rewrote 34 unrelated files in one
  sweep. That churn was reverted so it would not bury a feature diff — it is a
  five-minute job for whoever picks it up, but it has to land on its own.
- Nothing else qualifies. No class components exist to convert, no
  prop-drilling smell was found (Context + TanStack Query already do the
  job), and no repetitive un-componentized JSX turned up in the parts of
  `webapp/src` surveyed. This section is short because the ported code is
  already in reasonable shape — padding it with invented items would misrepresent
  that.

---

## 5. Revamping & Design Upgrades

`REACT_MIGRATION.md` decision #3 explicitly scoped the migration as **"No
visual redesign"** — tokens ported 1:1, CSS Modules only, no new component
library (decision #10: "not a new library" for Modals/Toasts), no
`react-quill` (decision #8). That decision stands in the migration doc.
This section exists because we're now deliberately reopening it *here*, as
its own tracked backlog — a proposal list for future sessions to scope and
build one at a time, not a batch of changes made in this pass:

- **Modal enter/exit animation.** Already a known loose end: React unmounts
  on close, so the vanilla's fade-out never got ported (only the CSS
  enter-animation exists). `AnimatePresence` (Framer Motion) is a natural fit
  to restore it — small, contained, and it's a gap we already know about
  rather than a new ask.
- **Route/view transitions.** Sidebar views (Dashboard/Tasks/Exams/Library/…)
  currently swap instantly. A light `AnimatePresence` crossfade at the
  route-outlet level would read as more "app-like" for very little code.
- **Dashboard micro-interactions.** Subtle scale/opacity on the Turbo chat
  command bar, toast entrances, and the quick-add widget — cheap, high-visibility
  polish once animation is per-component instead of hand-rolled CSS keyframes.
- **Empty states.** The `EmptyState` primitive could get a small illustrative
  animation instead of a static icon.
- **Flashcard flip.** Called out in `REACT_MIGRATION.md` as "the most
  complex" ported view (Step 18) — worth a look at a Framer Motion 3D-flip if
  the current CSS-transform flip ever feels stiff in review.

None of this is implemented in this pass — the deliverable here is the
ledger itself, per the original ask.

---

## 6. Priority Order

**Blockers:** none. No build breakage, no migration-introduced regression
currently blocks shipping. One failing test (`useLiveClock.test.ts`), but it
is a locale-dependent test bug, not a product defect — see section 2.

**Done since this list was written (2026-08-01):**
- ~~Step 23 — i18n port.~~ Was already shipped when this list was written;
  listing it as high-impact was the ledger's own stale entry.
- ~~Step 25 — Notes AI study sidebar.~~ Closed. This was the last known-scoped
  port; there is no remaining "build it in React" work.
- ~~CORS allow-list fix for local `npm run dev` model calls.~~ Fixed in code;
  **still needs the edge function redeployed** to take effect.

**High impact — the whole of what's left:**
- **Continuing the route-by-route cutover to `/app`.** This is now the only
  thing standing between the app and being React. Settings went first (Step
  26, 2026-08-01); Tasks, Exams, Timer, Library, Dashboard, Notes, Plan, Quiz
  and Review still belong to the vanilla app. Step 26's entry documents the
  recipe: add the route to `CUTOVER_ROUTES` in `js/router.js`, delete the
  vanilla `<section>` from `index.html`, and leave the no-op `bind*` listeners
  alone unless they are provably view-specific. Tasks or Timer are the natural
  next pick — self-contained, and each has a full React test suite behind it.
- **Redeploy the AI edge function** so the CORS fix above actually lands.

**Nice to have:**
- Everything in sections 4 and 5.
- The smaller loose ends: mini-timer overlap, duplicate logo files, the
  format backlog, `exportCSV`'s missing test, the reset-password heuristic,
  the sign-up cross-tab case, and the `useLiveClock` locale assertion.

**Verification debt worth paying down alongside any of the above:** every
route except `/app/settings` has still only ever been exercised under jsdom.
Step 25 showed a real-browser pass is achievable (see section 2 for the
harness technique), so a cutover is a good moment to take one.
