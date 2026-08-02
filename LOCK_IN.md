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

**Updated:** 2026-08-02. The route-by-route cutover is finished — all nine
remaining routes (Exams, Notes, Plan, Quiz, Review, Library, Timer, Tasks,
Dashboard) now redirect to `/app/*` and their vanilla `<section>`s are deleted.
The vanilla `index.html` is now a pure redirect shell: every hash route it
still recognizes sends the browser straight to the React app. The AI edge
function's CORS fix turned out to already be live (checked the deployed
function directly — version 35, not the "version 33" this doc previously
guessed — and confirmed with a live `curl -X OPTIONS` against both an allowed
and a rejected origin), so no redeploy was actually needed this session. All
four "nice to have" items from the previous update are also closed:
`useLiveClock.test.ts`'s locale assertion, `OnboardingBanner`'s
`getElementById` hack, `ResetPasswordView`'s expiry heuristic, and the
`format:check` backlog (`.gitattributes` added, `npm run format` run once).
Sections 1, 2, 3, 4 and 6 are amended below.

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

~~One minor exception, not currently tracked anywhere: `OnboardingBanner.tsx:62`
does `document.getElementById("dash-task-input")?.focus()` to focus an input
that lives in a sibling component, instead of going through a ref/callback.
Works, low risk — listed under Refactoring below.~~ — closed 2026-08-02.
`DashboardView` now owns a `useRef<HTMLInputElement>`, threaded down through
`TasksCard` into `DashboardTasksWidget`'s input and passed to
`OnboardingBanner` as an `onFocusTaskInput` callback. No `document.*` lookup
left in `webapp/src` outside the list already audited above.

---

## 2. Incomplete Work

Carried forward from `REACT_MIGRATION.md`'s "Known loose ends" (only the
still-open items — most of that section is already struck through as
closed):

- The docked mini-timer can sit on top of a view's bottom-left controls (quiz
  completion/review screens) — inherited from the vanilla's own
  `position: fixed` timer, not new.
- ~~The AI edge function's CORS allow-list lists `http://localhost:3000` but
  not the Vite dev server~~ — closed 2026-08-01, deployed as version 33. Two
  earlier attempts each hardcoded one port and broke again the next time a
  session ran Vite somewhere else, so `corsHeadersFor` now matches any
  `localhost`/`127.0.0.1` origin on any port by pattern, the same way a
  Vercel preview subdomain already was — verified live with `curl -X
  OPTIONS` against three origins (two locals plus `evil.com`, which is still
  rejected). Never affected tests (MSW intercepts at the network layer).
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
  (`REACT_MIGRATION.md` Step 26). ~~Every other route (Tasks, Exams, Timer,
  Library, Dashboard, Notes, Plan, Quiz, Review) still belongs to the vanilla
  app~~ — closed 2026-08-02, all nine cut over in one session. Two real
  cross-view landmines turned up and were handled by ordering (Exams → Notes →
  Plan/Quiz/Review → Library → Timer → Tasks → Dashboard, so each dependency
  was already-cut-over by the time the thing depending on it moved) plus one
  real bug fix: `loadTasks()` (`js/main.js`) early-returned on `#todo-list`
  not existing, which would have silently stopped populating Dashboard's task
  widget via `renderDashboardTasks()` once Tasks was cut over — the call was
  moved ahead of that guard. `js/router.js`'s dynamic-ID routes (`notes-`,
  `quiz-`, `quizreview-`, `review-`, `folder-`) needed their
  `route.startsWith(...)` branches changed to a `window.location.href`
  redirect directly, since `CUTOVER_ROUTES`'s static exact-match object can't
  hold an arbitrary ID the way it could for `settings`/`exams`/`plan`/`timer`/
  `todo`/`library`(+tabs). `index.html`'s `<main>` now has no `<section>`s
  left at all.
- The Supabase auth redirect allow-list doesn't include `/verify` /
  `/reset-password` under `/app` — an external config change (Authentication →
  URL Configuration), can't be fixed from this repo.
- The sign-up "check your inbox" screen's cross-tab confirmation case
  (confirming in a different browser) is untested.
- ~~`ResetPasswordView`'s "link expired" check is a 3-second heuristic
  ("nothing happened yet = bad link") — can misfire as a false "expired" on a
  slow connection. Reading the URL's `error`/`error_description` hash params
  directly would be the deterministic fix.~~ — closed 2026-08-02.
  `lib/supabase.ts` now captures `initialUrlHash` before `createClient()` gets
  any chance to consume it, and `ResetPasswordView` checks it for Supabase's
  own `error`/`error_code=otp_expired` params on mount, setting `phase` to
  `"expired"` immediately when present. The 3s timeout remains as a fallback
  for the case where neither an auth event nor an error param ever arrives.
  Not covered by a new test: exercising the real module-load-order race would
  need a `vi.resetModules()` + dynamic-import trick that risks more test
  flakiness than it proves — this is better verified against a real recovery
  link in a browser than in jsdom.
- ~~`npm run format:check` fails on 33 pre-existing files even on an LF
  checkout — a real formatting backlog underneath the Windows CRLF issue, not
  only a line-ending problem.~~ — closed 2026-08-02. Root cause was actually
  worse than 33 files: with `.gitattributes` still missing and
  `core.autocrlf=true`, every file was CRLF on disk against Prettier's
  `endOfLine: "lf"` default — 287 of ~292 tracked files under `webapp/`
  failed. Added `.gitattributes` (`* text=auto eol=lf`) so the object store
  stays LF regardless of a future Windows checkout's `core.autocrlf`, then ran
  `npm run format` once; `npm run format:check` is clean now.
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
- ~~**New, not previously tracked:** `OnboardingBanner.tsx:62`'s
  cross-component `getElementById` focus call (see section 1).~~ — closed
  2026-08-02, see section 1.
