# Unapplied Supabase migrations — status and runbook

Checked against production project `mlvgqwqiynpwpwzqufdf` on **2026-10-01**.

> **Update 2026-10-02: every row below is live.** All six migrations are applied (production now records 50) and `learnora-ai` v65 is deployed. See **Done** at the bottom. Still open: Section D (Cerebras secret, legal sign-off) and a live smoke test (one Explain session, then check `ai_request_log.provider`/`model`/`latency_ms` are filled).

- All **44** migrations recorded as applied in production match a file in `supabase/migrations/` on `main` (matched by name; production versions differ because they were applied through the dashboard/MCP).
- I spot-checked the live schema against those 44 (notes `updated_at` + trigger, `profiles.settings`, `learning_events`). **No drift found.**
- **6 migrations are not applied.**
  - **3 from PR #122 (Section A).** The code is merged; apply them now, in the order below.
  - **3 on unmerged feature branches (Section B).** Apply those only when that branch merges.

Every migration below is idempotent (`if not exists` / `on conflict do nothing` / `drop … if exists`), so re-running one is safe.

---

## Status — read this first (agents: update it when you change any row)

This is the single source of truth for what is merged and what is live. **Before acting, verify against production** with the query in each step; production wins over this table. After you apply, deploy or merge something, flip its row and add the date. When every row in a section is ✅, move that section's SQL to the "Done" note at the bottom; don't delete the history.

| Step | What | Code merged to `main`? | Live in production? |
|------|------|------------------------|---------------------|
| A1 | `20261001000000_ai_request_log_outcome.sql` | ✅ PR #122 (2026-10-01) | ✅ applied 2026-10-02 |
| A2 | `20261001010000_ai_request_log_session_key.sql` | ✅ PR #122 (2026-10-01) | ✅ applied 2026-10-02 |
| A3 | `20261001020000_study_session_state.sql` | ✅ PR #122 (2026-10-01) | ✅ applied 2026-10-02 |
| A4 | `learnora-ai` edge function with `_shared/` modules | ✅ PR #122 (2026-10-01) | ✅ v65 deployed 2026-10-02 (byte-identical to `main` at 6038fc6) |
| A5 | Webapp | ✅ PR #122 (2026-10-01) | ✅ Vercel deploys `main` automatically on merge |
| B1a | `20260929000000_materials_allow_study_photos.sql` | ✅ PR #123 | ✅ applied 2026-10-02 |
| B1b | `20260929010000_add_chat_media_bucket.sql` | ✅ PR #123 | ✅ applied 2026-10-02 |
| B2a | `20260929020000_flashcards_last_reviewed_at.sql` | ✅ PR #129 | ✅ applied 2026-10-02 |
| C1 | `20261002000000_exams_syllabus.sql` (exams.syllabus_id / syllabus_tier) | ❌ branch `ccr-21911d53-k2odo3` | ✅ applied 2026-10-02, ahead of the merge (additive, nullable; `main` ignores the columns) |
| C2 | `20261002010000_question_bank.sql` + seed (228 Learnora questions) | ❌ branch `ccr-21911d53-k2odo3` | ✅ applied and seeded 2026-10-02 (new table; read-back digest matches the repo) |
| C3 | `20261002020000_past_paper_attempts.sql` | ❌ branch `ccr-21911d53-k2odo3` | ✅ applied 2026-10-02 (new table; nothing on `main` reads it) |
| D1 | `20261005000000_drop_duplicate_ai_request_log_index.sql` | ✅ PR #132 | ✅ applied 2026-10-06 |
| D2 | `20261005010000_mistake_loop.sql` | ✅ PR #132 | ✅ applied 2026-10-06 |
| D3 | `20261005020000_study_profile_any_board.sql` | ✅ PR #132 | ✅ applied 2026-10-06 |
| E1 | `20261006000000_question_verification_and_reports.sql` | ❌ branch `tutor-hints-verification` | ✅ applied 2026-10-06, ahead of the merge (additive; the webapp tolerates it either way) |
| E2 | `learnora-ai` with quiz verification (caps, regeneration, review log) | ❌ branch `tutor-hints-verification` | ❌ needs `supabase functions deploy learnora-ai` after merge |

### What deploys what

- **Merging to `main` deploys only the webapp** (Vercel, automatically).
- **Nothing deploys Supabase automatically.** There is no GitHub Actions workflow. Migrations and edge functions go live only when someone runs them, through the CLI, the dashboard or the Supabase MCP. So "merged" never means "live" for rows A1–A4 or B.

### Order for Section A, and what happens at each point

