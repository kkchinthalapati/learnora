# UI_FORENSICS.md

Forensic audit of `webapp/src/**/*.css` (75 files, 24,541 lines) and
`webapp/src/**/*.tsx`. Branch `revamp/identity-2026`. No code was changed.

Every claim below is backed by a `file:line` citation or a reproducible count.
Counts were produced by grep/AST-lite parsing of every rule block in every
`.css` file under `webapp/src`. `archive/` was not read.

**Headline:** the token layer is actually good (100 tokens, only 8 dead, zero
shadowing). The problem is entirely in *consumption*: 343 hand-rolled card
shells with 289 distinct signatures, 3 parallel spacing systems, 57 distinct
border values, 20 border declarations that are **invalid CSS and render no
border at all**, and 19 different breakpoints. The system exists; nothing uses
it.

---

## 1. Border incoherence

### 1.1 Scale of the problem

| Metric | Count |
|---|---|
| Total `border*` declarations | 1,373 |
| Distinct `border:` shorthand values | **57** |
| Distinct `border-radius` values | **28** |

Top clusters (`grep -hoE "border[a-z-]*:\s*[^;]+"` over all CSS):

```
118  border: 1px solid var(--glass-border-subtle)
 70  border: 1px solid var(--glass-border)
 56  border: 1px solid var(--line)
 53  border: none
 30  border: 1px solid var(--accent-ring)
 22  border-bottom: 1px solid var(--line)
 20  border-top: 1px solid var(--line)
 17  border: 0
 14  border: 1px solid var(--success-soft)
 12  border: 1px solid var(--danger-soft)
 11  border: 1px solid var(--border)      <-- INVALID, see 1.2
 10  border: 1px solid transparent
  9  border: 1px solid var(--warning-soft)
  5  border: var(--border)
```

There are **three mutually exclusive "hairline" idioms** in use for the same
visual job — `--glass-border-subtle` (118), `--glass-border` (70), `--line`
(56) — plus a fourth (`--border`) that does not work. No file uses only one.
`views/library/library.module.css` alone uses `--glass-border` (3x),
`--glass-border-subtle`, and `--line` on sibling surfaces.

### 1.2 SEVERE — 20 borders that do not render at all

`webapp/src/styles/tokens.css:96`:

```css
--border: 1px solid var(--glass-border-subtle);
```

`--border` is a **full shorthand**, not a colour. Twenty declarations use it as
if it were a colour:

```css
border: 1px solid var(--border);
/* expands to: border: 1px solid 1px solid rgba(28,24,18,0.08); */
```

That is a parse error, so the browser **drops the entire declaration**. These
elements have no border in either theme:

- `webapp/src/views/notebooks/notebooks.module.css:70, 119, 238, 316, 329, 426, 446, 522, 556, 574, 653, 708, 725, 756` (14 of them — the entire Notebooks surface is unbordered)
- `webapp/src/views/dashboard/ResumeLearningCard.module.css:3, 67, 179`
- `webapp/src/views/dashboard/dashboard.module.css:1057`
- `webapp/src/views/settings/notifications.module.css:6`
- `webapp/src/components/ai/CognitiveCrossLinkBar.module.css:168`

Meanwhile five *correct* uses exist at
`webapp/src/views/settings/appearance.module.css:354, 365, 404, 430, 664`
(`border: var(--border);`). So the same token is used two incompatible ways in
the same codebase, and the majority usage is the broken one. **This is the
single largest cause of "the borders are wrong."**

Related but valid: `border-color: var(--border)` at
`webapp/src/components/ai/CognitiveCrossLinkBar.module.css:18`,
`webapp/src/views/notebooks/notebooks.module.css:285, 378` — also invalid
(a shorthand is not a `<color>`), also silently dropped, so hover states there
do nothing.

### 1.3 SEVERE — 70 borders that are invisible in light mode

`webapp/src/styles/tokens.css:83`:

```css
--glass-border: rgba(255, 255, 255, 0.7);   /* light mode: near-white */
```
`webapp/src/styles/themes.css:51`:
```css
--glass-border: rgba(255, 255, 255, 0.1);   /* dark mode */
```

`--glass-border` is a *highlight*, correct only on a translucent glass surface
floating over a tinted backdrop. It is used 70 times, and at least nine of
those are on an **opaque light surface**, where a 70%-white 1px line against
`--surface: #ffffff` / `--surface-2: #f1efe9` is invisible:

- `webapp/src/components/RichTextEditor.module.css:61` (bg `--surface`)
- `webapp/src/components/command/CommandPalette.module.css:21` (bg `--surface-2`)
- `webapp/src/views/room/room.module.css:141, 180` (bg `--surface`)
- `webapp/src/views/quiz/quiz.module.css:184` (bg `--surface-hover`)
- `webapp/src/views/library/library.module.css:216, 335`
- `webapp/src/views/library/LibrarySearch.module.css:22`
- `webapp/src/views/dashboard/commandBar.module.css:67`

Heaviest consumers: `views/review/review.module.css` (17), `views/room/room.module.css` (7),
`components/command/CommandPalette.module.css` (7), `views/quiz/quiz.module.css` (6).

The inverse also holds: in dark mode `--line` drops to
`rgba(255,255,255,0.08)` (`themes.css:60`) while `--glass-border-subtle` drops
to `rgba(255,255,255,0.06)` (`themes.css:52`) — so the three idioms converge to
near-identical values in dark and diverge wildly in light. **The same card looks
consistent in dark mode and incoherent in light mode.** That is why the problem
is hard to see in a screenshot review.

### 1.4 MAJOR — the same element, different borders across views

The segmented control is declared three times with three different shells:

| File:line | Selector | Border |
|---|---|---|
| `components/create/formShared.module.css:65` | `.segmentedOption` | inherits track |
| `views/timer/timer.module.css:41` | `.segOption` | inherits track |
| `views/exams/exams.module.css:258` | `.segmentedOption` | inherits track |

All three bodies are byte-identical (11 declarations, including a hardcoded
`padding: 9px 8px` — see §2). Three copies, one component.

Card shells with `background: var(--surface)` take four different borders
across the app: `1px solid var(--line)` (5x), `1px solid var(--glass-border)`
(3x), `1px solid var(--glass-border-subtle)` (4x), `1px solid var(--border)`
(2x, broken). See §3.1 for the full signature table.

### 1.5 MINOR — hardcoded rgba borders bypassing the theme

Eleven borders hardcode a colour and therefore do not respond to theme
switching or accent presets:

