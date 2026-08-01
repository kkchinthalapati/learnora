# Learnora React Migration — Progress & Remaining Work

**Living document.** Update the ledger as steps complete. Written so a different machine,
session, or agent can resume without any conversation history.

- **New app root:** `webapp/` (separate npm package, side-by-side with the vanilla app)
- **Branch:** `react-migration` (to be created on first implementation session)
- **Tests:** `npm --prefix webapp run test` — expect 846/846 passing
- **Last verified:** 2026-08-01 (Step 23, i18n port — tests green, `npm run build` green, `npm run lint` clean, `tsc -b` clean; Steps 11-13's browser passes still owed, see those steps' entries)

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
| 14 | AI layer port (streaming calls, `renderMarkdown`, action-tag parser) | Foundation | ✅ |
| 15 | Weekly Plan | Views | ✅ |
| 16 | Quiz runner + review | Views | ✅ |
| 17 | Turbo chat + dashboard command bar | Views | ✅ |
| 18 | Flashcard Review (SRS flip-card, most complex) | Views | ✅ |

Steps 1-18 were the view-porting plan, and they are done. A workspace-wide pass
on 2026-07-31 found that view parity was not the same as a complete migration:
a student still could not sign in without leaving React, two auth-adjacent pages
and the Terms page had no route, and nothing existed to serve a React route in
production. Those are steps 19-21.

| # | Step | Phase | Status |
|---|------|-------|--------|
| 19 | Auth wall (sign-in, sign-up, forgot password) | Views | ✅ |
| 20 | Auth-adjacent routes: `/verify`, `/reset-password`, `/terms` | Views | ✅ |
| 21 | Production cutover mechanism (`vercel.json`, Vite `base`, CSP) | Foundation | ✅ |
| 22 | App Shell (Sidebar + Header) — should have existed since Step 1 | Foundation | ✅ |
| 23 | i18n port (`i18n.js` → a React translation layer) | Foundation | ✅ |
| 24 | `createStudyPackage` Create-pipeline | Views | ✅ |
| 25 | Notes AI study sidebar | Views | ✅ |
| 26 | First real route cutover: Settings (`#settings` → `/app/settings`) | Foundation | ✅ |

**Every known-scoped view and feature port is now done.** With Step 25 closed
(2026-08-01), nothing on the vanilla side is waiting to be *built* in React —
what remains is the route-by-route cutover Step 26 started (Tasks, Exams,
Timer, Library, Dashboard, Notes, Plan, Quiz, Review still belong to the
vanilla app) plus the items in "Known loose ends".

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

    **Amended in Step 21.** The React app is served from the `/app` prefix, and
    cutting a route over is a **redirect the vanilla app issues** (`#settings` →
    `/app/settings`), not a rewrite Vercel performs. A rewrite cannot work: the
    vanilla is hash-routed, and a server never sees the fragment. The prefix
    makes the two routing schemes disjoint instead of trying to interleave them.

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
truth, with `_cachedUser` replaced by provider state. `signOut` drops the
session even when the API call fails, as the vanilla logout does; it does
**not** reload the page, since React re-renders from the state change.
(It also used to clear the `learnora_invite_access` keys — removed when the
gate itself was removed on 2026-08-01, see the "Residual-vanilla audit"
section below.)

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

### Steps 14 & 15 — AI layer + Weekly Plan (2026-07-30)

Shipped together because 15 cannot exist without 14: the ledger's own
Decision #13 puts the AI layer before Plan/Quiz/Chat, and the Weekly Plan is
the first screen that needs it.

**Step 14 — the AI layer**, split by concern rather than transcribed as one
`AI` object:

- **`api/ai.ts`** — the edge-function caller (`js/ai.js:62-136`). Raw `fetch`
  rather than `supabase.functions.invoke`, matching the vanilla, so the body
  can be read as a stream if the edge function ever becomes one. The retry
  rules are preserved exactly and are now pinned by tests: one retry, 4xx
  never retried, 429/5xx retried, and our own 60s deadline never replayed
  (the server has already spent its whole budget walking the provider chain
  by then, so a replay costs another minute to fail identically). Errors are
  an `AiError` carrying `retryable` and `refused`, so a content refusal —
  which arrives with its own explanation written for the student — can be
  shown verbatim instead of flattened into "generation failed".
- **`lib/actionTags.ts`** — the three separate jobs the vanilla's tag helpers
  do, kept separate on purpose because conflating them is how this becomes a
  prompt-injection hole: `fenceUntrusted` for attacker-influenced text going
  *into* a prompt (a PDF containing `<SET_THEME>x</SET_THEME>` must not be
  able to steer the app), `stripActionTagBlocks` for model output coming
  *out* before it is displayed or written to history, and
  `widgetToken`/`restoreWidgets` so app-built HTML is spliced back in *after*
  the model's text has been escaped, never round-tripped through the escaper.
  There is a test asserting the token survives `renderMarkdown` untouched —
  that is the property the whole scheme rests on.
- **`lib/aiJson.ts`** — the hardened extractors (`js/ai.js:257-418`). The
  ladder of strategies exists because the edge function walks a chain of
  providers and only some honour `response_format: json_object`, so one
  request comes back as `{"questions":[…]}` from Groq and a bare `[…]` from
  Gemini, with or without prose and fences around it. `correctIndex` is
  validated rather than assumed, for the reason the vanilla documents: the
  runner grades with `i === q.correctIndex`, so a reply naming its answer
  field `answer` yields a quiz where every option is marked wrong, silently.
- **`api/aiPlan.ts`** — `generateWeeklyPlan` plus `loadWorkspaceContext`,
  which step 17 will reuse for the chat's workspace summary. The prompt is
  carried over verbatim: it is what the edge function's `mode: "plan"`
  instructions were tuned against, and rewording it would change what every
  existing user gets. `settings` is a parameter rather than a global read, so
  the caller passes whatever `SettingsProvider` holds — including unsaved
  edits, which is what `UI.loadSettings()` did too.

`renderMarkdown` was already ported early, in Step 13. **`createStudyPackage`
is deliberately not ported** — see loose ends.

**Step 15 — the Weekly Plan** at `/plan` (`index.html:942-955` +
`js/router.js:1046-1141`). `views/plan/` holds `PlanView`, `planMeta.ts` and
the CSS module. The week comes from `mondayOfWeek()` on each render rather
than state: there is one plan per user per week and no week-stepping UI in
the vanilla, so holding it would be inventing a feature.

**`plan_json` is narrowed at the boundary** (`planMeta.parseStoredPlan`).
It is model output round-tripped through the database, so nothing about its
shape survives the trip — the vanilla read it optimistically
(`String(b.durationMins)`) and rendered "undefinedm" when a row predated a
field or a provider drifted. Blocks with no subject are dropped, durations
are coerced and defaulted to the vanilla's 25, and a plan with no `days`
falls back to the empty state rather than a broken grid.

**Regeneration asks first.** `Plans.upsert` is keyed on user + week_start, so
regenerating destroys the plan on screen; both entry points (the view's
button and the dashboard card) confirm, as the vanilla did. Generating the
*first* plan of a week destroys nothing and goes straight through.

**`TimerProvider` gained `prepareFocus`** for the vanilla's `start-plan-block`
handoff (`js/router.js:82-85` + `js/main.js:1288-1319`): a block's duration
and subject are pre-staged and the student lands on /timer with only Start
left to press. It deliberately does not auto-start, and never tears down a
running timer — it stages for the next Apply & Reset instead, the same rule
`selectType` follows. One deviation: the vanilla wrote only `#config-focus`,
so a student on the Countdown type saw the duration not change at all; both
`focus` and `countdown` are written here, since which one the clock reads
depends on the type (`lib/timer.ts` `focusSeconds`).

**A bug found in the browser and fixed.** After the handoff, the timer's
"Current Task" select read *None* while the provider was holding "Biology" —
a plan subject is usually not one of the student's tasks, so the `<select>`
had no option matching the bound value and fell back to the first one. The
display was lying about where the logged time would go. `TimerView` now
renders an option for a bound-but-unlisted task, which is exactly why the
vanilla appended one by hand; the fix also covers a task renamed or completed
since it was bound. Regression test in `PlanView.test.tsx`.

**The dashboard's "Plan my week" is now real** (`js/main.js:2445-2466`) —
generate, then navigate to /plan. The other three AI buttons still say they
aren't connected, but now name step 17 rather than 14, because what they need
is the chat surface.

**Testing: 91 new tests (570 total).** 15 on the action-tag sanitizers
(every tag defanged, opener/closer marked distinctly, a tag only ever paired
with its own closer, tokens surviving `renderMarkdown`), 25 on the JSON
extractors (every provider shape, fences, prose, trailing commas, and each
rejection rule), 18 on `callEdge` and `aiPlan` (bearer token, mode, retry
matrix, refusal flag, timeout, workspace filtering, upsert payload), 9 on
`parseStoredPlan`, and 24 on the view (empty state, generate, both failure
messages, the summary and grid, today's `aria-current`, the confirm-on-
regenerate in both directions, the timer handoff and its task binding, and
the unusable-`plan_json` fallback).

**Browser-verified.** With a stubbed session, `/plan` rendered the header,
week range (27 Jul – 2 Aug), summary panel with "Last generated 3h ago", and
all seven day cards: today (Thu 30 Jul) carrying the accent border and glow,
past days dimmed, free days showing their message, and each block its
subject, duration, hint and reason. Clicking "Start →" on the 90-minute
Biology block landed on /timer showing Focus 90 / 1:30:00, unstarted — which
is how the task-select bug above was found. Console clean.

One environment note for whoever verifies next: the query sat in TanStack
Query's `fetchStatus: "paused"` state on first paint in this browser, which
is its offline pause — nothing to do with the view. Seeding the cache through
`queryClient.setQueryData` from the console is the quickest way past it.

**Cutover still not performed**, same hash-routing reason as every prior
step. `index.html` and `js/*` remain untouched.

### Step 16 — Quiz runner + review (2026-07-30)

`/quiz/:quizId` and `/quiz/:quizId/review`, porting `js/router.js`'s
`startQuiz` (:827-945) and `reviewQuiz` (:948-1044) plus the host bubble
markup at index.html:920-926. New files under `webapp/src/views/quiz/`:
`QuizRunner`, `QuizReview`, `QuizHost` and `quizMeta.ts`.

