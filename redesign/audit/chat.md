# Chat batch — 3 files (audit-only, do not redesign)

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/components/chat/` (TurboChat.tsx, ChatMessage.tsx, chat.module.css, ~900
lines + 876-line test file)
Redesign status: N/A — preserve the distinct glass/purple-accent styling as-is. Audit is for
documentation/awareness only, not a redesign target.

## TurboChat / ChatMessage (components/chat/)

- Route: not routed — a floating panel mounted over the app.
- Related files: `chat.module.css` (420 lines), `TurboChat.tsx` (337), `ChatMessage.tsx` (146),
  `TurboChat.test.tsx` (876 — the largest test file in the app)
- Header: N/A — the panel has its own internal chat header, not a page header.
- Card usage: **4 glass-shell declarations**, all in the floating-surface tier:
  - `.panel` (`:12-30`) — `position: fixed; z-index: 1000`, `--glass-bg-strong`, hardcoded
    `blur(24px)`, `border-radius: 20px` as a literal, and a **fully hardcoded box-shadow**
    (`0 20px 40px rgba(0,0,0,0.6)`, `inset 0 1px 0 rgba(255,255,255,0.2)`) rather than the
    `--shadow-lg`/`--glass-inner` tokens.
  - `:140` and `:301` — Recipe B (`--glass-inner` + `--shadow-sm`)
  - `:297-300` — the chat dock input surface, using `--glass-blur` properly
  - Card primitive confidence: **N/A — do not migrate.** Explicitly on the preserve list.
- Spacing: **21 hardcoded px — the single worst module in the app.** Consistent with its status
  as a preserved, independently-styled surface, but recorded here so the app-wide spacing
  numbers in DESIGN_MOVES.md are not misread: if `chat/` is excluded (as it should be, being
  out of scope), the app's spacing-drift totals drop by about a fifth.
- Accent usage: 15 references. **The "purple" in "glass/purple styling" is no longer literal**
  — `:120-125` carries a comment recording that the assistant bubble's fixed indigo `#6b7ee8`
  was deliberately replaced with `linear-gradient(135deg, var(--accent), var(--accent-hover))`
  so the bubble follows the user's chosen preset ("Hacker's green, Sunset's orange, …").
  **The preserve rule as written in REDESIGN_LEDGER.md ("the AI chat's distinct glass/purple
  styling") describes a state the code has already moved past.** Worth correcting in the ledger
  so a future session does not "restore" a hardcoded indigo in the name of preservation.
- Distinctive/preserve:
  - The whole batch, per the ledger's ground rules.
  - Two `rgba(255,255,255,0.02)` surfaces (`:51`, `:349`) — near-invisible white washes that
    only do anything on the dark theme. Same class of dark-only literal the other ported
    modules replaced with tokens; left alone here because the batch is out of scope.
  - `border-radius: 20px` (`:22`) and `8px` (`:210`) as literals where `--r-lg` and `--r-xs`
    are the exact same values.
  - The file comment (`:1-10`) records two deliberate drops from the vanilla: the
    `!important` run on `.ai-modal.fullscreen`, and `.ai-modal.streaming` (the whole-panel
    streaming glow), because "the in-bubble thinking dots already say that, in the one place
    the student is looking". Good reasoning to keep visible.
- Accessibility: `prefers-reduced-motion` at `:196` covers the thinking-dots animation.
  `z-index: 1000` puts the panel above the CommandBar's `850` — correct stacking, and worth
  noting alongside the notes-sidebar comment (`notesSidebar.module.css:9-14`) explaining that
  the vanilla needed a rule to hide the command bar behind the notes AI panel, which React does
  not need because CommandBar is dashboard-only.
- Responsive: only `prefers-reduced-motion`. The panel sizes itself with
  `clamp(300px, 90vw, 420px)` / `clamp(420px, 70vh, 640px)` — intrinsic, no queries needed.
- Test file: `TurboChat.test.tsx` (876 lines). No `.closest()`, no `.className` assertions, no
  snapshots. Well-insulated.
- Design-move tags: **all N/A — preserved batch.** Evidence from this batch is recorded for
  awareness but must **not** be counted toward the "MEDIUM+ in 3 or more batches" threshold that
  promotes a hypothesis to an approved move, since no move will ever be applied here.
- Issues found (severity): **none actionable** (out of scope by design). Two documentation
  corrections for the ledger:
  - The preserve rule's wording ("glass/purple styling") is stale — the purple was intentionally
    replaced with the user's accent at `chat.module.css:120-125`.
  - `chat/` contributes 21 of the app's hardcoded-px count while being permanently out of scope;
    spacing-conformance metrics should exclude it.
- Redesign status: N/A
