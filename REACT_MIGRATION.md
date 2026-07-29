# Learnora React Migration — Progress & Remaining Work

**Living document.** Update the ledger as steps complete. Written so a different machine,
session, or agent can resume without any conversation history.

- **New app root:** `webapp/` (separate npm package, side-by-side with the vanilla app)
- **Branch:** `react-migration` (to be created on first implementation session)
- **Tests:** `npm --prefix webapp run test` — expect 95/95 passing
- **Last verified:** 2026-07-29 (Step 5 — tests green, `npm run build` green, `npm run lint` clean)

---

## Ledger

| # | Step | Phase | Status |
|---|------|-------|--------|
| 1 | Scaffold `webapp/` (Vite+React+TS, lint/format, empty routes) | Foundation | ✅ |
| 2 | Port design tokens (`tokens.css`, `themes.css`) | Foundation | ✅ |
| 3 | Shared primitives: Modal, ConfirmDialog, Toast, Icon, Button, EmptyState, Skeleton | Foundation | ✅ |
| 4 | Supabase client + AuthContext + protected-route shell | Foundation | ✅ |
| 5 | API layer + TanStack Query hooks (all 11 entities, thin scaffold) | Foundation | ✅ |
| 6 | Universal CreateModal (Material/Subject/Exam/Task panels) | Foundation | ☐ |
| 7 | Settings (first cutover — lowest external dependency, all 6 tabs) | Views | ☐ |
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

---

## Known loose ends

(carried forward from `REVAMP_PROGRESS.md` where relevant, plus new ones found during
the port)

- Vite's react-ts template now ships **oxlint** instead of ESLint (`npm run lint`).
  Kept — it satisfies the lint requirement — but if anyone wants ESLint-specific
  plugins later (e.g. eslint-plugin-react-hooks rules beyond what oxlint covers),
  that's a separate decision.
- `vercel.json` SPA-fallback + first path-prefix rewrite intentionally deferred to
  Step 7 (first cutover) — nothing to route to `webapp/dist` until then.
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
