# Learnora React Migration — Progress & Remaining Work

**Living document.** Update the ledger as steps complete. Written so a different machine,
session, or agent can resume without any conversation history.

- **New app root:** `webapp/` (separate npm package, side-by-side with the vanilla app)
- **Branch:** `react-migration` (to be created on first implementation session)
- **Tests:** `npm --prefix webapp run test` — expect 231/231 passing
- **Last verified:** 2026-07-29 (Step 7 — tests green, `npm run build` green, `npm run lint` clean, browser-verified)

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
| 8 | Tasks (+ dashboard quick-add widget) | Views | ☐ |
| 9 | Exams (calendar + ExamModal + DayDetailModal) | Views | ☐ |
| 10 | Timer | Views | ☐ |
| 11 | Library shell (4 tabs) + Subject detail page | Views | ☐ |
| 12 | Dashboard (aggregates Tasks/Exams/Timer/Library data) | Views | ☐ |
| 13 | Notes editor (Quill wrapper) | Views | ☐ |
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

---

## Known loose ends

(carried forward from `REVAMP_PROGRESS.md` where relevant, plus new ones found during
the port)

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
  replacing with a real login the moment auth is cut over.
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
- **No real entry point calls `useCreateModal()` yet.** Step 6 built the
  provider, the modal, and all four panels, but every route is still a
  placeholder (no sidebar, no dashboard, no per-view "+" button) — the first
  view step to build real navigation should call `openCreateModal()` from
  wherever the vanilla app's "+ Create" affordances lived (`js/main.js:116-119`).
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
