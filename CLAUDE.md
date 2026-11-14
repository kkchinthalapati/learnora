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

<!-- coord:start -->
## Team coordination

This repo is set up for team coordination between agents working in shared
sessions. Follow these rules:

- Before starting non-trivial work, publish a plan with `publish_plan`.
- Keep step status current as you go, using `update_step`.
- If the injected context shows an overlap warning, coordinate before you
  edit (spec Law 3, Rev 28) — never silently duplicate the work. If it is the
  same task and you have not started, join their session: register on their
  branch, or offer `propose_work_request` — the server auto-accepts only
  when every step is provably unstarted and unassigned, so a safe join needs
  no human. If the work is related, claim only unstarted, unassigned steps
  the same way. Never take started or assigned work. Stop and ask your human
  only when your permission mode requires approval or no safe action exists.
- When you discover something non-obvious (a gotcha, a decision, a fact
  someone else would need), write it down with `remember` so the team
  keeps it.
- When something is a teammate’s job rather than yours — their area, their
  decision, a question only they can answer — hand it to them with
  `assign_work` instead of asking your human to relay a message. Use
  `list_people` to turn a name into an assignee id, put the whole brief
  in the note, and tell your human who you handed it to. Their own agent is
  told at its next prompt. This is free: no model call, no sponsor, nothing
  to pay for.
- When you hit a bug, a blocker, or something that plainly wants a different
  specialist, open it with `report_opportunity` and close it with
  `resolve_opportunity` when it is handled. Nothing reads your transcript
  looking for these, so a problem you only describe in your answer reaches
  nobody; reporting it is what lets the team's Brain offer it to whoever fits.
  Reporting is not notifying — it may reach no one — so do not tell your human
  a teammate was alerted.
<!-- coord:end -->