```
border: 1px solid rgba(255, 255, 255, 0.25)   x2
border: 1px solid rgba(255, 255, 255, 0.35)
border: 1px solid rgba(255, 255, 255, 0.18)
border: 1px solid rgba(52, 184, 138, 0.2)      <- hardcoded --success
border: 1px solid rgba(30, 142, 107, 0.3)      <- hardcoded --success
border: 1px solid rgba(239, 68, 68, 0.4)
border: 1px solid rgba(224, 90, 78, 0.2)       <- hardcoded --danger
border: 1px solid rgba(201, 138, 46, 0.35)     <- hardcoded --warning
border: 1px solid rgba(201, 138, 46, 0.25)     <- hardcoded --warning
border: 1px solid rgba(194, 69, 58, 0.35)      <- hardcoded --danger
border: 3px solid #fff / 2px solid #fff
```

Note `rgba(201,138,46,…)` *is* `--warning` and `rgba(194,69,58,…)` *is*
`--danger` from `tokens.css:45,49`. In dark mode those tokens become `#e0a53e`
and `#e2564a` — these borders stay at the light-mode value and go muddy.

Two declarations are outright malformed and drop:
`border: rgba(255, 255, 255, 0.7);` and `border: rgba(255, 255, 255, 0.1);`
(a colour alone is a valid `border` value only with a style, which is missing —
computed `border-style: none`, so **no border renders**).

### 1.6 MAJOR — border widths with no system

`1px` (dominant), `1.5px` (2), `2px` (16), `3px` (7), `4px` (5), `6px` (1).
`border: 1.5px solid var(--surface-2)` / `border: 1.5px solid var(--surface)`
will render as 1px or 2px depending on DPR — visibly different on a retina vs
non-retina display.

### 1.7 MAJOR — radius has no hierarchy

144 `--r-md` + 121 `--r-pill` + 88 `--r-sm` + 63 `--r-lg` + 32 `--r-xl` — but
also **32 hardcoded radii** that sit *between* the token steps and therefore
create visible mismatch when nested:

```
9  9999px  (duplicate of --r-pill = 999px)
7  4px     (duplicate of --r-xs)
6  6px     (off-scale: between --r-xs 4 and --r-sm 8)
5  12px    (duplicate of --r-md)
3  8px, 3px, 10px
2  999px, 2px, 20px
1  22px, 2.5px, 18px, 18px 18px 4px 18px, 18px 18px 18px 4px
```

`border-radius: 18px 18px 4px 18px` / `18px 18px 18px 4px` at
`components/chat/chat.module.css` are chat bubbles using an 18px radius that
exists nowhere else in the system (`--r-lg` is 16, `--r-xl` is 20).

`views/notebooks/notebooks.module.css:512` uses `border-bottom-right-radius: 4px`
on `.userMessage` — a second, unrelated chat-bubble idiom for the same UI
pattern.

### 1.8 MAJOR — rounded parents without `overflow: hidden`

There are 38 files using `overflow: hidden`, against **453 `border-radius`
declarations**. Confirmed instance of a child painting past a rounded corner:

`webapp/src/views/notebooks/notebooks.module.css:135-141`

```css
position: absolute; top: 0; left: 0; right: 0;
height: 4px;
background: var(--card-accent, var(--accent));
```

This is a full-bleed accent strip pinned to the top of `.notebookCard`. The
card is rounded, and there is no `overflow: hidden` on it — the strip's square
corners overhang the card's rounded ones. Same pattern at
`views/dashboard/ResumeLearningCard.module.css:27` (`z-index: 1` decorative
layer over a rounded card).

### 1.9 MINOR — `outline: none` without a replacement

24 `outline: none` declarations against 41 `outline: 2px solid …`. See §6.6.

---

## 2. Spacing chaos

### 2.1 Three parallel spacing systems

Of **2,087** spacing declarations (`padding|margin|gap|row-gap|column-gap` and
their longhands):

| System | Declarations | Share |
|---|---|---|
| `var(--s-*)` scale | 1,203 | 58% |
| Hardcoded `px` | 576 | **28%** |
| `rem` | 90 | 4% |
| other (`%`, `auto`, `0`, `calc`, `clamp`) | ~218 | 10% |

The `rem` system is not scattered — it is **confined to five files**, four of
which are one feature:

- `webapp/src/views/debugger/CognitiveDebuggerView.module.css`
- `webapp/src/views/debugger/KnowledgeCircuit.module.css`
- `webapp/src/views/debugger/MicroRepairModal.module.css`
- `webapp/src/views/analytics/StudyAnalyticsView.module.css`
- `webapp/src/components/combobox.module.css`

The entire Cognitive Debugger feature was authored against a different spacing
system than the rest of the app. `padding: 3rem 1.5rem` at
`CognitiveDebuggerView.module.css:460` = 48px/24px, which happens to land on
`--s-12`/`--s-6` — but `gap: 1rem` (16px) sits alongside `gap: 0.5rem` (8px) at
`:264, :308, :346` where every other view writes `var(--s-4)` / `var(--s-2)`.
This is the clearest single signature of "copy-pasted from a different
generation session."

### 2.2 Every hardcoded spacing value, by frequency

```
122x  4px     (== --s-1)          | on-scale, just untokenised
121x  6px     OFF-SCALE
107x  8px     (== --s-2)
 82x  12px    (== --s-3)
 80x  2px     OFF-SCALE
 59x  10px    OFF-SCALE
 52x  16px    (== --s-4)
 36x  3px     OFF-SCALE
 22x  14px    OFF-SCALE
 21x  20px    (== --s-5)
 20x  5px     OFF-SCALE
 18x  1px     OFF-SCALE
 15x  24px    (== --s-6)
 14x  9px     OFF-SCALE
  9x  7px     OFF-SCALE
  9x  18px    OFF-SCALE
  8x  40px    (== --s-10)
  7x  32px    (== --s-8)
  7x  28px    OFF-SCALE
  6x  11px    OFF-SCALE
  5x  36px    OFF-SCALE
  4x  34px, 22px  OFF-SCALE
  3x  56px    OFF-SCALE
  2x  48px (== --s-12), 13px OFF-SCALE, 0px
  1x  80px, 70px, 44px, 38px, 30px, 15px, 120px, 112px  OFF-SCALE
```

**Off-scale total: ~415 declarations** using values that are not on the 4px
grid or not a token step. `6px` (121) and `10px` (59) are the two worst — they
sit between `--s-1`(4) and `--s-2`(8), and between `--s-2`(8) and `--s-3`(12),
so anything padded with them is visibly a half-step out of alignment with its
neighbours.

`398` of the hardcoded values (4/8/12/16/20/24/32/40/48px) have an **exact
token equivalent** and are pure drift with zero visual intent.

### 2.3 SEVERE — `--s-7` does not exist

Three files reference a spacing token that is not defined anywhere. The
`--s-*` scale in `tokens.css:110-120` is `1,2,3,4,5,6,8,10,12,16` — there is
no `--s-7`.