**No AI in this step.** Taking a quiz and reading back an attempt are plain
reads and one insert; generation is the Create pipeline's job (out of scope,
see loose ends) and the chat's `<ADD_QUIZ>` tag, which is step 17. Nothing
here calls the model.

**Both JSON columns are narrowed at the boundary** (`quizMeta.ts`).
`questions_json` is model output and `answers_json` is whatever the runner
wrote at the time; `lib/aiJson.ts` validates questions on the way *in* from
the model, but rows already in the database predate that check. The rule
that matters: a question whose `correctIndex` is out of range is **dropped**,
because the runner grades with `i === correctIndex` and such a question marks
every option — including the right one — wrong, with nothing said anywhere.
A quiz left with no usable questions says so instead of rendering
"Question 1 of 0".

One subtlety worth keeping: `correctIndex` is coerced from a numeric string
(it grades fine once read as a number) but `Number()` is **not** applied
blindly — `Number(null)` and `Number("")` are both `0`, which would silently
declare the first choice correct on a row that never named one. There's a
test for each.

**The runner is state, not string-building.** The vanilla rebuilt
`#quiz-content` per question with `innerHTML` and re-bound a listener per
choice, `esc()`-ing every field on the way in; here the question is state and
JSX escapes by construction, so the re-render/re-bind cycle and every `esc()`
call disappear rather than being translated.

**The attempt is written exactly once**, from an effect keyed on the
transition into "finished" rather than during render, and fire-and-forget:
the student has already finished, so the completion screen never waits on the
network — but a failure is surfaced, because weak-topic tracking silently
stops working otherwise. There's a test asserting exactly one POST and
another asserting the score still shows when the write fails.

**Two accessibility fixes over the vanilla.** The host bubble is a live
region — `role="alert"` for a wrong answer, `"status"` otherwise, matching
how `ToastProvider` already splits the two — so a verdict is announced rather
than only being a colour change. And the vanilla replayed its `pop-in` class
by removing it on a 300ms timer; here the bubble is keyed on its message, so
React remounts it and the animation restarts by definition, with no timer to
leak. Both the pop-in and the wrong-answer shake are dropped under
`prefers-reduced-motion`.

The review screen keeps the vanilla's deliberate call to *not* replay the
in-quiz pop and shake down a list of past answers (style.css:1108-1117) —
colours kept, motion dropped.

**Testing: 47 new tests (617 total).** 22 on `quizMeta` (every rejection
rule, the coercion rules above, id-vs-position answer matching, weak-topic
dedup), 15 on the runner (welcome, per-question feedback and its
Correct!/Incorrect. fallback, the alert-vs-status split, choices locking after
one pick, the last question's button wording, scoring, the recorded payload,
exactly-one-write, the save-failure path, and the three unusable-data
branches), and 14 on the review (verdicts, the three choice tags and the
untagged case, position matching when ids are absent, "Not answered", the
no-attempt state, and the scoped attempt query).

