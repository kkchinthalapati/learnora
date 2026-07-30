# Learnora React Migration — Progress & Remaining Work

**Living document.** Update the ledger as steps complete. Written so a different machine,
session, or agent can resume without any conversation history.

- **New app root:** `webapp/` (separate npm package, side-by-side with the vanilla app)
- **Branch:** `react-migration` (to be created on first implementation session)
- **Tests:** `npm --prefix webapp run test` — expect 480/480 passing
- **Last verified:** 2026-07-30 (Step 13 — tests green, `npm run build` green, `npm run lint` clean, `tsc -b` clean; Steps 11 & 12's browser passes still owed, see those steps' entries)

---

## Ledger

| # | Step | Phase | Status |
|---|------|-------|--------|
| 1 | Scaffold `webapp/` (Vite+React+TS, lint/format, empty routes) | Foundation | ✅ |
| 2 | Port design tokens (`tokens.css`, `themes.css`) | Foundation | ✅ |
| 3 | Shared primitives: Modal, ConfirmDialog, Toast, Icon, Button, EmptyState, Skeleton | Foundation | ✅ |
| 4 | Supabase client + AuthContext + protected-route shell | Foundation | ✅ |
| 5 | API layer + TanStack Query hooks (all 11 entities, thin scaffold) | Foundation | ✅ |
| 6 | Universal CreateModal (Material/Subject/Exam/Task panels) | Foundation | ✅ |
| 7 | Settings (first cutover — lowest external dependency, all 6 tabs) | Views | ✅ |
| 8 | Tasks (+ dashboard quick-add widget) | Views | ✅ |
| 9 | Exams (calendar + ExamModal + DayDetailModal) | Views | ✅ |
| 10 | Timer | Views | ✅ |
| 11 | Library shell (4 tabs) + Subject detail page | Views | ✅ |
| 12 | Dashboard (aggregates Tasks/Exams/Timer/Library data) | Views | ✅ |
| 13 | Notes editor (Quill wrapper) | Views | ✅ |
| 14 | AI layer port (streaming calls, `renderMarkdown`, action-tag parser) | Foundation | ☐ |
| 15 | Weekly Plan | Views | ☐ |
| 16 | Quiz runner + review | Views | ☐ |
| 17 | Turbo chat + dashboard command bar | Views | ☐ |
| 18 | Flashcard Review (SRS flip-card, most complex) | Views | ☐ |

---

## Decisions already made (do not re-litigate)

1. **Incremental, route-by-route, same repo (`webapp/` folder).** Side-by-side with the
   vanilla app until every route is cut over. Path-prefix split via Vercel rewrites.

2. **TypeScript.**

3. **CSS Modules over the existing token system**, ported 1:1 from `style.css`'s `:root`
   block (~130 tokens: colors, spacing, radii, shadows, typography, z-index, motion).
   **No visual redesign.**

4. **Routing: `react-router-dom` (browser router, not hash).** A `vercel.json` rewrite
   handles the SPA fallback; path-prefix split serves cut-over routes from `webapp/dist`
   and everything else from the existing static root.

5. **Server state: TanStack Query.** One `api/<entity>.ts` + `hooks/use<Entity>.ts` pair
   per entity, mirroring `js/api.js`'s existing per-entity object shape. Cache
   invalidation replaces hand-rolled "remember to call loadTasks()" refresh pattern.

