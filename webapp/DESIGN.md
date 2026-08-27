# Learnora webapp — design system

The React app (`webapp/`) styles everything with **CSS Modules + CSS custom
properties**. No Tailwind, no component library. This note is the map.

---

## 1. Tokens

All tokens live in [`src/styles/tokens.css`](src/styles/tokens.css) (`:root`) and
[`src/styles/themes.css`](src/styles/themes.css) (light/dark × 15 accent presets
+ a custom-theme engine). Components read them via `var(--…)`; they never
redeclare raw values.

| Group | Tokens | Notes |
|---|---|---|
| Accent | `--accent`, `--accent-hover`, `--accent-press`, `--accent-soft`, `--accent-ring`, `--accent-glow`, `--accent-on`, `--accent-text` | `--accent-text` is the accent **as text** (clears 4.5:1 on `--bg`); `--accent-on` is the label **on** an accent fill. Don't mix them up. |
| Semantic | `--success`, `--warning`, `--danger` (+ `-soft`, `-on`) | Use these, never a literal `rgba(16, 185, 129, …)` emerald — that colour doesn't follow dark mode or the accent presets. |
| Surfaces | `--bg`, `--surface`, `--surface-2`, `--surface-hover`, `--surface-active` | |
| Glass | `--glass-bg`, `--glass-bg-strong`, `--glass-border`, `--glass-border-subtle`, `--glass-inner`, `--glass-blur` (18px), `--glass-saturate` | The "liquid glass" surface recipe. |
| Blur | `--glass-blur` (canonical surface), `--blur-scrim` (4px), `--blur-strong` (32px) | Prefer these to literal `blur(12px)` / `blur(16px)`. |
| Text | `--text`, `--text-muted`, `--text-faint`, `--text-on-accent` | |
| Radius | `--r-xs 8` · `--r-sm 12` · `--r-md 16` · `--r-lg 20` · `--r-xl 24` · `--r-2xl 32` · `--r-pill` | |
| Spacing | `--s-1 4` … `--s-16 64` (4px base) | Every margin/gap/pad is one of these. |
| Shadow | `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-accent` | Prefer to hand-rolled `box-shadow: 0 … rgba(…)`. |
| Type scale | `--fs-xs 12` · `--fs-sm 13` · `--fs-base 15` · `--fs-md 16` · `--fs-lg 18` · `--fs-xl 22` · `--fs-2xl 28` | 12px is the floor. Nothing renders below `--fs-xs`. |
| Display numerals | `--fs-stat`, `--fs-stat-lg` | The one-glance metric on a card. |
| Line-height | `--lh 1.6` (body) · `--lh-snug 1.35` · `--lh-tight 1.15` | |
| Motion | `--ease`, `--ease-spring`, `--t-fast 140ms`, `--t 260ms`, `--t-slow 400ms` | Micro-interactions ≤ `--t`. All motion is wrapped in `@media (prefers-reduced-motion: reduce)`. |
| Structure | `--sidebar-width 264`, `--touch-target-min 44` | |

### ⚠️ Parity constraint

[`src/styles/tokens.test.ts`](src/styles/tokens.test.ts) asserts the `:root`
block declares **every token name from the legacy root `style.css` with an
identical value** (the legacy shell still serves `terms.html`,
`reset-password.html`, `verify.html`). Consequences:

- **Adding** a token to `tokens.css` is safe (the guard only checks the vanilla's
  names are a subset). Revamp-only additions sit in a marked block at the end of
  `:root`.
- **Changing** an existing shared token's value is a **two-file edit** —
  `tokens.css` *and* root `style.css` — or the test fails.

---

## 2. Semantic text roles

[`src/styles/text.module.css`](src/styles/text.module.css) — composable classes
for the size/weight/colour/tracking combinations views kept re-deriving. They
carry no layout, so they stack onto any element.

```tsx
import text from "../../styles/text.module.css";

<h2 className={text.title}>Library</h2>
<p className={`${text.body} ${text.muted}`}>12 decks</p>
<span className={text.overline}>Daily goal</span>
```

