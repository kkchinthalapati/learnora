# Learnora — operating guide for AI agents

## Mission

This repo is a React study-workspace product. Treat the actual product code in `webapp/` as the source of truth. Everything else is support, migration history, or docs. Be surgical: identify the real task, touch the minimal necessary files, and verify the behavior with the cheapest relevant command.

## The three rules for efficient, high-quality work

1. Prefer the live code over historical docs.
2. Patch only the root cause and only the necessary surface area.
3. Verify before claiming success.

## Current-state truth

Use these as the live source of truth unless the user explicitly asks for historical context:

- `webapp/` — active app (Vite + React + TypeScript + Vitest).
- `api/` — edge/server handlers and public API endpoints.
- `supabase/` — DB schema/migrations and server-side SQL.
- `scripts/build.sh` — deploy build flow.
- `README.md` — current product layout and important repo conventions.

You should assume the following are not current work unless the user specifically asks for them:

- `archive/` — historical plans, audits, migration logs, and redesign work.
- `docs/` — research notes and planning collateral.
- root HTML and CSS files (`landing.html`, `about.html`, `style.css`, etc.) — static marketing/policy pages only.

## Ignore / do not treat as active status

### `archive/`

`archive/` contains completed historical work, not active tasks. Do not read it to decide what is currently missing, current status, or current architecture. It may contain stale "next step" / "NOT started" items.

Use `archive/` only when the user explicitly asks:

- why a route or component was shaped a certain way,
- what an earlier decision was,
- or to explain past migration/rework history.

### Root static pages

The root `*.html` files are not the app. They are marketing and policy pages. Do not build features into them. The functional app lives in `webapp/`.

## Working style: optimize for low token use

### Good workflow

- Start with the narrowest possible search or symbol lookup.
- Read exactly the file and line range needed to answer the question.
- Form one hypothesis before patching.
- Make the smallest change that addresses the root cause.
- Verify with the smallest relevant command.

### Better than broad exploration

Avoid:

- reading whole files when a narrow range is enough,
- opening multiple unrelated files before identifying the actual dependency,
- reading `archive/` or `docs/` unless explicitly required,
- broad, speculative edits.

Prefer:

- a targeted grep for the symbol, route, API name, or error string,
- then one or two narrow reads around the actual call site,
- then patch + verify.

## App structure and where work normally belongs

### Primary product work

- `webapp/src/` — React app source.
- `webapp/tests/` — Vitest and Playwright coverage.
- `webapp/public/` — static assets.

### API/backend work

- `api/` for public serverless route handlers.
- `supabase/functions/` for Supabase edge or database-adjacent functions.
- `supabase/migrations/` for SQL changes.

### UI/marketing-only work

- root pages and CSS are for static content only.
- do not add product logic or app routes there.

## Repo-specific product facts

These are current repo realities and should guide work:

- The live React app is in `webapp/`.
- The current app is intentionally organized around the product destinations such as Dashboard, Library, Plan, Focus, and Progress.
- The front-end shell and routes live in the React app; the old vanilla shell is not the active app.
- Supabase changes are intentionally conservative; prefer small, well-scoped migrations and clear ownership rules.
- Production build flow is via `scripts/build.sh` and the Vite app in `webapp/`.

## Validation and build commands

Use the smallest relevant verification command for the task.

### Frontend app

```bash
npm --prefix webapp run lint
npm --prefix webapp run build
npm --prefix webapp test
```

### Local dev

```bash
npm --prefix webapp ci
npm --prefix webapp run dev
```

### Supabase migration work

Only if the task is migration-related:

```bash
npx supabase@2.115.0 migration list --linked
npx supabase@2.115.0 db push --dry-run --linked
npx supabase@2.115.0 db push --linked
npx supabase@2.115.0 db lint --linked --schema public --level warning --fail-on error
```

## Quality bar for code changes

- Prefer existing patterns over new abstractions.
- Keep changes narrowly scoped to the feature/fix.
- Do not create speculative folders, utilities, or wrappers unless required by the task.
- Avoid refactors unless they directly enable the bug fix or feature.
- Preserve current naming and route conventions.
- If a test is missing for the changed behavior, add the smallest useful one.

## Safety / correctness guardrails

- Do not assume historical docs are current.
- Do not remove files or move things without explicit user approval.
- Do not broaden the scope during a bug fix to “cleanup” unrelated code.
- Do not claim completion without running the proving command or test relevant to the change.
- When unsure, ask a targeted question instead of making a risky assumption.

## Good search pattern

When the task is not obvious, do this in order:

1. Search for the exact symbol, route name, API name, or error text.
2. Read only the relevant file and surrounding function.
3. Trace the dependency to its source.
4. Patch once.
5. Verify once.

This is better than a broad repo sweep and usually saves time and tokens.

## Typical agent decisions

### If the task is UI/UX

Look in `webapp/src/` first, especially the feature area and existing component patterns. Reuse existing components and style primitives rather than creating new ones.

### If the task is a bug

Find the failing behavior, identify the exact function/object driving it, and patch there. Add a focused test if the repo already uses one for that area.

### If the task is a feature

Check whether a similar flow already exists before inventing new patterns. Prefer wiring into established architecture rather than building parallel structures.

### If the task is a migration or DB change

Check `supabase/` and relevant app queries before changing schema or data access.

## Final expectations

Deliver work that is:

- correct,
- minimal,
- consistent with the current codebase,
- verified,
- easy for the next engineer to follow.

When in doubt, prefer a focused question over a broad, speculative change.

## One-line summary

The repo is a live React app in `webapp/`; the rest is mostly support, historical context, or static marketing. Respect the current app as the source of truth, avoid archive drift, and work in the smallest relevant slice with explicit verification.
