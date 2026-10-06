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

### `20261005010000_mistake_loop.sql`
Adds the repair-loop columns to `misconceptions` and `misconception_observations`,
a `'repair'` observation kind, a per-user unique `idempotency_key`, and replaces
`apply_misconception_observation()` with the new rule: resolved only by a
correct answer on a new question at least 2 days after the repair. Two new
triggers: clients can no longer write loop state directly, and repairs are
stamped with the server clock. Existing rows keep their status; open rows
need a repair like new ones.
The webapp tolerates this being absent: reads fall back to the old columns,
loop writes are skipped, and Today's "Mistakes to fix" stays hidden.
Revert keeps the columns (unused) and restores the old rule; it deletes only
`'repair'` observations.

```sql
drop trigger if exists misconceptions_guard_loop on public.misconceptions;
drop trigger if exists misconception_observations_stamp on public.misconception_observations;
drop function if exists public.guard_misconception_loop_columns();
drop function if exists public.stamp_misconception_observation();
delete from public.misconception_observations where kind = 'repair';
alter table public.misconception_observations
  drop constraint if exists misconception_observations_kind_check;
alter table public.misconception_observations
  add constraint misconception_observations_kind_check
  check (kind in ('evidence', 'correction'));
-- then re-run the create-or-replace of apply_misconception_observation()
-- from 20260907000000_add_misconception_ledger.sql
```

Verify:
```sql
select column_name from information_schema.columns
where table_name = 'misconceptions' and column_name in ('repaired_at','retest_due_at','provisional');
select indexname from pg_indexes where indexname = 'misconception_observations_user_idempotency_key';
select tgname from pg_trigger where tgname in ('misconceptions_guard_loop','misconception_observations_stamp');
```

### `20261005020000_study_profile_any_board.sql`
Relaxes `profiles_exam_type_check` and `profiles_region_check` to shape checks
(every existing row passes; nothing is rewritten), adds `country`, `board`,
`age_band`, `study_profile` to `profiles`, and the owner-only
`subject_outlines` table (rows can never be marked verified by a client).
The webapp tolerates this being absent: the wizard writes only the legacy
`exam_type`/`region` and keeps the rest on the device.
Revert drops the outlines table and the new columns. Re-adding the old
checks fails if any row now holds a new exam_type or region; set those to
`'other'` / null first.

```sql
drop table if exists public.subject_outlines;
alter table public.profiles drop column if exists country,
  drop column if exists board, drop column if exists age_band,
  drop column if exists study_profile, drop column if exists study_profile_updated_at;
```

Verify:
```sql
select pg_get_constraintdef(oid) from pg_constraint
where conname in ('profiles_exam_type_check','profiles_region_check');
select to_regclass('public.subject_outlines');
```

### `20261006000000_question_verification_and_reports.sql`
**Applied to production 2026-10-06** (checked afterwards with a rolled-back
test: flag after 3 reporters, bank row moved to `review`, cross-user insert
refused, 21st report in a day refused; nothing left behind).
Adds `question_bank.review_status` / `human_reviewed` / `verification` /
`report_count`, and the `question_reports`, `question_flags` and
`question_review_log` tables with their triggers. The webapp tolerates it
being absent (bank fetch falls back, flags read as none, reports say
"unavailable"). Revert loses reports and the review log.

```sql
drop table if exists public.question_flags, public.question_reports, public.question_review_log;
drop function if exists public.limit_question_reports();
drop function if exists public.flag_reported_question();
drop index if exists public.ai_request_log_verify_created_idx;
alter table public.question_bank drop column if exists review_status,
  drop column if exists human_reviewed, drop column if exists verification,
  drop column if exists report_count;
```

Reviewing what it collects: `docs/question_review.sql`.

### `20260901000000_add_diagram_artifact_type.sql`
**Applied to production 2026-10-06.** Widens `notebook_artifacts_type_check` to
admit `'diagram'`. Revert only if no diagram artifacts exist (the old constraint
would then reject the existing rows):

```sql
delete from public.notebook_artifacts where type = 'diagram';
alter table public.notebook_artifacts drop constraint if exists notebook_artifacts_type_check;
alter table public.notebook_artifacts add constraint notebook_artifacts_type_check
  check (type in ('feynman','cheat_sheet','flashcards','quiz','summary'));
```

### `learnora-ai` edge function (quiz verification)
Not deployed by merging. Deploy with `supabase functions deploy learnora-ai`
after the migration above. Optional secrets: `QUIZ_VERIFIER_MODEL` (a cheaper
checker model), `QUIZ_VERIFY_USER_DAILY` (default 20), `QUIZ_VERIFY_GLOBAL_DAILY`
(default 2000). Rollback: redeploy the previous version from the dashboard
(Edge Functions ▸ learnora-ai ▸ versions). Until it is deployed, quizzes come
back without verdicts and the webapp serves them as before.

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
4. Paste each newer file into the SQL Editor **one at a time, in this
   order**, and stop at the first error:
   1. `20261005000000_drop_duplicate_ai_request_log_index.sql`
   2. `20261005010000_mistake_loop.sql`
   3. `20261005020000_study_profile_any_board.sql`
   Each is idempotent and safe to re-run. The reconstructed baseline lives in
   `archive/migrations-unapplied/` and must not be applied to production.
5. After each, run its verify query (in this file's per-migration section)
   and check Database ▸ Advisors for new security warnings.
6. Record each as applied so the CLI history stays honest:
   `supabase migration repair --status applied <version>`.
7. Remove the dead Cerebras key: `supabase secrets unset CEREBRAS_API_KEY`.
8. Smoke test: one Explain session, then
   `select provider, model, latency_ms from ai_request_log order by created_at desc limit 5;`
9. Update the status table in `unmergedsupabase.md` with the date.
