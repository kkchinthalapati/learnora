---
name: agentic-validation-and-proof
description: Use when completing a task in Learnora and needing to verify behavior with the smallest relevant proof, avoid overclaiming, and report evidence instead of assumptions.
---

# Agentic Validation and Proof

Use this skill when closing out a task, especially after code or docs edits.

## Core principle

Do not claim completion without fresh evidence.

## Workflow

1. Identify the smallest behavior that proves the task is complete.
2. Run the smallest relevant check that exercises that behavior.
3. Review the output carefully before reporting success.
4. State actual evidence, not confidence alone.

## Repo-specific guidance

- For frontend logic, prefer `npm --prefix webapp test` or the smallest targeted frontend check.
- For build-related changes, use `npm --prefix webapp run build`.
- For migration or DB changes, use the linked Supabase validation commands.
- For docs-only changes, verify that the wording and file organization are coherent and no links are broken by the move.

## Validation commands

```bash
npm --prefix webapp run lint
npm --prefix webapp run build
npm --prefix webapp test
```

```bash
npx supabase@2.115.0 migration list --linked
npx supabase@2.115.0 db push --dry-run --linked
npx supabase@2.115.0 db lint --linked --schema public --level warning --fail-on error
```

## Reporting standard

Say what was checked, what command was used, and what result it produced.

Avoid phrases like “should work” or “likely fixed” without evidence.

## Quality bar

The work is complete only when the proof step matches the changed behavior and the final report is narrow, factual, and easy for the next engineer to trust.
