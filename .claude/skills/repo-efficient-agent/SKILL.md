---
name: repo-efficient-agent
description: Use when working in the Learnora repo to do surgical code, docs, or cleanup tasks with minimal token waste, live-app-first reasoning, and verification before completion.
---

# Repo Efficient Agent

Use this skill for day-to-day work in the Learnora codebase when the goal is to be precise, low-noise, and high quality.

## Core operating rules

1. Prefer the live app in `webapp/` over older or historical docs.
2. Treat `archive/` and `docs/` as supporting context, not current status.
3. Patch the root cause, not the surrounding area.
4. Read the smallest relevant range, not whole files.
5. Verify with the smallest meaningful command before claiming success.

## Current-state truth

Use these as the active baseline unless the user explicitly asks for historical context:

- `webapp/` — active app and product source of truth
- `api/` — edge/server handlers and public API endpoints
- `supabase/` — schema, migrations, and database-adjacent logic
- `scripts/build.sh` — deploy build flow
- `README.md` and `AGENTS.md` — repo guidance and current conventions

Everything else is support material, historical context, or static policy/marketing content unless the user specifically asks for it.

## What not to do

- Do not infer current status from `archive/` or stale planning notes.
- Do not read broad folders before the root cause is localized.
- Do not refactor unrelated code while fixing a bug.
- Do not create speculative abstractions or new folders without a clear need.
- Do not add large cleanup work unless the user asked for it.

## Good workflow

1. Identify the real task and the actual failing behavior.
2. Search for the exact symbol, route name, API call, or error text.
3. Read only the narrow surrounding range.
4. Form one working hypothesis.
5. Make one minimal fix.
6. Run the cheapest relevant validation command.
7. Report results with evidence from the command output.

## Repo-specific priorities

- Keep work aligned with the current Learnora product structure.
- Prefer existing patterns and established routes rather than inventing new ones.
- Keep migrations conservative and scoped.
- Preserve current naming and route conventions.
- If a test is missing and the code path is already covered by the repo’s patterns, add the smallest useful one.

## Validation commands

Use the minimal relevant command for the task.

### Frontend checks

```bash
npm --prefix webapp run lint
npm --prefix webapp run build
npm --prefix webapp test
```

### Local app

```bash
npm --prefix webapp ci
npm --prefix webapp run dev
```

### Migration work

```bash
npx supabase@2.115.0 migration list --linked
npx supabase@2.115.0 db push --dry-run --linked
npx supabase@2.115.0 db lint --linked --schema public --level warning --fail-on error
```

## When to ask a question

Ask a targeted question instead of guessing when:

- the user has not clearly specified the target file or module,
- the repo has multiple plausible implementations,
- a change would touch live behavior in more than one system,
- or the requested cleanup would require moving files or deleting content.

## Finish condition

Only claim work is done when the change is minimal, behavior is verified, and the result aligns with the actual repo state rather than stale docs or historical assumptions.
