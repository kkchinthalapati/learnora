---
name: feature-implementation-patterns
description: Use when adding or extending a feature in Learnora. Follow the repo’s established patterns, existing routes, and minimal integration design before adding new abstractions.
---

# Feature Implementation Patterns

Use this skill when building or extending functionality in the app.

## Default approach

Look for the closest existing feature flow before inventing a new pattern.

## Repo-specific guidance

- Start in `webapp/src/` and match established screen and component structure.
- Reuse route organization, shared UI patterns, and existing data-fetching conventions.
- Prefer small, integrated changes over parallel or duplicate implementations.
- Treat the UI shell and route boundaries as authoritative.

## Workflow

1. Find a similar existing flow or component.
2. Mirror the naming and structure of that pattern.
3. Add only the minimal logic needed for the new feature.
4. Keep state, API calls, and rendering responsibilities aligned.
5. Validate the affected behavior with the smallest proof step.

## Avoid

- creating new feature folders without a clear architectural need
- duplicating patterns that already exist in adjacent screens
- over-engineering state or API wrappers prematurely
- designing around hypothetical future features instead of the current task

## Proof step

```bash
npm --prefix webapp run build
npm --prefix webapp test
```

The goal is to ship a correct, consistent feature with the least extra structure possible.
