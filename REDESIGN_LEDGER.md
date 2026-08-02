# Learnora Redesign Ledger

Last updated: 2026-08-02 — batch 2 of 15 (notes) audited

This is the master index for the Learnora visual/UX redesign. It is kept deliberately small —
findings live in `redesign/audit/<batch>.md`, not here. A cold session (no memory of prior
conversations) should be able to resume this project using only this file plus the codebase.

## How to resume (read this first)

1. Read this file fully (it's short by design).
2. Read `redesign/DESIGN_MOVES.md` for the agreed direction — do not invent new design moves;
   only ones recorded there with a "Status: APPROVED" line and date are real.
3. Find the next row below with a status that isn't done, open its `redesign/audit/<batch>.md`.
4. Do NOT re-audit a batch marked AUDITED. Do NOT re-apply a batch marked APPLIED/VERIFIED
   without first checking whether DESIGN_MOVES.md changed since.
5. Full plan/rationale: see the plan this ledger was created from (context recap in this file's
   companion doc `redesign/PRIMITIVES.md` and `redesign/DESIGN_MOVES.md` — those two plus this
   file are the complete resumable state).

## Ground rules (carried from the approved plan — do not violate these)

- This is a visual/UX pass, not a rewrite. Preserve all business logic and the 927+ existing
  tests (run scoped `npm test` after every redesign change, before moving to the next batch).
- `webapp/src/styles/tokens.css` and `themes.css` are a finished, AA-contrast-audited API —
  consume them, don't redesign them.
- Preserve, do not erase: the AI chat's distinct glass/purple styling (`components/chat/`),
  the 13 accent presets + Custom Theme Studio, exam-difficulty color coding, the flashcard
  flip interaction.
- Never touch `components/chat/*` or `components/create/*` internals during rollout unless an
  audit specifically flags card-shell duplication inside them.
- Tests query by role/text/testid, which is what makes class-name swaps safe — EXCEPT where a
  test uses `.closest("div")` or similar DOM-depth-sensitive queries (confirmed present in
  `DashboardView.test.tsx`). Check each batch's test file for this before assuming a primitive
  swap is safe.

## Phase status

- [x] Phase 0 — Plan approved
- [x] Phase 1 — Ledger scaffold created
- [ ] Phase 2 — Full audit (all 15 batch rows AUDITED)
- [ ] Phase 3 — Design moves synthesized + user sign-off (see `redesign/DESIGN_MOVES.md`)
- [ ] Phase 4 — Card/PageHeader primitives built + proven on Dashboard (tests green)
- [ ] Phase 5 — Flagship 3-screen sign-off (Dashboard, Notes, Exams) — user must approve before Phase 6
- [ ] Phase 6 — Full rollout (remaining 12 batches)
- [ ] Phase 7 — Final consistency pass + full test suite + lint green

## Batch table

| Batch | Files | Audit | Screenshots | Redesign | Tests | Notes file |
|---|---|---|---|---|---|---|
| dashboard | 8 | AUDITED | done | TODO | — | redesign/audit/dashboard.md |
| notes | 3 | AUDITED | done | TODO | — | redesign/audit/notes.md |
| exams | 3 | TODO | — | TODO | — | redesign/audit/exams.md |
| library | 6 | TODO | — | TODO | — | redesign/audit/library.md |
| plan | 1 | TODO | — | TODO | — | redesign/audit/plan.md |
| quiz | 3 | TODO | — | TODO | — | redesign/audit/quiz.md |
| review | 1 | TODO | — | TODO | — | redesign/audit/review.md |
| settings | 8 | TODO | — | TODO | — | redesign/audit/settings.md |
| tasks | 3 | TODO | — | TODO | — | redesign/audit/tasks.md |
| terms | 1 | TODO | — | TODO | — | redesign/audit/terms.md |
| timer | 2 | TODO | — | TODO | — | redesign/audit/timer.md |
| auth | 6 | TODO | — | TODO | — | redesign/audit/auth.md |
| shell (AppShell/Sidebar/Header) | 3 | TODO | — | TODO | — | redesign/audit/shell.md |
| components (shared, 29 files) | 29 | TODO | — | TODO | — | redesign/audit/components.md |
| chat (preserve, audit-only) | 3 | TODO | — | N/A | — | redesign/audit/chat.md |

**Status vocab — Audit:** TODO / SCREENSHOTTED / AUDITED
**Status vocab — Redesign:** TODO / IN_PROGRESS / APPLIED / VERIFIED / SIGNED_OFF / N/A
**Status vocab — Tests:** — / PASS / FAIL (link failure detail in the batch's own file, not here)

## Flagship screens (Phase 5 sign-off gate)

Dashboard, Notes, Exams — chosen for varied UI shapes (stat cards, rich-text/list content,
forms+calendar). Full rollout to the remaining 12 batches (Phase 6) may not begin until the
user has explicitly signed off on these three, recorded in this file's Phase status above.