- `webapp/src/views/dashboard/dashboard.module.css:12` — `gap: clamp(var(--s-7), 4vw, var(--s-8));`
- `webapp/src/views/notebooks/notebooks.module.css:9` — `gap: var(--s-7);`
- `webapp/src/views/tasks/tasks.module.css:126` — `margin-top: var(--s-7);`

Only `dashboard.module.css:12` has an effective fallback (the `clamp()` still
resolves via `--s-8`). The other two resolve to the initial value:
`gap: normal` (i.e. **0** on flex) and `margin-top: 0`. **The Notebooks hub's
main vertical rhythm collapses to zero gap, and the Tasks section loses its top
margin.** These are literal "things aren't spaced out" bugs, not opinions.

Four more phantom tokens are referenced with fallbacks (so they work, but they
prove the CSS came from elsewhere) — all but one in Notebooks:
`--surface-base` (`notebooks.module.css:228, 437`), `--surface-3` (`:379`),
`--card-accent` (`:140`), `--text-inverse` (`:515`), `--border-hover`
(`views/dashboard/ResumeLearningCard.module.css:18`). None of these names exist
in this design system; they are shadcn/Tailwind-shaped names.

### 2.4 MAJOR — broken vertical rhythm between siblings

The clearest measurable case: **empty states**, which are the same UI pattern
everywhere and are padded six different ways:

| File:line | Padding |
|---|---|
| `components/EmptyState.module.css:4` (the canonical primitive) | `var(--s-10) var(--s-5)` = 40/20 |
| `views/room/room.module.css:986` | `var(--s-12) var(--s-6)` = 48/24 |
| `views/graph/graph.module.css:711` | `var(--s-8)` = 32 |
| `views/feynman/FeynmanHubView.module.css:417` | `var(--s-8) var(--s-4)` = 32/16 |
| `views/achievements/achievementsModal.module.css:470` | `var(--s-8) var(--s-4)` = 32/16 |
| `views/review/review.module.css:707` | `var(--s-6)` = 24 |
| `views/tasks/tasks.module.css:460` | `16px 20px` |
| `views/debugger/CognitiveDebuggerView.module.css:460` | `3rem 1.5rem` |
| `views/plan/plan.module.css:319` | `var(--s-2) 0` = 8/0 |
| `views/room/room.module.css:820` | `var(--s-3) 0` = 12/0 |

Ten paddings for one pattern, spanning 8px to 48px. Navigating between two
views that both show "nothing here yet" produces a visibly different amount of
whitespace each time.

Card padding shows the same spread. From the 343-rule card-shell census (§3.1),
padding values on `background: var(--surface)` cards include `var(--s-3)`,
`var(--s-4)`, `var(--s-5)`, `var(--s-6)`, `var(--s-8)`, `10px 12px`, `12px 16px`,
`8px 10px`, `4px 10px`, `4px 12px`, `2px 6px`, `6px 12px`, `4px 8px`.

### 2.5 MAJOR — 49 hand-rolled `clamp()` ramps

`tokens.css:180-181` defines `--fs-stat: clamp(30px, 4.5vw, 44px)` and
`--fs-stat-lg: clamp(38px, 6vw, 56px)` precisely to stop this. There are still
**49 inline `clamp()` calls**, of which these are near-duplicate display-number
ramps that should all be one token:

```
clamp(22px, 3vw, 34px)    x5
clamp(20px, 4vw, 36px)    x4
clamp(30px, 4vw, 40px)    x2   <- dashboard.module.css:322
clamp(24px, 4vw, 36px)    x2
clamp(20px, 4vw, 48px)    x2
clamp(20px, 3vw, 32px)    x2
clamp(24px, 3.2vw, 32px)       <- analytics.module.css:99
clamp(36px, 6vw, 56px)         <- == --fs-stat-lg, retyped
clamp(34px, 5vw, 44px)
clamp(32px, 5vw, 56px)
clamp(48px, 7vw, 72px)
clamp(19px, 2.5vw, 23px)  x2
```

The dashboard's big number (`clamp(30px, 4vw, 40px)`) and the analytics view's
big number (`clamp(24px, 3.2vw, 32px)`) are the same UI element rendered at
different sizes on adjacent screens.

---

## 3. Copy-paste clusters — the core finding

### 3.1 The card shell: 343 rules, 289 distinct signatures

Rules that carry `background` + `padding` + `border-radius` + a `border` — i.e.
a card/panel/tile shell — number **343**. Reducing each to its
`(background, border, padding, radius)` signature yields **289 distinct
combinations**. That is **84% uniqueness**: essentially every card in the app is
hand-rolled, and no two agree.

The most-repeated signature appears only **6 times**. Top of the distribution:

```
6x  bg=--surface-2   border=1px --glass-border-subtle  pad=--s-1   r=--r-md
5x  bg=--surface     border=1px --line                 pad=--s-4   r=--r-lg
4x  bg=--surface     border=1px --line                 pad=--s-3   r=--r-md
3x  bg=--surface-2   border=1px --line                 pad=--s-4   r=--r-lg
3x  bg=--glass-bg    border=1px --glass-border         pad=--s-6   r=--r-xl
3x  bg=--surface     border=1px --line                 pad=--s-6   r=--r-xl
3x  bg=--surface     border=1px --glass-border         pad=--s-5   r=--r-lg
3x  bg=--surface-2   border=1px --line                 pad=4px 10px  r=--r-pill
3x  bg=--surface-2   border=1px --glass-border-subtle  pad=4px 12px  r=--r-pill
2x  bg=--surface     border=1px --border (BROKEN)      pad=--s-6   r=--r-xl
```

Note rows 8 and 9: **the same pill** (`--surface-2` fill, pill radius) with
different borders *and* different horizontal padding (10px vs 12px), each used
three times.

A `Card` primitive **already exists** at
`webapp/src/components/Card.module.css` and is imported by 35 files — yet 343
bespoke shells were written anyway. The primitives are not the problem; the
bypass is.

**Collapse estimate:** 343 rules × ~5 declarations = ~1,715 lines. A single
`Card` with 4 variants (`flat`, `raised`, `glass`, `inset`) and 3 densities
would be ~60 lines. **~1,650 lines removable (≈6.7% of all CSS).**

### 3.2 Exact-duplicate rule bodies

Byte-identical rule bodies (≥4 declarations) that appear in ≥3 files:

**Cluster A — "flex row, space-between, gap --s-2" — 13 copies:**
```
display:flex; align-items:center; justify-content:space-between; gap:var(--s-2)
```
`views/settings/appearance.module.css:268` `.swatchInfo` ·
`views/plan/plan.module.css:264` `.dayHeadingRow` ·
`views/plan/plan.module.css:321` `.blockHead` ·
`views/timer/FocusStudyHUD.module.css:218` `.scratchpadHeader` ·
`views/timer/timer.module.css:388` `.studyRoomWidgetHeader` ·
`views/premortem/PreMortemHubView.module.css:59` `.sectionHeader` ·
`views/premortem/StressTestRunner.module.css:142` `.questionHeader` ·
`views/premortem/PreMortemRadarView.module.css:182` `.sectionHeading` ·
`views/feynman/FeynmanStudioView.module.css:167` `.misconceptionItemHeader` ·
`views/dashboard/AdaptiveHealthWidget.module.css:182` `.readinessHeader` ·
`views/dashboard/AdaptiveHealthWidget.module.css:257` `.masteryItemHead` ·
`views/dashboard/dashboard.module.css:1063` `.shelfCardTop` ·
`views/review/review.module.css:825` `.sourceDrawerHeader`

**Cluster B — identical but `gap: var(--s-3)` — 7 copies:**
`components/PasswordField.module.css:13` `.labelRow` ·
`components/create/MaterialPanel.module.css:396` `.labelRow` ·
`views/room/room.module.css:367` `.deskHeader` ·
`views/feynman/FeynmanStudioView.module.css:288` `.gaugeHeader` ·
`views/feynman/FeynmanStudioView.module.css:496` `.consoleFooter` ·
`views/dashboard/AdaptiveHealthWidget.module.css:30` `.header` ·
`views/dashboard/dashboard.module.css:1031` `.notebooksShelfHead`

**A and B are the same component with 8px vs 12px gap.** 20 copies, 2 gaps,
13 different class names. This alone is 80 lines that should be one utility.

**Cluster C — "wrap row, gap --s-2" — 6 copies:**
`components/ai/CognitiveCrossLinkBar.module.css:141` ·
`components/create/MaterialPanel.module.css:375` ·
`views/achievements/achievementsModal.module.css:251, 382` ·
`views/library/library.module.css:320` ·
`views/feynman/FeynmanStudioView.module.css:65`

**Cluster D — visually-hidden radio input — 4 copies:**
```
position:absolute; inset:0; opacity:0; margin:0; cursor:pointer
```
`components/create/SubjectPanel.module.css:29` ·
`components/create/formShared.module.css:81` ·
`views/timer/timer.module.css:57` ·
`views/exams/exams.module.css:274`

**Cluster E — segmented control option — 3 copies, 11 declarations each:**
`components/create/formShared.module.css:65` ·
`views/timer/timer.module.css:41` ·
`views/exams/exams.module.css:258`
All three carry the off-scale `padding: 9px 8px`. `formShared.module.css` is
*already* a shared file — two views declined to import it.

**Cluster F — "wrap row, space-between, gap 0.5rem" — 3 copies, all inside one file:**
`views/debugger/CognitiveDebuggerView.module.css:264, 308, 346`

**Cluster G — section title — 3 copies:**
`font-family:var(--font-head); font-size:var(--fs-md); font-weight:700; margin:0`
`views/review/review.module.css:413, 718, 976`
and again as `color:var(--text)` variant at
`views/debugger/CognitiveDebuggerView.module.css:235, 381, 422`.

### 3.3 The recurring UI patterns, by count

Rules whose selector names them (first selector in the list):

| Pattern | Rules | Files | Shared primitive exists? | Adoption |
|---|---|---|---|---|
| pill / chip / badge / tag | **202** | 38 | `components/Chip.module.css` | **3 views** |
| section header / heading | **116** | 43 | `components/PageHeader.module.css` | **3 views** |
| stat / metric / kpi | **112** | 25 | none | — |
| card | **105** | 37 | `components/Card.module.css` | 35 files |
| empty state | **44** | 20 | `components/EmptyState.module.css` | **8 views** |
| toolbar | **42** | 7 | none | — |
| skeleton | 7 | 2 | `components/Skeleton.module.css` | ok |

Worst adoption gaps:
- **Chip**: `components/Chip.tsx` is imported by exactly three files
  (`views/dashboard/NextExamCard.tsx`, `DailyDrillCard.tsx`, `StreakCard.tsx`),
  while 202 chip-shaped rules exist across 38 CSS files. Heaviest re-rollers:
  `views/achievements/achievementsModal.module.css` (25 rules),
  `views/review/review.module.css` (18), `views/exams/examPrepModal.module.css` (10).
- **PageHeader**: imported by 3 views (`premortem/PreMortemHubView.tsx`,
  `premortem/PreMortemRadarView.tsx`, `friends/FriendsView.tsx`) against 116
  header rules in 43 files. **19 of 22 view folders roll their own page header.**
- **EmptyState**: imported by 8 views, all but one of them under
  `views/library/` and `views/notes|review|friends`. The whole Study Lab
  (graph, debugger, feynman, premortem) re-rolls it.

**Collapse estimate for §3.3:** 202 chip rules ≈ 700 lines → ~90; 116 header
rules ≈ 450 lines → ~50; 44 empty-state rules ≈ 190 lines → ~30. Plus §3.1's
1,650. **Total recoverable: ~4,000–4,800 lines, 16–20% of the CSS.**

### 3.4 Button: 197 raw `<button>` elements

`components/Button.tsx` is imported by 58 files, yet there are **197 raw
`<button>` tags** in `views/` + `components/`. Worst offenders:

```
17  views/notebooks/NotebookStudioView.tsx
13  views/review/ReviewView.tsx
 9  views/graph/ConceptNodeDrawer.tsx
 9  views/graph/ConceptGraphView.tsx
 7  views/premortem/StressTestRunner.tsx
 6  views/timer/FocusStudyHUD.tsx
 6  views/tasks/TaskItem.tsx
 6  views/settings/CustomThemeStudio.tsx
 6  views/library/SubjectDetailPage.tsx
```

Each raw button carries its own hand-written CSS, which is where a large share
of the 57 border variants and the off-scale paddings come from.

### 3.5 JSX duplication

**Four AI study surfaces share an identical shell.** `views/graph`,
`views/debugger`, `views/feynman`, `views/premortem` each mount
`components/ai/CognitiveCrossLinkBar` and each implement their own hub → runner
→ debrief page structure. Combined: 9,850 non-test lines across 4 folders and
9 routes. See `REDUNDANCY_MAP.md` §2.

**Inline styles: 233 occurrences** of `style={{` in `.tsx`, bypassing CSS
Modules entirely:
```
42  views/notebooks/NotebookStudioView.tsx
23  views/notebooks/NotebooksHubView.tsx
21  views/graph/ConceptNodeDrawer.tsx
16  views/feynman/FeynmanDebriefView.tsx
12  views/analytics/StudyAnalyticsView.tsx
11  views/feynman/FeynmanStudioView.tsx
 9  views/premortem/PreMortemRadarView.tsx, PreMortemHubView.tsx, debugger/CognitiveDebuggerView.tsx
```
`views/notebooks/` alone has 65 inline-styled elements — a third of the whole
app's. Example: `views/dashboard/RecentNotebooksShelf.tsx:23`
`style={{ fontSize: "var(--fs-xs)" }}` — a token reached through an inline
style, which is the CSS-Modules equivalent of giving up.

