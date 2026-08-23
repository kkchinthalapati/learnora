# Learnora — instructions for AI agents working in this repo

## Ignore `archive/`

`archive/` holds old planning and audit documents (the React-migration
ledger, the visual-redesign audit, an earlier UX-revamp plan) whose work is
already merged. **Do not read files under `archive/` when analyzing the
current state of the codebase, deciding what to work on, or answering
questions about this app.** They describe a past snapshot and their
"next step" / "NOT started" sections are stale — treating them as live
status will misdirect the work. See `archive/README.md` for what each one
was and when it was superseded.

If you're specifically asked to research *why* a past decision was made
(a component's shape, a route's structure), `archive/` is fair game — just
don't use it to infer what's currently true or what's currently left to do.

## Where the app actually lives

- **`webapp/`** — the live React app (Vite + TS + Vitest). This is where
  features, fixes, and UI work happen.
- **`js/`, `index.html`, `style.css`** at the repo root — a thin legacy
  shell. Every real view now redirects into `webapp/` (see
  `js/router.js`'s `CUTOVER_ROUTES`); what's left is auth-adjacent pages
  (`terms.html`, `reset-password.html`, `verify.html`) and the redirect
  glue itself. Don't build new features here.
