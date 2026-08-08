# Terms batch — 1 file

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured. **Exception: this
is the one batch that is publicly reachable without auth** (`/terms`), so it is the only view
that *could* be screenshotted without a session. Deferred with the rest for consistency.
Source: `webapp/src/views/terms/`

## TermsView (views/terms/TermsView.tsx)

- Route: `/terms` — **outside the `ProtectedRoute`/`AppShell` tree** (`routes.tsx:63`, declared
  alongside the auth routes rather than inside the signed-in block). It therefore renders with
  no sidebar and no app header, and supplies its own page chrome.
- Related files: `terms.module.css` (~155 lines). Test file `TermsView.test.tsx`.
- Header: **`.header`, its own third variant** (`terms.module.css:20-30`, used at
  `TermsView.tsx:35`) — a bordered block containing `.nav` (back button + brand lockup) and
  `.title`. This is a standalone-document header, not a page header; because the route sits
  outside the shell it genuinely needs one. **Do not migrate to the PageHeader primitive** —
  different job, different context.
- Card usage: **2 partial glass surfaces, neither a real card shell:**
  - `.backBtn` (`:33-46`) — `--glass-bg` + `--glass-border-subtle`, `--r-pill`. No blur, no
    shadow.
  - `.tocBox` (`:88-94`) — `--glass-bg` + `--glass-border-subtle`, `--r-lg`, `padding:
    var(--s-5)`. No blur, no shadow. This is the `subtle` variant in the PRIMITIVES contract.
  - Card primitive confidence: **LOW.** Two surfaces, both `subtle`, neither duplicated
    elsewhere in this batch. Migrate opportunistically in Phase 6 at most.
- Spacing: **7 hardcoded px**, distinct values `8 10 16 20 24 40 80`. Off-scale: `10px` (`:59`
  brand gap), `80px` (`:9` page bottom padding — plausibly intentional footer clearance).
  `40px`/`24px`/`16px` at `:9`, `:21-25` are on-scale literals. The body of the file (`.section`,
  `.footer`, `.tocList`) is fully on-token — the drift is confined to the header block.
- Accent usage: 2 references (`.tocList a`, `.section a` — both link colour). Minimal and
  correct for a legal document.
- Distinctive/preserve:
  - `font-size: 0.9rem` on `.backBtn` (`:44`) and `clamp(28px, 5vw, 40px)` on `.title` (`:73`)
    bypass the `--fs-*` scale. The title clamp is a deliberate fluid heading; the `0.9rem` is
    not (`--fs-sm` is the intended token).
  - `transition: all 0.2s ease` at `:45` — the only `transition: all` in the app. Everything
    else enumerates properties explicitly. Worth tightening.
  - `scroll-margin-top: var(--s-6)` on `.section` (`:126-128`) is a deliberate, commented
    accommodation for the table-of-contents jump links. Preserve it.
- Accessibility: `min-height: 100dvh` uses the dynamic viewport unit — correct for mobile
  browser chrome, and the only `dvh` in the app. TOC links are real anchors with
  `scroll-margin-top`. `prefers-reduced-motion` at `:55` neutralises the back-button hover
  translate. Good for a document page.
- Responsive: no width breakpoints — `max-width: 860px` centred column plus
  `repeat(auto-fit, minmax(240px, 1fr))` on the TOC grid. Intrinsic sizing, no queries needed.
- Test file: `TermsView.test.tsx`. No `.closest()`, no `.className` assertions, no snapshots.
  Safe for class-name swaps.
- Design-move tags: [card-primitive: LOW] [pageheader-primitive: N/A — standalone document
  header, outside the shell] [spacing-scale: LOW] [accent-restraint: LOW] [header-actions: N/A]
  [empty-loading-polish: N/A — static content, no async states]
- Issues found (severity):
  - **LOW — `transition: all 0.2s ease`** (`:45`). Only instance in the app; enumerate the
    properties instead (this one animates `background` and `transform`).
  - **LOW — `font-size: 0.9rem`** (`:44`) bypasses the `--fs-*` scale.
  - **LOW — `padding: 40px 20px 80px`** (`:9`) — the page's outermost spacing is fully literal
    while the rest of the file is on-token.
- Redesign status: TODO
