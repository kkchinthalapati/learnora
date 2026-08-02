# Notes batch — 3 files

Status: AUDITED (2026-08-02) — code audit complete; screenshots not captured (see dashboard.md).
Source: `webapp/src/views/notes/`
Note: uses a toolbar pattern instead of PageHeader (split-pane view) — deliberate, not a gap.
**Confirmed deliberate by this audit** — see Header below.

## NotesView (views/notes/NotesView.tsx)

- Route: `/notes/:materialId`
- Related files: `notes.module.css`, `NotesEditorPane.tsx`, `NotesAiSidebar.tsx` +
  `notesSidebar.module.css` (Step 25)
- Header: **uses toolbar, no `.pageHeader`** — `NotesEditorPane.tsx:142-166`, styled by
  `notes.module.css:38-51`. The toolbar is `position: sticky; top: 0` and carries the material
  title + save status + actions. This is the correct pattern for a full-height editing surface
  (a `.pageHeader` would eat vertical space the Quill pane needs) — **preserve, do not migrate
  to PageHeader**. The DESIGN_MOVES.md note about this is confirmed, not merely assumed.
  NotesView itself is a route wrapper that renders only loading/error/not-found states.
- Card usage: **2 glass-shell declarations**, and neither is a plain `.card`:
  - `.editorPane` (`notes.module.css:88-100`) — full glass shell, `--r-xl`, but
    `box-shadow: … var(--shadow-sm)` (dashboard uses `--shadow-md`) and, critically,
    `overflow: hidden` with the comment "Quill has its own scroll".
  - `.toolbar` (`:38-51`) — **partial** shell: `background: var(--glass-bg)` +
    `backdrop-filter: blur(12px)` only. No border, no shadow, hardcoded 12px blur against
    `--glass-blur: 18px`. This is the `flat` variant in the PRIMITIVES contract.
  - `notesSidebar.module.css` adds `.card` (`:41-56`) — a *quick-action* card that is
    `--surface-2` + `--glass-border-subtle`, no blur at all. This is the `subtle` variant.
  - Card primitive confidence: **MEDIUM** for this batch. All three shells are real, but all
    three are *different variants*, and none is the canonical dashboard `.card`. This batch is
    evidence for the variant API, not for the default shell.
- Spacing: **21 hardcoded px across the two modules** (3 in `notes.module.css`, 18 in
  `notesSidebar.module.css` — the second-worst offender in the app).
  - `notes.module.css`: `:23` `gap: 24px`, `:25` `margin-top: 16px`, `:45` `padding: 12px 24px`
    — all three are on-scale values written as literals. Pure token swap, zero visual delta.
  - `notesSidebar.module.css` is where the real drift is: `gap: 16px` (`:23`), `gap: 10px`
    (`:35`), `padding: 14px 12px` (`:45`), `gap: 8px`, `gap: 6px`, `margin-top: 2px`,
    `padding: 2px 6px`, `padding: 20px`, `gap: 12px`, `margin: 2px 0 0`, `margin-top: 16px`,
    `padding: 7px 12px`. **`14px`, `10px`, `7px`, `6px`, `2px` are off the `--s-*` scale
    entirely.** This module is the newest in the app (Step 25) and never adopted the scale.
- Accent usage: 1 in `notes.module.css` (`.title` accent text), 13 in `notesSidebar.module.css`
  (card hover/active fills, chat affordances). Restrained on the document pane, which is right —
  the editor content should not compete with chrome.
- Distinctive/preserve:
  - `.editorPane`'s `overflow: hidden` is load-bearing for Quill's internal scroll. Any `<Card>`
    swap must keep it — the PRIMITIVES contract already flags this.
  - The AI sidebar's styling is adjacent to, but not the same as, `components/chat/*`. The
    preserve rule names `components/chat/*` specifically; `notesSidebar.module.css` is **not**
    covered by it and is a legitimate redesign target.
- Accessibility: `role="alert"` on load error; `aria-busy` on the loading skeleton; the sidebar's
  `.card:focus-visible` has its own accent ring (`notesSidebar.module.css:62-65`). Save-status is
  rendered as a text span (`NotesEditorPane.tsx:151`) — worth checking in Phase 4 whether it
  carries an `aria-live` region, since it is the only feedback that a save happened.
- Responsive: `@media (max-width: 900px)` twice in `notes.module.css` (`:28-36` collapses the
  split to a column and drops the fixed height; `:102-106` gives the editor `min-height: 55vh`)
  and once in `notesSidebar.module.css`. Coherent, and 900px is shared only with `plan`.
- Test file: `NotesView.test.tsx` + `NotesAiSidebar.test.tsx`. **No `.closest()`, no `.className`
  assertions, no snapshots** — the safest batch in the app for a class-name swap.
- Design-move tags: [card-primitive: MEDIUM] [pageheader-primitive: N/A — toolbar by design]
  [spacing-scale: HIGH] [accent-restraint: LOW] [header-actions: N/A] [empty-loading-polish: LOW]
- Issues found (severity):
  - **MEDIUM — `notesSidebar.module.css` ignores the spacing scale.** 18 hardcoded px values,
    five of them (14/10/7/6/2) off-scale. Newest module in the app, written after the token
    system was finished. This is the single clearest spacing-conformance target.
  - **LOW — three different blur values in one view.** `--glass-blur` (18px) on `.editorPane`,
    hardcoded `12px` on `.toolbar`, none on the sidebar cards. Intentional layering is plausible
    but undocumented.
  - **LOW — `.editorPane` uses `--shadow-sm` where dashboard's `.card` uses `--shadow-md`.**
    Feeds the variant question rather than being a defect on its own.
- Redesign status: TODO