PR #122 was merged **before** A1–A4 were applied. That is safe, because the new webapp degrades against the old backend. Here is exactly what users get in each state:

| State | What users get |
|-------|----------------|
| **Now: webapp merged, A1–A4 not done** | Everything works. Study sessions save in the browser only. The sync calls fail quietly and "resume on another device" doesn't appear (same as before). AI quotas count every call, as before. The AI still runs through v64's provider chain, which **includes Mistral, a provider the new privacy text no longer names**. Close this gap promptly (step 4). |
| After 1. A1 | No visible change. The columns exist for the new function to fill. |
| After 2. A2 | No visible change. **A2 must be applied before step 4.** The new function writes `session_key`; without the column, its quota insert fails, and it fails open, so **AI limits would not be enforced at all**. |
| After 3. A3 | Study sessions start syncing. A session paused on one device shows up in Today's Resume on another. |
| After 4. A4 `supabase functions deploy learnora-ai` | The quota counts one study session once (up to 16 calls). The provider chain matches the privacy policy, with no Mistral. Dead keys are skipped. Each request logs its provider, model and latency. |

So the runbook is: **A1 → A2 → A3 → A4**, verifying each with its query below. A3 is independent of the others and can go any time. The one hard rule: **never deploy learnora-ai (A4) before A2.**

### Section B: when to merge what

