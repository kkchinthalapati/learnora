# Learnora webapp — design system

The React app (`webapp/`) styles everything with **CSS Modules + CSS custom
properties**. No Tailwind, no component library.

**Section 0 is the rulebook.** Every screen follows it, and a change that
breaks a rule needs a reason written next to it. Sections 1 onwards are the
reference map and the history of how the system got here.

---

## 0. The rules (2026-10 unified overhaul)

### 0.1 The shape of the app

Learnora is three nested things, and every screen belongs to one of them.

| Thing | What it is | Data | Route |
|---|---|---|---|
| **Home** | Where you land. One box to add something, where you left off, what to fix, your lessons. | — | `/` |
| **Subject** | A course you're studying: Biology, Chemistry. Holds lessons, an exam date and a plan. | `folders` | `/library` (Subjects page is the next step) |
| **Lesson** | One thing you're learning: an upload, a link, your notes or a topic. Holds its notes, cards, quiz, tutor and mistakes. | `materials` (notes, quizzes and cards point at it by `material_id`) | `/lessons/:materialId` |

Words in the UI follow the table: say **lesson**, not material, file or
source; **subject**, not folder; **cards**, not flashcards or deck (a deck is
an implementation detail); **mistakes**, not misconceptions.

### 0.2 Navigation

- **Interim:** a fourth item, **Plan**, stays in the bar until the Subjects
  page holds each subject's exam date and week plan. Without it the planner
  pages (Plan, Availability, Tasks, Exams) had no entry point. Remove it in
  the same change that moves them into Subjects.
- **Top bar, no sidebar.** Brand · Home · Subjects · Progress on the left;
  search (⌘K), Ask (⌘J), focus timer and the profile menu on the right.
  Friends, study room, settings, feedback and sign out live in the profile menu.
- On phones the top bar keeps the brand and the profile menu, and the three
  destinations move to a bottom bar.
- No second level of navigation in a bar. A page that has parts uses `Tabs`
  inside the page.

### 0.3 Every page starts the same way

- One `PageHeader`: a serif title (`--font-head`, `--fs-3xl`), at most one
  plain sentence under it, and actions on the right. It renders the page's
  one `<h1>`.
- No eyebrow or kicker above a page title. Home is the only page that greets
  you, and only Home asks "What do you want to learn?".
- Sections inside a page use `SectionHeader`: a sans `--fs-lg` heading and at
  most one quiet action on the right ("New subject").

### 0.4 One way to do each thing

| Need | Use | Not |
|---|---|---|
| Add something to study | The capture box (`CaptureBar`) | A second upload form, an "Add notes" button with its own dialog |
| Find something | ⌘K search | A per-page search box, unless the page is a long list |
| A list of lessons, subjects, decks | `ListRow` | Bespoke cards with their own borders |
| How far along something is | `ProgressRing` | Bars, percentages in text, coloured top borders |
| Switch between parts of one page | `Tabs` | Sidebar children, a row of buttons |
| A small toggle or status | `Chip` | Hand-rolled pills |
| The main action | `Button variant="primary"`, one per screen | Two primaries, gradient buttons |
| Nothing here yet | `EmptyState` with one next action | A paragraph of explanation |

### 0.5 Tokens: one scale each

Two older scales still exist for legacy consumers. New and touched code uses
only these:

- **Space** `--s-*`. Not `--space-*`.
- **Radius** `--r-*`. Cards `--r-lg`, controls `--r-md`, pills `--r-pill`.
  Not `--radius-*`, not `--card-radius`.
- **Type** `--fs-*` with `text.module.css` roles. Not `--text-*`.
- **Colour** semantic only: `--text`, `--text-muted`, `--text-faint`,
  `--surface`, `--surface-2`, `--hairline`, `--accent`, `--accent-text`,
  `--success|warning|danger(-text)`, `--recall` for "due". No hex in a module.
- **Elevation** flat: hairline borders, no shadows on cards. Only menus,
  modals and drawers cast `--shadow-md` or larger.
- **Motion** `--t-fast` / `--t`, with `--ease`, inside
  `prefers-reduced-motion: no-preference` or reset under `reduce`.

### 0.6 Writing

- Sentence case everywhere, including buttons and tabs: "New subject", not
  "+ New Folder".
- Buttons start with a verb and say what happens: "Start session",
  "Make my study set".
- Second person, plain, short. No exclamation marks, no "Unlock",
  "Supercharge", "Level up", no sparkle emoji, no "AI-powered".
- Numbers say what they count: "12 of 30 cards practised", not "40%".
- Never claim something the data doesn't support. If a figure is an
  estimate, say so.

### 0.7 Dark first

