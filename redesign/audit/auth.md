# Auth batch — 6 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured. **These routes are
publicly reachable** (no session needed), so this batch and `terms` are the two that could be
screenshotted first in Phase 4 if a visual baseline is wanted before the auth wall is solved.
Source: `webapp/src/views/auth/` (uses its own AuthShell.tsx, not the main AppShell)

## AuthShell + 5 auth views (views/auth/)

- Routes: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify` (paths come from
  `authPaths.ts`, declared at `routes.tsx:58-62` — **outside** the `ProtectedRoute`/`AppShell`
  tree, alongside `/terms`).
- Related files: `auth.module.css` (~340 lines), `AuthShell.tsx`, `LoginView.tsx`,
  `SignupView.tsx`, `ForgotPasswordView.tsx`, `ResetPasswordView.tsx`, `VerifyView.tsx`,
  `RedirectIfSignedIn.tsx`, `useAuthStatus.tsx`
- Header: **`.brandHeader`, a fourth variant** (`AuthShell.tsx:46-49`) — a centred logo lockup
  plus per-view title, not a page header. Correct for a signed-out split-screen layout.
  **Do not migrate to the PageHeader primitive.**
- Card usage: **1 glass-shell declaration, and it is its own recipe.** `.card`
  (`auth.module.css:48-58`) uses `--glass-bg-strong` (not `--glass-bg`), a hardcoded
  `blur(36px)` (double `--glass-blur`), and `box-shadow: var(--glass-inner)` alone — no outer
  shadow at all, because the elevation is carried by the parent `.layout` (`:35-46`,
  `--r-2xl` + `--shadow-lg` + `overflow: hidden`). This is a deliberate two-part construction:
  the container owns radius/shadow/clipping, the panel owns the glass.
  - Card primitive confidence: **LOW — do not migrate.** `--glass-bg-strong` + 36px blur +
    shadowless is a one-off, and the `.layout`/`.card` split is load-bearing for the
    split-screen. Forcing `<Card>` here would add complexity for one call site.
- Spacing: **4 hardcoded px**, distinct values `12 14 16 24 28 40 44 56`. Off-scale: `14px`,
  `28px`, `44px`, `56px` — but `28/44` and `24/56` appear as the two ends of `clamp()` fluid
  padding on `.card` (`:52`), which is intentional. Genuine drift is limited to `14px`.
  Cleanest spacing of any batch relative to its size.
- Accent usage: 5 references — light. The logo's `0 0 24px var(--accent-glow)` halo (`:65-67`),
  link colour (`:129`, `:188`), the loader's `border-top-color` (`:325`), and an
  `--accent-glow` stop in the decorative panel's radial gradient (`:205`).
- Distinctive/preserve:
  - **The `.visual` panel is `aria-hidden="true"`** (`AuthShell.tsx:75`) and hardcodes a dark
    gradient `linear-gradient(165deg, #1b1e1c 0%, #0a0c0a 100%)` (`:208`) with `color: #fff`
    (`:239`). Because the panel is decorative and always dark in both themes, the fixed white
    is internally consistent — **this is a deliberate always-dark surface, not a theming bug.**
    Recording it explicitly so a later "replace hex with tokens" pass does not "fix" it into
    an unreadable light-on-light panel.
  - The `drift` animation (`:223`, 32s linear infinite) on the decorative panel.
  - `min-height: 100dvh` on `.wrapper` (`:17`) with a commented rationale (`:6-8`) about the
    vanilla's `#auth-wall` overlay becoming a real route. Preserve.
- Accessibility: **the best reduced-motion handling in the app.** `:305-307` sets
  `animation: none` for the decorative drift, but `:336-338` deliberately sets the *loader* to
  `animation-duration: 3s` instead of `none` — a spinner that stops spinning stops
  communicating. This is a considered distinction worth citing as the house pattern.
  - `PasswordField.tsx` (shared component) handles the show/hide affordance; see
    `components.md`.
  - **No `:focus-visible` rules in this module** — relies entirely on the global ring plus the
    global `input:focus` accent ring from `index.css:102-116`. Correct here: the auth forms are
    plain inputs and buttons with no `outline: none` overrides (unlike the dashboard
    CommandBar), so the global rules apply cleanly.
- Responsive: `@media (max-width: 1024px)` (`:282`) collapses the split-screen — shared only
  with the timer batch. Two `prefers-reduced-motion` queries (`:305`, `:336`).
- Test file: one per view — `LoginView.test.tsx`, `SignupView.test.tsx`,
  `ForgotPasswordView.test.tsx`, `ResetPasswordView.test.tsx`, `VerifyView.test.tsx`.
  **No `.closest()`, no `.className` assertions, no snapshots.** Safe for class-name swaps,
  though there is little here worth swapping.
- Design-move tags: [card-primitive: LOW — do not migrate] [pageheader-primitive: N/A —
  signed-out brand lockup] [spacing-scale: LOW] [accent-restraint: LOW] [header-actions: N/A]
  [empty-loading-polish: HIGH — best-in-app, use as the reference]
- Issues found (severity): **none blocking.** This is the most internally consistent batch in
  the app. Two notes for the record:
  - The always-dark `.visual` panel's hex literals are intentional (see Distinctive/preserve) —
    do not token-ise them.
  - `14px` at one call site is the only genuine off-scale spacing value.
- Redesign status: TODO