| Role | Use |
|---|---|
| `eyebrow` | accent kicker above a title |
| `overline` | tiny all-caps micro-label ("DAILY GOAL") |
| `title` / `titleSm` | page / section heading (pair with a real `<h_>`) |
| `subtitle` | card heading |
| `body` | running copy |
| `label` | form label, list-row primary text |
| `caption` | helper text, timestamps, metadata |
| `stat` / `statLg` | one-glance dashboard metric |
| `muted` / `faint` / `accent` | colour modifiers — compose on top |
| `truncate` / `clamp2` | overflow helpers |

---

## 3. Primitives

`src/components/`. Reach for these before writing a new `.module.css`.

| Primitive | Covers |
|---|---|
| `Button` | `primary` (one per screen) · `secondary` · `danger` / `warning` / `success` · `size="sm"` |
| `IconButton` | icon-only action, 44px hit area, needs `aria-label` |
| `Card` | `panel` (default) · `elevated` · `row` · `subtle`; `padding` + `radius` props |
| `PageHeader` | title + `eyebrow` + `sub` + right-aligned `actions` slot (renders text, **not** an `<h1>` — the shell's `Header` owns the page's one `<h1>`) |
| `EmptyState` | zero-data view: icon + message + action |
| `Skeleton` | loading placeholder (reserve layout, avoid CLS) |
| `Modal` | focus-trapped dialog; `--blur-scrim` backdrop |
| `InlineFeedback` / toast (`ToastProvider`) | transient status; toasts auto-dismiss 3–5s, `aria-live` |
| `ToggleSwitch`, `PasswordField`, `Combobox` | form controls with the states wired |

### State checklist (every async view)

- **loading** → `Skeleton`, never a bare spinner or "Loading…"
- **empty** → `EmptyState` with a next action
- **error** → message + retry (`ErrorBoundary` is the backstop, not the UX)

---

## 4. Accessibility baseline (already in place — keep it)

- `:focus-visible` ring on every interactive role — [`index.css`](src/index.css).
  Never remove it; override the ring, don't delete it.
- 44px minimum touch target (`--touch-target-min`).
- `@media (prefers-reduced-motion: reduce)` around every transition/animation.
- Contrast: [`src/styles/contrast.test.ts`](src/styles/contrast.test.ts) proves
  every accent preset × mode clears WCAG AA. New presets need a dark-mode ramp.
- Form controls lift to 16px under 768px (stops iOS focus-zoom).
- Settings → Appearance exposes font family (incl. Atkinson Hyperlegible),
  interface font scaling, reduced motion, sidebar framing.

---

## 5. The revamp — phases

Tracked on branch work; each phase ends green on
`npm run build` + `lint` + `tsc -b` + `test`.

| Phase | What | Status |
|---|---|---|
| 0 | `drift.test.ts` ratchet guard (raw hex / sub-token font-size / raw shadow / raw blur / emerald, frozen per file, ratchets down) | ✅ done |
| 1 | Tokens (`--fs-stat*`, `--blur-*`, `--lh-*`), `text.module.css` roles, iOS input fix, this doc | ✅ done |
| 2 | Primitive consolidation — extend `Button`, roll `PageHeader` / `EmptyState` / `Skeleton` to all view areas, replace hand-rolled `.card` divs | ⬜ |
| 3 | View CSS de-drift — emerald→`--success`, hex→token, raw font-size→role, raw shadow→`--shadow-*`, raw `blur()`→token. Order: analytics → debugger → graph → dashboard → feynman → premortem → room → rest | ⬜ |
| 4 | Dashboard IA + responsive — priority grid, 3 real breakpoints, one primary CTA, single stat treatment | ⬜ |
| 5 | Effects & motion budget — cap stacked-blur depth, consolidate blob layers | ⬜ |

### Known pre-existing issue (not caused by the revamp)

`src/lib/analyticsEngine.test.ts` → "marks subjects as High Urgency…" fails on
`main` as of 2026-08-27: the fixture hardcodes `exam_date: "2026-08-26"` ("exam
in 3 days") with no fake clock, so it rots once that date passes. Fix
separately by pinning the clock or making the fixture dates relative.