Dark is the default (`lib/appearance.ts`). Design and check every screen in
dark first, then light. Accent presets stay in Settings; everything reads
`--accent` and its roles, so a preset can never break a screen.

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
| **2026-09 redesign** — colour | `--paper`, `--sidebar-bg`, `--hairline`, `--hairline-strong`, `--text-secondary`, `--track`, `--recall` / `--recall-text` / `--recall-soft` | Ochre `--recall` means "memory / due / guessed" and nothing else. It is a fill (3:1); `--recall-text` is the same hue as a label (4.5:1). Both are pinned in `contrast.test.ts`. Dark values in `themes.css`. |
| redesign — accent roles | `--accent-wash`, `--accent-deep`, `--accent-line`, `--accent-line-strong` | `color-mix` off the live accent, so every preset gets them. Declared on `body` (themed aliases must be, see tokens.test). The handoff's `--accent-ink` is `--accent-deep` here — `--accent-ink` already existed. |
| redesign — reading | `--fs-read 17` · `--fs-read-lg 19` · `--lh-read 1.65` · `--lh-display 1.02` · `--tracking-display` · `--tracking-meta` · `--measure-read 62ch` · `--font-mono` | Tutor prose is set in `--font-read` at `--fs-read`, capped at `--measure-read`. |
| redesign — layout | `--rail-width 300` · `--drawer-width 420` · `--session-plan-width 260` · `--topbar-height 64` · `--control-sm 32` · `--control-lg 48` | `--control-sm` is fine-pointer only; lift to `--touch-target-min` under `(pointer: coarse)`. |
| redesign — elevation | `--shadow-focus`, `--shadow-drawer`, `--scrim` | Flat by default: hairlines, not shadows. Only the drawer and modals cast. |

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
| `display` / `pageTitle` | redesign serif headline (Today hero, results finding, first run) / in-page title |
| `claim` | the one-sentence answer that opens a tutor turn |
| `prose` | tutor reading text (`--font-read`, `--fs-read`, `--measure-read`) |
| `meta` | small uppercase-tracked line above a block ("PRACTICE · 3 OF 8") |
| `secondary` / `recall` / `accentDeep` | colour modifiers for the redesign roles |

---

## 3. Primitives

`src/components/`. Reach for these before writing a new `.module.css`.

| Primitive | Covers |
|---|---|
| `Button` | `primary` (one per screen, flat fill) · `secondary` · `ghost` (lowest-emphasis text action) · `danger` (text-style) / `warning` / `success` · `size="sm" \| "lg"` · `busy` (keeps its width, sets `aria-busy`) |
| `IconButton` | icon-only action, 44px hit area, needs `aria-label` |
| `Chip` | compact pill — filter/toggle (`pressed`), quick action, or clickable status (`soft` + `tone`). `tone`: `neutral` / `accent` / `success` / `warning` / `danger` |
| `Card` | `panel` (default) · `elevated` · `row` · `subtle`; `padding` + `radius` props |
| `PageHeader` | the page's one `<h1>` (serif) + one-sentence `sub` + right-aligned `actions`. Pages that render it are listed in `viewOwnsPageTitle()` so the shell doesn't add a second title. `eyebrow` is kept for old callers only; don't use it in new code (rule 0.3) |
| `SectionHeader` | an `<h2>` inside a page + one quiet action (rule 0.3) |
| `ListRow` | one row in a list of lessons, subjects or decks: leading icon, title, one meta line, trailing slot (a `ProgressRing`, a chevron, a menu). Renders as a link when given `to` |
| `ProgressRing` | how far along something is, with a text label that says what it counts |
| `Tabs` | parts of one page; arrow keys, Home/End, one tab stop; each tab can be a link (`to`) so the URL holds the tab |
| `EmptyState` | zero-data view: icon + message + action |
| `Skeleton` | loading placeholder (reserve layout, avoid CLS) |
| `Modal` | focus-trapped dialog; `--blur-scrim` backdrop |
| `InlineFeedback` / toast (`ToastProvider`) | transient status; toasts auto-dismiss 3–5s, `aria-live` |
| `ToggleSwitch`, `PasswordField`, `Combobox` | form controls with the states wired |

### Learning primitives (`src/components/learning/`)

The redesign's study vocabulary. Every mode, the Ask drawer, results and the
first run are built from these.

