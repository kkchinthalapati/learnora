# Learnora Migration Ledger — Vanilla JS → React

Standalone tracking doc, separate from `REACT_MIGRATION.md` (the step-by-step
build log for the migration itself). This one is a status/bugs/refactor/design
audit — use it to track progress on cleanup and revamp work, not to re-derive
migration history (that lives in `REACT_MIGRATION.md`).

**Audited:** 2026-08-01. Every claim below was checked against current file
contents, not copied from memory — file:line references are spot-verified.

---

## 1. Migration Status

**Fully migrated (Steps 1–22, 24 of `REACT_MIGRATION.md`):** scaffold, design
tokens, shared primitives (Modal/Toast/Icon/Button/EmptyState/Skeleton),
Supabase client + auth + protected routes, the API/TanStack Query layer for
all 11 entities, the universal CreateModal, Settings, Tasks, Exams, Timer,
Library + Subject detail, Dashboard, Notes editor (Quill wrapper), the AI
layer, Weekly Plan, Quiz runner + review, Turbo chat, Flashcard review, the
auth wall, `/verify` `/reset-password` `/terms`, the production cutover
mechanism (`vercel.json` + Vite `base`), the App Shell, and the
`createStudyPackage` pipeline.

**Still vanilla-only, actively tracked as open work:**
- **i18n (Step 23).** `i18n.js` has no React equivalent — the Preferences tab
  persists `uiLanguage`, but the React UI is English-only regardless of it.
- **Notes AI study sidebar (Step 25).** `sendNotesChat` (`js/ai.js:1388-1512`)
  — quiz-me/flashcard quick actions plus the split-pane layout beside the
  editor — isn't ported. The Turbo chat already reads a note's content and
  tutors on it from `/notes/:materialId`, so the capability exists; it's just
  not docked in the editor's own sidebar.

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
- The AI edge function's CORS allow-list (`supabase/functions/learnora-ai/index.ts`)
  lists `http://localhost:3000` but not `http://localhost:5173` — any real
  model call from `npm run dev` (Vite) is blocked before it reaches the
  function. Fixable via the `ALLOWED_ORIGINS` env var on the function, no
  redeploy needed. Doesn't affect tests (MSW intercepts at the network layer).
- Steps 11-13's real-browser verification passes are still owed (Library's
  four tabs, a subject workspace, the dashboard's cards, Quill's toolbar) —
  no browser driver was available in those sessions. Step 18 later found
  Playwright's Chromium is actually installed locally; that recipe should be
  reused rather than re-declaring it impossible.
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

**Correction to `REACT_MIGRATION.md`'s own ledger:** it still lists "the
dashboard's Focus-Session quick-starts are not wired up" as an open loose
end. That's stale — `FocusCard.tsx` (rendered in `DashboardView`) already
calls `startFocusPreset()` → `TimerProvider.startPreset()`. Worth striking
through there; not fixed here since the source doc was left untouched by
request.

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

---

## 4. Refactoring Opportunities

- `OnboardingBanner.tsx`'s `document.getElementById("dash-task-input")?.focus()`
  → pass a ref down, or lift the focus call into a shared dashboard context,
  next time that file is touched.
- The `npm run format:check` backlog (33 files) → one dedicated
  `npm run format` commit, plus a repo-wide line-ending decision
  (`.gitattributes` forcing LF, or Prettier's `endOfLine: "auto"`).
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

**Blockers:** none. No build breakage, no failing tests, no
migration-introduced regression currently blocks shipping.

**High impact:**
- Step 23 — i18n port.
- Step 25 — Notes AI study sidebar.
- CORS allow-list fix for local `npm run dev` model calls.
- Continuing the route-by-route cutover to `/app` (Settings done 2026-08-01,
  Step 26 — Tasks, Exams, Timer, Library, Dashboard, Notes, Plan, Quiz, and
  Review still belong to the vanilla app).

**Nice to have:**
- Everything in sections 4 and 5.
- The smaller loose ends: mini-timer overlap, duplicate logo files, the
  format backlog, `exportCSV`'s missing test, the reset-password heuristic,
  the sign-up cross-tab case.