- ~~**Found 2026-08-01:** `src/hooks/useLiveClock.test.ts` fails on any
  machine whose locale formats time as 12-hour — it asserts `toContain
  ("14:07")` and gets `"02:07 PM"`. Pre-existing and locale-dependent, not a
  code bug: the test hard-codes a 24-hour expectation instead of pinning a
  locale (or asserting on the formatter's own output). It is the *only*
  failing test in the suite, so it currently makes a green run look red. Fix
  by passing an explicit locale to the formatter under test.~~ — closed
  2026-08-02. The second test now compares against a live `toLocaleTimeString`
  call for each expected minute instead of a hardcoded 24-hour string,
  matching the pattern the file's first test already used.

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

**Fixed in the 2026-08-01 session, and worth knowing it was a real bug:** the
vanilla's notes sidebar shared one `AI.chatHistory` array with the workspace
chat, so a question asked beside a document became context for the floating
panel on an unrelated view. The React port (Step 25) gives the sidebar its own
transcript keyed on the material. Listed here because the vanilla still has
this behaviour on every route that hasn't been cut over.

**Fixed in the 2026-08-02 session, and worth knowing it was a real bug:**
`loadTasks()` (`js/main.js`) fetched tasks, then early-returned if `#todo-list`
wasn't found before ever reaching the `renderDashboardTasks(tasks)` call at
its tail. That's fine while Tasks is still vanilla, but the moment Tasks was
cut over and `#todo-list` was deleted, Dashboard's own compact task widget —
still vanilla at that point in the cutover order — would have silently stopped
refreshing, even though nothing about Dashboard itself had changed. Fixed by
moving the `renderDashboardTasks(tasks)` call ahead of the `#todo-list` guard,
so it always runs off the same fetch regardless of whether the vanilla Tasks
view exists. Both `ResetPasswordView`'s expiry heuristic and
`useLiveClock.test.ts`'s hard-coded assertion (previously listed here) are
also closed — see section 2.

---

## 4. Refactoring Opportunities

- ~~`OnboardingBanner.tsx`'s `document.getElementById("dash-task-input")?.focus()`
  → pass a ref down, or lift the focus call into a shared dashboard context,
  next time that file is touched.~~ — closed 2026-08-02, see section 1.
- ~~The `npm run format:check` backlog (33 files) → one dedicated
  `npm run format` commit, plus a repo-wide line-ending decision
  (`.gitattributes` forcing LF, or Prettier's `endOfLine: "auto"`).~~ — closed
  2026-08-02, see section 2. **Confirmed 2026-08-01:** running `npm run format`
  during the Step 25 work rewrote 34 unrelated files in one sweep and that
  churn was reverted at the time so it wouldn't bury a feature diff — this
  session's reformat (287 files) was deliberately its own pass, alongside
  route-cutover edits but not mixed into them, for the same reason.
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
currently blocks shipping. `npm test` (856), `node --test tests/*.test.js`
(173), `npm run lint`, and `npm run build` are all clean as of 2026-08-02.

**Done since this list was written (2026-08-02):**
- ~~Continuing the route-by-route cutover to `/app`.~~ All nine remaining
  routes are cut over — see section 2. The vanilla app is now a redirect
  shell with no `<section>`s left in `<main>`.
- ~~Redeploy the AI edge function so the CORS fix above actually lands.~~ Was
  already live (version 35) when checked directly — no redeploy needed.
- Everything previously listed under "Nice to have" below is closed:
  `OnboardingBanner`'s focus hack, the format/`.gitattributes` backlog, the
  `ResetPasswordView` heuristic, and the `useLiveClock` locale assertion.

**Done since this list was written (2026-08-01):**
- ~~Step 23 — i18n port.~~ Was already shipped when this list was written;
  listing it as high-impact was the ledger's own stale entry.
- ~~Step 25 — Notes AI study sidebar.~~ Closed. This was the last known-scoped
  port; there is no remaining "build it in React" work.
- ~~CORS allow-list fix for local `npm run dev` model calls.~~ Fixed; confirmed
  live 2026-08-02 (version 35).

**High impact:** nothing currently open.

**Nice to have:**
- Everything in sections 4 and 5 not already struck through — the animation/
  design-upgrade backlog in section 5 is untouched by this session, by design
  (visual redesign was out of scope).
- The smaller loose ends still open: mini-timer/quiz-review z-index overlap,
  duplicate logo files, `exportCSV`'s missing test, the sign-up cross-tab
  case, the `/verify`/`/reset-password` Supabase redirect allow-list (external
  config, can't be fixed from this repo), and the timer's task-attribution-by-
  text-not-id schema note.

**Verification debt worth paying down next:** every route was verified this
session via the full automated suite (`node --test` + `npm test`, both green
after each cutover) and static cross-reference auditing of every `bind*`/
`load*` function for DOM lookups reaching outside the section being deleted —
but not against a real signed-in browser session, since no test account was
available and the app's data-fetching means a real click-through needs one
(unlike Step 25's Notes work, which could mount a single view in isolation via
the devharness technique with fake props). A real-browser pass — ideally
hitting all nine newly-cut-over routes with a real account, both to confirm
the redirect UX feels right and to exercise the two genuine cross-view fixes
this session made (`loadTasks()`/`renderDashboardTasks()`, and the
`ResetPasswordView` hash-timing fix, which is inherently hard to unit-test) —
is the highest-value next session.
