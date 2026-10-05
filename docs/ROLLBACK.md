# Migration rollback notes and production checklist

Migrations in this repo are applied by hand (see `unmergedsupabase.md` for the
running status). Nothing here has been run by an agent. Each note says what
the migration changes, whether reverting loses data, and the exact revert SQL.

`webapp/src/migrations.test.ts` checks every migration from A1 on without a
database: `if not exists` creates, dropped or guarded policies, RLS on new
tables, no unguarded destructive statements, and a `Revert:` line.

## Per-migration rollback

### A1 — `20261001000000_ai_request_log_outcome.sql`
Adds nullable `provider`, `model`, `latency_ms`, `failed_providers` to
`ai_request_log`. Review: additive, idempotent, no policy change. No issues.
Revert loses only the logged outcome values; learnora-ai's update of them
fails quietly afterwards (it runs after the request has already succeeded).

```sql
alter table public.ai_request_log
  drop column if exists provider, drop column if exists model,
  drop column if exists latency_ms, drop column if exists failed_providers;
```

### A2 — `20261001010000_ai_request_log_session_key.sql`
Adds nullable `session_key` (format-checked) and an index on
`(user_id, tool, created_at)`. Review: that index duplicates
`ai_request_log_user_id_tool_created_at_idx` from 20260906 — fixed by
`20261005000000` below rather than by editing A2, which is applied.
Students can still insert their own `ai_request_log` rows (web-research needs
the insert policy), so they could write a `session_key` themselves; that only
adds to their own usage, never reduces it.
**Do not revert while the deployed learnora-ai writes `session_key`**: its
quota insert would fail and it fails open, so AI limits stop being enforced.
Redeploy a function version that doesn't write it first.

```sql
drop index if exists public.ai_request_log_user_tool_created_idx;
alter table public.ai_request_log drop column if exists session_key;
```

### A3 — `20261001020000_study_session_state.sql`
New table `study_session_state`, owner-only RLS on all four verbs, 256 KB cap
per record, cascades on account deletion. Review: idempotent, policies dropped
before creation. `updated_at` is client-supplied; it only orders the
student's own sessions, so a wrong clock affects nobody else. No issues.
Revert **deletes every server-side session**; sessions still in a browser's
localStorage survive, and the client's sync calls fail quietly.

```sql
drop table if exists public.study_session_state;
```

### `20261005000000_drop_duplicate_ai_request_log_index.sql`
Drops A2's duplicate index and re-asserts the 20260906 one. No data change.

```sql
create index if not exists ai_request_log_user_tool_created_idx
  on public.ai_request_log (user_id, tool, created_at);
```

## How to apply to production safely

Run these yourself, in order. Do not use `supabase db push`: production's
recorded versions differ from the filenames (see `unmergedsupabase.md`), so
the CLI may try to re-run old files.

1. Merge the branch to `main` only after `npm --prefix webapp test` and
   `node --test tests/*.test.js` pass. Vercel deploys the webapp on merge; the
   webapp must tolerate the database *before* the new migrations (each
   section below says how it degrades).
2. In the Supabase dashboard, take a backup (Database ▸ Backups) or note the
   PITR timestamp.
3. Confirm A1–A3 are live (they were reported applied 2026-10-02):
   ```sql
   select column_name from information_schema.columns
   where table_name = 'ai_request_log'
     and column_name in ('provider','model','latency_ms','failed_providers','session_key');
   select to_regclass('public.study_session_state');
   ```
   Five rows and a non-null regclass means nothing to do. If not, paste A1,
   then A2, then A3 into the SQL Editor, in that order.
4. Paste each newer file from `supabase/migrations/` (version above
   `20261002020000`) into the SQL Editor **one at a time, in filename order**.
   Each is idempotent; if one errors, stop and fix before the next.
5. After each, run its verify query (in this file's per-migration section)
   and check Database ▸ Advisors for new security warnings.
6. Record each as applied so the CLI history stays honest:
   `supabase migration repair --status applied <version>`.
7. Remove the dead Cerebras key: `supabase secrets unset CEREBRAS_API_KEY`.
8. Smoke test: one Explain session, then
   `select provider, model, latency_ms from ai_request_log order by created_at desc limit 5;`
9. Update the status table in `unmergedsupabase.md` with the date.
