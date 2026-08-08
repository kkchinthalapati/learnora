# Shell batch — 3 files (AppShell, Sidebar, Header)

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/components/AppShell.tsx`, `Sidebar.tsx`, `Header.tsx`
Note: comments in these files reference a 1:1 port from the prior vanilla-JS app
(index.html/js/main.js/js/ui.js/js/router.js) — some structure may exist for parity reasons
rather than deliberate design intent; worth distinguishing during audit.
**This note turned out to be the most productive lead in the whole audit — see Issues.**

## AppShell (components/AppShell.tsx)

- Route: layout route wrapping every signed-in route (`routes.tsx:66-81`), nested inside
  `ProtectedRoute`.
- Related files: `AppShell.module.css` (30 lines), `Sidebar.tsx` + `Sidebar.module.css` (174),
  `Header.tsx` + `Header.module.css` (105)
- Header: renders `<Header>`, which shows `sectionLabel(pathname, t)` as `.title` and a greeting
  as `.subtitle`. `Header.tsx:16-24` carries a long comment explaining that `#page-title` is
  deliberately a `<p>`, not an `<h1>`, because "every view in this app already renders its own
  real `<h1>` (the exact same text this header would show…)". The reasoning about heading
  semantics is sound; the visual consequence it creates was never revisited. See Issues.
- Card usage: **2 glass-shell declarations in `Header.module.css`, both Recipe B**:
  - `.iconBtn, .menuToggle` (`:36-60`) — 42px square, `--r-md`, glass bg/border,
    `--glass-inner` + `--shadow-sm`, accent hover escalating to `--shadow-md`.
    **This is the canonical version of the 42px glass icon button that `exams.module.css:55-72`,
    `library.module.css:279-287` and `dashboard.module.css:433-447` each re-declare.** Four
    copies app-wide.
  - `.clock` (`:74-87`) — the same glass recipe as a text pill.
  - `Sidebar.module.css:12-27` — the sidebar's own glass surface with a bespoke
    `1px 0 0 var(--glass-border)` right-edge shadow.
  - Card primitive confidence: **N/A for the shell surfaces** (they are chrome, not content
    cards) but **HIGH for extracting the icon button** — see design move #7.
- Spacing: only 5 hardcoded px across all three modules (`AppShell` 1, `Header` 2, `Sidebar` 3)
  — the cleanest area of the codebase. `Header.module.css` uses `clamp(20px, 2.5vw, 32px)` and
  `clamp(22px, 3vw, 30px)` fluid values, and `padding: 9px 16px` on `.clock` (9px off-scale).
- Accent usage: `Header` 3, `Sidebar` 10. Sidebar's are the nav-active state, the create button
  and the due-count badge — all functional, none decorative.
- Distinctive/preserve:
  - **The `collapsed` boolean has two opposite meanings by breakpoint** — on desktop it hides
    the sidebar, on mobile it is the *open* flag (`Sidebar.module.css:31-56`, explained in both
    `AppShell.tsx:14-19` and the CSS). Faithful to the vanilla and load-bearing for the mobile
    menu. **Do not "clean this up" into two booleans without also updating
    `AppShell.test.tsx`**, which asserts on the class directly (see Test file).
  - The `liquid-blobs` decorative background uses **plain global class names, not CSS-module
    ones**, because `index.css` disables them via a `data-bg-texture` body-attribute selector
    that cannot target a hashed class (`AppShell.tsx:29-33`). Preserve the global naming.
- Accessibility: sidebar is `role="navigation"` with an accessible name ("Main navigation");
  every header control has both `aria-label` and `title`. Mobile menu auto-closes after
  navigation (`closeOnMobile`, asserted in the test). Good — apart from the landmark issue below.
- Responsive: `AppShell` 768px, `Header` 768px, `Sidebar` 768px + a `min-width: 769px` desktop
  counterpart. **Fully coordinated on one breakpoint** — the model the view batches (which use
  860/900/1024) should be measured against.
- Test file: `AppShell.test.tsx`. **The only test in the app that matches a literal class name:**
  `:237/242/247/264/267` use `expect(sidebar.className).toMatch(/collapsed/)`, with an in-file
  comment (`:229-232`) explaining it checks by substring because CSS Modules hash the name to
  `_collapsed_xxxxx`. **Hard constraint: the sidebar's collapsed-state class must keep the
  substring `collapsed` in its name.** This is the one place in the app where a class *rename*
  (not just a swap) breaks tests.
- Design-move tags: [card-primitive: N/A — chrome] [pageheader-primitive: HIGH — see Issues]
  [spacing-scale: LOW] [accent-restraint: LOW] [header-actions: HIGH]
  [empty-loading-polish: N/A] [icon-button-primitive: HIGH]
- Issues found (severity):
  - **HIGH — nested `<main>` landmarks on every signed-in route.** `AppShell.tsx:42` renders
    `<main className={styles.mainContent}>` containing `<Outlet />`, and **every** view inside
    it renders its own `<main className={styles.view}>` — `DashboardView.tsx:23`,
    `TasksView.tsx:56`, `ExamsView.tsx:115`, `TimerView.tsx:149`, `PlanView.tsx:195`,
    `SettingsView.tsx:77`, `LibraryView.tsx:74`, `SubjectDetailPage.tsx:87/95/119`,
    `NotesView.tsx:28/36/47`, `NotesEditorPane.tsx:141`, `QuizRunner.tsx` (×6),
    `QuizReview.tsx` (×5), `ReviewView.tsx` (×6). A document must have one `main` landmark;
    nesting them is invalid HTML and breaks landmark navigation for screen-reader users, who
    get two overlapping "main" regions on every page. This is a pure port artefact: the views
    were built before the shell existed (the ledger's step 12 ordering), each correctly claimed
    `<main>` at the time, and nothing revisited it when `AppShell` landed. **Fix: the shell keeps
    `<main>`, the views become `<div>`/`<section>`.** Cheap and mechanical, but it touches ~30
    call sites across 10 batches, so it belongs in Phase 7's consistency pass rather than being
    smuggled into a card swap.
  - **HIGH — the section label is rendered twice on six routes.** `Header.tsx:66` renders
    `sectionLabel(pathname, t)`, and Dashboard/Tasks/Exams/Timer/Settings each render an `<h1>`
    with the same string immediately below it. For `/` the strings are literally identical in
    every locale (`i18n.ts:11` `nav_dashboard: "Dashboard"` vs `:20` `title_dashboard:
    "Dashboard"`; `es` `Tablero`/`Tablero`; `fr` `Tableau`/`Tableau`). A user sees "Dashboard"
    stacked over "Dashboard", ~20px apart. **This directly challenges DESIGN_MOVES hypothesis
    #2:** building a `PageHeader` primitive would systematise a duplication rather than remove
    it. The Phase 3 decision should be *whether the per-view h1 should exist at all* — e.g.
    promote the shell header's label to the `<h1>` and drop the five per-view copies, keeping
    per-view headers only where they say something the shell cannot (Library's subtitle +
    actions, Review's deck title, Notes' document title). Recorded as a blocker on #2, not a
    unilateral change — this is a design decision for the owner.
  - **LOW — `padding: 9px 16px`** on `.clock` (`Header.module.css:82`) is off-scale.
- Redesign status: TODO