**Browser-verified end to end.** Answered right (green highlight, success
ring on the host avatar, the question's own feedback), then wrong on the last
question (red highlight on the pick, green on the right answer, "Incorrect."),
then through to the completion screen: "1 / 2 correct", "Topics to review:
Genetics". The stubbed session cannot write to Supabase, which incidentally
exercised the save-failure path for real — the score stayed on screen and the
toast appeared. The review screen then showed both questions with
"Your answer · correct", "Correct answer" and "Your answer" on the right
rows. Console clean.

**Cutover still not performed**, same hash-routing reason as every prior
step. `index.html` and `js/*` remain untouched.

### Step 17 — Turbo chat + dashboard command bar (2026-07-30)

Ports `AI.send` (js/ai.js:900-1275), the panel at index.html:2314-2455 with
its `bindAI` wiring (js/main.js:2359-2440), and the command bar at
index.html:2459-2475. New: `context/chat.ts` + `ChatProvider`,
`components/chat/` (`TurboChat`, `ChatMessage`, the CSS module),
`views/dashboard/CommandBar`, `lib/chatPrompt.ts`, `lib/chatActions.ts`,
`lib/markdownToReact.tsx` and `api/aiQuiz.ts`.

**The chat renders React elements, not an HTML string — and that is the
biggest decision in this step.** The vanilla builds each bubble by assigning
`renderMarkdown(...)`'s output to `innerHTML`. Doing the same here means
`dangerouslySetInnerHTML`, and Step 3 established, deliberately, that this
app contains none. The vanilla's version is safe *today* only because it
escapes `& < >` before any other transform — one careless reordering in a
pile of regexes away from being an XSS hole on a surface whose entire input
is untrusted model output. `lib/markdownToReact.tsx` renders the same
markdown subset to elements instead, so escaping is structural: a `<script>`
in a reply is a text node and there is no code path where it could be
anything else. There is a test for exactly that, in the renderer and again
through the real chat.

Two improvements fell out of it: consecutive list items are wrapped in a real
`<ul>`/`<ol>` (the vanilla emitted bare `<li>`s with an inline
`list-style-type` and no list parent — invalid HTML, and a screen reader
announces no list at all), and the inline `style` attribute the vanilla wrote
on every element becomes a CSS module on tokens, which also fixes a
hard-coded dark palette (`#4AE283`, white-alpha backgrounds) that was
low-contrast noise in light mode.

**`widgetToken`/`restoreWidgets` are removed from `lib/actionTags.ts`.**
Step 14 ported them because the vanilla needs an opaque placeholder to sneak
app-built widget markup past its own escaper. Once a widget is a React node
sitting between two text nodes there is no string for it to be smuggled
through, so they were dead code. Their tests went with them; the two
sanitizers that do real work (`fenceUntrusted`, `stripActionTagBlocks`) are
untouched and still tested.

**`lib/chatActions.ts` is the action contract, isolated and I/O-free.** The
vanilla executed every tag and then ran seven `.replace()` passes over the
original string. One pass over the matches produces the same result and,
because handlers are injected, the whole contract — what runs, what asks
first, what a declined action looks like — is testable without rendering a
chat. Three behaviours are worth calling out:

- **One vanilla bug is fixed.** It executed only the *first* occurrence of
  every tag except `ADD_TASK`, but its replace pass then rendered a success
  widget for *every* occurrence — so a reply with two `<START_TIMER>` blocks
  told the student two timers had started when one had. Repeats are marked
  cancelled here, which is what actually happened.
- **`<GRADE_FLASHCARD>` is parsed but not executed.** The vanilla clicked the
  review screen's score buttons; there is no React flashcard review until
  step 18. Parsing it still matters — the tag must never survive into the
  visible reply — and rendering nothing is what the vanilla did when the
  click target was missing.
- **`<NAVIGATE>` maps hash names to paths** and ignores a destination the app
  has no route for, rather than pushing the student onto the not-found page.

**`<SET_THEME>` now does what it says.** The vanilla looked for
`.theme-preset-btn[data-theme="dark"]`, which does not exist — the presets
are named `default`, `lavender`, … — so "switch to dark mode" silently
applied the *default accent* and then reported success. Light/dark/system set
the appearance `mode` here and a preset name sets the accent, and the change
is persisted, because a student asking for dark mode means it to stick.

**The prompt is carried over verbatim** (`lib/chatPrompt.ts`). It is the
thing the action-tag contract is written in — "emit `<ADD_TASK>…`" is what
makes the model produce tags this app executes, and the GROUNDING RULES are
what stop it inventing deadlines a student would act on. Rewording it changes
behaviour for every user with nothing in a diff to show it. The per-route
context is mapped by path instead of hash; a note body still goes through
`fenceUntrusted` before interpolation, because it is student- and
model-authored content the app is about to put inside its own prompt.

**A flashcard reply is listed rather than hijacking the Library.** The
vanilla wrote *unsaved* cards straight into `#flashcards-grid` and switched
tabs, so they vanished on the next refetch; the React Library tab is
data-driven and cannot be written into like that. The detection and its guard
(a conversational reply quoting fewer than three cards is left alone) are
kept exactly, and the cards render in the bubble with a line pointing at
Create for saving them.

**`api/aiQuiz.ts` ports only the topic path** of `generateQuiz` →
`createStudyPackage` → `_generateQuizFrom`, which is all `<ADD_QUIZ>` needs:
the vanilla's own code reduces to `sourceText = "Topic: <topic>"` for a topic
source. The file/link/material sources stay with the unported Create
pipeline. The quiz prompt, like the plan prompt, is verbatim.

**Dragging and the viewport clamp are ported**, including the fix PR #19
shipped: a dragged panel pinned with inline left/top could be stranded
off-screen by a window resize or by leaving fullscreen, taking the only close
button with it.

**Deliberately not ported:** the panel does not register with
`OverlayStackProvider`. Focus-trapping and scroll-locking are right for a
dialog and wrong for a floating assistant the student reads the page around —
and the vanilla's own Escape/backdrop behaviour never applied to it either.
The Notes AI study sidebar also stays out (see Step 13's entry); the Turbo
chat *is* context-aware on `/notes/:materialId`, so it tutors on the open
material, which is most of what the sidebar was for.

**Testing: 74 new tests (691 total).** 16 on the markdown renderer (every
block and inline form, fences kept literal, real list wrappers, and that no
model text can become markup), 23 on the action executor (each tag's happy
path, its declined path, the confirmation copy, the task cap, the repeat
rule, the unclosed-tag case, and the route map), 13 on the prompt builder
(workspace state, grounding rules, every declared tag, note truncation, and
the tag/fence defanging), 24 through the real panel (send, markdown in a
reply, injection, error reporting, history carried forward and *not* carried
forward after a failure, the confirm-then-create flow in both directions,
chips, attachments including the text-file inlining, and flashcard replies)
and 3 on the dashboard's chat entry points.

**Browser-verified.** Typed into the dashboard command bar; the panel opened
with the question, then a reply rendering real bullets, bold, and inline
code, then the "AI Task Creation" confirmation with the vanilla's exact
wording, and on approval the tag became an "✓ Added task: **Read chapter 4
summary**" widget in place — with no raw `<ADD_TASK>` anywhere in the DOM.
Dragging the header repositioned the panel and pinned it; shrinking the
window pulled it back inside the viewport with the close button reachable.
Console clean.

**Cutover still not performed**, same hash-routing reason as every prior
step. `index.html` and `js/*` remain untouched.

### Step 18 — Flashcard Review, SRS flip-card (2026-07-31)

The last view on the ledger. Ports `startReview` (js/router.js:640-792) and
the markup at index.html:1873-1909 into `webapp/src/views/review/`:
`ReviewView` (resolves the deck and its due cards; splits into `ReviewSession`
once there's a real list to run) and `srs.ts` (the SM-2 approximation and the
due-date filter as pure functions, matching the precedent `lib/timer.ts` and
`quiz/quizMeta.ts` already set). `Button` gained a `success` variant for
"Easy" — the same reasoning Step 7 gave for adding `warning`: the vanilla's
exact four grading colours (danger/warning/primary/success) are a settled UX
choice, not a redesign. 27 new tests (718 total): 10 on `srs.ts`, 14 on
`ReviewView`, and 3 replacing/extending `chatActions.test.ts`'s
`GRADE_FLASHCARD` case (below).

**The session snapshots its due-card list on mount and never resyncs it.**
Grading a card invalidates `useFlashcardsByDeck`'s query (`useUpdateFlashcardReview`,
Step 5), which refetches in the background — and that refetch's response is
exactly the due list shrinking by the card just graded. Reading `cards`
straight from the query on every render, the first cut of this step, let a
refetch landing mid-session shrink the array while `index` stayed put, making
`index >= cards.length` true a card early and ending the review before every
due card had been seen. `useState(initialCards)`'s lazy-initializer-by-omission
(the prop is only ever read on mount) fixes it; there's a regression test that
forces the refetch to actually land before asserting the session didn't skip
a card, and reverting the fix to confirm the test catches it was part of
writing it.

**`<GRADE_FLASHCARD>` is wired for real, closing the loose end Step 17 named.**
The manual score buttons and the AI-grading box both funnel into one
`scoreCard(quality)`; `ChatProvider` gained a `registerFlashcardGrader` ref
(analogous to `TimerProvider`'s app-wide state, but page-scoped: the review
session registers itself on mount and unregisters on unmount) so a
`<GRADE_FLASHCARD>` tag executed from *anywhere* — the AI-grading box's own
`send()` call, or in principle the floating Turbo panel — can score whichever
card is on screen. `chatActions.ts`'s case matches the vanilla exactly:
that tag never rendered a confirmation, success or failure, only the *side
effect* (which score button gets clicked) is new; a malformed score, one
outside 1-4, or a repeat, grades nothing, same as "the click target was
missing." The registration re-arms every card change the same way the
vanilla's `bindScore` closures read `cards[currentIndex]` fresh on every click
rather than the card that was current when first bound.

**One vanilla bug found and fixed: the deck was never named.**
`#review-deck-title` (index.html:1877) is static markup nothing in
`js/router.js` ever assigns to — same class of bug Step 11 found for a
subject's workspace title. The screen now shows the real deck title,
sourced the same way `SubjectDetailPage` finds its folder: `useAllDecks()`,
found by id, no new endpoint needed.

**Grading advances immediately; the write is fire-and-forget with a toast on
failure** — the same call Steps 8 and 16 already made for task toggles and
quiz-attempt writes, not the vanilla's blocking `await`. There's a test that
fails the PATCH and asserts the session still advances to completion while an
error toast appears, rather than the review stalling on a flaky connection.

**The flip card is a real `<button>`**, not a `div` with an `onclick` and no
keyboard equivalent — `aria-pressed` carries the flipped state and the label
stays constant ("Flip card to see the answer") rather than describing the
state in prose, the standard toggle-button pattern. Both faces are always in
the DOM (`backface-visibility: hidden` hides whichever one is turned away),
exactly mirroring the vanilla's structure; only the imperative
`container.style.transform` write becomes a derived inline style off
`flipped` state. Card text renders through `white-space: pre-wrap` instead of
the vanilla's `esc(text).replace(/\n/g, '<br/>')` — no `dangerouslySetInnerHTML`
anywhere in this app, per Step 3's decision, and a text node escapes by
construction.

**Browser-verified** (Playwright driving a real Chromium against the dev
server — no project skill for this existed yet, so this session drove it
directly: a stubbed `sb-<ref>-auth-token` in localStorage plus routed REST/
edge-function responses, per the recipe under "Loose ends"). Flip, all four
grade buttons' colours, two-card progression, the completion screen, the
all-caught-up and deck-not-found empty states, and the AI-grading path all
the way through a real `callEdge` request containing the crafted grading
prompt to a `<GRADE_FLASHCARD>` reply actually advancing the session — all
console-clean.

**Cutover still not performed**, same hash-routing reason as every prior
step. `index.html` and `js/*` remain untouched. This is also the last view on
the ledger — every remaining ☐ is the cutover mechanism itself (see the
`vercel.json` loose end), not a view port.

### Post-Step-18 bug-fix pass (2026-07-31)

With every view ported, this pass went back through "Known loose ends" for
real, low-risk fixes rather than starting the (much larger, higher-stakes)
cutover. 6 new tests (724 total):

- **AI-grading timeout** (closing the gap Step 18 itself just opened, same
  day): `handleAiGrade` now recovers with an error toast and re-enables
  manual grading if the model's reply never contains a usable
  `<GRADE_FLASHCARD>` tag, via a ref `scoreCard` clears on success — the
  vanilla had no recovery here at all, so this is a real improvement, not
  just a port.
- **SRS due-cards notification** (`lib/notifications.ts`, closing the Step 12
  loose end): the once-per-day browser `Notification` js/main.js:2241-2256
  described, wired into `TasksCard`'s existing due-count read.
- **Nested `<button>` inside `<a>`** in `SubjectDetailPage`'s not-found state,
  fixed the same way `NotesView` already had it.
- **Material-delete confirmation copy** no longer claims flashcards are
  deleted with a material — `flashcard_decks` has no `material_id`, so a
  deck outlives the material it came from.

---

### Step 19 — Auth wall (2026-07-31)

The gap that made every other step provisional. `api/auth.ts` had shipped
`login` / `signup` / `resetPasswordRequest` back in Step 5 and they were tested,
but no `.tsx` called any of them: `/login` rendered `SignInRequired`, whose only
action was a link back to the vanilla `index.html`. Decision #13 deferred auth
past every view step and never circled back.

Three routes replace what the vanilla did with one card and four stacked forms:
`/login`, `/signup`, `/forgot-password`. Because each is a route, only one form
is ever mounted, and the shared brand header is a prop rather than something
`setAuthHeader` (js/main.js:455-460) has to rewrite on every toggle.

Files: `views/auth/{AuthShell,LoginView,SignupView,ForgotPasswordView,
RedirectIfSignedIn,useAuthStatus}.tsx` + `auth.module.css`. `SignInRequired` and
its test are deleted. `components/PasswordField.tsx` is lifted out of
`SecurityTab` and `lib/passwordStrength.ts` out of `views/settings/` — both were
only in the settings folder because settings was the first step to need them,
and the vanilla had four copies of that markup.

Two deliberate deviations, both commented at their call sites:

- **The signup poll is dropped.** The vanilla re-attempted a silent login every
  20s, fifteen times, so the tab would let itself in once the user confirmed
  elsewhere (js/main.js:601-632). That is fifteen real auth requests against
  Supabase's rate limit per signup, and it existed only because the vanilla had
  no way to hear about a session it did not create. The confirmation link now
  lands on `/verify`, which signs the user in directly.
- **Nothing reloads on success.** The vanilla called `window.location.reload()`
  because the auth wall and the app shared one document. `AuthProvider` is
  already subscribed to `onAuthStateChange`, so the session updating in place is
  enough — which is also what makes the `state.from` return trip work, since a
  reload would lose it.

`RedirectIfSignedIn` finally consumes the `state.from` that `ProtectedRoute` has
recorded since Step 4 (closing that loose end), and refuses to bounce back into
an auth route. The docked mini-timer and chat panel are now gated on a live
session in `App.tsx`: both already self-hid most of the time, but the timer's
"a session is live" is localStorage state that outlives signing out, so a
returning visitor could get a floating timer over the login form.

Accessibility carried over rather than dropped: the status banner is
`role="alert"` for errors and `role="status"` otherwise (the vanilla's
`#auth-status` had no role and was never announced), the date-of-birth hint is
tied to its field with `aria-describedby` instead of only living in a `title`,
and the decorative marketing panel is `aria-hidden`.

Tests: 22 across the three views. Browser-verified at `/app/login` and
`/app/signup` — glass card, marketing panel, strength meter, the 1024px
breakpoint that drops the panel, and every link correctly `/app`-prefixed.

### Step 20 — `/verify`, `/reset-password`, `/terms` (2026-07-31)

Three standalone pages folded into the router.

`verify.html` + `verify.js` were a static page that waited three seconds and did
`window.location.replace("index.html" + window.location.hash)`, handing the
tokens along for *another* page's Supabase client to consume. That hop existed
only because verify.html had no client. `VerifyView` has one:
`detectSessionInUrl` exchanges the tokens on mount, `AuthProvider` hears the
SIGNED_IN, and the redirect is a router navigation with no page load and no
token re-attached to a URL.

`reset-password.html` + `reset-password.js` built their own Supabase client from
a CDN import and re-implemented the theme sync, the popup, the password toggle
and the strength meter. All four are app infrastructure now, so `ResetPasswordView`
is only the flow. It is deliberately *not* wrapped in `RedirectIfSignedIn`: a
recovery link produces a real session, so that guard would bounce the user off
the very screen the link was for.

`terms.html` becomes `/terms`, copy reproduced verbatim, sitting outside
`ProtectedRoute` — the auth screens link to it, and requiring a session to read
the terms you are being asked to accept would be backwards.

`api/auth.ts`'s email redirects now point at `/verify` and `/reset-password`
instead of the `.html` pages, built through `import.meta.env.BASE_URL` so they
survive the path-prefix deploy. **The vanilla's own redirects are unchanged**,
so both apps keep working side by side.

> **Action required outside this repo:** both URLs must be added to the Supabase
> project's redirect allow-list (Authentication → URL Configuration) or Supabase
> silently falls back to the project's Site URL. That is a dashboard setting.

Tests: 13 across the three views, plus route-table coverage for the public routes.

### Step 21 — Production cutover mechanism (2026-07-31)

Step 7 found the original plan unworkable and it stayed unbuilt: no `vercel.json`
existed anywhere in the repo, and `vite.config.ts` set no `base`.

The routing-scheme conflict Step 7 identified is real but does not need solving —
it needs sidestepping. The vanilla app is hash-routed, so a path rewrite can
never intercept `#settings`; but `/app/*` and `/#settings` cannot collide
either, because the vanilla's routes live entirely in a fragment the server never
sees. Mounting the React app on a prefix makes the two schemes disjoint.
**Cutting a route over therefore becomes a redirect the vanilla app issues, not a
rewrite Vercel performs** — that is the correction to Decision #12.

- `webapp/vite.config.ts` — `base: "/app/"`. Asset URLs are prefixed, and
  `import.meta.env.BASE_URL` carries the value to runtime code building absolute
  URLs.
- `webapp/src/App.tsx` — `BrowserRouter basename` from `BASE_URL`, so the route
  table stays written as `/settings`.
- `scripts/build.sh` — assembles `dist/`: vanilla at the root, React under
  `/app`. An explicit copy list, because `outputDirectory: "."` would publish
  `webapp/node_modules` and `webapp/src` too. **Adding a file to the vanilla app
  means adding it here**; the script fails loudly on a missing path rather than
  shipping an incomplete site.
- `vercel.json` — build/output wiring, SPA fallback for `/app/*`, and response
  headers.

The headers close the CSP loose end: the vanilla ships a strict policy as a
`<meta>` tag, but the same tag in `webapp/index.html` would break Vite's HMR, so
it belongs on the response. The policy mirrors the vanilla's Supabase
`connect-src` origins, drops the `cdn.jsdelivr.net` entries the bundled build has
no use for, and keeps `script-src` as plain `'self'` — verified against a real
build whose `index.html` contains no inline script.

> **This is not a route cutover.** No vanilla route is deleted; this only makes
> one possible. It also cannot be verified from a workstation, because it changes
> how the whole site is built and served. **Check a Vercel preview deployment
> before merging**, and confirm the project has no Root Directory override that
> would bypass `vercel.json`.

---

### Cleanup pass over Steps 18-21 (2026-07-31)

Requested explicitly rather than discovered in passing: a full review of
everything from Step 18 through the Steps 19-21 reconciliation for bugs and
cleanup, before treating the migration as settled again. Split into a manual
bug-hunt over the newest, least battle-tested surface (the review flow, the
auth views, the cutover config) and a 4-agent `/simplify` pass (reuse,
simplification, efficiency, altitude) over the same diff. 6 new tests (766
total).

**Two real bugs found and fixed in `ReviewView.tsx`:**

- **The turned-away flashcard face was readable by a screen reader before the
  card was ever flipped.** `backface-visibility: hidden` only hides a face
  *visually* — both faces stay in the accessibility tree regardless, so
  without `aria-hidden` the answer was announced immediately alongside the
  question, defeating the flip entirely for assistive tech. The competing PR
  (#39) had caught this independently; this session's own Step 18 hadn't.
  Both faces now carry `aria-hidden` keyed on `flipped`.
- **The four manual score buttons weren't disabled while an AI grade was in
  flight.** Grading manually mid-request would advance the card and
  re-register the grader for the *next* one, so a late AI reply for the card
  the student had just left would silently score whatever card happened to
  be showing when it arrived. Now disabled for the duration, matching the
  input/Grade button's existing guard.

**From the `/simplify` pass, applied:**

- `AuthShell.tsx`'s `AuthStatus` had its own `"error" | "success" | "info"`
  type, parallel to `components/InlineFeedback.tsx`'s `FeedbackKind` — and
  `"info"` was never actually constructed anywhere (grep confirmed every
  `setStatus` call is `"error"` or `"success"`). `AuthStatusState` is now a
  type alias for `InlineFeedback`'s `FeedbackState`; `AuthStatus` stays its
  own component (a centered banner vs. `InlineFeedback`'s lighter inline
  note — different layout role, same colour semantics), just without a dead
  third variant.
- The same two password checks (length, confirmation match) were re-typed at
  three call sites — `SignupView`, `ResetPasswordView`, and
  `SecurityTab` — with the wording having already drifted between them.
  `lib/passwordStrength.ts` (already the shared home for password-scoring
  logic, per its own header comment) gained `validateNewPassword(password,
  confirm)`, called by all three; the settings tab's message now matches the
  auth views' wording instead of a shorter variant.
- `lib/notifications.ts`'s `notifyDueCardsOncePerDay` had a `now` parameter
  no call site ever passed a non-default value for. Dropped — the pure
  decision half (`shouldNotifyDueCards`) is what's actually tested against a
  fixed instant.
- `RedirectIfSignedIn.tsx`'s `AUTH_PATHS` hand-duplicated the five route
  strings `routes.tsx` already owns, with nothing tying the two lists
  together. Both now import named path constants from a new
  `views/auth/authPaths.ts` — its own module rather than living in
  `routes.tsx` itself, since `routes.tsx` imports `LoginView`, which (via
  `RedirectIfSignedIn`) would otherwise need to import back out of
  `routes.tsx` — a circular import for no reason.

**Found, deliberately not applied:**

- **`ChatProvider`'s `registerFlashcardGrader`** is arguably the wrong
  altitude: a single-purpose ref bolted onto the general-purpose `ChatApi`
  every chat consumer pulls in, when only `ReviewView` registers against it
  and only `GRADE_FLASHCARD` reads it. The generalizable shape would be a
  narrow `FlashcardGraderContext` that `ChatProvider` itself consumes just to
  bridge the tag to the mechanism. Not done here: there is exactly one such
  tag today, extracting it would mean a new provider threaded through
  `App.tsx` and every test file that currently wraps `<ChatProvider>`
  directly (`ReviewView.test.tsx`, `DashboardView.test.tsx`,
  `routes.test.tsx`, `TurboChat.test.tsx`), and generalizing for a
  hypothetical second view-scoped tag that doesn't exist yet is exactly the
  speculative complexity this pass was trying to remove, not add. Worth
  revisiting the day a second tag actually needs the same mechanism.
- **Folding each auth view's `catch (err) { setStatus({kind: "error", ...}) }`
  into `useAuthStatus` itself** (a `runWithStatus(fn)` wrapper) was flagged
  as a smaller, genuine win, but `SignupView`/`ResetPasswordView` both need
  early-return validation *before* the try block starts, which complicates
  the wrapper's control flow for a four-line-per-file saving. Skipped as
  lower value than the fixes above, not as a false positive.

---

### Step 22 — App Shell: Sidebar + Header (2026-07-31)

**The biggest gap the whole migration had, and nobody had noticed it.** Every
step from 1 through 21 ported a *view* — but the vanilla's persistent chrome
around every view (the left nav sidebar with the Learnora brand, Dashboard/
Library/Timer/Task Manager/Plan/Exams/Settings links, the Create button and
the flashcards-due badge; the header with the page title, a time-of-day
greeting, a live clock and the logout button — `index.html:339-445`) had no
React equivalent *at all*. Every migrated view rendered as a bare page. This
was never on the ledger as a loose end because it was never scoped as a step
in the first place — Decision-list sequencing covered views and, eventually,
auth and cutover, but nothing ever owned "the frame around all of it." It
surfaced only once someone actually signed in and looked: a dashboard with
real data and no way to reach anything else without typing a URL.

**Files:** `components/AppShell.tsx` (the layout route — sidebar + header +
`<Outlet />` + the decorative background blobs), `components/Sidebar.tsx` +
`.module.css`, `components/Header.tsx` + `.module.css`, `lib/sectionLabel.ts`
(which route belongs to which nav item — shared by both, not duplicated),
`lib/greeting.ts`, `lib/clock.ts` + `hooks/useLiveClock.ts`. Mounted as its
own pathless layout route nested *inside* `ProtectedRoute` in `routes.tsx`
(`ProtectedRoute` decides "is there a session"; `AppShell` decides "what
wraps the view once there is one") — every protected route now renders
inside it, not just some.

**The header does not render its own `<h1>`.** Every view already renders a
real, correctly-labelled `<h1>` — Dashboard, Tasks, Exams, Timer, Plan,
Settings, Library, and (for a subject/note/quiz/review) the specific item's
own name. Reproducing `#page-title` as a second heading with the same text
would be either a literal duplicate (top-level views) or a second
significant heading fighting the page's real one (item-specific views). The
header shows the same text — a plain, non-heading label — so the visual
layout matches the vanilla without creating a duplicate-`<h1>` accessibility
problem the vanilla's single-document structure never had to deal with.

**Library stays highlighted on pages with no sidebar entry of their own** —
a subject workspace, a note, a quiz, a flashcard review — the same way the
vanilla's title logic left `#page-title` reading "Library" on all of them
(`js/router.js:130-145` folds every `library-*` sub-route to `library`
before matching). `lib/sectionLabel.ts`'s `isLibrarySection` is the one
`pathname.startsWith(...)` list both `Sidebar` (for `.active`/`aria-current`)
and `Header` (for the label) read, rather than two copies drifting apart.
One correctness fix over a first draft: the Library nav item is a plain
`Link` with `aria-current` set explicitly from that same check, not a
`NavLink` — `NavLink`'s own `isActive` only ever compares against
`"/library"` itself, so it would have highlighted the item visually (via the
`className` callback) without marking it `aria-current="page"` for assistive
tech on every one of those deeper pages.

**The mobile collapse is one boolean with a breakpoint-dependent meaning**,
faithfully carried over from `js/main.js:727-738`'s `.sidebar.collapsed`:
on desktop it hides the sidebar (the idle state is visible); on mobile it's
the sidebar's *open* state (the idle state is off-canvas). Same class name,
opposite effect, entirely down to which `@media` rule is in scope — kept
exactly rather than "cleaned up" into two differently-named states, since
the vanilla's version already works and two flags would just be two things
that could disagree with each other. Choosing a nav link (or the Create
button) auto-closes the mobile drawer, matching `js/main.js:732-738`.

**Two vanilla sidebar items deliberately left out:** the "Learnora AI" nav
link — `style.css:4594-4601` hides it with `display: none !important`
("Hide the redundant Turbo AI tab"), so it is dead UI in the shipped app,
not something to port — and the `.sidebar-overlay` mobile backdrop, defined
in CSS but never referenced by any element or script in the vanilla at all.

**Testing:** 26 new tests (792 total) — `lib/greeting.test.ts`,
`lib/clock.test.ts`, `hooks/useLiveClock.test.ts` (the minute-alignment
schedule, using fake timers safely since this hook test involves no
MSW/userEvent — the codebase's usual fake-timer gotcha doesn't apply here),
`lib/sectionLabel.test.ts`, and `components/AppShell.test.tsx` covering every
nav link's href, the active/`aria-current` state (including the Library
edge case), the due-count badge showing and hiding, opening the create modal
from the sidebar, the time-of-day greeting (derived from the real clock, not
mocked — this one *is* a view test, so the usual gotcha applies), the header
label not duplicating the page's `<h1>`, logging out, and the mobile
menu toggle in both directions including auto-close-after-navigate.

**Browser-verified** with Playwright against a stubbed session: desktop
layout with the sidebar present and the correct item highlighted on
Dashboard, Tasks and Library (confirmed via computed `background-color`,
not just a screenshot glance — a first visual read of the screenshots
looked like two items were highlighted at once, which computed styles
proved was a misreading, not a real bug); a 480px viewport with the sidebar
off-canvas by default and the header collapsed into its mobile layout; the
hamburger button opening the drawer. Console clean throughout.

---

### Residual-vanilla audit and fixes (2026-07-31)

Asked explicitly, in the same spirit as the Step 22 discovery: read the
vanilla source directly again, rather than trusting this ledger, to find
anything else with no React equivalent. Two real, previously-untracked
findings closed; two more found and deliberately left alone, documented
below rather than silently dropped. 9 new tests (798 total).

**Closed — the header's quick theme toggle** (`#theme-toggle`,
js/main.js:725 → `UI.toggleTheme`, js/ui.js:698-704). Distinct from the
Settings→Appearance studio a few clicks away: one click, flips light/dark,
persists instantly. `Header.tsx` now has it, reusing `useAppearance()` and
`resolveDark()` from the Step 7/Step 22 appearance engine rather than
building a second one. Deliberately does **not** call the provider's own
`save()` — that persists every appearance field (accent, sidebar style,
custom colours, …), and the vanilla's version only ever touched the two
theme keys directly. Calling the broad `save()` here would silently commit
whatever a student was still auditioning in the Settings studio the moment
they used this unrelated shortcut, breaking the two-tier "audition without
keeping it" contract Step 7 established. `lib/inviteAccess.ts` — see below —
set the precedent for keeping component files fast-refresh-clean by moving
a plain function out; this one didn't need its own module since
`resolveDark`/`THEME_KEY` already live in `lib/appearance.ts`.

**Closed — the pre-launch invite-access gate** (`js/main.js:61-63`): the
single check that runs before anything else in the vanilla, including its
own login form, redirecting to `coming-soon.html` unless
`learnora_invite_access` is set in `localStorage`. This app had no
equivalent *at all* — and unlike the other gaps found this session, this
one wasn't just an omission still waiting for its turn: since Step 21
merged, `vercel.json` already serves this app at `/app/*` in production,
so `/app/signup` was a real, live, working bypass of even that (deliberately
weak, client-side-only) wall. `components/InviteGate.tsx` +
`lib/inviteAccess.ts` port the same check, mounted in `main.tsx` wrapping
`<App />` so it gates every route including `/login` — exactly where the
vanilla's check sat, before its own auth wall. Fails closed (redirects) if
`localStorage` itself throws, same outcome as simply not having the key.
This does not make the gate real security — it never was; a publicly-known
password gating a marketing splash page is not access control — it restores
parity with what the vanilla actually shipped, no more, no less.

**Removed entirely (2026-08-01).** The product is no longer pre-launch, so the
gate stopped being a marketing wall and started being a live bug: the React
dev server has no `/coming-soon.html` to redirect to (it only ever existed in
the vanilla app's static root), so every local `vite` session hard-404'd on
first paint. Deleted on both sides rather than patched — `coming-soon.html`,
`components/InviteGate.tsx`, `lib/inviteAccess.ts` (+ their tests), the
`InviteGate` wrapper in `main.tsx`, the redirect in `js/main.js:61-63`, the
`learnora_invite_access` clears in `js/api.js`'s `logout` and
`AuthProvider.signOut`, and the `coming-soon.html` entry in
`scripts/build.sh`'s `VANILLA_PATHS`. If a pre-launch wall is ever needed
again, it should be a Vercel-level check (env var / edge middleware), not a
client-side redirect racing the app's own boot.

**Found, deliberately not ported — two cosmetic-only drops:**

- **The full-page "Cinematic Boot Sequence" splash** (`#global-loader`,
  `js/ui.js:1259-1272`) forced a ~2s branded splash with a personalized
  greeting on every load. `ProtectedRoute`'s plain skeleton is a reasonable,
  much simpler stand-in for "the session hasn't resolved yet" — reproducing
  an artificial minimum delay and a second greeting surface (this app
  already has one, in `Header`) would be adding UI, not porting a gap.
- **The blocking "AI is thinking…" full-app overlay** (`js/ui.js:435-501`,
  `setAILoading`/`setAIProgress`, used by Plan/Quiz generation) applied
  `inert` to the whole app and showed rotating captions. `PlanView`'s own
  pending-button state and the chat's typing indicator already communicate
  "something is happening" for these same actions; a second, competing
  full-screen lock is a design divergence this session judged reasonable,
  not a broken feature — but nothing currently reproduces the `inert` lock
  specifically, worth a look if a real screen-reader user reports being able
  to interact with the app mid-generation.

---

### Step 23 — i18n port (2026-08-01)

**Decision: hand-rolled hook, not `react-i18next`.** `i18n.js` is a flat
`{ lang: { key: string } }` object, 10 languages, ~61 keys each, no
interpolation, no pluralization, no nesting (`tests/i18n-labels.test.js`
even asserts no key contains HTML). Nothing there justifies a library built
for ICU plurals and lazy namespace loading — a hand-rolled hook is less code,
no new dependency, and matches decision #10's "not a new library" reasoning
for Modals/Toasts.

`lib/i18n.ts` ports the `translations` object verbatim (all 10 languages,
even the 6 the Settings UI doesn't expose — it's just data) plus one pure
`translate(lang, key)` matching `applyTranslations`'s exact fallback
(`js/ui.js:1111,1116`: unknown language → whole English dict; missing key →
that key's English string). `TranslationKey` is derived as
`keyof typeof translations.en`, so a typo'd key is a compile error — a real
check the vanilla's untyped strings never had.

**No new Context.** `uiLanguage` already lived in `SettingsProvider`
(Step 7) and was already persisted — just never read by anything. `hooks/
useTranslation.ts` is a three-line hook: read `settings.uiLanguage` from
`useSettings()`, return a memoized `t(key)` closed over it. One consequence
worth flagging: `setSettings` commits to React state immediately and only
`save()` persists it, so switching the Preferences tab's language `<select>`
re-translates the page live, before "Save Changes" is clicked — stricter
than the vanilla (whose DOM walk only ran on save). A free byproduct of
reading reactive context instead of walking the DOM on an event, not a
redesign.

**Scope: exactly what the vanilla translates, verified against `index.html`
directly rather than against the fear of "~40 components."** A plain grep
for `data-i18n=` in `index.html` turned up every real key site: `Sidebar`,
`Header` (via `sectionLabel`, which now takes `t` as a parameter — it's
shared with `Sidebar`'s active-route check), `DashboardView`'s h1,
`SessionHistoryCard`, `PlanView`'s h1, all of `TimerView`'s pomodoro-panel
labels, `TasksView`'s input placeholder and Add button, `ExamsView`'s
weekday header, and `PreferencesTab`'s AI Personalization + Localization
fields (including the option lists, keyed locally by `value` since
`AI_PERSONA_OPTIONS`/`AI_LENGTH_OPTIONS` are shared data, not per-view text).

Confirmed **not** to translate, because the vanilla doesn't either: toasts,
popups, confirm dialogs, the auth wall, the dashboard's "Ask Learnora AI"
card (`AIActionsCard` — every button there is untranslated in
`index.html:531-573`), the Data & Privacy tab, `FocusCard`'s dashboard preset
buttons (vanilla shows bare "20m"/"45m"/"90m", no `data-i18n`), and the
`<option>` language *names* in both language selects (English/Español/…
render the same regardless of UI language, in both apps). Two keys the
dictionary defines but `index.html` never actually references
(`nav_calendar`, `nav_ai`'s sibling `header_flashcards`/`desc_flashcards`/
`nav_quizzes`/`header_quizzes`/`desc_quizzes`/`desc_plan`) are ported as inert
data and left unwired here too — translating them would be adding scope the
vanilla itself never shipped.

**One found-in-passing fix.** The Save button showed "Save Preferences" in
`index.html`'s raw markup, but `applyTranslations()` runs unconditionally at
boot (`js/main.js`, right after `populateSettingsUI()`) and overwrites it
with `translations.en.btn_save_config` = **"Save Changes"** even when the
language is English — the HTML's "Save Preferences" is dead text nobody
running the vanilla app has actually seen since translations were added.
`PreferencesTab` now shows "Save Changes" to match what the vanilla
actually renders, not its stale source fallback; its tests were updated to
match.

7 new tests (846 total): `lib/i18n.test.ts`, `hooks/useTranslation.test.tsx`,
plus one added to `sectionLabel.test.ts`; `PreferencesTab.test.tsx`'s existing
tests were updated in place (reordered selects, "Save Changes" wording) rather
than adding new ones.

---

### Step 24 — the `createStudyPackage` Create pipeline (2026-07-31)

**The last big hole in the migration is closed.** Since Step 6 the Create
dialog had every control, every validation and every error message the vanilla
had, and a submit button that said "AI-powered generation isn't connected yet".
It now runs for real: a file, a link, pasted text, a saved material or a bare
topic becomes a material row, a notes document, a flashcard deck and a quiz.

**`api/studyPackage.ts`** ports `AI.createStudyPackage` and its primitives
(js/ai.js:472-826) — `generateNotes`, `loadSourceText`, `generateDeck`, the
`fileToPayload` reader, `CREATE_DEFAULTS`, and the entry point that resolves a
source into a material and then derives the requested outputs. Every prompt is
carried over verbatim; they are what the edge function's `mode` instructions
were tuned against. Quiz generation is **not** duplicated here: `aiQuiz.ts`
grew a `generateQuizFrom` that both this pipeline and the chat's `<ADD_QUIZ>`
tag call, with `generateQuizFromTopic` reduced to a four-line wrapper over it.
That is the vanilla's own "THE ONE ENTRY POINT" consolidation, kept.

**Four deliberate differences from the vanilla**, each following a decision
already made on this branch:

1. **Failures are structured, and a late refusal no longer discards a
   successful earlier stage.** The vanilla re-threw on `err.refused`
   (js/ai.js:784, :803), so a run that generated a deck and was then refused a
   quiz reported a flat "Create failed" and dropped the deck reference. The
   result now carries `failures: StageFailure[]` (stage, user-safe message,
   `refused` flag) and keeps everything that was made. A failure message is
   only passed through when this layer raised it on purpose — a raw Postgres
   or storage error is swapped for the stage's own wording rather than shown.
2. **Untrusted text is fenced on the way into a prompt.** The vanilla dropped
   a decoded document straight into the notes prompt (js/ai.js:535), so an
   uploaded file could close the fence and issue its own instructions — or emit
   an action tag. `buildNotesPrompt` fences internally, so no call path can
   forget; material titles reaching the quiz prompt as its `topic` are fenced
   too. Covered by tests in `studyPackage.test.ts`.
3. **The dialog stays open while the run is in flight**, captioned with the
   stage `onProgress` reports, instead of closing immediately onto the blocking
   full-app overlay this branch deliberately didn't port (see "Found,
   deliberately not ported" above). A run that produces nothing therefore
   explains itself in the form the student is still looking at. On success it
   toasts, closes, and lands them on what was made — quiz, then notes written
   *in this run*, then the deck — the vanilla's own precedence
   (js/main.js:402-410), lifted into a pure `studyPackageDestination`.
4. **Half-written flashcards are dropped, not fatal.** `extractFlashcardJSON`
   validates the array and its first element; a reply trailing off into
   `{"front": "…"}` with no back would reject the whole batch insert (both
   columns are NOT NULL) and lose the good cards with it. The deck row is also
   created only once there are cards to put in it — an empty deck is worse than
   no deck, since the library lists it and review serves nothing from it.

**Also touched:** `decksApi.add` takes `folderId: string | null` (a deck built
from a bare topic is filed nowhere, which the Topic source's hidden folder
picker already implied); `hooks/useStudyPackage.ts` owns the cache
invalidation for the five tables one run can write to.

**One structural change, in `App.tsx`: `CreateModalProvider` moved inside
`BrowserRouter`.** The Material panel navigates now, so the dialog has to sit
under a router — the same reason `ChatProvider` already did. `test/render.tsx`
gained `withRouter`/`initialEntries` to match, since the dialog it renders is a
*sibling* of the `ui` a test passes in and so can't be covered by a router
inside that `ui`. Four view tests that brought their own `<MemoryRouter>` and
open the create dialog moved to the harness's router instead; nested routers
are an error, and the app only ever has one.

**Tests:** `api/studyPackage.test.ts` (33) covers each source kind, the
notes-then-derive ordering, partial success, refusals, fencing, progress
captions and the two pure reporting helpers; `MaterialPanel.test.tsx` gained
three covering a real submit end to end, a run that produced nothing, and the
in-flight lock. Suite: **833 passing**.

---

### AI audit pass (2026-07-31)

Asked explicitly to scan every AI surface for bugs and coverage gaps, same
spirit as the residual-vanilla audit above. Read the edge function
(`supabase/functions/learnora-ai/index.ts`) end to end alongside every
client-side AI module — `api/ai.ts`, `api/aiPlan.ts`, `api/aiQuiz.ts`,
`api/studyPackage.ts`, `lib/aiJson.ts`, `lib/actionTags.ts`,
`lib/chatActions.ts`, `lib/chatPrompt.ts`, `context/ChatProvider.tsx`,
`components/chat/*`, `lib/markdownToReact.tsx`, `views/quiz/quizMeta.ts` —
against each other and against `js/ai.js`. One real bug found and fixed, in
both apps; one real coverage gap found and closed.

**Fixed — a safety refusal could be saved to the database as a material's
actual notes, with no error shown anywhere.** `notes` is not a JSON mode
(`supabase/functions/learnora-ai/index.ts`'s `JSON_MODES`), so when the
content screen blocks a request, `safetyRefusalResponse` answers with a plain
`200` and the refusal sentence *as* `text` — deliberately, so a refused
*chat* reply still displays like any other answer. But `generateNotes`
(`api/studyPackage.ts`) read that `text` as data: it trimmed the string and
saved anything over 50 characters as the notes, with nothing checking
whether the reply was a refusal rather than content. A student uploading
something that tripped the screen got a material whose notes read "I can't
help with that topic…", saved silently. `js/ai.js`'s `_generateNotes` has
the identical bug — same shape, same root cause, ported over in Step 14
without anyone (including this session, the first time through) noticing the
implication.

Fixed in both apps by threading the response's `refused` flag through to the
one caller that needs it:
- `api/ai.ts` — `EdgeResult` gained an optional `refused` field, only present
  (and only ever `true`) when the reply is a refusal; omitted otherwise, so
  it doesn't disturb the existing `{text}`-shaped assertions in `ai.test.ts`.
- `api/studyPackage.ts` — `generateNotes` now throws `AiError(text, {refused:
  true})` on that flag, before the length check, which the existing
  stage-failure machinery already reports correctly (a `StageFailure` with
  the real refusal text, and nothing written to `notes`).
- `js/ai.js` — `_callEdgeStream` returns `{text, refused}` instead of
  dropping the flag; `_generateNotes` returns `null` on `data.refused` (the
  same "unusable reply" convention it already used for a too-short one),
  which the existing `errors.push("notes")` path in `createStudyPackage`
  already handles.

Quiz, flashcard and plan generation were never at risk here: all three are
JSON modes, so a refusal for them arrives as a non-2xx response and was
already converted to a thrown, `refused: true` `AiError` — the bug was
specific to the one non-JSON generation mode. Chat itself needed no change:
displaying the refusal sentence as the assistant's reply *is* the correct
behaviour there, which is exactly why the edge function answers `200` for it
in the first place.

New tests: `ai.test.ts` (the 200-refusal shape), `studyPackage.test.ts` (a
refused notes generation saves nothing and reports the refusal verbatim).
Confirmed all 181 vanilla `node --test` cases still pass after the `js/ai.js`
change.

**Closed — `<ADD_QUIZ>` and `<ADD_PLAN>` had no end-to-end test.**
`lib/chatActions.test.ts` covers the tag-parsing logic against a *mocked*
handler; nothing exercised `ChatProvider`'s real `generateQuiz`/`generatePlan`
closures, which fire a second, differently-moded `callEdge` after the chat
turn that emitted the tag — exactly the kind of glue code most likely to
have a wrong invalidation key, a swapped message branch, or a bad navigation
target with nothing to catch it. `TurboChat.test.tsx` gained 9 tests: for
each tag, a full success (generation, toast, navigation), a decline, a safety
refusal's own wording reaching the toast verbatim (distinct from a shape
error's own wording, distinct again from a plain transport failure's generic
fallback — three different branches of the same ternary, each needing its
own case), plus one for `<NAVIGATE>`'s real `navigate()` call.
`<GRADE_FLASHCARD>` needed no new coverage — already end-to-end tested in
`ReviewView.test.tsx` since the post-Step-18 pass.

Suite: **845 passing** (74 files). Vanilla: **181/181** (`node --test
tests/*.test.js`).

---

### Step 26 — First real route cutover: Settings (2026-08-01)

LOCK_IN.md's priority list called this out as the actual point of the whole
migration — Step 21 only built the mechanism, nothing had used it yet. Picked
Settings, per Decision #13 and the "Found during Steps 19-21" note.

`js/router.js`'s `navigate()` gained a `CUTOVER_ROUTES` table (`{ settings:
"/app/settings" }`), checked before any vanilla view-toggling. A cut-over route
does a full `window.location.href` navigation — not a client-side hash
change — since it has to cross from the vanilla's fragment-only routing into
the React app mounted at `/app`. `loadSettingsProfile()` and its call site were
deleted along with it: unreachable once the redirect fires first.

`index.html`'s `<section id="view-settings">` (721 lines) is deleted outright,
per the ledger's own description of a cutover ("delete the vanilla's handler
for it"), not just hidden behind the redirect. `js/main.js`'s `bindSettings()`
and its settings-panel-specific helpers (`showFeedback`, the tab switcher, the
appearance-control listeners) were deliberately left in place rather than
chased down: they're wired with `$(...)?.addEventListener` / iterate empty
NodeLists, so they no-op harmlessly now that the markup is gone, and
`UI.applyAppearance` in particular is shared boot-time theme logic (called
unconditionally at startup, not settings-only) — not safe to remove in the
same pass as a route deletion. Left as a named cleanup item, not silently
dropped.

Verified: vanilla suite still 181/181 (`node --test tests/*.test.js` — no test
referenced the deleted markup or `loadSettingsProfile`). The React side is
unchanged by this step; `/app/settings` already existed from Step 7.

**Not verified from a workstation, same caveat as Step 21:** a real
`#settings` click doing the cross-app redirect needs a Vercel preview
deployment (or `scripts/build.sh` output served locally) — the vanilla and
React dev servers don't share an origin in local dev.

---

### Step 25 — Notes AI study sidebar (2026-08-01)

The last known-scoped view work. Ports the vanilla's `.notes-ai-panel`
(index.html:1084-1155), its wiring in `bindNotesEditor` /
`bindNotesQuickActions` / `bindNotesSuggestions` (js/main.js:2522-2628), and
`AI.sendNotesChat` (js/ai.js:1388-1512).

`views/notes/NotesAiSidebar.tsx` is the panel; `lib/notesChatPrompt.ts` is its
system context, carried over word for word the way `chatPrompt.ts` was.
`NotesEditorPane` now renders a two-column `.splitLayout` — the Quill pane and
the sidebar — instead of a single editor pane.

**It is not the Turbo chat with a different prompt, and that distinction is
the point of the step.** The two system contexts tell the model opposite
things about what it may do: the workspace assistant is handed the action-tag
contract and executes what it emits, while this panel's context says plainly
that it "cannot run app actions" and to point the student at the quick-action
cards instead. That is why the prompt lives in its own module rather than as a
boolean parameter on the existing builder — one flag apart is exactly how the
sidebar would quietly acquire the power to create tasks. Action tags are still
*stripped* from what it displays: a model that emits one anyway must not have
raw markup rendered at the student.

Four decisions worth knowing:

1. **Its own transcript.** The vanilla pushed this panel's turns onto
   `AI.chatHistory` — the *same array* the workspace chat uses — so a question
   asked beside a document silently became context for the floating panel on
   another view, and vice versa. Here the history is local to the mounted
   sidebar and `NotesView` keys it on the material, so switching documents
   starts a fresh conversation about the document actually on screen.
2. **The document is read live, not snapshotted.** `RichTextEditor` gained a
   `getPlainText()` imperative handle (a direct port of `Editor.getPlainText()`,
   js/editor.js:194-197) so the model sees what the student is looking at now,
   unsaved edits included. It is truncated at 5000 chars and `fenceUntrusted`d
   before interpolation, exactly as the vanilla did — a note body is
   model-generated from an uploaded file and freely editable, so it is
   untrusted input going into the app's own prompt.
3. **The quick actions reuse the Create dialog.** `openCreateModal` gained
   `materialId` / `outputs` / `title`, so "Quiz me" and "Flashcards" open the
   one Create dialog scoped to the open document with the matching output
   pre-ticked and the material's folder pre-filled — the vanilla's own
   consolidation (js/main.js:2589-2612), which had replaced a four-field quiz
   modal and an options-free flashcard generation. A caller-supplied heading
   applies only to the panel the dialog opened on; switching panels restores
   that panel's own heading rather than mislabelling it.
4. **The cards are real `<button>`s**, where the vanilla used `role="button"`
   divs that had to hand-wire Enter and Space.

Two deliberate divergences from the vanilla's markup and CSS: the hard-coded
`rgba(255,255,255,0.0x)` surfaces are expressed in the ported tokens (they only
ever looked right on the dark theme, and this view has to survive the light one
— verified in both), and the composer placeholder is shortened to "Ask about
your notes…" because the vanilla's longer string wrapped to a second line a
one-row textarea has no room for and rendered as a clipped half-line.

The vanilla needed `body:has(#view-notes:not(.hidden)) .dashboard-command-bar
{ display: none }` so the fixed command bar didn't cover this panel's input.
No equivalent is needed: the React command bar is rendered by `DashboardView`,
not the app shell, so it doesn't exist on this route.

Verified: 9 new tests in `NotesAiSidebar.test.tsx` (document context, the
fencing, tag stripping, a failed exchange staying out of history, multi-turn
history, suggestion chips, both quick actions, the podcast toast). Suite
**854 passing** (75 files); vanilla **181/181**. Also a real-browser pass —
the first this migration has managed on a view — at desktop and 375px, in
light and dark: the split layout, cards, chips and composer all render, the
Create dialog opens with "Quiz on this document" and Quiz pre-ticked, and
there is no horizontal overflow at mobile. That was done by mounting
`NotesEditorPane` in a throwaway harness with a fake note, since `/app/notes/:id`
sits behind the auth wall and no test account was available; the harness was
deleted after. **Still owed: a pass with a real signed-in session and a live
model call** — the reply path itself is only covered by MSW.

---

## Known loose ends

(carried forward from `REVAMP_PROGRESS.md` where relevant, plus new ones found during
the port)

- ~~**`createStudyPackage` is not ported**~~ Closed by Step 24 (2026-07-31) —
  see its section above. `api/studyPackage.ts` + `hooks/useStudyPackage.ts`,
  wired into `MaterialPanel`'s submit; the Step 6 stub message is gone.
  **Still owed on it: a real-browser pass.** Every stage is covered by MSW
  tests, but nothing here has yet uploaded an actual PDF to Supabase Storage
  and watched a real provider come back — the one part of this step a test
  cannot stand in for.
- **The docked mini-timer can sit on top of a view's bottom-left controls.**
  Seen on the quiz completion and review screens, where "Retake quiz" is
  partly behind it while a timer runs. This is inherited, not new: the
  vanilla's `#mini-timer` is `position: fixed; bottom/left` with `z-index:
  985` (style.css:848-853) and the vanilla quiz screen put its buttons in the
  same place. Worth solving once, app-wide (a bottom-left safe area, or
  docking away from the pointer), rather than per view.
- ~~**The Notes AI study sidebar is still not ported.**~~ Closed by Step 25
  (2026-08-01) — see its section below. `views/notes/NotesAiSidebar.tsx` +
  `lib/notesChatPrompt.ts`, mounted by `NotesEditorPane` in a two-column
  layout.
- ~~**`<GRADE_FLASHCARD>` is parsed but never executed**~~ Closed in Step 18:
  `ChatProvider` gained `registerFlashcardGrader`, and the review screen
  registers whichever card is on screen.
- ~~**AI-grading has no timeout**~~ Closed in a post-Step-18 pass (2026-07-31):
  `handleAiGrade` now checks a ref `scoreCard` clears on success once `send`
  resolves, and shows an error toast + re-enables manual grading if the reply
  never contained a usable tag — strictly better than the vanilla, which had
  no recovery path here at all.
- ~~**A flashcard's `front`/`back` reach the AI-grading prompt unsanitized**~~
  Fixed 2026-07-31: a concurrent independent Step 18 implementation (PR #39,
  `feat/react-step-18-review`) caught this before this session did — card
  text and the student's typed answer are model-generated-or-student-entered
  content interpolated into a prompt the app controls, the same class of
  concern `lib/chatPrompt.ts` already fences note bodies for. Ported just
  this fix (`fenceUntrusted` around all three fields in `AI_GRADE_PROMPT`)
  from that PR rather than merging its full, independently-diverged
  implementation; see the PR for an alternative take on surfacing the
  model's real feedback text (reads `useChat()`'s `messages` directly with a
  tracked start-index) that wasn't pulled in here, since it's a different
  architecture, not a drop-in fix.
- ~~**The AI edge function's CORS allow-list does not include the Vite dev
  server.**~~ Fixed 2026-08-01: `DEFAULT_ALLOWED_ORIGINS` in
  `supabase/functions/learnora-ai/index.ts` now lists `http://localhost:5173`
  and `http://127.0.0.1:5173` alongside the vanilla app's `:3000` (they are
  distinct origins to a browser, and Vite prints whichever the host resolves
  to). **Takes effect only once the function is redeployed** — the running
  deployment still has the old default list, so until then a live model call
  from `npm run dev` is still blocked, and the `ALLOWED_ORIGINS` env var
  remains the no-redeploy workaround. The test suite intercepts the call at
  the network layer (MSW) and was never affected either way.

- **Steps 11, 12 and 13's browser passes are still owed** (see those
  sections) — at the time, no browser driver was available in *those*
  sessions. Step 18 found that Playwright's Chromium (`npx playwright`) is
  actually installed in this environment (`C:\Users\<user>\AppData\Local\
  ms-playwright`) and used it directly (no `chromium-cli`, so a small script
  driving `{ chromium }` from the `playwright` package, per the `run` skill's
  fallback guidance) — see Step 18's own browser-verification recipe below.
  Whoever picks this up next should use the same approach rather than
  re-declaring it impossible: stub `sb-<ref>-auth-token` in `localStorage` via
  `page.addInitScript`, route `**/rest/v1/**` and `**/functions/v1/**` with
  canned JSON via `page.route`, then drive the three still-outstanding views —
  the Library's four tabs, a subject workspace, the dashboard's seven cards,
  and the Quill editor's toolbar/pickers.
- **The Notes AI study sidebar is not ported** (Step 13's scoping decision —
  see that section). `NotesView` is Quill-only until Step 17 builds the chat
  surface for real; nothing to revisit before then.
- ~~**SRS due-cards notification is not ported**~~ Closed in a post-Step-18
  pass (2026-07-31): `lib/notifications.ts` ports `notifyDueCardsOncePerDay`
  (js/main.js:2241-2256) as a pure decision function (`shouldNotifyDueCards`,
  tested) plus the effectful `Notification` call, fired from `TasksCard`'s
  `useEffect` on the same `dueCount` the badge already reads. Permission
  handling still isn't centralized with `TimerProvider`'s own
  `notifyTimerAlerts` path — two independent call sites, same as noted here
  before; worth unifying if a third notification type shows up.
- ~~**"Plan my week" and "Quiz me" are stubs pending Step 14**~~ (Step 12).
  "Plan my week" became real in Step 15. "Quiz me" reaches the same generator
  the Create dialog now does, via the chat's `<ADD_QUIZ>` tag, but it drops a
  half-written prompt into the composer rather than opening a quiz-tuned
  CreateModal the way the vanilla did — deliberate (a quiz on a topic nobody
  named is a downgrade), and left that way in Step 24. Restoring the vanilla's
  version would want `OpenCreateModalOptions` extended with a way to
  pre-select the Topic source and the Quiz output; nothing else blocks it.
- ~~**The material-delete confirmation overstates what goes with it**~~ Fixed
  in a post-Step-18 pass (2026-07-31): the copy no longer names flashcards,
  since `flashcard_decks` has no `material_id` and a deck outlives the
  material it was generated from. Notes and quizzes really are deleted, and
  the wording now says exactly that.
- **A subject's "+ Create" no longer pre-selects the folder's newest
  material.** The vanilla passed `materialId: materials[0]?.id` so the dialog
  could seed "generate a deck/quiz from this material". That flow exists as of
  Step 24 — the dialog's Saved source runs it — but the *pre-selection* still
  isn't passed, and reviving it means reviving a blind `materials[0]` pick,
  which is one of the things the unified pipeline was built to get rid of. The
  folder pre-selection is passed, as before.
- ~~**`SubjectDetailPage`'s two "Back to Library" links nest a `<button>` inside
  an `<a>`.**~~ Closed twice, independently, the same day: the post-Step-18
  pass and Step 21's cleanup each fixed the empty-state action's link the same
  way (`Button`'s `onClick` + `void navigate()`, matching `NotesView`'s
  existing pattern) and reconciling them just kept Step 21's version. Correction
  to the original note either found: only **one** link actually nested —
  the empty-state action. The other "Back to Library" is a plain styled
  `<Link>` with no button inside it and was always valid.
- Vite's react-ts template now ships **oxlint** instead of ESLint (`npm run lint`).
  Kept — it satisfies the lint requirement — but if anyone wants ESLint-specific
  plugins later (e.g. eslint-plugin-react-hooks rules beyond what oxlint covers),
  that's a separate decision.
- ~~**`vercel.json` still not added, and the cutover mechanism needs
  rethinking.**~~ Closed in Step 21. Both blockers are addressed: `base` is set,
  and the hash-routing conflict is sidestepped by the `/app` prefix rather than
  solved. **Still unverified in production** — see the Step 21 note about
  checking a Vercel preview deployment before merge.
- ~~**i18n is not ported**~~ Closed by Step 23 (2026-08-01) — see its section
  below. The feared "~40 components" turned out to be the vanilla's own
  audit talking about worst case, not what `[data-i18n]` actually covers:
  grepping `index.html` for real `data-i18n` usage found only ~9 components'
  worth of surface (sidebar/header, three dashboard/plan headings, the Timer
  view, the Tasks quick-add, the Exams calendar header, and Preferences' AI +
  Localization fields) — everything else in the vanilla (toasts, popups,
  confirms, the auth wall, Data & Privacy, the dashboard's AI-actions card)
  was never translated either, so porting it 1:1 meant leaving it alone, not
  adding new scope.
- ~~**No React sign-in flow exists**, so manual verification of any protected
  route needs a locally stubbed session in `sb-<ref>-auth-token`.~~ Closed in
  Step 19. Manual verification of a protected route is now just signing in at
  `/app/login` with a real account — no stub token, no `window.fetch` patch, no
  client-side remount dance.
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
- ~~**The dashboard's Focus-Session quick-starts are not wired up**~~ Stale —
  struck through 2026-08-01, having been fixed by Step 12 itself without this
  entry being updated. `FocusCard.tsx`, rendered by `DashboardView`, calls
  `startFocusPreset()` → `TimerProvider.startPreset()`. (`LOCK_IN.md` flagged
  the discrepancy; this closes it.)
- **`vite.config.ts` raises `testTimeout` to 20s** (Step 9). Several
  pre-existing tests sit near 600ms on an idle machine and the 5s default was
  failing them under parallel load. It's a ceiling for hangs, not a target; if
  a test ever approaches it, that's a bug worth looking at rather than a
  reason to raise it again.
- The timer's "task" binding logs the task's *text*, not its id — carried over
  from the vanilla, which read `#active-task-select`'s value. Renaming a task
  therefore orphans the attribution on past sessions. Worth switching to the
  id whenever someone touches the study_sessions schema.
- ~~`webapp/public/favicon.svg` is still the Vite template favicon.~~ Closed in
  Step 21's cleanup — it is `learnora.jpg`, the same icon the vanilla uses in
  `terms.html`.
- ~~**CSP for the React app is not set yet.**~~ Closed in Step 21: it is a
  response header in `vercel.json` scoped to `/app/(.*)`, for exactly the
  reason predicted here (a `<meta>` tag would break Vite's HMR). It keeps
  `style-src 'unsafe-inline'` and the vanilla's Supabase `connect-src` origins,
  and — unlike the vanilla's — needs no `cdn.jsdelivr.net`, since the bundle is
  self-contained. Untested in production until someone checks a preview deploy.
- Modal enter animation is CSS; the exit animation is dropped because React
  unmounts on close (the vanilla kept the node and faded `.hidden`). Revisit only
  if the missing fade-out is noticeable in review.
- ~~`ProtectedRoute` records `state.from`, but nothing consumes it yet.~~ Closed
  in Step 19: `RedirectIfSignedIn` consumes it, and refuses to send a user back
  into an auth route.
- ~~Sign-in, sign-up and password reset all still live in the vanilla app.~~
  Closed in Steps 19-20. ~~The invite-access gate is still not ported.~~
  Moot: the gate was removed entirely on 2026-08-01 (product is past
  pre-launch) — see the "Residual-vanilla audit" section above.
- **`npm run format:check` fails on unformatted files — but it is not only the
  CRLF problem.** The original note (Step 5) said all tracked files fail on a
  Windows checkout because `core.autocrlf true` writes CRLF while Prettier
  expects LF. **On an LF (macOS) checkout it still reports 33 files**, so there
  is a genuine backlog underneath the line-ending issue. Step 19-21's own files
  are formatted; the other 26 are pre-existing and were left alone rather than
  buried in an unrelated diff. Worth one dedicated `npm run format` commit, plus
  the repo-wide line-ending decision (`.gitattributes` forcing LF, or Prettier's
  `endOfLine: "auto"`) the original note called for.
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

### Found during Steps 19-21

- **The Supabase redirect allow-list is not updated, and cannot be from here.**
  `/verify` and `/reset-password` (under the `/app` prefix in production) must be
  added in Authentication → URL Configuration. Until then Supabase falls back to
  the Site URL and a confirmation link will not reach the React route. This is
  the single external prerequisite for step 19-20's flows working end to end.
- ~~**No route has actually been cut over.**~~ — closed by Step 26: `#settings`
  now redirects to `/app/settings` and the vanilla view is deleted. Every other
  route (Tasks, Exams, Timer, Library, Dashboard, Notes, Plan, Quiz, Review)
  still belongs to the vanilla app — this closed the mechanism gap, not the
  full cutover.
- **The signup "check your inbox" screen is terminal by design**, and the
  cross-tab case is untested. If a user confirms their email in a different
  browser, the original tab will sit on that screen until they click through to
  `/login`. supabase-js does propagate a session across tabs of the *same*
  browser via storage events, which would move them on automatically, but that
  path has not been exercised and no test covers it.
- **`ResetPasswordView`'s 3-second deadline is a heuristic**, inherited from
  `reset-password.js`. Supabase fires `PASSWORD_RECOVERY` when it exchanges the
  token and fires nothing when the token is missing or expired, so "nothing
  happened for 3s" is the only available signal for a bad link. On a slow
  connection this can show "Link expired" to someone whose link was fine.
  Reading the URL's `error` / `error_description` hash params directly would be
  the deterministic fix.
- **The `base: "/app/"` change does not affect the edge function's CORS
  allow-list.** Worth stating explicitly so nobody re-derives it: a path prefix
  is not part of an origin, so the origin to allow is still
  `http://localhost:5173`, exactly as the existing CORS loose end says. In
  production the origin is likewise unchanged.
- **`webapp/src/assets/learnora.jpg` and `webapp/public/learnora.jpg` are copies
  of the root `learnora.jpg`.** Three copies of one image: the bundled import
  (so Vite rewrites its URL under `base`), the public copy (for the favicon,
  which cannot be a bundled import), and the vanilla's original. Harmless at
  62KB but worth collapsing if the vanilla app is ever retired.

---

## Complete Migration — Full Gap Ledger (2026-07-31, closed 2026-07-31)

Everything above the "Known loose ends" section tracks the 18 view-porting steps.
This section started as a wider, workspace-wide scan for what a genuinely *complete*
migration still needed beyond view parity. **Items 1-3 below are now closed** — an
independent pass (Steps 19-21, reconciled into this branch the same day) built exactly
these, before this list had a chance to go stale. Kept here as the record of what was
found and why it mattered, not as an open punch list anymore.

### 1. ~~No React login/signup/password-reset UI exists~~ — closed by Step 19

`webapp/src/api/auth.ts` had fully-ported `signInWithPassword`, `signUp`, and
`resetPasswordForEmail` since Step 5 — the logic layer was real and tested, but zero
non-test `.tsx` files called any of it, and `SignInRequired.tsx`'s only action was a
link back to the *vanilla* `index.html`'s login form. Step 19 built the real
`/login`, `/signup`, `/forgot-password` routes against that existing API layer — see
its own ledger entry above for what shipped.

### 2. ~~Two more auth-adjacent pages have no React route~~ — closed by Step 20

`verify.html`/`verify.js` and `reset-password.html`/`reset-password.js` (the latter
had its own inline Supabase client and its own duplicated theme-sync logic) are now
`/verify` and `/reset-password` routes. See Step 20's ledger entry.

### 3. ~~The cutover mechanism was unbuilt~~ — closed by Step 21

Step 7 documented *why* the original plan (Vercel path-prefix rewrites intercepting
vanilla hash routes) couldn't work as specified. Step 21 didn't solve that conflict —
it sidestepped it: the vanilla's routes live entirely in a URL fragment the server
never sees, so a `/app` prefix makes the two schemes disjoint instead of colliding.
`vercel.json`, Vite's `base`, and a CSP scoped to `/app/(.*)` all landed together. See
Step 21's ledger entry, and note its two open items that need a human (the Supabase
redirect allow-list, and a Vercel preview-deploy check) — neither can be done from a
workstation.

### 4. Standalone pages — both closed

- ~~`terms.html`~~ — now `/terms`, closed by Step 20.
- ~~`i18n.js` (root, ~21KB) is still not ported~~ — closed by Step 23
  (2026-08-01), `lib/i18n.ts`. This entry described it as needing a
  library-vs-hand-rolled decision first; that decision was made and the port
  landed. Struck through 2026-08-01, having been left stale.

### 5. Everything else

See "Known loose ends" above for what's still genuinely open: no `DatePicker`
primitive, mini-timer can overlap bottom-left controls, timer logs task by text
not id, `format:check` failing repo-wide (a CRLF-checkout artifact, confirmed
larger than first thought — an LF checkout still reports 33 files, per Step 21's
own note), no Tasks pagination, and Steps 11-13's real-browser verification
passes still owed. The Notes AI study sidebar was on this list until Step 25
closed it (2026-08-01).

---

## How to resume

```bash
git checkout react-migration
cd webapp && npm install && npm run test    # expect 845/845 passing
npm run dev                                  # http://localhost:5173/app/ — note the /app prefix
```

The dev server now serves under `/app/` because `vite.config.ts` sets
`base: "/app/"` (Step 21). `http://localhost:5173/` will 404; the app is at
`http://localhost:5173/app/`. Sign in for real at `/app/login` — the stubbed-token
dance earlier steps needed is gone. Every view now renders inside the sidebar +
header shell (Step 22) — if you're only used to the bare view-per-page look
from before that step, expect navigation to look different (and much more
usable).

1. Find the first ☐ in the ledger. Every view-porting step (1-18), the
   auth/cutover work (19-21), the app shell (22) and the Create pipeline (24)
   are done as of 2026-07-31. That is **step 23, the i18n port** — read its
   loose-end entry first, since it needs a library-vs-hand-rolled decision
   before any code. After that: **step 25, the Notes AI study sidebar** (the
   last unported vanilla feature), and the still-owed real-browser passes for
   Steps 11-13 and for Step 24's upload path. Read "Known loose ends" in full
   before picking a next task.
2. If its section is not yet written below, read the corresponding entry in `.claude/plans/dapper-snacking-bumblebee.md` or the plan's Section 4.
3. Implement, verify (see Definition of Done below), commit, tick the box, **stop**.

**Before any of that, if the Steps 19-21 PR has not merged:** it carries two
things that need a human. The Supabase redirect allow-list needs `/verify` and
`/reset-password` added (a dashboard setting), and `vercel.json` changes how the
whole site builds and deploys, so it wants a preview deployment checked. Neither
can be done from a workstation.

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
