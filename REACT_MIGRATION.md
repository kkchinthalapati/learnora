# Learnora React Migration — Progress & Remaining Work

**Living document.** Update the ledger as steps complete. Written so a different machine,
session, or agent can resume without any conversation history.

- **New app root:** `webapp/` (separate npm package, side-by-side with the vanilla app)
- **Branch:** `react-migration` (to be created on first implementation session)
- **Tests:** `npm --prefix webapp run test` — expect 14/14 passing
- **Last verified:** 2026-07-29 (Step 1 — tests green, `npm run build` green, dev server click-through)

---

## Ledger

| # | Step | Phase | Status |
|---|------|-------|--------|
| 1 | Scaffold `webapp/` (Vite+React+TS, lint/format, empty routes) | Foundation | ✅ |
| 2 | Port design tokens (`tokens.css`, `themes.css`) | Foundation | ☐ |
| 3 | Shared primitives: Modal, ConfirmDialog, Toast, Icon, Button, EmptyState, Skeleton | Foundation | ☐ |
| 4 | Supabase client + AuthContext + protected-route shell | Foundation | ☐ |
| 5 | API layer + TanStack Query hooks (all 11 entities, thin scaffold) | Foundation | ☐ |
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

**Deviation from Decision #4 (deliberate):** installed `react-router@8.3.0` and
import from `"react-router"` instead of `react-router-dom@7.x` — the entire
`react-router-dom` 7.12+ line sits in the vulnerable range of GHSA-qwww-vcr4-c8h2
(`npm audit` high), v8.3.0 is the patched release, and since v7 `react-router-dom`
is only a re-export shim anyway. Same library, same `BrowserRouter` API, browser
router not hash — the substance of the decision is unchanged. `npm audit`: 0
vulnerabilities.

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