| Primitive | Covers |
|---|---|
| `TutorTurn` / `StudentTurn` | a turn of tutoring: `meta`, `claim`, prose, optional `structure`, `trap`, `deeper`, `check` slots; `streaming` sets `aria-busy` |
| `TrapCallout` | "the usual mistake" — accent-edged, labelled in text as well as colour |
| `HintLadder` | hints revealed one rung at a time, never the answer first |
| `ConfidencePicker` | Sure / Think so / Guessing before an answer; the answer is stored with it so "guessed right" is not credited as known |
| `StepPlan` | the ordered plan in a session's side column and the upload pipeline |
| `MasteryLadder` | Seen → Recalled → Applied → Explained (`lib/mastery.ts`). `gainedFrom` fills newly earned rungs once — the one celebration, static under reduced motion |
| `AiErrorCard` | "The tutor didn't answer that one" + retry + a non-AI fallback + what was kept |

### Feature flags

`src/lib/flags.ts` — `weeklyGoal`, `guessFirst`, `teachGapChips`. On in dev,
off in prod, forced per browser with `localStorage["learnora:flag:<name>"]`.

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
| 2 | Primitives — `Button` `ghost` variant + new `Chip` built & tested; proven in the dashboard (`StreakCard` / `NextExamCard` trophy + readiness pills → `Chip`, `.eyebrow` now `composes` the shared `overline` role). Per-view `Chip` / `IconButton` / `PageHeader` rollout folds into Phase 3. | 🔶 primitives done |
| 3 | View + component CSS de-drift — ~640 raw values across 46 modules → design tokens (Tailwind emerald/red/amber/indigo ramps → `--success`/`--danger`/`--warning`/`--accent`; phantom tokens like `--card-bg`, `--surface-elevated`, `--shadow-xl` → real ones; `blur()` → `--glass-blur`/`--blur-*`; rem/px `font-size` → `--fs-*`; white/black shadow layers → `--glass-inner`/`--shadow-*`). The Feynman, Cognitive Debugger and Study Analytics suites had been built against non-existent tokens and were **broken in dark mode / every accent preset** — now themed. `settings/appearance` (theme studio) exempted. | ✅ done — 12 annotated residuals left (see below) |
| 4 | Dashboard IA + responsive — priority grid, 3 real breakpoints, one primary CTA, single stat treatment | ⬜ |
| 5 | Effects & motion budget — cap stacked-blur depth, consolidate blob layers | ⬜ |

### 2026-09 redesign (`archive/design_handoff_learnora_redesign/README.md`)

| Phase | What | Status |
|---|---|---|
| 1 | Revamp tokens + dark values, contrast pins for `--recall*` / `--accent-deep`, flat `Button`, new text roles, learning primitives, `lib/mastery.ts`, `lib/flags.ts` | ✅ |
| 2 | Five-item nav (Today · Library · Study · Plan · Progress), children revealed under their parent, icon rail 768–1023, ⌘J Ask, paused-session card; `/dashboard` → `/` | ✅ |
| 3 | Today (one scenario-driven hero + rail) and the Ask drawer (guess-first behind a flag) | ✅ |
| 4 | `/study/:id` session screen, five modes (Explain · Socratic · Practice · Teach · Recall); every old tool URL redirects into it | ✅ |
| 5 | Error / empty / loading states (`AiErrorCard`, fading topics, ledger copy) | ✅ |
| 6 | Confidence before answering, results led by the finding, strict test runner, upload pipeline as a `StepPlan` | ✅ |
| 7 | Value-first `/welcome`: topic or notes → 3-min lesson → win → two planning questions. The full wizard is `SetupWizard`, reached from Settings (`?replay=1`) | ✅ |
| 8 | Mastery-rung animation where a rung is earned, copy pass, this doc | ✅ |

Not built (need backend or product calls): a server-side sessions table
(sessions are per-device in localStorage), upload thumbnails / topic chips /
duplicate detection / early start, "mastery changes" in the results rail,
"Pause & save" in the strict mock exam.

### Phase 3 intentional residuals (in `drift.baseline.json`, all annotated in-file)

- **Button** ×2 — brighter white sheen on the primary gradient (`--btn-sheen` covers the rest).
- **OfflineBanner** ×2 — the `.offline` pill is deliberately theme-independent, like an OS toast.
- **ToggleSwitch** ×1 — white switch knob (iOS/Material platform convention).
- **auth `.visual`** ×3 — fixed near-black marketing panel, treated like a hero image.
- **FeynmanHubView** ×3 — emoji-glyph avatar `font-size` (px on purpose; must not scale with interface font).
- **graph** ×1 — single-edge drawer cast, no `--shadow-*` token fits.

### Known pre-existing issue (not caused by the revamp)

`src/lib/analyticsEngine.test.ts` → "marks subjects as High Urgency…" fails on
`main` as of 2026-08-27: the fixture hardcodes `exam_date: "2026-08-26"` ("exam
in 3 days") with no fake clock, so it rots once that date passes. Fix
separately by pinning the clock or making the fixture dates relative.