**Duplicate hook module:** `webapp/src/views/room/useStudyRoom.ts` is a 5-line
re-export of `webapp/src/hooks/useStudyRoom.ts` (657 lines). Two import paths
for one hook; `views/room/StudyRoomView.tsx:3` uses the shim,
`views/timer/TimerView.tsx:11` and `views/dashboard/StudyCircleCard.tsx:6` use
the real one, and the test files are split across both.

---

## 4. Token drift and dead tokens

**Good news, stated plainly: the token layer is healthy.** 100 custom
properties defined across `tokens.css` + `themes.css`; 92 are referenced.
Zero view files shadow a global token. Only four module-local custom properties
exist and all are legitimate component APIs (`--chip-color`, `--chip-soft`,
`--chip-on` in `components/Chip.module.css`; `--btn-sheen` in
`components/Button.module.css`).

### 4.1 Dead tokens (8)

| Token | Defined at | Verdict |
|---|---|---|
| `--command-bar-clearance` | `tokens.css:9` | **SEVERE — see §6.1.** Defined explicitly to reserve room for the fixed command bar, never applied. |
| `--measure: 68ch` | `tokens.css:157` | Dead. No view constrains line length; long prose runs the full container width. |
| `--shadow-accent` | `tokens.css:135` | Dead — every accent glow is hand-written instead. |
| `--glass-highlight` | `tokens.css:85` | Dead. |
| `--primary-hover` | `tokens.css:35` | Dead (`--accent-hover` used directly). |
| `--tracking-normal` | `tokens.css:163` | Dead (correct — it's `0em`). |
| `--tracking-wider` | `tokens.css:165` | Dead. |
| `--tracking-widest` | `tokens.css:166` | Dead. |

`--measure` and `--command-bar-clearance` are the two that matter — both were
written to solve a real layout problem and then never wired up.

### 4.2 Values hardcoded despite having a token

- **~398 spacing values** that exactly equal an `--s-*` step (§2.2).
- **Radius**: 9× `9999px` and 2× `999px` where `--r-pill` exists; 7× `4px` =
  `--r-xs`; 5× `12px` = `--r-md`; 3× `8px` = `--r-sm`.
- **Blur**: `tokens.css:186-190` adds `--blur-scrim: 4px` and
  `--blur-strong: 32px` with a comment saying the literal `blur(12px)`/
  `blur(16px)` in the view modules "should collapse onto" `--glass-blur`. They
  have not.
- **Semantic colours**: 6 hardcoded rgba borders reproduce `--success`,
  `--warning`, `--danger` (§1.5) and therefore break in dark mode.
- **Motion**: `--t-fast: 140ms`, `--t: 260ms`, `--t-slow: 400ms` exist. Actual
  transition durations in use: `0.15s`(18), `140ms`(11), `0.2s`(11), `0.3s`(8),
  `1s`(5), `0.6s`(4), `0.1s`(2), `0.08s`(2), `0.5s`, `0.4s`. **Only 11 of 63
  use the token.** `0.15s` and `140ms` are 10ms apart and both mean "fast" —
  that difference is imperceptible individually but guarantees that two
  adjacent hover animations never land together.
- **Type**: `font-size` is well-tokenised (only 8 hardcoded px). `font-weight`
  is not: 700(245), 600(190), 800(40), 500(34), **650(12)**, **750(3)**,
  400(2), `bold`(1), 900(1). There are no weight tokens at all, and 650/750
  are variable-font weights that will render as 700 on any static fallback in
  the `--font` stack (`tokens.css:143`) — so those 15 rules are silently
  inconsistent depending on whether Plus Jakarta Sans loaded.

### 4.3 Phantom tokens

Six `var()` references to properties that are defined nowhere — see §2.3.
`--s-7` is the one that causes visible breakage.

---

## 5. The "generic AI look" indictment

Verdict per cliché. **Load-bearing** = removing it would lose real information
or hierarchy. **Decoration** = pure cost.

### 5.1 Glassmorphism — 85 `backdrop-filter` declarations · MOSTLY DECORATION

```
12  views/room/room.module.css              4  views/notes/notes.module.css
10  views/graph/graph.module.css            3  views/tasks/tasks.module.css
 6  components/chat/chat.module.css          2  x11 files
 5  views/exams/exams.module.css             1  views/not-found/NotFoundView.module.css
 4  timer/FocusStudyHUD, settings/appearance, room/StudyRoomView, review
```

**Load-bearing (8):** overlays that genuinely float over scrolling content and
need to stay legible — `components/Modal.module.css`,
`components/command/CommandPalette.module.css`,
`components/OfflineBanner.module.css`, `components/AppShell.module.css`,
`views/dashboard/commandBar.module.css`, `views/timer/MiniTimer.module.css`,
`views/timer/FocusStudyHUD.module.css`, `context/ToastProvider.module.css`.

**Decoration (~77):** blur applied to *in-flow cards inside a page*. Blurring a
card that sits on a flat `--bg` produces no visual difference from a solid
fill — it costs a compositor layer and a repaint per scroll frame for nothing.
`views/room/room.module.css` blurs 12 separate in-page elements. `views/graph`
blurs 10. **Kill all 77.** This is the single cheapest performance win in the
app and it will change nothing visually except making light-mode borders
readable (§1.3 — the glass borders only ever made sense *because* of these).

### 5.2 `linear-gradient(135deg, …)` — 41 of 65 gradients · DECORATION

**63% of every gradient in the app is at the same 135° angle.** The others:
90deg (5), 165deg (1). Uniform 135° across an entire app is the textbook
signature of generated CSS — a real design system varies the angle with the
element's aspect ratio or does not gradient at all.

`--gradient-primary` (`tokens.css:36-40`) is itself `linear-gradient(135deg, …)`,
so the token endorses it. **Load-bearing: 1** (the primary button fill).
**Decoration: 40.**

### 5.3 Gradient text — 5 declarations · DECORATION, DELETE ALL

`background-clip: text` in:
- `views/room/StudyRoomView.module.css`
- `views/room/room.module.css`
- `views/not-found/NotFoundView.module.css`

Gradient text is unselectable-looking, fails high-contrast mode, and cannot be
contrast-audited. Three files, five rules. No information is carried.

### 5.4 Emoji as UI iconography — 85 occurrences in 40 non-test `.tsx` files · DECORATION

The app has a real icon system (`components/Icon.tsx`, `components/icons.tsx`)
and uses it heavily. It *also* ships 85 raw emoji in JSX:

```
13  views/room/StudyRoomView.tsx          4  views/premortem/StressTestRunner.tsx
12  views/feynman/FeynmanStudioView.tsx   4  views/graph/ConceptNodeDrawer.tsx
 9  views/notebooks/NotebookStudioView.tsx 4  views/feynman/FeynmanDebriefView.tsx
 8  views/review/ReviewView.tsx            4  components/OfflineBanner.tsx
 6  views/room/StudyDeskCard.tsx           3  views/quiz/QuizReview.tsx
 6  views/notes/InlineAiToolbar.tsx        2  tasks/TasksView, TaskItem, DashboardTasksWidget,
                                              settings/NotificationsTab
 1  components/icons.tsx  <-- an emoji inside the icon module itself
```

Emoji render as full-colour vendor glyphs that ignore `currentColor`, do not
respond to the accent preset, sit on a different optical baseline than the
Lucide-style line icons next to them, and change appearance across OS. Mixing
them with a real icon set in the same row is the loudest single "AI wrote this"
tell in the product. `components/icons.tsx` containing an emoji means the icon
abstraction itself has been contaminated.

**Verdict: replace all 85 with `Icon` entries.** Zero are load-bearing.

### 5.5 Pill-shaped everything — 121 `--r-pill` + 11 hardcoded 999/9999px

132 fully-rounded elements. Pill radius is a *semantic* shape — it should mean
"this is a tag/status/toggle." At 132 uses it is applied to buttons, inputs,
chips, badges, progress tracks, the command bar, and card corners
indiscriminately, so it means nothing. Against 144 `--r-md` and 88 `--r-sm`,
the pill is the **second most common radius in the app**.

### 5.6 Three-tier drop shadows — 297 `box-shadow`, 71 distinct values

`--shadow-sm`/`-md`/`-lg` (`tokens.css:125-134`) are each a 2–3 layer stack.
297 shadow declarations across only **71 distinct values** means most are
tokenised — but 71 distinct shadows is still ~65 more than a design system
needs. Combined with the 85 `backdrop-filter`s, a typical Learnora card is
carrying: a blur, a border, a 3-layer shadow, and a gradient. That stack is the
"expensive-looking but cheap" effect the owner is describing.

### 5.7 Uniform radii with no hierarchy

`--r-xs 4 / --r-sm 8 / --r-md 12 / --r-lg 16 / --r-xl 20 / --r-2xl 24` — a
perfectly even 4px ramp with no jump between "small thing" and "big surface."
`--r-2xl` is used **twice**. In practice the app uses md(144), pill(121),
sm(88), lg(63), xl(32) — five radii on similar-sized elements, so nesting a
`--r-md` child in a `--r-lg` parent (a 4px difference) reads as a mistake
rather than a hierarchy. A system that jumped 4 → 10 → 20 would read as
intentional; a 4/8/12/16/20/24 ramp reads as generated.

### 5.8 Centred empty state with a big glyph and two lines

Confirmed as a repeated template. `.emptyIcon` + `.emptyTitle` + `.emptySubtitle`
+ `text-align: center` appears at:
`views/room/room.module.css:985-1038` (icon at `--accent-glow`, title `--fs-lg`,
subtitle `--fs-sm`), `views/plan/plan.module.css:519-551`,
`views/graph/graph.module.css:710-725` (title `--fs-xl`),
`views/feynman/FeynmanHubView.module.css:416-424` (icon at **`--fs-stat`** —
a 30–44px glyph), `views/achievements/achievementsModal.module.css:470`,
`views/dashboard/AdaptiveHealthWidget.module.css:364`,
`views/review/review.module.css:707`,
`views/debugger/CognitiveDebuggerView.module.css:460`.

Eight copies. Titles at `--fs-lg` in one view and `--fs-xl` in another; icon
colour `--accent-glow` in one and `--accent-text` in another (`plan:531`).
`--accent-glow` is a **35%-alpha shadow colour** (`tokens.css:23`) being used as
a foreground fill — it will be barely visible.

### 5.9 What should die, ranked

1. 77 decorative `backdrop-filter`s — pure cost, and they are the reason the
   invisible `--glass-border` idiom exists.
2. 85 emoji in JSX — loudest tell, cheapest fix, app already has icons.
3. 40 decorative `linear-gradient(135deg)` — keep only `--gradient-primary`.
4. 5 gradient-text rules.
5. ~65 of the 71 bespoke shadows.

**Load-bearing and worth keeping:** the token system itself, `--gradient-primary`
on the primary button, the 8 overlay glass surfaces, `--r-pill` *if* restricted
to status/tag elements only.

---

## 6. Real visual bugs

### 6.1 SEVERE — the fixed command bar overlaps page content

`webapp/src/views/dashboard/commandBar.module.css:12-32`:
```css
position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
z-index: 850; width: min(540px, 75vw); padding: 10px 18px;
```
`webapp/src/styles/tokens.css:7-9` defines the fix and documents it:
```css
/* Vertical room the fixed "Ask AI" command bar needs at the end of a
   scrolling view: its 28px bottom offset + ~56px height + breathing room. */
--command-bar-clearance: 104px;
```
**`--command-bar-clearance` is referenced nowhere in the codebase.** The
dashboard's own bottom padding is `var(--s-8)` = 32px
(`views/dashboard/dashboard.module.css:6`), i.e. 72px short. The last card on
every scrolling view sits under the command bar. This is a one-line fix with
the token already written.

### 6.2 SEVERE — z-index has no scale; four tiers collide

44 `z-index` declarations, 24 distinct values, no named layer tokens. Full map:

| z | Location | Positioning |
|---|---|---|
| **10000** | `components/Modal.module.css:9` | fixed |
| **10000** | `components/AppShell.module.css:20` | fixed |
| **9999** | `context/ToastProvider.module.css:11` | fixed |
| **9999** | `components/OfflineBanner.module.css:11` | fixed |
| **9999** | `components/command/CommandPalette.module.css:6` | fixed |
| **9999** | `views/room/room.module.css:883` | fixed |
| 9000 | `views/room/room.module.css:929` | fixed |
| 4300 / 4200 / 4100 | `views/notes/notes.module.css:315 / 161 / 428` | fixed |
| 1000 | `components/chat/chat.module.css:14` | fixed |
| 1000 | `views/review/review.module.css:951` | fixed |
| 1000 | `views/analytics/analytics.module.css:350` | fixed |
| 990 / 985 | `views/timer/FocusStudyHUD.module.css:206 / 7` | fixed |
| **985** | `views/timer/MiniTimer.module.css:10` | fixed |
| 850 | `views/dashboard/commandBar.module.css:17` | fixed |
| 200 | `views/room/room.module.css:185` | — |
| 101 / 100 | `views/graph/graph.module.css:399 / 376` | fixed |
| 100 | `components/combobox.module.css:89` | — |
| 50 | `components/Sidebar.module.css:5` | — |
| 40 | `components/AppShell.module.css:66` (@media) | fixed |
| 40 / 20 / 15 / 10 | `views/graph/graph.module.css:342 / 181 / 220 / 28` | — |
| 10 | `views/notes/notes.module.css:42` (sticky), `notebooks:240`, `terms:16` | — |
| 5 | `components/chat/chat.module.css:424`, `views/analytics/analytics.module.css:263` | — |
| −1 | `components/create/MaterialPanel.module.css:18` | — |

Concrete collisions:
- **`Modal` (10000) ties `AppShell` header (10000).** A modal covers the header
  only because it appears later in the stylesheet order. Any change to import
  order in `main.tsx` flips this — the header will paint *over* an open modal.
- **Four different fixed overlays sit at exactly 9999**: toasts, offline
  banner, command palette, and a room overlay. Their relative order is
  undefined and source-order dependent. A toast can be hidden behind the
  command palette.
- **`FocusStudyHUD` (985) ties `MiniTimer` (985)** — both `position: fixed`,
  both timer chrome, both can be on screen at once. Which one wins is
  arbitrary.
- **`commandBar` (850) sits *under* the FocusStudyHUD (985)** — the dashboard's
  primary AI entry point can be covered by the HUD.
- **The 4100/4200/4300 band** in `views/notes/notes.module.css` belongs to no
  scale and was clearly invented for that one file.

### 6.3 SEVERE — flex/grid children will overflow

**841** `display: flex|grid` declarations. **79** `min-width: 0` (or
`min-height: 0`) declarations, in 29 files. A flex/grid item's default
`min-width` is `auto`, so any item containing a long unbreakable string
(a URL, a filename, a concept name, an email) **pushes past its container**
rather than shrinking.

Compounding it:
- Only **9** `overflow-wrap` / `word-break` / `hyphens` declarations in the
  entire 24,541-line stylesheet.
- Only **33** `text-overflow: ellipsis`.
- Only **4** `-webkit-line-clamp`.

For an app whose content is user-supplied notes, subject names, notebook
titles, flashcard fronts and AI-generated concept labels, 9 wrap rules is
effectively zero. **Every card with a user-named title is a layout bomb.**
`views/notebooks/NotebooksHubView.tsx` renders `nb.title` (free text) into a
flex card with no `min-width: 0` on the text column.

### 6.4 MAJOR — 19 breakpoints, no scale, overlapping ranges

```
16x  max-width: 768px      3x  max-width: 520px     1x  max-width: 960px
 9x  max-width: 900px      3x  max-width: 1024px    1x  max-width: 840px
 8x  max-width: 480px      2x  min-width: 640px     1x  max-width: 620px
 6x  max-width: 640px      2x  max-width: 860px     1x  max-width: 580px
 3x  max-width: 760px      2x  max-width: 720px     1x  max-width: 1200px
 3x  max-width: 560px      2x  max-width: 700px     1x  max-width: 1120px
                           2x  max-width: 420px     1x  min-width: 769px
                                                    1x  min-width: 1024px
```

**19 distinct max-width values.** The clusters 760/768 (8px apart), 840/860/900
and 1024/1120/1200 mean that dragging a window from 1200px to 400px triggers
reflows at ~19 different widths, most of them affecting only one view. Nothing
snaps together. `760px` vs `768px` in particular guarantees an 8px window in
which one component has gone mobile and its neighbour has not.

`min-width: 769px` paired with `max-width: 768px` is the only correctly-paired
range in the file; every other breakpoint is a one-sided max-width, so
desktop-only rules are written as "not mobile" overrides rather than a scale.

### 6.5 MAJOR — 159 hardcoded pixel heights

`height: <N>px` appears 159 times. Ones on containers that hold variable text
will clip:

- `views/room/StudyRoomView.module.css:276` — `height: 580px` (and `400px` at
  `:417` under a media query). A fixed-height panel in a room whose participant
  list is dynamic.
- `views/settings/settings.module.css:327` — `height: 64px`
- `components/create/CreateModal.module.css:62` — `height: 52px`
- `components/chat/chat.module.css:92` — `height: 34px`;
  `:376, :394` — `height: 40px`
- `views/settings/appearance.module.css:188` — `height: 42px`
- `views/settings/settings.module.css:232` — `height: 38px`; `:78` `36px`;
  `:160` `32px`

Note the control-height set: 32, 34, 36, 38, 40, 42, 44, 52. **Eight different
control heights**, none tokenised, several within 2px of each other — that is
the "things don't line up" complaint in its purest form. `--touch-target-min:
44px` exists (`tokens.css:174`) and only one of these matches it, so most of
these controls are **below the WCAG 2.5.5 / iOS HIG floor the token was added
to enforce**.

### 6.6 MAJOR — focus states

41 `outline: 2px solid …` against **24 `outline: none` / `outline: 0`** and 58
`:focus-visible` blocks. The ratio is workable, but two problems:

1. `outline: 2px solid var(--accent)` is the near-universal focus ring. On the
   `hacker` preset (`themes.css:` `--accent: #22c55e`) and `forest`
   (`#10b981`), a 2px accent ring on `--surface: #ffffff` is a bright green
   line at ~2:1 contrast — **below the 3:1 WCAG 2.4.11 non-text minimum**.
   `--accent-text` exists precisely to solve this for text (`themes.css` walks
   each preset down in lightness) but the **focus ring does not use
   `--accent-text`** — it uses raw `--accent`. This is a systematic
   accessibility failure across 38 declarations × 12 presets.
2. There is **no `outline-offset`** anywhere. A 2px outline drawn flush against
   a 1px border produces a 3px muddle rather than a legible ring.

### 6.7 MAJOR — `--text-faint` fails WCAG AA everywhere it is used

`--text-faint` is used as a foreground colour **50 times**. Measured contrast:

| Pairing | Ratio | AA (4.5:1) |
|---|---|---|
| light `#9a9384` on `--surface` `#ffffff` | **3.05:1** | FAIL |
| light `#9a9384` on `--bg` `#f6f5f2` | **2.80:1** | FAIL |
| light `#9a9384` on `--surface-2` `#f1efe9` | **2.65:1** | FAIL |
| dark `#64748b` on `--surface` `#111419` | **3.88:1** | FAIL |
| dark `#64748b` on `--surface-2` `#161a20` | **3.67:1** | FAIL |

All 50 uses are at `--fs-xs` (12px) or `--fs-sm` (13px), so the large-text
3:1 exemption does not apply. Three of the five pairings also fail the 3:1
large-text floor. `--text-muted` is fine (5.79:1 light, 7.20:1 dark) — the
faint tier simply has no legal use at body sizes.

`components/EmptyState.module.css:19` puts `--text-faint` on the empty-state
icon, and `views/room/room.module.css:1011` uses `--accent-glow` (a 35%-alpha
*shadow* colour) as an icon fill — both effectively invisible.

### 6.8 MAJOR — `display: none` used 17 times

17 `display: none` declarations, several inside `max-width` media queries
(`components/Sidebar.module.css:283` region,
`views/settings/settings.module.css:490, 557, 563`). Any of these that hides a
control rather than a decoration removes functionality on mobile with no
replacement affordance. Needs a per-instance pass; the count alone is the
flag.

### 6.9 MINOR — decorative layers with `z-index` and no `overflow` guard

`views/dashboard/ResumeLearningCard.module.css:27, 70, 150` all set
`z-index: 1` on content to sit above a decorative layer. Combined with the
broken `border: 1px solid var(--border)` at `:3, :67, :179` (§1.2), this card
has a decorative background layer, no border to contain it, and a rounded
corner. It is the single most-broken component found.

### 6.10 MINOR — `position: fixed` proliferation

21 `position: fixed` declarations across 18 files, plus 4 `position: sticky`.
Six of the fixed elements are anchored to the viewport bottom or edges
(`commandBar`, `MiniTimer`, `FocusStudyHUD`, `chat`, `room:879/922`,
`notes:160/314/427`) and can therefore co-occur. With no shared layer scale
(§6.2) and no clearance token applied (§6.1), any two of them appearing
together is unhandled.

### 6.11 Dark-mode-specific findings

`webapp/src/styles/themes.css` is, on the whole, **the best-engineered file in
the repo** — it documents measured contrast ratios per preset and fixes them
(`:96-105` lifts eight presets' `--accent-on` to ink; `:113-150` walks every
preset's `--accent-text` down for light mode; `:225-280` lifts six accents for
dark mode). Credit where due.

Its gaps:
- `--border` is **not overridden** for dark mode. It resolves through
  `--glass-border-subtle`, which *is* overridden (`:52`), so this happens to
  work — but only because of the shorthand indirection that is broken at 20
  call sites anyway (§1.2).
- `--glass-border` goes from `rgba(255,255,255,0.7)` (light) to
  `rgba(255,255,255,0.1)` (dark) — a **7× alpha change**. Every one of the 70
  elements using it has a dramatically different border weight between themes.
  In dark mode 0.1 white ≈ the 0.08 of `--line` and the 0.06 of
  `--glass-border-subtle`, so the three idioms are indistinguishable; in light
  mode 0.7 white is invisible while `--line` (0.06 black) and
  `--glass-border-subtle` (0.08 black) are faintly visible. **The border system
  only "works" in dark mode.**
- The 11 hardcoded semantic rgba borders (§1.5) are frozen at light-mode values
  and do not follow the dark overrides at `themes.css:21-30`.
- `--text-faint` fails AA in dark mode too (§6.7).

---

## Top 20 fixes, ranked by visual impact per line changed

| # | Sev | Fix | Lines | Evidence |
|---|---|---|---|---|
| 1 | SEVERE | Replace `border: 1px solid var(--border)` → `border: var(--border)` (or change the token to a colour). 20 elements currently render **no border**. | **20** | §1.2 — `notebooks.module.css` ×14, `ResumeLearningCard` ×3, `dashboard:1057`, `notifications:6`, `CognitiveCrossLinkBar:168` |
| 2 | SEVERE | Define `--s-7: 28px` (or retarget the 3 refs). Notebooks hub gap and Tasks margin are currently **0**. | **1** | §2.3 — `notebooks:9`, `tasks:126`, `dashboard:12` |
| 3 | SEVERE | Apply `padding-bottom: var(--command-bar-clearance)` to scrolling views. Token exists and is unused; last card is under the command bar. | **~3** | §6.1 — `tokens.css:9`, `commandBar.module.css:12` |
| 4 | SEVERE | Introduce z-layer tokens; fix the 10000/10000 modal-vs-header tie and the four-way 9999 collision. | **~25** | §6.2 |
| 5 | SEVERE | Retire `--glass-border` on opaque surfaces (9 confirmed sites, 70 total) → `--line`. Restores visible borders in light mode. | **~70** | §1.3 |
| 6 | MAJOR | Delete the 5 malformed decls (`border: rgba(...)`, `border-color: var(--border)` ×3). | **5** | §1.2, §1.5 |
| 7 | MAJOR | Darken `--text-faint` to clear 4.5:1 in both themes. 50 uses, currently 2.65–3.88:1. | **2** | §6.7 |
| 8 | MAJOR | Point the focus ring at `--accent-text` instead of `--accent`, and add `outline-offset: 2px`. Fixes 38 rings × 12 presets. | **~40** | §6.6 |
| 9 | MAJOR | Delete 77 decorative `backdrop-filter`s (keep the 8 overlay ones). Perf + light-mode legibility. | **~154** | §5.1 |
| 10 | MAJOR | Replace 85 JSX emoji with `Icon`. Loudest "AI look" signal. | **~85** | §5.4 |
| 11 | MAJOR | Add `min-width: 0` to the ~50 flex/grid text columns holding user content. 841 flex containers, 79 guards. | **~50** | §6.3 |
| 12 | MAJOR | Collapse the 3 segmented-control copies onto `formShared.module.css`; fix `padding: 9px 8px`. | **−22** | §3.2 Cluster E |
| 13 | MAJOR | Collapse Clusters A+B (20 copies of the same header row) into one utility. | **−80** | §3.2 |
| 14 | MAJOR | Adopt `EmptyState` in the 12 views that re-roll it; kill 10 different paddings. | **−160** | §2.4, §3.3 |
| 15 | MAJOR | Adopt `Chip` in the 38 files with bespoke pills (202 rules). | **−600** | §3.3 |
| 16 | MAJOR | Adopt `PageHeader` in the 19 views that re-roll it (116 rules). | **−400** | §3.3 |
| 17 | MAJOR | Collapse the 343 card shells (289 signatures) onto `Card` + 4 variants. Biggest single win. | **−1650** | §3.1 |
| 18 | MAJOR | Consolidate 19 breakpoints → 4 (480/768/1024/1440). | **~60** | §6.4 |
| 19 | MINOR | Tokenise control heights (32–52px, 8 values) onto a 3-step scale ≥ `--touch-target-min`. | **~30** | §6.5 |
| 20 | MINOR | Replace 40 decorative `linear-gradient(135deg)`; delete 5 gradient-text rules; port the 90 `rem` values in `views/debugger/` to `--s-*`. | **~135** | §5.2, §5.3, §2.1 |

**Items 1–3 are one-line fixes for genuinely broken rendering and should ship
before anything else.** Items 12–17 remove roughly **2,900 lines of CSS**
without changing a single intended pixel.
