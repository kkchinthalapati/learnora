# Design Moves

Status: HYPOTHESES ONLY — not yet approved. Do not apply any move below beyond the flagship
proof-of-concept until this file has a line reading `Status: APPROVED <date>` at the top.

A move only survives from hypothesis to approved if audit evidence (see `redesign/audit/*.md`
design-move tags) shows MEDIUM+ confidence in 3 or more batches. Anything weaker stays a
per-view note in that batch's audit file — it does not become a systemic move applied
everywhere.

## Hypotheses (seeded from initial exploration, to confirm/kill during Phase 2 audit)

### 1. Card primitive
Extract the repeated glass-shell CSS (`background: var(--glass-bg); backdrop-filter: blur(var(--glass-blur)) var(--glass-saturate); border: 1px solid var(--glass-border); border-radius: var(--r-xl|--r-lg); box-shadow: var(--glass-inner), var(--glass-inner-bottom), var(--shadow-md);`) into a shared `<Card>` component.
- Confidence going in: **HIGH** — confirmed duplicated 4+ times in `dashboard.module.css` alone, also seen in exams/notes/library/settings.
- Evidence batches: (fill in during audit)

### 2. PageHeader primitive
Extract the repeated `<div className={styles.pageHeader}><h1>` + matching CSS into a shared `<PageHeader>` component.
- Confidence going in: **HIGH** — confirmed duplicated in tasks/timer/settings/exams/dashboard.
- Note: Notes and Library deliberately use a toolbar pattern instead (split-pane views) — that
  is a decision to preserve, not a gap to fix.
- Evidence batches: (fill in during audit)

### 3. Spacing-scale conformance
Snap hardcoded px paddings (found off the `--s-*` scale, e.g. dashboard's `16px 20px`, `20px 24px`) onto the scale, or explicitly document why each is an intentional micro-adjustment.
- Confidence going in: **MEDIUM** — needs full audit to know if this is 3 instances or 30.
- Evidence batches: (fill in during audit)

### 4. Accent restraint
Audit whether accent-colored text/glow/gradient (seen 4x on Dashboard alone: stat numbers, countdown, today-badge glow, hover states) reads as tasteful across all 13 accent presets + custom studio, or needs dialing back on some screens.
- Confidence going in: **LOW / exploratory** — must be re-checked against multiple presets, not just default teal.
- Evidence batches: (fill in during audit)

### 5. Header action-affordance
Every current PageHeader is header-only (no actions slot). Consider promoting primary actions (e.g. "New exam") next to the h1 rather than burying them in a toolbar below.
- Confidence going in: **LOW / exploratory**.
- Evidence batches: (fill in during audit)

### 6. Empty/loading/error visual polish
Structurally consistent already (Skeleton/EmptyState/`role="alert"` used everywhere) but not yet judged for visual *quality* rather than just presence/consistency.
- Confidence going in: **exploratory**.
- Evidence batches: (fill in during audit)

## Approved moves (Phase 3 output — empty until synthesis)

(none yet)

## Sign-off

Status: PENDING