6. **API layer throws on error** (unlike the vanilla layer's `false`/`null`/`[]` returns) —
   deliberate adaptation to TanStack Query idioms, not a bug to "fix back."

7. **Forms: React Hook Form + Zod**, only where real validation exists (Settings,
   CreateModal panels, exam edit). Single-field inputs stay plain `useState`.

8. **Quill: hand-rolled `RichTextEditor` wrapper**, not `react-quill` (unmaintained
   against Quill 2.x). Instantiated in `useEffect`, torn down on unmount.

9. **Icons:** port `js/icons.js`'s registry as one `<Icon name="..." />` component.

10. **Modals/Toasts:** built as shared primitives early — port `ModalManager` and
    `UI.showToast`'s exact behavior (stack, focus-trap, scroll-lock) into React context +
    portal, not a new library. Preserve UX already settled in `REVAMP_PROGRESS.md` Steps 8–9.

11. **Testing: Vitest + React Testing Library + jsdom + MSW.** Vitest shares Vite's
    transform pipeline. MSW intercepts Supabase calls at the network layer. None of the
    vanilla suite's 463 test() sites port as-is (static-analysis over raw source strings)
    — tests rewritten per feature, behavior-first.

12. **Cutover mechanism: same-domain path-prefix Vercel rewrites.** One rewrite rule added
    per completed step, vanilla route deleted in the same commit. Both apps share the same
    Supabase project + client-side session storage (`persistSession: true`).

13. **Sequencing:** Foundation steps 1–6 before any view; Settings first view (lowest
    dependency); AI layer (14) before Plan/Quiz/Chat; Chat (17) before Review (18).

14. **Every step ships independently.** Finish → verify → commit → tick the box → stop.

15. **Supabase CLI and MCP tools authorized.** Use `supabase start` locally for dev, `mcp`
    tools for production-database read-only checks (e.g., `list_tables`, `get_advisors`)
    before any schema changes. No unauthorized remote mutations.

---

## What has been done

(filled in step-by-step as work completes; each entry: what/why, files touched, tests
added, browser verification, any bonus bugs found and fixed in passing)

### Step 1 — Scaffold `webapp/` (2026-07-29)

Scaffolded `webapp/` with `npm create vite` (react-ts template: Vite 8, React 19,
TS 6, oxlint) plus Prettier, Vitest + RTL + jsdom (+ `afterEach(cleanup)` in
`src/test/setup.ts` since globals are off), and MSW installed but not yet wired
(first used in Steps 4–5). Route skeleton in `src/routes.tsx` mirrors every vanilla
hash route (`js/router.js`): `/`, `/tasks`, `/exams`, `/timer`, `/library(/:tab)`,
`/folders/:folderId`, `/notes/:materialId`, `/plan`, `/quiz/:quizId(/review)`,
`/review/:deckId`, `/settings`, plus a `*` catch-all — each rendering a named
placeholder. Tests: 14 route-rendering assertions via `MemoryRouter`. Verified in
the browser: `/` and deep link `/quiz/q-1/review` render, console clean.

### Step 2 — Port design tokens (2026-07-29)

Ported `style.css`'s `:root` token block 1:1 into `webapp/src/styles/tokens.css`
and the theme layer (dark-mode overrides + all 13 `data-theme-color` accent
presets + the shared derivation rule + custom-theme hooks) into
`webapp/src/styles/themes.css`, keeping the vanilla selectors (`body.dark-theme`,
`body[data-theme-color]`) since both apps share persisted theme settings.
`index.css` now applies the base body typography/surface from tokens, and
`index.html` loads the same Google-Fonts stylesheet (Outfit + Plus Jakarta Sans)
as the vanilla app. Tests: `tokens.test.ts` is a parity guard that reads the real
`style.css` and asserts every `:root` token name **and value**, every dark-theme
override, and every accent preset exists in the port — so drift between the two
apps fails CI until the last vanilla route is deleted. Browser-verified computed
styles for light, `dark-theme`, and a preset (lavender, including its derived
`--accent-ring`). Also gave test files their own `tsconfig.test.json` (node types)
so `tsc -b` stays strict for app code.

**Deviation from Decision #4 (deliberate):** installed `react-router@8.3.0` and
import from `"react-router"` instead of `react-router-dom@7.x` — the entire
`react-router-dom` 7.12+ line sits in the vulnerable range of GHSA-qwww-vcr4-c8h2
(`npm audit` high), v8.3.0 is the patched release, and since v7 `react-router-dom`
is only a re-export shim anyway. Same library, same `BrowserRouter` API, browser
router not hash — the substance of the decision is unchanged. `npm audit`: 0
vulnerabilities.

### Step 3 — Shared primitives (2026-07-29)

Ported `ModalManager`, `UI.showToast` and `UI._dialog` from `js/ui.js` into React
context + portals, and `js/icons.js` into `<Icon name="…" />`. Files:
`context/overlayStack.ts` + `OverlayStackProvider.tsx` (stack, ref-counted scroll
lock, single Escape listener), `context/ToastProvider.tsx`, `context/DialogProvider.tsx`,
`hooks/useFocusTrap.ts`, and `components/` — `Modal`, `Button`, `Icon`, `icons`,
`EmptyState`, `Skeleton` — each with a CSS Module carrying the matching rules from
`style.css`. 28 new tests cover the a11y invariants the Definition of Done calls
for: focus moves in on open and back to the trigger on close, Tab wraps at both
ends, Escape closes, toast `role="alert"` vs `"status"`, and the promise contracts
of `confirm`/`promptText`.

Three deliberate divergences, all documented in-file: **(1)** dialogs register on
the same overlay stack as modals, so "top-most wins" replaces the vanilla's
`if (!$("app-dialog").classList.contains("hidden")) return;` special case — same
user-visible behaviour, one less rule; **(2)** icons are JSX rather than the
vanilla's raw-markup-plus-`innerHTML`, so no `dangerouslySetInnerHTML` exists
anywhere in the React app; **(3)** `getFocusable` tests computed
`display`/`visibility` instead of `offsetParent !== null`, because jsdom never
lays out and every control would otherwise look hidden.

**Bug found and fixed during browser verification.** The first cut deferred both
the dialog's invalid-state and the modal's initial focus to `requestAnimationFrame`
(mirroring the vanilla). rAF never fires in a hidden or background tab, so an
empty prompt submit silently did nothing there — and jsdom fires rAF regardless of
visibility, so the tests were green. Both now apply synchronously: React has
already committed the overlay to the DOM by the time effects run, so the vanilla's
reason for deferring (focusing a `display:none` node) doesn't apply. The shake
replay moved to `element.animate()`, which restarts by definition and needs no
reflow hack. The regression test asserts the error state without `waitFor`, so
re-deferring it fails the suite.

### Step 4 — Supabase client + auth + protected routes (2026-07-29)

`lib/supabase.ts` creates the client with the same project, publishable key and
auth options as `js/supabase.js`, from the npm package rather than the CDN so the
bundle is pinned and self-contained. The storage key is left at the default on
purpose: it's how both apps share one session while they run side by side.
`context/AuthProvider.tsx` ports `Auth.getSession`/`Auth.logout` — `getSession()`
first (local, no network), then `onAuthStateChange` as the running source of
truth, with `_cachedUser` replaced by provider state. `signOut` clears the
`learnora_invite_access` keys from both storages and drops the session even when
the API call fails, as the vanilla logout does; it does **not** reload the page,
since React re-renders from the state change.

`components/ProtectedRoute.tsx` is a layout route wrapping every view; `/login` is
the only public route. While the stored session is still resolving it renders a
skeleton rather than redirecting — bouncing on first paint would kick out anyone
who simply reloaded — and a resolved "no session" redirects with the attempted
location in `state.from`, ready for a real post-sign-in return.

13 new tests. AuthProvider's use `vi.mock` on the client module rather than MSW:
supabase-js resolves sessions from storage without a network call, so there is no
request for MSW to intercept — MSW starts earning its keep with the data queries
in Step 5. One test-infra note worth keeping: mocks are cleared in `beforeEach`,
not `afterEach`, because RTL's automatic cleanup unmounts *after* `afterEach`, so
one test's unsubscribe was being counted against the next.

**Design change found in the browser.** The first cut auto-redirected
unauthenticated users with `window.location.replace("/index.html")`. That loops
forever anywhere the React app itself serves that path — immediately reproducible
on the dev server, and a live risk in production if a rewrite ever routes `/` to
the SPA. Replaced with a plain `SignInRequired` page and a real link. Worth
revisiting at Step 7 when the path-prefix rewrites make `/` unambiguous.

### Step 5 — API layer + TanStack Query hooks (2026-07-29)

Ported all twelve `js/api.js` entity objects (Tasks, Folders, Materials, Notes,
Decks, Flashcards, Exams, Sessions, Plans, Quizzes, DataAdmin, Auth) into
`webapp/src/api/*.ts`, one file per entity plus `types.ts` (row shapes checked
against the live schema via the Supabase MCP `list_tables` tool — the project
has no `supabase gen types` step) and `session.ts` (a `requireUserId()`
helper). Every module throws on failure per Decision #6, replacing the
vanilla's `UI.showPopup`/`console.error` + `false`/`null`/`[]` returns. One
`hooks/use<Entity>.ts` per entity wraps each with `useQuery`/`useMutation`,
invalidating the relevant query key(s) on mutation success — `useAuthActions.ts`
covers `Auth`'s one-shot actions (login, signup, password/email/profile
changes, account deletion) separately from `useAuth()` in `context/auth.ts`,
which stays the reactive session read Step 4 already built.
`@tanstack/react-query` is wired into `App.tsx` via a shared `QueryClient`
(`lib/queryClient.ts`), and into `test/render.tsx`'s provider stack with a
fresh per-call client so tests don't leak cache between each other.

