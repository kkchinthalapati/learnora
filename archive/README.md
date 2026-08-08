# Archive

Everything under this directory is a **historical planning or audit document**,
not current status. Each one describes a body of work that has since been
completed and merged:

- **`REACT_MIGRATION.md`** — the Vanilla JS → React migration ledger. Its own
  "resume here" section still points at step 23 as the next unfinished step —
  that's stale. The migration finished in full (all 9 route cutovers + 4
  loose-end fixes) on 2026-08-02, commit `6a2c87f`. `js/` is now a thin
  redirect shell in front of `webapp/`, not a parallel app.
- **`redesign/`** (`DESIGN_MOVES.md`, `PRIMITIVES.md`, `audit/*.md`,
  `screenshots/`) — the visual/UX redesign audit and the moves it approved
  (Card/PageHeader/IconButton primitives, landmark fixes, spacing
  conformance). All of it shipped: Phases 1–7 are merged (see git log for
  `redesign/`, ending at "Phase 7: close out the redesign ledger — final
  gate green"). The current code comments that cite a specific move number
  (e.g. `// archive/redesign/DESIGN_MOVES.md move #2`) are pointing at *why*
  a decision was made, not a to-do.
- **`plans/PROGRESS.md`, `plans/ux-revamp-plan.md`** — an earlier UX/CSS
  consistency pass on the pre-migration vanilla app. Also fully landed.

**If you're an AI agent (or a person) exploring this codebase:** don't read
these to understand the *current* state of the app, and don't treat their
"NOT started" / "next agent, start here" sections as live work items — they
describe a past snapshot, not this one. For current status, use the code
itself, `git log`, and the top-level `README.md`. See the repo's `CLAUDE.md`
for the standing instruction to skip this directory during normal analysis.

They're kept (rather than deleted) only because the *reasoning* inside them —
why a given primitive or route shape was chosen — is occasionally worth
digging up; git history alone makes that harder to search.
