# Shared components batch — 29 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/components/` (excluding chat/, which is its own batch)
Known primitives already in place: Button.tsx, Modal.tsx, EmptyState.tsx, Skeleton.tsx,
InlineFeedback.tsx, ToggleSwitch.tsx, PasswordField.tsx, RichTextEditor.tsx, Icon.tsx/icons.tsx,
components/create/ (CreateModal + 4 panel forms, 711 lines — do not touch internals unless
audit specifically flags card-shell duplication inside them).

## Shared primitives (components/)

- Route: not routed — used across every batch.
- Related files: 10 primitive components + 10 module CSS files + `components/create/` (7 files)
  + `icons.tsx` (319 lines, the icon registry)
- Header: N/A — no component in this batch renders a page header. **This is itself a finding:
  there is no `PageHeader` today, which is why five views hand-roll the same 10-line rule.**
- Card usage: **no shared card primitive exists**, which is the entire premise of the redesign.
  What *does* exist and is relevant:
  - `Button.module.css:61-73` — `.secondary` is glass bg/border + `--glass-inner` +
    `--shadow-sm`, hover-escalating to `--shadow-md`. **The same escalation pattern Library's
    `.card`, Settings' `.card` and Header's `.iconBtn` each implement independently, at three
    different target shadows** (`--shadow-lg`, `--shadow-md`, `--shadow-md`). If elevation-on-
    hover becomes part of the Card primitive, it should reuse Button's scale, not invent a
    fourth.
  - `Modal.module.css:31` — `--glass-inner` + `--shadow-lg`, the floating-surface tier
    (shared with `MiniTimer.module.css:21` and, conceptually, `commandBar` and `chat/.panel`).
  - `create/formShared.module.css:40` — `--glass-inner` + `--glass-inner-bottom`, no outer
    shadow. `create/SubjectPanel.module.css:12` — bare `--glass-inner`.
  - **`create/MaterialPanel.module.css` has 2 glass shells and 12 accent references in a single
    form panel** — the densest non-view module. The ledger's "do not touch `create/` internals
    unless audit flags card-shell duplication" condition **is met**: `MaterialPanel` re-declares
    a card shell rather than composing one. Recording the trigger; the decision to act on it is
    Phase 3's.
- Spacing: 13 hardcoded px across the batch (`PasswordField` 5, `create/MaterialPanel` 3,
  `Sidebar` 3 — counted in shell.md — `RichTextEditor` 2, `Button` 2, `Modal` 1, `AppShell` 1,
  `create/formShared` 2). Plus `lib/markdown.module.css` with **14**, the third-worst module in
  the app and easy to overlook because it sits in `lib/`, not `components/`.
- Accent usage: `Button` 10, `create/MaterialPanel` 12, `create/formShared` 5, `RichTextEditor`
  3, `ToggleSwitch` 2, `PasswordField` 2, `create/SubjectPanel` 2. All functional (state,
  focus, primary action), none decorative.
- Distinctive/preserve:
  - **`Button.module.css` is the app's de-facto colour contract** — `.primary` is an accent
    gradient with `--accent-on` text and `--accent-on-shadow`; `.danger`/`.warning`/`.success`
    each carry `inset 0 1px 0 rgba(255,255,255,0.1)`. These semantic fills were the subject of
    two recent fixes on `main` ("Fix hardcoded white labels on success/warning/danger fills",
    "Make the accent ramps readable in both modes"). **Do not re-touch these without re-running
    `styles/contrast.test.ts`.**
  - `components/create/` (711 lines in `MaterialPanel.tsx` alone) is on the ledger's
    do-not-touch list except for the card-shell condition noted above.
  - `ToggleSwitch.module.css:33` `background: #fff` — the switch knob. A fixed white knob on a
    coloured track is the conventional treatment and reads in both themes; leaving as-is.
- Accessibility:
  - `Icon` is `aria-hidden="true"` unless given a label, and `primitives.test.tsx:26-31` asserts
    exactly that. Good default.
  - `primitives.test.tsx:11-24` renders **every** icon in the registry and asserts each draws
    child nodes — a genuinely useful guard against registry typos.
  - `Skeleton.module.css` and `InlineFeedback.module.css` both carry
    `prefers-reduced-motion` queries.
  - 5 `:focus-visible` rules across the batch (`ToggleSwitch`, `create/formShared`,
    `create/SubjectPanel`, `create/MaterialPanel`, + Sidebar). `Button` has **none** — it relies
    on the global `:where(a, button, …):focus-visible` ring from `index.css:90-100`, which is
    the documented and correct arrangement (the comment there says the shared Button was one of
    the things that used to fall through to the invisible UA ring).
- Responsive: `Modal`, `Skeleton`, `InlineFeedback`, `Button` carry only `prefers-reduced-motion`.
  `create/MaterialPanel.module.css` has `@media (max-width: 520px)` — **the only 520px breakpoint
  in the app**, bringing the app-wide total to five uncoordinated values (520/768/860/900/1024).
- Test file: `primitives.test.tsx` (Button, EmptyState, Icon, Skeleton), `Modal.test.tsx`,
  `RichTextEditor.test.tsx`, `ProtectedRoute.test.tsx`, `AppShell.test.tsx` (see shell.md),
  `create/CreateModal.test.tsx`, `create/MaterialPanel.test.tsx`.
  - **`create/MaterialPanel.test.tsx:80` uses `.closest("label")`** — structure-sensitive.
    Form controls must stay wrapped in `<label>`.
  - `context/ToastProvider.test.tsx:42` uses `.closest("[role]")` — attribute-based, safe.
  - No `.className` assertions in this batch, no snapshots.
- Design-move tags: [card-primitive: HIGH — absent, and `create/MaterialPanel` re-declares one]
  [pageheader-primitive: HIGH — absent] [spacing-scale: MEDIUM] [accent-restraint: LOW]
  [header-actions: N/A] [empty-loading-polish: MEDIUM] [icon-button-primitive: HIGH]
- Issues found (severity):
  - **MEDIUM — five uncoordinated breakpoints app-wide**: 520 (`create/MaterialPanel`),
    768 (shell, Header, Sidebar, settings, timer, commandBar, MiniTimer), 860 (dashboard),
    900 (notes, plan), 1024 (timer, auth). The shell trio is coordinated on 768; the view
    batches are not. Proposed as a **new** design move — see DESIGN_MOVES.md #8.
  - **MEDIUM — `lib/markdown.module.css` has 14 hardcoded px** and is not owned by any of the
    15 batch rows. It renders AI-generated markdown, so it is user-visible on every AI surface.
    **Batch-coverage gap** — flagged in REDESIGN_LEDGER.md.
  - **LOW — hover-elevation is implemented four times at three different target shadows**
    (`Button.secondary` → md, `Header.iconBtn` → md, `settings.card` → md, `library.card` → lg).
- Redesign status: TODO