**Deviation from the plan's example (deliberate):** the plan's Section 4
example showed `tasksApi.fetch(): Promise<Task[]>` reading the current user
via a vanilla-style `getCurrentUser()` cache. Since Step 4 already built
`AuthProvider` as the one reactive session source, duplicating a second
network-verifying cache (the vanilla's `auth.getUser()`) would just be two
sources of truth doing the same job. `session.ts`'s `requireUserId()` keeps
the same call-site signature (no `userId` param, throws if signed out) but
resolves it via `auth.getSession()` — local/cached, the same primitive
`AuthProvider` itself uses — instead of a second cache.

**Testing:** MSW infra lives in `src/test/mocks/` (`handlers.ts` + `server.ts`,
wired into `test/setup.ts`'s `beforeAll`/`afterEach`/`afterAll`), and
`test/mockSession.ts` spies on `supabase.auth.getSession()` per test so
`requireUserId()` resolves without real storage. Rather than exhaustively
testing every method on all twelve entities (this is a Foundation "thin
scaffold" step, not a view), coverage is representative of every *query
shape* the layer has to support: full CRUD + user-scoping + error-throwing on
`tasksApi` (the canonical example, plus its `useTasks`/`useAddTask` hook pair
proving the cache-invalidation wiring), `foldersApi.delete`'s
cross-entity compose-then-cleanup ordering (materials fetch → row delete →
storage removal), `examsApi.save`'s insert-vs-update branch, `flashcardsApi`'s
count/`HEAD` query and join-with-title query, `quizzesApi.fetchWeakTopics`'s
client-side aggregation logic, `dataAdminApi.wipe`'s partial-failure handling
(`Promise.all` resolves with `{error}` rather than rejecting), and
`authApi.signup`/`login`'s validation and GoTrue response-shape handling
(discovered along the way: `/signup`'s auto-confirmed response is flat —
session fields at the top level beside `user`, not nested under a `session`
key — confirmed by reading `@supabase/auth-js`'s `_sessionResponse`
transform, not guessed). 95/95 tests pass.

**Manual verification deferred:** these are pure data-layer modules with no
UI yet — nothing to click through until Step 6 (CreateModal) and Step 7
(Settings) put a screen in front of them.

### Step 6 — Universal CreateModal (2026-07-29)

**Scoping correction before any code was written:** the vanilla app does not
actually have one Material/Subject/Exam/Task dialog to port. It has four
unrelated things — a rich Material-creation dialog (`#create-modal`,
`index.html:2060-2250` + `js/main.js:111-422` + `js/ui.js:508-681`), folders
created ad hoc via a bare `UI.promptText()` (`js/main.js:195-212`), a fully
separate `#exam-modal` that's Step 9's territory, and a plain inline input
for tasks with no modal at all. "Universal CreateModal" was always a *new*
consolidation decision, not a straight port — confirmed with the user before
writing anything, along with two scoping calls this forced:

- **The Material panel's submit is a real, fully-validated form wired to a
  clearly-labeled stub**, not a fake success or a disabled button. Every
  vanilla validation rule is ported exactly (same messages, same per-source
  checks) so the only thing that doesn't happen yet is the actual model
  call — because `AI.createStudyPackage()` has no non-AI path in the vanilla
  app at all (every new material unconditionally gets AI-generated notes;
  see `js/ai.js:680-812`), and that layer doesn't exist until Step 14.
  Submitting a fully valid form shows: *"AI-powered generation isn't
  connected yet — Step 14 wires this form up to real notes, flashcards, and
  quizzes."* — and leaves the dialog open, unlike a real submit (which closes
  immediately in the vanilla flow).
- **The Exam panel is quick-create only** (name, date, difficulty) — mirrors
  Task's simplicity, not the vanilla exam modal's edit/delete/status surface.
  Editing, deleting, and status changes stay Step 9's job on the calendar's
  own `ExamModal`/`DayDetailModal`. New exams always save with
  `status: "Scheduled"`, matching the vanilla create form's hidden-but-still-
  submitted default (`js/main.js:1781`).

**Files:** `context/createModal.ts` + `CreateModalProvider.tsx` (the
`useCreateModal().openCreateModal(options)` entry point every future "+"
button will call), `components/create/CreateModal.tsx` (the shell: a
type-picker segmented control switching between the four panels) and one
component per panel (`MaterialPanel`, `SubjectPanel`, `ExamPanel`,
`TaskPanel`), each owning its own form state, validation, and submit —
`formShared.module.css` carries the input/segmented/error styling every
panel reuses. Wired into `App.tsx` between `AuthProvider` and
`BrowserRouter`, and into `test/render.tsx`'s provider stack.

**Two implementation notes worth keeping:** (1) `CreateModal` remounts via a
`key={sessionId}` bumped on every `openCreateModal()` call, so every field
resets to defaults on open the same way vanilla's `showCreateModal()` did by
hand — for free, via React's own remount semantics instead of an imperative
reset function. (2) `MaterialPanel`'s and `ExamPanel`'s `<form>` need
`noValidate` — native browser constraint validation (the date input's `min`,
the link input's `type="url"`) blocks the `submit` event entirely before any
JS runs once a value is out of range, which is exactly why the vanilla
`#create-form` already carries `novalidate` (index.html:2074) and every rule
is enforced in JS instead.

**Testing:** 33 new tests (`components/create/CreateModal.test.tsx` for the
shell + Subject/Exam/Task, `components/create/MaterialPanel.test.tsx` for
the more involved panel) cover: default panel/reset-on-reopen, every
per-source validation message, the implicit-vs-optional Notes output
depending on source, the Saved-materials tab appearing/disappearing, the
inline "+ New folder" flow selecting its own result immediately (not waiting
on a background refetch — see loose end below), quiz-tuning options only
rendering once Quiz is checked, and the Material stub message leaving the
dialog open. 118/118 total.

**Manual verification deferred.** Every route sits behind `ProtectedRoute`
with no real login flow yet, so there's no authenticated page to click
through from — same reasoning as Step 5. Nothing in this step needs a real
browser to verify (no Quill, no 3D transforms, no streaming); the RTL/MSW
suite already drives real typing, clicking, and network requests.

### Step 7 — Settings, all six tabs (2026-07-29)

The whole Settings view is ported: Account, Appearance, Security, Preferences,
Notifications and Danger Zone, at `/settings`. New files live under
`webapp/src/views/settings/` (`SettingsView` shell + one component per tab,
plus `CustomThemeStudio`, `passwordStrength.ts` and `profile.ts` for the two
bits of pure logic worth testing on their own), over a new shared layer in
`webapp/src/lib/`: `storage.ts` (the vanilla's `Storage` wrapper),
`color.ts` (hex/HSV/luminance helpers), `appearance.ts` (the theme engine's
state, derivation and DOM application) and `settings.ts` (the
`learnora_settings` object). Two new providers — `AppearanceProvider` and
`SettingsProvider` — sit above the router in `App.tsx`, and
`ToggleSwitch`/`InlineFeedback` join the shared primitives. 113 new tests
(231 total).

**Storage stays byte-compatible with the vanilla app.** Same keys, same JSON,
same body attributes (`dark-theme`, `data-theme-color`, `data-sidebar-style`,
`data-bg-texture`, `data-font-family`, `data-font-size`). While both apps are
live a theme picked in one has to survive a navigation into the other, so
this is a compatibility contract, not an implementation detail. The one
deliberate hardening: every value read back out of storage is now checked
against the allowed set, where the vanilla spread `{...DEFAULTS, ...stored}`
straight through — a hand-edited `learnora_settings` could previously put an
unknown AI persona into every prompt.

**Two-tier appearance state is preserved.** Every appearance control repaints
`<body>` immediately but only writes to localStorage on "Save Appearance", so
a user can still audition a theme and walk away without keeping it
(`js/ui.js` did this with `_activeAppearanceState`; here it's React state vs
localStorage, with `dirty` a comparison of the two). The studio's Reset keeps
its odd-one-out behaviour of persisting immediately.

**Accessibility carried over and, in four places, fixed.** (1) The tab strip
is a real ARIA tablist with `aria-selected`, `aria-controls`, roving
`tabIndex` and Arrow/Home/End navigation — the vanilla's six buttons toggled
a `.active` class and nothing else, so neither the tab semantics nor the
selection reached assistive tech and arrow keys did nothing. (2) Only the
selected panel is rendered, rather than all six kept in the DOM behind
`display:none`, so the Danger Zone's delete button is no longer a tab stop
from page load. (3) The notification toggles get accessible names — the
vanilla wrapped each checkbox in an empty `<label class="toggle-switch">`, so
both were anonymous to a screen reader. (4) Selection state is expressed once
as `aria-pressed` instead of a duplicated `.active` class plus `aria-pressed`
pair, so the highlight cannot drift from what is announced. The password
strength meter also gained a `role="status"`, and inline feedback is
`alert` for errors / `status` for successes; both were silent before.

**Picker HSV is still held apart from the hex list**, for the reason the
vanilla documented: converting a hex back to HSV loses the hue whenever
saturation or value hits 0, so the handle would snap to red as you dragged
into a corner. The vanilla cached it in `_pickerState` and invalidated by
hand; here the local state carries the hex it was derived from and is
recomputed during render when the active stop changes — same effect, no
cache to forget to clear. There is a regression test for the corner case.

**Browser-verified** (the one step so far where that was worth doing — CSS
gradients, a drag surface and derived custom properties are exactly what
jsdom cannot prove). Dragging on the saturation/brightness field produced
`Saturation 15%, brightness 20%` → hex `#2B2C33` → `data-theme-color="custom"`
→ `--custom-accent: #2A2B30` → the real `--accent` token resolving to that
value, which also confirms Step 2's `themes.css` custom-accent mapping works
end to end. Console clean. Verified against a locally stubbed session, since
there is still no React login flow; the stub and every key it wrote were
cleared afterwards.

**Cutover deliberately not performed — the ledger's mechanism does not work
as specified, and this is the step that discovered it.** Decision #12 and the
Definition of Done both say "vanilla route deleted + rewrite rule added" per
step. A Vercel rewrite matches *paths*, but the vanilla app is hash-routed:
Settings is `index.html#settings`, and a URL fragment is never sent to the
server, so no rewrite can intercept it. Nothing about `/settings` is
reachable by rewriting until the vanilla nav links themselves change from
`#settings` to `/settings` — which turns in-app tab switches into full page
loads between two separate apps, a UX change nobody has signed off on.

A second problem sits behind it: `webapp/dist/index.html` references its
assets at `/assets/*` (Vite's default `base`), so serving it from a path
prefix needs `base` set at build time and the output placed where Vercel can
find it, or every asset 404s. `vercel.json` is therefore still **not** added
— an untested routing config that only takes effect on merge to `main` could
break the live site silently, which is worse than not having one. The
cutover wants its own PR, by someone who can sign in and exercise the
two-app navigation. Everything above ships as additive React routes; the
vanilla app is untouched and still owns every route in production.

**Other deferrals.** `saveSettings()` in the vanilla also called
`applyTranslations()`, which walks every `[data-i18n]` node. No i18n layer
exists in the React app and none is on the ledger, so the UI-language choice
is persisted (and honoured by the vanilla app) but does not re-render this
one — noted in loose ends. `Button` gained a `warning` variant so
"Sign Out Others" keeps its exact vanilla colour rather than being recoloured
to `danger`.

### Steps 8 & 9 — Tasks and Exams (2026-07-29)

**Step 8 — Tasks** (`/tasks`). Ports index.html:846-877 + js/main.js:1329-1645
into `webapp/src/views/tasks/`: `TasksView`, `TaskItem` (one row, and most of
the interaction), `DashboardTasksWidget`, `useTaskActions` (the mutations both
entry points share) and `sortTasks.ts`. New `lib/date.ts` carries
`localDateStr`/`formatDateStr`/`MONTH_NAMES`/`WEEKDAY_NAMES` — both views build
plain YYYY-MM-DD from *local* calendar fields rather than
`toISOString().slice(0,10)`, which converts to UTC first and would report a
task due today as overdue for most of the evening west of Greenwich.

The vanilla re-ran `loadTasks()` by hand after every mutation and kept a 300ms
debounce so a burst of toggles didn't thrash the network; cache invalidation
replaces all of it, which is Decision #5's whole point. The dashboard widget
reads the same query as the full list, so the vanilla's `tasksUpdated` window
event and its "loadTasks() re-renders both" coupling both disappear: one cache,
two subscribers. There's a test that completes a task in the widget and asserts
the full list updates.

`useToggleTask` gained an optimistic update with rollback, because the vanilla
was optimistic too — it flipped the row's class on click and only reverted if
the write failed. Waiting for the round trip would make every checkbox feel
broken on a slow connection.

**Two bugs found and fixed while porting.** (1) *Escape didn't cancel a rename.*
Removing a focused input fires blur, and blur committed the edit — so abandoning
a rename saved it anyway. The vanilla dodged this with a `hasSaved` latch; the
same idea survives as a `cancelled` ref, with a regression test. (2) *Double-
clicking the task text toggled it.* The row's click handler ran twice on the way
to the dblclick, so opening the rename editor also flipped the task done and
back — and the `if (t.is_done) return` guard then read whatever `is_done` had
raced to. Clicks on the text are now held for one double-click interval
(`DOUBLE_CLICK_MS`) so only one of the two intents wins; clicks elsewhere on the
row still toggle immediately.

The deferred delete keeps the vanilla's 4s Undo window, but deliberately does
**not** go through `useDeleteTask`: a mutation observer is torn down with its
component, so a delete armed just before the user navigated away could be
dropped — silently resurrecting a task they watched disappear. It calls the api
module directly and invalidates through the QueryClient (which outlives any
component), and the unmount cleanup flushes rather than cancels, for the same
reason.

**Step 9 — Exams** (`/exams`). Ports index.html:877-916 + js/main.js:1651-1915
into `webapp/src/views/exams/`: `ExamsView` (the month grid), `ExamModal`,
`DayDetailModal` and `examMeta.ts`. The grid is derived from a `{year, month}`
pair on each render rather than rebuilt imperatively into `#calendar-days`,
which incidentally fixes a real vanilla bug: it mutated a shared `Date` with
`setMonth()`, and from the 31st that overflows (31 Jan + 1 month is 3 Mar), so
"next month" silently skipped February. There's a test that steps twelve months
and asserts twelve distinct months, landing exactly one year on. Exams are
bucketed by date in one pass instead of the vanilla's `filter()` per cell (28-31
times per render).

`DayDetailModal` needed none of the vanilla's machinery: that built each row
with `innerHTML` (hence `esc()` around every field) and `cloneNode`d the "+ Add
exam" button on every open to shed the previous open's listener. JSX escapes by
construction and React re-renders instead of re-binding. Each row is a real
`<button>` rather than a div with `role="button"` and a hand-rolled Enter/Space
handler. `ExamModal` likewise stops reconfiguring one dialog field by field on
open — "editing" versus "creating" is just whether an `exam` was passed.

**A shared visual bug found in the browser and fixed for all three views.**
Every plain `<input>`/`<select>` was rendering with browser-default chrome — a
white box on a dark surface — because Step 2 ported only the `:root` token
block, never `style.css`'s BASE layer. `components/create/formShared.module.css`
had worked around it locally with a `.field` class, which is why Step 6 looked
fine. `index.css` now carries the global form rule (style.css:574-620 plus the
select-arrow fixes at :4620-4655). The negations sit inside `:where()` so the
selector scores (0,0,1) and any CSS-Module class beats it — the vanilla's
version scored (0,4,1) and had to be fought off with deliberately over-specific
selectors and a run of `!important`s. Verified that the custom-theme studio's
hex input and intensity slider still win.

**Testing: 54 new tests (285 total).** `TasksView` (19) covers urgency
ordering, add/validate/clear, optimistic toggle *and* its rollback, rename via
double-click with Enter/Escape, due-date editing, the three due-badge states,
and both halves of the undo window. `DashboardTasksWidget` (5) covers the
six-item cap, "all caught up" vs "no tasks", quick-add, and the shared-cache
assertion. `ExamsView` (18) covers the grid, month stepping in both directions
across year boundaries, exam bars, the overflow badge, difficulty styling,
past-dimming vs Completed, and which overlay each activation opens.
`ExamModal` (13) is rendered directly rather than through the calendar, so the
date rules don't depend on what today happens to be.

**Two test-infrastructure notes worth keeping.** (1) `vi.useFakeTimers` is not
usable in these files. TanStack Query and MSW both pace themselves off
`Date.now()`, so a frozen clock means the query never resolves and the grid
never renders; `toFake: ["Date"]` alone also breaks `userEvent`, which paces
itself the same way. `shouldAdvanceTime` "works" only by burning real time on an
interval, which slowed the suite from 7s to 120s and timed out unrelated files
in parallel. Both files now derive expectations from the real clock instead.
(2) `vite.config.ts` raises `testTimeout` to 20s. Several pre-existing tests
already sit near 600ms on an idle machine, and under parallel load the 5s
default was failing tests for no reason but contention. It's a ceiling for
hangs, not a target.

**Cutover still not performed**, for the reasons written up under Step 7 — the
vanilla app is hash-routed, so no path rewrite can intercept `#todo` or
`#exams` either. `index.html` and `js/*` remain untouched.

### Step 10 — Timer (2026-07-30)

Ports all 745 lines of `js/timer.js` plus its wiring (js/main.js:1177-1290) and
markup (index.html:596-846, :2278-2310). Split three ways:

- **`lib/timer.ts`** — the state machine as pure functions, with every DOM
  write lifted out. The vanilla mutated one shared `state` object in place and
  repainted by hand, which is why its subtlest rules had no coverage; here each
  transition returns the next state plus its *effects* as data (`logMinutes`,
  `toast`, `notify`, `newQuote`), so "what counts as a loggable session" is
  testable without a clock or a document.
- **`context/TimerProvider.tsx`** — owns the one live interval, persistence and
  effect execution. Mounted above the router: a running timer has to survive
  navigating away from /timer.
- **`views/timer/`** — `TimerView` and `MiniTimer`, which are now only screens.

Both clock directions are preserved exactly. Count-down is anchored to
`targetEndTime` and recomputed from the wall clock on every tick, so a
throttled background tab catches up instead of drifting; count-up is
`startedAt` + `countUpBase`, so elapsed time survives a pause and a reload. A
count-down that expires while the tab is closed is still logged and toasted on
the next load. All four types, all four modes, staging, `+5 min`, flowtime's
proportional break, favourite presets (including the legacy flat fields the
vanilla writes, so presets round-trip between the two apps) and the
motivational quotes all came across.

**The three vanilla bugs its own comments describe are preserved as behaviour
and pinned by tests** — they were fixed in the vanilla and it would be easy to
silently undo them in a rewrite: `flushCountUpSession` runs *before* any type
switch (otherwise a stopwatch looks like a countdown and banked minutes vanish);
it clears the counters unconditionally (otherwise a type switch reads a
pomodoro's stale `elapsed` as a fresh stopwatch session and logs time nobody
spent); and `isRunning` is set before the elapsed read on restore (otherwise the
display shows the pre-reload time until the first tick).

**One accuracy fix.** `pause()` now recomputes `timeLeft` from the end anchor
instead of trusting whatever the last tick left behind. The vanilla's version
rounded up to a second of free time on every pause, and a pause during a
throttled background tab could bank a value many seconds stale.

**Session logging keeps the vanilla's ordering deliberately**: localStorage
first and synchronously, then a best-effort Supabase write whose failure is
warned and swallowed. Local history is the source of truth for instant UI, so a
flaky connection never loses a logged session — there's a test for exactly that.

**Testing: 90 new tests (375 total).** 64 on the state machine — every type and
phase transition, both clock directions, the flush rules above, persistence
round-trips including "expired while away", and the legacy preset format — and
26 on the views: the type panels, staging vs applying, both confirmation
dialogs, Stop & log, the preset lifecycle, restore-across-reload, task
attribution, and the mini-timer's docking rules.

**One test-infrastructure change:** `TimerProvider` is opt-in in
`test/render.tsx` (`withTimer: true`) rather than part of the default stack. It
restores and re-persists localStorage-backed state on every mount and owns an
interval; including it unconditionally made the whole suite roughly eight times
slower for the benefit of the ~25 tests that need it. That's the same reasoning
`AuthProvider` is already excluded for.

**Browser-verified.** Started a pomodoro, confirmed it ticks, then switched type
mid-run: the segmented control and config panel moved to Countdown and the hint
appeared, while the pomodoro kept running at 24:51 in Focus — the vanilla's
non-destructive staging, intact. Navigating to /exams docked the mini-timer
bottom-left, still counting, with its pulsing accent dot. Console clean.

**Cutover still not performed** — same hash-routing reason as Steps 7-9.
`index.html` and `js/*` remain untouched.

### Step 11 — Library shell + subject workspace (2026-07-30)

**Built on Steps 8-9, not on Step 10** — the Timer sat unmerged on
`feat/react-step-10-timer` at the time and nothing in the Library depended on
it. Both branches were combined onto `feat/react-step-12-dashboard` when
Step 12 started, since that step is the first one that needs both.

The Library's four tabs (`/library`, `/library/materials|flashcards|quizzes`)
and a subject's workspace (`/folders/:folderId`) are ported into
`webapp/src/views/library/`: `LibraryView` (the shell), one component per tab
(`FoldersPanel`, `MaterialsPanel`, `FlashcardsPanel`, `QuizzesPanel`),
`SubjectDetailPage`, `useLibraryActions` (the confirm-then-delete flows both
surfaces share) and `libraryMeta.ts` (tab list, `safeColor`, the two date
formats). Sources: index.html:1684-1748 + js/router.js:251-498 and :794-825.
36 new tests (321 total).

**The active tab lives in the URL**, as it did in the vanilla (`#library`,
`#library-materials`, …), so tabs stay linkable and survive a refresh. An
unknown tab now redirects to `/library` instead of rendering Folders under a
URL that says `#library-nonsense`, which is what `known.includes(tab) ?
tab : "folders"` did. Only the selected panel is mounted, which is also how the
vanilla's "load only this tab's data" behaviour falls out for free — an
unmounted panel's queries never run.

**The delegated-click ordering hack is gone.** The vanilla made each folder
card a `[data-hash]` div with the rename/delete buttons *inside* it, so
clicking Delete also navigated into the folder; `js/router.js:32-65` defused
that with five `[data-action]` checks that had to run before the `[data-hash]`
handler. Here the card is a real `<Link>` and the buttons are siblings layered
over it, so neither can trigger the other and there is no ordering to get
right. Quiz cards, which have two destinations (take it / review the last
attempt), keep the title and both actions as separate links rather than nesting
anything inside a card-wide link.

**Card quick-actions are reachable without a mouse.** `.folder-card-actions`
was `opacity: 0` until `:hover`, so on a touch device rename and delete were
invisible and unreachable. `:focus-within` was already there for keyboards; the
port adds a `@media (hover: none)` rule that keeps them visible where hover
isn't a real input.

**Two bugs found while porting.**

1. *Every subject's workspace was titled "Workspace".* The markup has
   `<h2 id="workspace-title">Workspace</h2>` and nothing in `js/` ever assigns
   to it, so the page never named the folder you had opened. It shows the
   subject's name now, and a folder id that doesn't resolve says so instead of
   rendering three empty lists that look like a real but empty subject.
2. *Deletes left the rest of the Library showing rows that no longer existed.*
   `useDeleteFolder` invalidated only the folder list, but folder deletion
   cascades to materials, quizzes and decks in the database (migration
   20260719000000), and a deck takes its flashcards with it. Same gap in
   `useDeleteDeck` (the due-count banner sits directly above the deck it just
   removed) and `useDeleteMaterial` (`notes.material_id` and
   `quizzes.material_id` both point at the deleted row — FKs re-checked against
   the live schema via the Supabase MCP `list_tables` tool). All three now
   invalidate what the cascade actually touches; `notesKeys` gained an `all`
   prefix for it.

**Creation goes through Step 6's CreateModal**, so "+ Create", "+ New Folder"
and every empty-state button open the one dialog on the right panel — this is
the "first view step to build real navigation should call `openCreateModal()`"
loose end from Step 6, now closed. The vanilla created folders from a bare
`UI.promptText()` with a random colour; the Subject panel asks for the colour
instead. Renaming a folder still uses `promptText`, matching the vanilla.
Failures report through an error toast rather than `UI.showPopup`, which has no
React equivalent, and a successful folder delete now toasts like the other
three did.

**Nothing re-renders a view by hand.** The vanilla's four delete handlers each
parsed `window.location.hash` for `folder-<id>` to decide whether to call
`loadFolderDetail(id)` or `loadAllX()`; cache invalidation reaches every
subscriber regardless of which is mounted, so deleting a deck inside a subject
updates the Flashcards tab too. The subject page filters decks and quizzes out
of the all-entities queries the Library tabs already load, so opening a subject
from the Library costs no new requests.

**Browser verification not done — it is owed before this merges.** There is no
browser driver in this environment (no Playwright/Puppeteer installed, no
browser tool available), and the visual surface here is exactly the kind jsdom
cannot prove: hover-revealed card actions, `backdrop-filter` glass cards, the
`auto-fill minmax` grid, and the folder colour written as an inline
`border-top`. The dev server was smoke-tested instead (`/` and
`/library/quizzes` both 200, the CSS module compiles and serves), and
`npm run build` is green. Worth a click-through of all four tabs plus one
subject against a stubbed session, per the recipe in the loose ends below.

**Cutover still not performed**, for the reasons under Step 7 — the vanilla app
is hash-routed, so no path rewrite can intercept `#library`. `index.html` and
`js/*` remain untouched.

### Step 12 — Dashboard (2026-07-30)

**Required combining Steps 10 and 11 first.** The Timer sat unmerged on
`feat/react-step-10-timer` and the Library was still on its own
`feat/react-step-11-library` branch — this step is the first that needs both,
per the plan's Section 4 ("Dashboard comes after its constituent widgets'
source views"). Both were merged into `feat/react-step-12-dashboard` (two
merge commits, conflicts only in `routes.tsx` and this ledger — every hook
file Step 11 touched resolved cleanly since Step 10 never touched them)
before any Dashboard code was written. 454 total tests (411 carried over +
43 new: 21 pure-function, 22 integration).

The whole `/` route is ported into `webapp/src/views/dashboard/`: seven
components (`NextExamCard`, `FocusCard`, `StreakCard`, `TasksCard`,
`AIActionsCard`, `OnboardingBanner`, `SessionHistoryCard`) composed by
`DashboardView`, plus `analytics.ts` (the pure functions behind the numbers —
`computeStreak`, the 7-day sparkline, the per-folder breakdown, focus-time
totals, the next-exam countdown) and `useLocalSessions.ts`. Sources:
index.html:470-593 + js/main.js's renderDashboard/renderAnalytics/
renderNextExam/renderDueCards/renderWeakTopics/maybeRenderOnboardingBanner
(:1921-2354) and the focus-preset/plan-week/quiz-me bindings (:1252-1276,
:2445-2483).

**One deliberate cross-view import, pre-authorized by Step 8's own comment.**
`TasksCard` renders Step 8's `DashboardTasksWidget` directly from
`views/tasks/` — every other view in this codebase is self-contained, but
that widget's file comment already says "Step 12 imports it into the real
dashboard," so this was the plan, not scope creep. `analytics.ts`'s `safeColor`
is duplicated rather than imported from `views/library` for the same reason
the reverse direction wasn't done in Step 11: everything else stays
self-contained.

**Two data sources for one number, same split as the vanilla.** The Focus
card's total/today paint instantly from the same `localStorage["sessions"]`
key `TimerProvider` writes first and synchronously (its own comment: "a
flaky Supabase write should never lose a logged session"), then prefer the
Supabase-sourced `useSessionsSince(90)` total — the same query `StreakCard`
reads — the moment it resolves. The vanilla did this as two sequential DOM
writes (`renderDashboard()` then `renderAnalytics()`); here it's "prefer the
query once it's ready," which is the idiomatic shape of the same design in
React.

**Live-refresh bug found and fixed while porting.** `js/timer.js:463`
dispatches a same-tab `sessionLogged` window event after every local write,
and `js/main.js:2653` listens for it to repaint the dashboard — necessary
because the timer can keep running (and finish) on a different route than
the one showing the log. The first cut of this port missed that entirely:
`useLocalSessions` read `localStorage` once on mount with no way to learn
about a write from a sibling component, so a session completing via the
docked `MiniTimer` while sitting on `/` would never appear until a real
navigation away and back. `TimerProvider` now dispatches
`SESSION_LOGGED_EVENT` (same idea, exported name) after its local write, and
`useLocalSessions` re-reads on it. There's a regression test that dispatches
the event manually and asserts the list updates without remounting.

**The "Ask Learnora AI" card is real UI with an honest stub, not an
omission.** All four buttons ("Plan my week", "What next?", "Quiz me",
"Summarize notes") call into `js/ai.js`, which doesn't exist in the React
app until Step 14. Rather than drop the card — a visible hole in the
grid — or invent new `CreateModal` option surface to half-wire "Quiz me"
early, every button opens the same "AI features aren't connected yet —
Step 14 wires this up" message Step 6's `MaterialPanel` already established
for its own AI-gated submit. The weak-topics chips beneath them are real,
not stubbed: `fetchWeakTopics` only aggregates
`quiz_attempts.weak_topics`, a plain read with no AI dependency, unchanged
since Step 5.

**One vanilla behavior not carried over — genuinely dropped, not deferred
elsewhere.** The vanilla's `renderDueCards()` also pushed a once-per-day
browser `Notification` when cards are due (`notifyDueCardsOncePerDay`,
gated on the `notifyStudyReminders` setting). Nothing in the React app fires
that yet — `TimerProvider`'s `Notification` calls are for timer alerts only,
a separate setting (`notifyTimerAlerts`). Listed below under loose ends
rather than silently skipped.

**Testing.** `analytics.test.ts` (21 tests) covers every pure function on
its own — `computeStreak`'s grace-day and missed-day rules, the sparkline's
7-day window, the folder breakdown's sort-and-cap-at-4, `daysUntil`'s
local-time parsing — matching the precedent `lib/timer.test.ts` set for
testing state logic without a document. `DashboardView.test.tsx`
(22 tests) covers all seven cards end to end: the exam countdown and its
empty state, the two-source focus total (including the instant local paint
asserted *before* the network response resolves), both focus-preset paths
(idle vs. running-with-confirmation), the streak card's empty state, the
tasks widget's View-all link and SRS due banner, the AI stub message, real
weak topics, the onboarding banner's full lifecycle (appears, dismisses,
persists, disappears once there's real data, focuses the task input), and
the live session-log refresh. Needed `withTimer: true` in the provider stack
(FocusCard reads `useTimer()`) and, per the Step 9 loose end, derives every
exam/session date from the real clock rather than faking timers.

**Manual/browser verification not done — no driver available in this
environment** (same constraint as Step 11's entry). The dev server was
smoke-tested (`/` returns 200, `npm run build` succeeds). Worth a real
click-through — the sparkline bar heights, the AI card's hover states, and
the glass-card gradients on `.examCard`/`.card::before` are exactly what
jsdom can't prove — before this merges.

**Cutover still not performed**, same hash-routing reason as every prior
step. `index.html` and `js/*` remain untouched.

### Step 13 — Notes editor, Quill wrapper (2026-07-30)

Ports js/editor.js (217 lines) and index.html:1750-1802 into two layers,
matching Decision #8: `components/RichTextEditor.tsx` (a hand-rolled Quill
wrapper — `react-quill` is unmaintained against Quill 2.x) and
`views/notes/NotesEditorPane.tsx` (the autosave/save-status state machine
above it). `views/notes/NotesView.tsx` is the route-level wrapper that
resolves the material and its notes and hands off to the pane, split the
same way Library's `SubjectDetailPage`/panels are. 26 new tests (480 total):
9 on the wrapper, 9 on the view, 8 on `renderMarkdown` (below).

**Scoping decision made before writing any code.** The vanilla's Notes view
is actually two panes — the Quill editor (this step) and a full AI study
sidebar (chat, Quiz-me/Flashcards quick actions, file attach, voice input;
index.html:1804-1869). The sidebar is not ported here. It depends on the AI
layer (step 14) and is, in substance, the same chat surface Step 17 builds
for real — the ledger's own dependency table already has 17 depend on 13,
not the reverse, so building a throwaway stub here would just be replaced
work. `notes.module.css` is a single-pane layout for exactly this reason:
no reason to reserve space for a sidebar that doesn't exist yet.

**One function ported early, deliberately, out of step 14's file.**
`AI.renderMarkdown` (js/ai.js:138-192) is the fallback path for any note
whose `html_content` hasn't been generated yet — still processing, or a row
that predates the `html_content` column (migration 20260727020000). It has
no network call and no AI dependency, just a pure regex-based markdown→HTML
transform, so it's ported now into `lib/markdown.ts` rather than leaving
that fallback broken (or showing raw markdown syntax) until step 14 lands.
Step 14 should import it, not reimplement it. The one thing deliberately
*not* carried over: the vanilla's widget-token un-escape step
(js/ai.js:183-190) — that exists for the AI chat's action-tag system, which
doesn't exist here yet, so there is nothing calling this function with
reserved tokens to stay compatible with.

**Both of `js/editor.js`'s documented security fixes are preserved exactly,
with a regression test each.** (1) Stored HTML is never assigned via
`innerHTML` — it round-trips through the DB and is seeded from model output
run over an uploaded document, so `RichTextEditor` only ever loads content
through `quill.clipboard.convert()`, which parses it into a Delta and keeps
only the formats on an explicit allowlist. (2) That allowlist excludes
`video` on purpose: Quill's default format set includes it, and a stored
`<video>`/iframe embed is a same-origin frame of the app inside a note
(clickjacking / spoofed UI) — nothing here needs embeds, so the format is
dropped. Tests load a document containing a `<script>` and one containing an
`<iframe>` and assert both are stripped, not merely escaped, and that the
script never executes.

**The autosave state machine keeps two rough edges the vanilla has on
purpose,** not smoothed over as "obvious improvements": a save already in
flight blocks a new one from starting rather than racing it
(js/editor.js:130) — the cost is a save that could in principle sit dirty
until the next keystroke reschedules it, same as the vanilla, and manual
Save on an unchanged document acknowledges with "Saved" instead of silently
doing nothing (js/editor.js:131-138, itself already a fix over an earlier
version that just did nothing). A pending edit is flushed on unmount rather
than dropped — `Editor.destroy()`'s fire-and-forget save — using the same
`flushRef`-points-at-the-latest-closure pattern `useTaskActions.ts` already
established for its own flush-on-unmount, since an unmount-only effect would
otherwise close over a stale `note`/mutation.

**`quill` needed pinning to an exact patch version.** `npm install quill`
resolves to 2.0.3, which `npm audit` flags for GHSA-v3m3-f69x-jf25 (XSS via
the HTML export feature, CVSS 6.1) — a range of exactly `=2.0.3`; 2.0.2 is
unaffected. Installed as `"quill": "2.0.2"` (exact, via `--save-exact`).
`npm audit`: 0 vulnerabilities.

**One pre-existing issue noticed in passing, not fixed here.** Step 11's
`SubjectDetailPage`'s two "back to Library" affordances nest a `<Button>`
(a `<button>`) inside a `<Link>` (an `<a>`) — invalid HTML (interactive
content can't nest) that this step's own not-found empty state avoids by
using `Button`'s `onClick` + `navigate()` instead, matching the pattern
already used elsewhere (`ExamsView`'s "+ Add exam", `FoldersPanel`'s
"+ Create Folder"). Left alone rather than opportunistically fixed —
outside this step's diff — but worth a one-line fix whenever Library is
next touched.

**Manual/browser verification not done — no driver available in this
environment**, same constraint as Steps 11 and 12. The dev server was
smoke-tested (`/notes/x` returns 200, Quill's stylesheet serves correctly
at `/node_modules/quill/dist/quill.snow.css` in dev). Everything about this
step that jsdom *can* prove is covered by the test suite (sanitization,
autosave timing, read-only toggling); what it can't — the toolbar's actual
icon rendering, focus rings inside the `ql-editor`, and the picker dropdowns'
dark-theme colors — wants a real click-through before this merges.

**Cutover still not performed**, same hash-routing reason as every prior
step. `index.html` and `js/*` remain untouched.

---

## Known loose ends

(carried forward from `REVAMP_PROGRESS.md` where relevant, plus new ones found during
the port)

- **Steps 11, 12 and 13's browser passes are all owed** (see those
  sections) — no browser driver is available in this environment. Everything
  else about all three steps is verified; only the real-browser look at the
  Library's four tabs, a subject workspace, the dashboard's seven cards, and
  the Quill editor's toolbar/pickers is outstanding.
- **The Notes AI study sidebar is not ported** (Step 13's scoping decision —
  see that section). `NotesView` is Quill-only until Step 17 builds the chat
  surface for real; nothing to revisit before then.
- **SRS due-cards notification is not ported** (found in Step 12).
  `notifyDueCardsOncePerDay` (js/main.js:2241-2256) — a once-per-day browser
  `Notification` when flashcards are due, gated on `notifyStudyReminders` —
  has no React equivalent yet. `useFlashcardsDueCount` exists and the
  dashboard reads it, so wiring the notification itself is small; it just
  hasn't been done. Natural home is wherever notification permission gets
  centralized (`TimerProvider` currently owns its own `notifyTimerAlerts`
  path independently).
- **"Plan my week" and "Quiz me" are stubs pending Step 14** (Step 12). Both
  dashboard buttons show "AI features aren't connected yet" instead of
  calling `AI.generateWeeklyPlan()` or opening a quiz-tuned CreateModal —
  same reasoning as Step 6's Material panel. Revisit once the AI layer
  lands; "Quiz me" additionally wants `CreateModal`'s options extended with
  a way to pre-select the Quiz output and a custom title, which don't exist
  today.
- **The material-delete confirmation overstates what goes with it.** It says
  "along with the notes, flashcards and quizzes generated from it", but
  `flashcard_decks` has no `material_id` at all — decks reference a folder
  only, so a deck outlives the material it was generated from. Notes and
  quizzes really are deleted. The wording is the vanilla's and is left
  unchanged here (it's a copy decision, not a port bug); worth fixing in
  whichever step owns deck provenance.
- **A subject's "+ Create" no longer pre-selects the folder's newest
  material.** The vanilla passed `materialId: materials[0]?.id` so the dialog
  could seed "generate a deck/quiz from this material" — a flow that is AI-
  driven and doesn't exist until Step 14. The folder pre-selection, which does
  exist today, is passed.
- **`SubjectDetailPage`'s two "Back to Library" links nest a `<button>`
  inside an `<a>`** (found while building Step 13, which needed the same
  affordance and used `Button`'s `onClick` + `navigate()` instead) — invalid
  HTML, interactive content can't nest. One-line fix whenever Library is next
  touched.
- Vite's react-ts template now ships **oxlint** instead of ESLint (`npm run lint`).
  Kept — it satisfies the lint requirement — but if anyone wants ESLint-specific
  plugins later (e.g. eslint-plugin-react-hooks rules beyond what oxlint covers),
  that's a separate decision.
- **`vercel.json` still not added, and the cutover mechanism needs rethinking**
  (found in Step 7 — see that section for the full analysis). Two blockers: the
  vanilla app is hash-routed, so a path rewrite cannot intercept `#settings`;
  and `webapp/dist/index.html` asks for `/assets/*`, so a path-prefix deploy
  needs Vite's `base` set and the output placed accordingly. Wants its own PR
  from someone who can sign in and test navigation across the two apps.
- **i18n is not ported.** `UI.saveSettings()` called `applyTranslations()` over
  every `[data-i18n]` node; the React app has no translation layer and none is
  on the ledger. The Preferences tab persists `uiLanguage` (and the vanilla app
  honours it), but the React UI stays English until someone schedules the port.
- No React sign-in flow exists, so manual verification of any protected route
  needs a locally stubbed session in `sb-<ref>-auth-token` (see Step 7). Worth
  replacing with a real login the moment auth is cut over. A stub token is
  rejected by the real Supabase, so verifying a data-backed view also needs
  `window.fetch` patched in the page and the route remounted client-side (no
  reload, or the patch dies) — done for Steps 8-9. A real login would replace
  the whole dance.
- **`vi.useFakeTimers` is unusable in view tests** (found in Step 9). TanStack
  Query, MSW and userEvent all pace themselves off `Date.now()`, so a frozen
  clock hangs the query; `shouldAdvanceTime` fixes that only by burning real
  time and slowed the suite ~17x. Derive from the real clock, or render the
  component under test directly to avoid depending on today's date.
- **No `DatePicker` primitive still.** The vanilla attached `js/datepicker.js`
  to the Tasks due-date field and the exam date input; both use a plain
  `<input type="date">` here, as `ExamPanel`/`TaskPanel` already did in Step 6.
  Consistent across the app, but still a deviation from the vanilla's custom
  calendar overlay.
- The Tasks list has no pagination or virtualisation, matching the vanilla — the
  whole table is fetched and rendered. Fine at a student's task count; worth
  revisiting only if someone turns up with thousands.
- **The dashboard's Focus-Session quick-starts are not wired up** (js/main.js:
  1252-1276). `TimerProvider` exposes `startPreset()` for exactly that, and the
  Tasks widget is already built, but the dashboard itself is step 12 — so the
  entry point lands there.
- **`vite.config.ts` raises `testTimeout` to 20s** (Step 9). Several
  pre-existing tests sit near 600ms on an idle machine and the 5s default was
  failing them under parallel load. It's a ceiling for hangs, not a target; if
  a test ever approaches it, that's a bug worth looking at rather than a
  reason to raise it again.
- The timer's "task" binding logs the task's *text*, not its id — carried over
  from the vanilla, which read `#active-task-select`'s value. Renaming a task
  therefore orphans the attribution on past sessions. Worth switching to the
  id whenever someone touches the study_sessions schema.
- `webapp/public/favicon.svg` is still the Vite template favicon; swap for Learnora
  branding whenever convenient (cosmetic only).
- **CSP for the React app is not set yet.** The vanilla app ships a strict policy as
  a `<meta>` tag in `index.html`; the same tag in `webapp/index.html` would break
  Vite's dev server, which injects inline scripts for HMR. Set it as a response
  header in `vercel.json` alongside the first path-prefix rewrite in Step 7 —
  production needs `style-src 'unsafe-inline'` (React inline `style` attributes)
  and the same Supabase `connect-src` origins the vanilla policy lists.
- Modal enter animation is CSS; the exit animation is dropped because React
  unmounts on close (the vanilla kept the node and faded `.hidden`). Revisit only
  if the missing fade-out is noticeable in review.
- `ProtectedRoute` records `state.from`, but nothing consumes it yet — the
  post-sign-in return trip needs the vanilla app to hand control back, which
  belongs to whichever step cuts auth over.
- Sign-in, sign-up, password reset and the invite-access gate all still live in
  the vanilla app. Step 5 ported `signInWithPassword`/`signUp`/`friendlyAuthError`
  and friends into `api/auth.ts` + `hooks/useAuthActions.ts`, but nothing calls
  them yet — no React view exists for login/signup/settings until Steps 6–7.
- **`npm run format:check` reports all 67 tracked files as unformatted on a
  Windows checkout, unrelated to any step's content.** `core.autocrlf true`
  checks files out with CRLF while Prettier's default `endOfLine` expects LF;
  confirmed by stashing every Step 5 change and seeing the same failure count
  beforehand. Not fixed here — fixing it means picking a repo-wide convention
  (`.gitattributes` forcing LF, or Prettier's `endOfLine: "auto"`) which is a
  separate decision, not a Step 5 side effect.
- `api/dataAdmin.ts`'s `exportCSV` (Blob + anchor-click download) has no test —
  it's a real-browser DOM interaction with nothing meaningful to assert on
  under jsdom. Worth a manual click-through once Settings (Step 7) puts a
  button in front of it.
- ~~**No real entry point calls `useCreateModal()` yet.**~~ Closed in Step 11:
  the Library header, the "+ New Folder" card, a subject's "+ Create" and every
  empty state now open it (`js/main.js:116-119`'s affordances). The dashboard's
  own "+" arrives with the shell in Step 12.
- `MaterialPanel`'s inline "+ New folder" selects the new folder immediately
  via local state (`extraFolder`) merged into the fetched list, rather than
  waiting for `useAddFolder`'s cache invalidation to refetch — intentional
  (matches the vanilla's `select.appendChild()`, and avoids a flash where the
  just-created folder is briefly unselectable), but worth knowing about if a
  future entity's "create inline from a select" pattern needs the same trick.
- No `DatePicker` primitive exists yet — `ExamPanel`/`TaskPanel` use plain
  `<input type="date">` rather than the vanilla's custom calendar overlay
  (`js/datepicker.js`). Functionally equivalent and fully accessible; revisit
  only if a future step needs the vanilla's exact visual calendar widget.

---

## How to resume

```bash
cd c:/Users/kkchi/OneDrive/Desktop/study-planner-1
git checkout react-migration
cd webapp && npm install && npm run test    # expect N/N passing
npm run dev                                  # localhost:5173, side-by-side with vanilla app
```

1. Find the first ☐ in the ledger.
2. If its section is not yet written below, read the corresponding entry in `.claude/plans/dapper-snacking-bumblebee.md` or the plan's Section 4.
3. Implement, verify (see Definition of Done below), commit, tick the box, **stop**.

---

## Definition of Done (per migrated step)

- **Renders:** component mounts with realistic mock data (MSW) and empty-state data,
  asserted via `screen.getByRole`/`getByText` (never snapshot tests).
- **Interactions work:** `userEvent` drives real flows (type, submit, click delete/confirm),
  asserting on resulting DOM state or the mutation request MSW intercepted.
- **API calls correctly scoped:** MSW assertions confirm the right user-scoping
  (`eq("user_id", ...)` invariant) and payload shape.
- **Accessibility invariants carried over, not dropped:** focus-trap on modal open, Escape
  closes, `role="tab"`/`aria-selected`, toast `role="alert"` — each gets one explicit RTL
  test.
- **Manual/browser verification:** noted in ledger prose for anything worth a real
  click-through (real Quill rendering, actual 3D CSS flip, real streaming).
- **Tests pass:** `npm run test` green + vanilla route deleted + rewrite rule added + committed.

---

## Out of scope

- Backend/schema changes (beyond what's needed to expose existing tables to the new app).
- AI provider chain internals or edge-function logic.
- Visual redesign (design tokens are ported as-is, no recoloring/resizing).
- New features beyond what the vanilla app already has.

---

## Critical reference files (source for porting)

- **`js/api.js`** (1,229 lines) — per-entity CRUD pattern to port into `webapp/src/api/*.ts` + `hooks/use*.ts`.
- **`style.css`** (lines 1–144: `:root` token block) — ported 1:1 into `webapp/src/styles/tokens.css`.
- **`js/ui.js`** (1,482 lines) — ModalManager/toast/theme-engine logic to port into `webapp/src/context/*.tsx`.
- **`js/ai.js`** (1,728 lines) — streaming/action-tag logic to port into `webapp/src/api/ai.ts` (gates Steps 14–18).
- **`js/router.js`** (1,185 lines) — route list to mirror in `webapp/src/routes.tsx`, progressively delete as each step cuts over.
- **`js/main.js`** (2,700 lines) — event wiring to decompose into component click handlers / useEffect hooks.
- **`supabase/functions/learnora-ai/index.ts`** — CORS allow-list informs routing decision; no changes needed.

---

## Incremental progress notes

(leave empty until Step 1 lands, then add brief dated notes per step completion)

---

## How to update this ledger (for any agent or teammate)

1. After each step is verified and committed, return here and change the ☐ to ✅.
2. Write a prose section below "What has been done" for that step (2–3 sentences: what/why,
   files touched, any deferred work).
3. If new loose ends are discovered, add them to the "Known loose ends" section.
4. Push the updated ledger.

This document is the single source of truth for migration progress across any machine or
session — keep it current so the next person (or agent) picking up the work can resume
without rederiving state.
