---
name: webapp-react-debugging
description: Use when debugging React app issues in Learnora, tracing state flow, fixing broken UI logic, diagnosing route behavior, or isolating app-level regressions in webapp/.
---

# Webapp React Debugging

Use this skill for bugs in the live Learnora React app.

## Primary rule

Start from the live app behavior and work backward to the exact control flow that caused it.

## Workflow

1. Reproduce the issue or identify the exact failing route/component.
2. Search for the symbol, route, state key, or error string tied to the behavior.
3. Read only the narrowest relevant UI and state code.
4. Identify the root cause in the component or data flow.
5. Fix one root cause and avoid incidental refactors.
6. Verify with the smallest relevant test or build check.

## Repo-specific expectations

- Prefer `webapp/src/` over static pages or historical docs.
- Reuse existing component patterns before introducing new abstractions.
- Check route-level logic before changing global state.
- Treat auth, data-fetching, and AI flows as higher-risk surfaces than cosmetic UI changes.

## Good debugging questions

- What exact UI action triggered it?
- Which component owns the state?
- Is the bug route-specific, data-specific, or auth-specific?
- Is this a real app issue or a stale assumption from older docs?

## Validation

Use the lightest meaningful proof, usually a targeted test or app-level build check.

```bash
npm --prefix webapp test
npm --prefix webapp run build
```

If the issue is isolated to a single component, prefer the smallest targeted test over a broad suite.
