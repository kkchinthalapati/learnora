# Learnora

Learnora is a React study-workspace product for planning, learning from materials,
reviewing with spaced repetition, and tracking long-term progress.

## Product overview

The live app sits in `webapp/` and is the source of truth for feature work. The
repo also contains operational docs, API handlers, database work, and historical
project notes that are intentionally separated from active product work.

## Repository map

- `webapp/` — active Vite + React + TypeScript app
- `api/` — public edge/server handlers and API endpoints
- `supabase/` — database migrations, edge functions, and SQL schema
- `scripts/` — deploy and build scripts
- `docs/` — research, audits, and supporting product documentation
- `plans/` — active planning notes and product strategy docs
- `archive/` — historical migration/design/audit work that is no longer active
- `tests/` — repo-level validation scripts and broader checks
- root HTML/CSS files — static marketing and policy pages only

## Current working model

The live React app is the canonical implementation. Historical artifacts in
`archive/` are kept for reference only and should not be treated as pending work.

The app is organized around product destinations such as Dashboard, Library,
Plan, Focus, and Progress. The front-end shell and routes live in `webapp/`.
The old vanilla shell is no longer the active implementation.

## Documentation organization

We keep docs in the most useful place without forcing unnecessary churn:

- `README.md` — top-level overview for contributors and agents
- `AGENTS.md` — repo-specific instructions for AI agents
- `docs/` — research notes, audits, and supporting analysis
- `plans/` — active planning and design memos
- `archive/` — historical docs and completed migration records
- root-level operation files like `AI_PROVIDERS.md`, `EMAIL_NOTIFICATIONS.md`,
  `PUSH_NOTIFICATIONS.md`, `STRIPE_SETUP.md`, and `SUPABASE_SETUP.md` stay at the
  top level because they are directly referenced by runtime code and operational
  setup flows

This is intentional: moving every markdown file into `docs/` would create churn,
break relative references, and slow down day-to-day work. Only genuinely stale or
definitively historical material is archived.

## Local development

Requirements: Node.js 24.x and npm.

```bash
npm --prefix webapp ci
npm --prefix webapp run dev
```

The app is served under `/app/` in Vite and production, for example:
`http://localhost:5173/app/`.

## Build and validation

Use the smallest relevant command for the task, but these are the standard checks:

```bash
npm --prefix webapp run lint
npm --prefix webapp run build
npm --prefix webapp test
```

Production deployment is configured in `vercel.json` and uses:
`bash scripts/build.sh`.

## Supabase / database workflow

Only run the full migration flow when a task is database-related:

```bash
npx supabase@2.115.0 migration list --linked
npx supabase@2.115.0 db push --dry-run --linked
npx supabase@2.115.0 db push --linked
npx supabase@2.115.0 db lint --linked --schema public --level warning --fail-on error
```

Keep migration work small, intentional, and scoped to the current issue.

## Working rules for contributors and agents

- Prefer `webapp/` over older marketing or legacy shell files.
- Do not treat `archive/` as active status.
- Do not broaden a bug fix into unrelated cleanup.
- Read only the relevant code and docs before patching.
- Verify the smallest meaningful check before claiming completion.

## Key operational docs

These are the most common active references:

- `AGENTS.md` — repo operating guide for coding agents
- `AI_PROVIDERS.md` — AI provider configuration and opt-in rules
- `EMAIL_NOTIFICATIONS.md` — email notification setup and behavior
- `PUSH_NOTIFICATIONS.md` — push notification setup and behavior
- `STRIPE_SETUP.md` — Stripe configuration and billing flow
- `SUPABASE_SETUP.md` — Supabase installation and operational setup

## Notes

This repo intentionally keeps operational docs close to the code they support,
while placing more historical or analysis-heavy content under `archive/` and
`docs/`. That keeps the project easier to navigate without creating unnecessary
file churn or brittle links.