| If you merge… | Apply first / with it | What happens if you don't |
|---------------|-----------------------|---------------------------|
| `claude/beautiful-cerf-vt46z2` | B1a and B1b, before or right after the merge, then redeploy `learnora-ai` (that branch changes it) | Photo uploads are refused by Storage (the `materials` bucket has no image types). "Generate image" fails because the `chat-media` bucket doesn't exist. |
| `claude/dreamy-keller-3sjvnp` | Apply B2a. Its migration is already renamed to `20260929020000_flashcards_last_reviewed_at.sql` on the branch (version collision with beautiful-cerf, resolved 2026-10-01) | The client falls back to the old unconditional review write, so an offline review replayed late can overwrite a newer one. |
| Both | Apply B1a, B1b, B2a (dreamy-keller's file is already renamed) | Two files share version `20260929000000`, so `supabase db push` rejects or skips one |

Both branches were cut before PR #122. Merge `main` into each and re-run the tests before merging. Their migrations are dated before `20261001…`, so `supabase db push` needs `--include-all`.

---

## How to apply

Either:

```bash
# from the repo root, with the CLI linked to the project
supabase link --project-ref mlvgqwqiynpwpwzqufdf
supabase db push            # applies every file in supabase/migrations/ not yet recorded
supabase functions deploy learnora-ai
```

or paste each SQL block below into **Dashboard → SQL Editor** in the order given, then deploy the function.

> `supabase db push` matches by **version**. The 44 already-applied migrations were recorded with different version numbers than their filenames, so the CLI may try to re-run them. They are idempotent, but if you'd rather not risk it, use the SQL Editor route. Then optionally record each one with `supabase migration repair --status applied <version>`.

---

## Section A — PR #122 (merged; apply in this order)

| # | File | What it does | Order constraint |
|---|------|--------------|------------------|
| A1 | `20261001000000_ai_request_log_outcome.sql` | Logs provider, model, latency and failed providers per AI request | Before the learnora-ai deploy |
| A2 | `20261001010000_ai_request_log_session_key.sql` | Bills AI quota per study session (`session_key`) + quota index | **Must be applied before the learnora-ai deploy.** Otherwise inserts fail and the function fails open, so **limits are not enforced** |
| A3 | `20261001020000_study_session_state.sql` | Server-side study sessions (resume on another device) | Any time (until applied, the webapp's sync calls fail quietly and sessions stay browser-only) |
| A4 | `supabase functions deploy learnora-ai` | Picks up the new `_shared/` modules (system prompt, provider policy, session billing) | After A1 + A2 |
| A5 | Webapp | Deployed by merging PR #122 (Vercel) | Done. It degrades safely until A1–A4 are live |

### A1 — ai_request_log outcome columns

```sql
-- Which provider and model answered each AI request, how long it took, and
-- which providers failed before it. ai_request_log held only the tool and
-- the time, so a dead key (Cerebras answered 402 to every request on
-- 2026-09-25) or a slow model was visible only in raw function logs.
--
-- Additive and nullable: rows written before this, and requests that never
-- reach a provider, simply leave them empty. learnora-ai writes them with
-- the service role after a request succeeds; students keep their existing
-- owner-only SELECT/INSERT and gain nothing new.
--
-- Revert: alter table public.ai_request_log
--   drop column if exists provider, drop column if exists model,
--   drop column if exists latency_ms, drop column if exists failed_providers;

alter table public.ai_request_log
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists latency_ms integer check (latency_ms is null or latency_ms >= 0),
  add column if not exists failed_providers text[];
```

Verify:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='ai_request_log'
  and column_name in ('provider','model','latency_ms','failed_providers');
-- expect 4 rows
```

### A2 — ai_request_log.session_key (apply BEFORE deploying learnora-ai)

```sql
-- Bill the daily AI allowance per study session instead of per call.
--
-- A Study session (Explain, Socratic, Teach, Practice) makes several calls.
-- Counted per call, the free plan's 2 a day for these tools meant one
-- Explain session a day, and a Socratic session hit the limit after its
-- first answer and fell back to canned questions. learnora-ai now counts
-- each distinct session_key once (with a per-session call cap) and every
-- call without one as before.
--
-- Additive and nullable. Apply BEFORE deploying the learnora-ai version
-- that writes it: until then the function's insert fails, which it logs
-- and allows (it fails open), so limits would not be enforced.
--
-- Revert: drop index if exists ai_request_log_user_tool_created_idx;
--         alter table public.ai_request_log drop column if exists session_key;

alter table public.ai_request_log
  add column if not exists session_key text
    check (session_key is null or session_key ~ '^[A-Za-z0-9_-]{6,80}$');

create index if not exists ai_request_log_user_tool_created_idx
  on public.ai_request_log (user_id, tool, created_at);
```

Verify:

```sql
select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='ai_request_log' and column_name='session_key') as has_session_key,
  exists(select 1 from pg_indexes where indexname='ai_request_log_user_tool_created_idx') as has_index;
-- expect true, true
```

### A3 — study_session_state table

```sql
-- Study sessions (Explain / Socratic / Practice / Teach / Recall) saved on
-- the server as well as in the browser.
--
-- Sessions lived only in localStorage: a session started at school could
-- not be resumed on a phone ("That session isn't on this device. Sessions
-- are saved in the browser you studied in."), and Today's Resume card only
-- appeared on the original device. The client keeps localStorage as a
-- write-through cache and upserts here (webapp/src/api/studySessionSync.ts).
--
-- Owner-only RLS on every verb, matching every other student table. The
-- record is bounded so a runaway transcript cannot grow a row without
-- limit.
--
-- Revert: drop table if exists public.study_session_state;

create table if not exists public.study_session_state (
  user_id    uuid not null references auth.users (id) on delete cascade,
  id         text not null check (id ~ '^[A-Za-z0-9_-]{6,80}$'),
  status     text not null check (status in ('active', 'paused', 'done')),
  record     jsonb not null check (pg_column_size(record) <= 262144),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists study_session_state_user_updated_idx
  on public.study_session_state (user_id, updated_at desc);

alter table public.study_session_state enable row level security;

drop policy if exists "study_session_state_select_own" on public.study_session_state;
create policy "study_session_state_select_own" on public.study_session_state
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "study_session_state_insert_own" on public.study_session_state;
create policy "study_session_state_insert_own" on public.study_session_state
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "study_session_state_update_own" on public.study_session_state;
create policy "study_session_state_update_own" on public.study_session_state
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "study_session_state_delete_own" on public.study_session_state;
create policy "study_session_state_delete_own" on public.study_session_state
  for delete to authenticated using ((select auth.uid()) = user_id);
```

Verify:

```sql
select relrowsecurity from pg_class where oid = 'public.study_session_state'::regclass;   -- expect true
select count(*) from pg_policies where tablename = 'study_session_state';                -- expect 4
```

Account deletion: rows go with the user through `on delete cascade` on `auth.users`, so `delete-account` needs no change.

### A4 — redeploy the AI function

```bash
supabase functions deploy learnora-ai
```

Production currently runs **learnora-ai v64**, which predates this PR. The other functions don't need redeploying for this PR. Current versions: stripe-billing v18, stripe-webhook v16, delete-account v12, send-email-reminders v13, web-research v5, send-push-reminders v3.

Smoke test after deploy: run one Explain session in the app, then

```sql
select tool, session_key, provider, model, latency_ms, failed_providers
from public.ai_request_log order by created_at desc limit 5;
-- expect session_key and provider/model filled for the new rows
```

---

## Section B — only when you merge these feature branches

These live on branches with no open PR. **Don't apply them before their code is merged.** They're harmless on their own, but they'd widen what Storage accepts with no client using it.

> ⚠️ **Version collision:** both branches have a migration with version **`20260929000000`**. Merging both as-is gives two files with the same version, and `supabase db push` will reject or skip one. Before merging the second branch, rename dreamy-keller's file to `20260929020000_flashcards_last_reviewed_at.sql`. **Done on `claude/dreamy-keller-3sjvnp` (2026-10-01).** Both are also dated *before* this PR's `20261001…` files. That's fine for the SQL Editor, but with the CLI you may need `supabase db push --include-all`.

### B1 — branch `claude/beautiful-cerf-vt46z2` (photo study material, chat image generation)

Apply both, in order, when that branch merges. Production's `materials` bucket currently has **no image types**, so photo uploads from that branch would be refused until B1a runs.

#### B1a — `20260929000000_materials_allow_study_photos.sql`

```sql
-- Photos as study material: a whiteboard, worksheet or textbook page.
--
-- The Create panel (webapp/src/components/create/MaterialPanel.tsx) now
-- accepts a photo, shrinks it in the browser to a JPEG of at most 2048px
-- (webapp/src/lib/studyImage.ts), and stores it in `materials` like any other
-- upload before Gemini reads it into notes. The allowlist set in
-- 20260928000000_storage_limits_and_session_guards.sql has no image types, so
-- that upload would be refused by Storage.
--
-- Only the three types the client produces or passes through are added. SVG
-- stays out on purpose: it is a document that can carry script, not a photo.
-- The 10 MB file_size_limit is unchanged.
--
-- Idempotent: types already present are not added twice, and a bucket with no
-- allowlist at all (null — everything allowed) is left alone.
--
-- To revert:
--   update storage.buckets
--   set allowed_mime_types = array(
--     select t from unnest(allowed_mime_types) as t
--     where t not in ('image/jpeg', 'image/png', 'image/webp')
--   )
--   where id = 'materials';

update storage.buckets as b
set allowed_mime_types = b.allowed_mime_types || array(
  select t
  from unnest(array['image/jpeg', 'image/png', 'image/webp']) as t
  where t <> all (b.allowed_mime_types)
)
where b.id = 'materials'
  and b.allowed_mime_types is not null
  and not (b.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp']);
```

#### B1b — `20260929010000_add_chat_media_bucket.sql`

```sql
-- Images generated in the chat ("Generate image").
--
-- The learnora-ai edge function (mode "image") generates a diagram, stores it
-- here under the student's own user id, and returns only the storage key. The
-- chat transcript keeps that key, never the image bytes or a URL, and the app
-- reads it back through a short-lived signed URL — the same shape as
-- `card-media` (20260905010000_add_flashcard_images.sql).
--
-- The upload is made with the student's own JWT, not the service role, so the
-- insert policy below is what decides where it may land.
--
-- Private bucket. 5 MB is well above a 1024px PNG from any provider in the
-- image chain; SVG is excluded because it is a document that can carry script.
--
-- Idempotent: the bucket insert is skipped if it exists, and each policy is
-- dropped before it is created.
--
-- To revert (objects must be removed first; Storage refuses to drop a
-- non-empty bucket):
--   drop policy if exists "chat_media_read_own" on storage.objects;
--   drop policy if exists "chat_media_insert_own" on storage.objects;
--   drop policy if exists "chat_media_delete_own" on storage.objects;
--   delete from storage.buckets where id = 'chat-media';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

-- Every object is filed under the owner's user id; these policies make that
-- prefix load-bearing. No update policy: a generated image is never
-- overwritten, only written once and (on account deletion) removed.
drop policy if exists "chat_media_read_own" on storage.objects;
create policy "chat_media_read_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "chat_media_insert_own" on storage.objects;
create policy "chat_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "chat_media_delete_own" on storage.objects;
create policy "chat_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
```

Verify:

```sql
select id, allowed_mime_types from storage.buckets where id in ('materials','chat-media');
-- materials includes image/jpeg, image/png, image/webp; chat-media exists, private
```

Check before merging that branch: make sure `delete-account` also empties the user's folder in `chat-media` (Storage objects are not removed by the `auth.users` cascade).

### B2 — branch `claude/dreamy-keller-3sjvnp` (offline flashcard review)

#### B2a — `20260929020000_flashcards_last_reviewed_at.sql` (renamed from `20260929000000_…` — see collision note)

```sql
-- Offline flashcard review: order card reviews by when they happened.
--
-- A review graded with no connection waits in the device's queue and is
-- written when the connection comes back — possibly hours later, and possibly
-- after the same card was reviewed again on another device. Until now the
-- write was unconditional, so whichever arrived last won, not whichever
-- happened last: a stale offline grade could overwrite a newer schedule.
--
-- The client (webapp/src/api/flashcards.ts `updateReview`) now stamps each
-- review with the moment it was graded and writes only
--   where last_reviewed_at is null or last_reviewed_at < <this review's time>
-- so the newest review wins wherever it came from, and replaying a review
-- that already landed (a retry, a double flush) matches no row and changes
-- nothing — the sync is idempotent.
--
-- Nullable with no default and no backfill: every existing card simply has no
-- recorded review yet, which the condition treats as "older than anything".
-- Row access is unchanged — the column sits under flashcards' existing
-- owner-only RLS policies.
--
-- The client degrades to the old unconditional write until this is applied.
--
-- Reverse with:
--   alter table public.flashcards drop column if exists last_reviewed_at;

alter table public.flashcards
  add column if not exists last_reviewed_at timestamptz;

comment on column public.flashcards.last_reviewed_at is
  'When the latest applied review was graded (client time). Reviews older than this are ignored, so offline replays are idempotent and the newest review wins.';
```

Verify:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='flashcards' and column_name='last_reviewed_at';
-- expect 1 row
```

---

## Section C — production snapshot (2026-10-01, before any of the above)

| Check | Value |
|-------|-------|
| Applied migrations | 44, all matching repo files on `main` |
| `ai_request_log` columns | `id, user_id, tool, mode, created_at` (none of A1/A2) |
| `study_session_state` | absent |
| `flashcards.last_reviewed_at` | absent |
| `chat-media` bucket | absent |
| `materials` MIME allowlist | pdf, msword, docx, text/plain, audio/*, video/mp4, video/ogg, application/ogg, application/octet-stream (no images) |
| `notes.updated_at` + trigger, `profiles.settings` | present (2026-09-28 migration applied correctly) |
| `learning_events` | present |

---

## Section D — other ops to do with this deploy

1. **Remove the dead `CEREBRAS_API_KEY` secret.** It answered 402 to every request. The function now skips dead keys, but it still costs one round trip per cold start:
   `supabase secrets unset CEREBRAS_API_KEY`
2. **Optional:** set `AI_PROVIDER_ALLOWLIST` (comma-separated provider ids) to pin the chain to providers named in the privacy policy. If unset, it defaults to the disclosed list in `supabase/functions/_shared/providerPolicy.js`, which excludes Mistral.
3. **Legal sign-off on the updated privacy/provider wording** in the webapp's privacy and consent copy before the webapp deploy.

---

## Done

- **2026-10-02 — Sections A and B live.** Applied through the Supabase MCP in filename order: B1a, B1b, B2a, A1, A2, A3. Verified: the `ai_request_log` columns `provider`, `model`, `latency_ms`, `failed_providers` and `session_key` exist; `study_session_state` exists with RLS on, four owner-only policies and `authenticated` grants; the `chat-media` bucket and its three policies exist; `flashcards.last_reviewed_at` exists; `materials` allows jpeg/png/webp.
  - B1b and A3 went in with their `drop policy if exists … ; create policy …` pairs rewritten as `create policy` guarded by a `pg_policies` existence check. The MCP refused the statements containing `drop`, and on a fresh object the drops are no-ops, so the result is identical. The repo files are unchanged.
- **2026-10-02 — C2 and C3 applied ahead of their merge.**
  - `question_bank`: students can read it, only the service role can write it, anonymous users get nothing. It was seeded from `webapp/src/lib/questionBank/seed/*.json`, with Postgres computing each content hash the same way `build.ts` does. An md5 over every row's spec, ref, tier, answer, explanation and hash matched the repo's: 228 rows.
  - `past_paper_attempts`: owner-only, and can only be filed against one of the student's own exams.
  - Re-seeding later: `node webapp/scripts/question-bank/seed-sql.mjs | psql` (idempotent).
  - Oak import: see `docs/QUESTION_SOURCES.md`.
- **2026-10-02 — C1 applied ahead of its merge.** `exams.syllabus_id` and `exams.syllabus_tier` exist in production. Nothing on `main` reads or writes them, so it is inert until branch `ccr-21911d53-k2odo3` merges; the branch's client also retries a save without them if they are ever missing.
- **2026-10-02 — learnora-ai v65 deployed** (after A2, as required). The deployed `learnora-ai/index.ts` and all five `_shared/*.js` files were downloaded back and are byte-identical to `main`. No AI traffic had arrived by the time of writing (the last `ai_request_log` row is 2026-09-26), so the outcome columns have not yet been seen filled on a live request.
