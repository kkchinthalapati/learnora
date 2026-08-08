# Library batch — 6 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/library/`
Note: uses a toolbar pattern instead of PageHeader (split-pane view) — deliberate, not a gap.
**Partly corrected by this audit** — Library is not a split-pane view and does not use a
toolbar; it uses a *header-with-actions* variant. See Header below.

## LibraryView (views/library/LibraryView.tsx)

- Route: `/library`, `/library/:tab`
- Related files: `library.module.css` (~430 lines, largest view module), `FoldersPanel.tsx`,
  `MaterialsPanel.tsx`, `FlashcardsPanel.tsx`, `QuizzesPanel.tsx`, `SubjectDetailPage.tsx`,
  `libraryMeta.ts`, `useLibraryActions.ts`
- Header: **`.header`, not `.pageHeader`** (`library.module.css:23-44`, used at
  `LibraryView.tsx:78-84`). It is `display: flex; justify-content: space-between;
  align-items: center; flex-wrap: wrap` with an `h1`, a `.headerSub` description line, and a
  right-hand action slot. **This is exactly the `PageHeader` shape DESIGN_MOVES.md hypothesis
  #5 proposes building** (title + optional eyebrow/sub + right-aligned actions) — Library has
  already invented it independently. This is the strongest single piece of evidence for the
  `actions` slot, and it means the PageHeader primitive must support a subtitle too, which the
  PRIMITIVES.md contract currently does not (it has `eyebrow`, not `sub`).
  - The stub note calling this a "toolbar pattern (split-pane view)" is inaccurate: Library is
    a tabbed single-column view, and `SubjectDetailPage` is a separate route. The genuine
    toolbar-instead-of-header case is Notes only.
- Card usage: **6 glass-shell declarations — the most of any batch**, spanning three recipes:
  - `.card` (`:117-128`) — Recipe A (`--r-xl`, inner + inner-bottom + `--shadow-md`),
    `padding: clamp(24px, 3vw, 32px)`, with a `box-shadow`/`transform` hover transition
  - `.card:hover` (`:147`) — escalates to `--shadow-lg` (the only `--shadow-lg` hover in a view)
  - `:410` — a second Recipe A shell
  - `.iconBtn` (`:279-287`) — Recipe B, `--r-md`, glass + `--shadow-sm`. **Third near-copy of
    the same 42px glass icon button** already seen in `exams.module.css:55-72` (`.iconBtn`) and
    `dashboard.module.css:433-447` (`.dismissBtn`).
  - `:356` and `:390` — two more Recipe B shells (`--r-xl`/`--shadow-sm`, and a
    hardcoded-`blur(12px)` surface at `:386-388`)
  - Card primitive confidence: **HIGH**, and this batch is the main evidence that a `hover`
    elevation behaviour belongs in the primitive rather than being re-declared per view.
- Spacing: **14 hardcoded px**, distinct values `4 6 8 9 12 16 20 24 28 32`. Off-scale: `6px`
  (`:347`), `9px` (`:59`, `:198`/`:219` `6px 12px`), `28px` (inside a `clamp`). Mostly on-scale
  values written as literals — a low-risk token swap.
- Accent usage: **25 references — tied for the heaviest in the app** with settings. Tab strip
  active state, `.cardLink:focus-visible`, hover borders, meta pills, panel affordances. Given
  the tab strip is persistent chrome, this is the best batch in which to judge whether accent
  density reads as tasteful across all 13 presets (DESIGN_MOVES hypothesis #4).
- Distinctive/preserve:
  - **Hover-reveal card actions** — the PRIMITIVES contract names this as a source of Card
    variance. Confirmed present, and guarded by `@media (hover: none)` (`:269`), which is the
    **only hover-capability query in the app**. Preserve that guard through any refactor; it is
    what keeps the actions reachable on touch.
  - Six `:focus-visible` rules (`.tab`, `.panel`, `.cardLink`, `.iconBtn`, `.newCardBtn`, +1) —
    tied with settings for the most explicit focus handling in the app. Good baseline; do not
    regress it by deleting per-element rules in favour of the global ring, because several of
    these draw an *inset* ring for elements that are clipped by an `overflow: hidden` parent.
- Accessibility: strong. `.panel:focus-visible` implies the tab panels are focusable
  (`tabindex`), consistent with the ARIA tabs pattern. `.cardLink` uses a stretched-link
  overlay (`:151` comment: "to cover the card's padding box to keep the same click target") —
  verify in Phase 4 that the overlay does not swallow the hover-reveal action buttons' hit area.
- Responsive: **no width breakpoints at all** — the layout relies on
  `grid-template-columns: repeat(auto-fit, minmax(...))` and `flex-wrap`. Only
  `@media (hover: none)`. This is intrinsic-sizing done properly and is the pattern other
  batches should be measured against, not a gap.
- Test file: `LibraryView.test.tsx` + `SubjectDetailPage.test.tsx`. **Two DOM-depth-sensitive
  query styles:**
  - `SubjectDetailPage.test.tsx:99-100` — `screen.getByRole("heading", { name })
    .closest("section")!`, used as the `within()` root for most assertions in that file.
    **Hard constraint: the per-section wrapper must stay a `<section>` element.** Wrapping a
    section's contents in `<Card>` is safe; replacing the `<section>` with `<Card>` (which
    renders a `div`) breaks every assertion in that file.
  - `LibraryView.test.tsx:261/264/533/541` — `.closest("li")`. Safe as long as list rows stay
    `<li>`; a `<Card>` *inside* the `<li>` is fine.
  - `:413` `toast.closest("[role='alert']")` — attribute-based, unaffected by class swaps.
- Design-move tags: [card-primitive: HIGH] [pageheader-primitive: HIGH — with `actions` + `sub`]
  [spacing-scale: MEDIUM] [accent-restraint: HIGH] [header-actions: HIGH]
  [empty-loading-polish: MEDIUM]
- Issues found (severity):
  - **MEDIUM — the 42px glass icon button is declared three times app-wide** with slightly
    different hover treatments (`library:.iconBtn`, `exams:.iconBtn`, `dashboard:.dismissBtn`).
    Stronger duplication evidence than anything except the card shell itself, and it is not one
    of the six seeded hypotheses. Proposed as a **new** design move — see DESIGN_MOVES.md #7.
  - **LOW — hardcoded `blur(12px)`** at `:387-388` against `--glass-blur: 18px`; same class of
    drift as notes' `.toolbar`.
  - **LOW — the batch stub's "split-pane / toolbar" description is wrong** (corrected above).
- Redesign status: TODO
