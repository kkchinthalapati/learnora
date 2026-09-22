---
name: repo-docs-housekeeping
description: Use when organizing markdown files, archiving stale docs, updating README and AGENTS guidance, or keeping repo documentation tight, current, and easy to navigate without unnecessary churn.
---

# Repo Docs Housekeeping

Use this skill when the task is about docs hygiene, cleanup, or organization in the Learnora repo.

## Goals

- Keep current docs accurate and easy to navigate.
- Move truly stale or historical material into `archive/`.
- Preserve operational docs that are still referenced by code and setup flows.
- Avoid pointless churn and brittle relative links.
- Improve repo clarity without breaking the app or contributor workflow.

## Decision rule

A markdown file is a candidate for archiving only if it is clearly historical, design-only, audit-only, or planning-only and not part of the current operational flow.

Keep a file at the root if it is still actively used as a setup guide, reference doc, or runtime documentation.

## Good archive candidates

Examples of files that often belong in `archive/`:

- migration ledger notes
- redesign audits
- historical UX plans
- old implementation retrospectives
- completed design or quality sweeps
- stale “next step” docs that no longer reflect the app state

## Files to keep near the root when still useful

These often remain active and should be preserved at top level when referenced by the app or developer workflow:

- `README.md`
- `AGENTS.md`
- `AI_PROVIDERS.md`
- `EMAIL_NOTIFICATIONS.md`
- `PUSH_NOTIFICATIONS.md`
- `STRIPE_SETUP.md`
- `SUPABASE_SETUP.md`

## Documentation structure guidelines

- Root docs: active repo entry points, operational references, and contributor instructions.
- `docs/`: research, audits, and supporting analysis that are still useful but not core workflow docs.
- `plans/`: active product plans, strategy notes, or near-term thinking.
- `archive/`: completed historical work and stale documentation.

## Cleanup workflow

1. Identify whether the file is active or historical.
2. Prefer preserving references that code or setup docs still use.
3. Move only clearly stale docs into `archive/`.
4. Update `README.md` and `AGENTS.md` if the organization changes materially.
5. Keep the result minimal and intentionally scoped.

## Avoid

- moving operational docs just to make the tree look tidier
- creating many nested folders for low-value markdown files
- deleting historical material without a clear reason
- burying useful setup docs in `docs/` where they are harder to find

## Final quality bar

The repo should be easier to navigate, not more fragmented. The documentation structure should reduce confusion, not add another layer of indirection.

If a move would break a real workflow, leave the file where it is and document the reason.
