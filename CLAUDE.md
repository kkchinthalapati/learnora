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

## Keep `WAITINGONLEDGER.md` current

`WAITINGONLEDGER.md` at the repo root lists everything the code is waiting on
that a person must do: migrations to apply, edge functions to deploy, secrets
and API keys to set, domain/billing/legal decisions. Update it **in the same
commit** as any change that adds, changes or completes such a dependency (new
migration, edited edge function, new env var or secret, merged PR with a
follow-up step). Mark rows verified only with a date and only after checking
production; otherwise leave them `UNVERIFIED`.

## Where the app actually lives

- **`webapp/`** — the live React app (Vite + TS + Vitest). This is where
  features, fixes, and UI work happen.
- Root `*.html` + `public.css` / `style.css` — static marketing and policy
  pages only (landing, about, contact, privacy, developers, 404). The
  vanilla JS shell (`js/`, `index.html`, `terms/verify/reset-password.html`)
  was deleted on 2026-09-16; `/terms`, `/verify` and `/reset-password` are
  routes in `webapp/`. Don't build features here.
