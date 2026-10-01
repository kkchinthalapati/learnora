---
name: db-migration-safety
description: Use when modifying Supabase schema, writing migrations, or changing database-related app behavior in Learnora. Focus on minimal, reversible, and safe changes.
---

# DB Migration Safety

Use this skill for any work touching `supabase/` migrations, SQL, or DB-dependent app logic.

## Core priorities

- Keep the change small and explicit.
- Prefer additive, reversible work over broad schema churn.
- Validate the app logic against the new schema before claiming success.
- Avoid silent assumptions about existing data or permissions.

## Workflow

1. Inspect the exact migration or schema area being changed.
2. Check the corresponding query or model usage in the app.
3. Prefer the smallest migration that satisfies the requirement.
4. Verify SQL safety, ownership rules, and constraint behavior.
5. Run the relevant migration validation command.

## Learnora-specific rules

- Keep Supabase changes conservative.
- Prefer clear ownership policies and explicit constraints.
- Avoid broad cleanup in migration files unless required by the fix.
- If a task is not migration-related, do not start a migration-only path.

## Validation commands

```bash
npx supabase@2.115.0 migration list --linked
npx supabase@2.115.0 db push --dry-run --linked
npx supabase@2.115.0 db lint --linked --schema public --level warning --fail-on error
```

If the task includes app changes, also run the smallest relevant frontend or code validation step.
