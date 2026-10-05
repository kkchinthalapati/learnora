-- The mistake memory loop: match -> repair -> delayed retest -> resolved.
--
-- New rule (webapp/src/lib/mistakeLoop.ts holds the tested TypeScript copy;
-- change both together): a misconception is resolved only by a correct
-- answer on a NEW question at least 2 days after its repair. A correct answer
-- sooner, on the question that was failed, on the repair's own check, or with
-- no question at all (a tool's judgement) moves it to 'improving' at most.
-- The old rule (two corrections outnumbering the errors) let an immediate
-- re-answer close a row, so it measured short-term recall, not repair.
--
-- What this adds:
--   misconceptions          provisional, error_type, catalogue_id,
--                           repair_text, contrast_text, repaired_at,
--                           retest_due_at, excluded_question_keys
--   misconception_observations
--                           kind 'repair'; question_key; due_at;
--                           idempotency_key (unique per user, so a retried
--                           or offline-replayed write is dropped, and the
--                           trigger never sees it twice)
--   apply_misconception_observation   replaced with the rule above
--   guard_misconception_loop_columns  only the trigger may change loop state;
--                                     a client UPDATE of status/repaired_at/…
--                                     is ignored
--   stamp_misconception_observation   repairs take the server's clock, and no
--                                     observation may claim a future time, so
--                                     backdating can't skip the 2-day wait
--
-- Existing rows keep their status. Rows already 'resolved' stay resolved;
-- open/improving rows have no repaired_at and need a repair, like new ones.
-- Additive except for the replaced function and the widened kind check.
-- Idempotent. Ordered after A1-A3 and 20261005000000.
--
-- Revert: restores the previous rule; the loop columns are left, unused.
--   drop trigger if exists misconceptions_guard_loop on public.misconceptions;
--   drop trigger if exists misconception_observations_stamp on public.misconception_observations;
--   drop function if exists public.guard_misconception_loop_columns();
--   drop function if exists public.stamp_misconception_observation();
--   delete from public.misconception_observations where kind = 'repair';
--   alter table public.misconception_observations
--     drop constraint if exists misconception_observations_kind_check;
--   alter table public.misconception_observations
--     add constraint misconception_observations_kind_check
--     check (kind in ('evidence', 'correction'));
--   then re-run the function body from 20260907000000_add_misconception_ledger.sql.

alter table public.misconceptions
  add column if not exists provisional boolean not null default false,
  add column if not exists error_type text,
  add column if not exists catalogue_id text,
  add column if not exists repair_text text,
  add column if not exists contrast_text text,
  add column if not exists repaired_at timestamptz,
  add column if not exists retest_due_at timestamptz,
  add column if not exists excluded_question_keys text[] not null default '{}';

alter table public.misconceptions
  drop constraint if exists misconceptions_error_type_check;
alter table public.misconceptions
  add constraint misconceptions_error_type_check
  check (error_type is null or error_type in ('concept', 'misread', 'calculation', 'time'));

alter table public.misconceptions
  drop constraint if exists misconceptions_repair_text_length_check;
alter table public.misconceptions
  add constraint misconceptions_repair_text_length_check
  check (char_length(coalesce(repair_text, '')) <= 2000
     and char_length(coalesce(contrast_text, '')) <= 2000
     and char_length(coalesce(catalogue_id, '')) <= 80);

alter table public.misconception_observations
  add column if not exists question_key text,
  add column if not exists due_at timestamptz,
  add column if not exists idempotency_key text;

alter table public.misconception_observations
  drop constraint if exists misconception_observations_kind_check;
alter table public.misconception_observations
  add constraint misconception_observations_kind_check
  check (kind in ('evidence', 'correction', 'repair'));

alter table public.misconception_observations
  drop constraint if exists misconception_observations_keys_check;
alter table public.misconception_observations
  add constraint misconception_observations_keys_check
  check ((question_key is null or question_key ~ '^[a-z0-9]{1,40}$')
     and (idempotency_key is null or idempotency_key ~ '^[A-Za-z0-9:_-]{6,200}$'));

-- Not partial: PostgREST's on_conflict can't name a partial index's
-- predicate. NULLs are distinct, so rows without a key never collide.
create unique index if not exists misconception_observations_user_idempotency_key
  on public.misconception_observations (user_id, idempotency_key);

create index if not exists misconceptions_user_retest_due_idx
  on public.misconceptions (user_id, retest_due_at)
  where status <> 'resolved' and retest_due_at is not null;

-- ── The rule ──────────────────────────────────────────────────────────────
create or replace function public.apply_misconception_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.misconceptions%rowtype;
  observed integer;
  corrected integer;
  eligible boolean;
begin
  -- Serialise observations on one row so two arriving together can't both
  -- read the pre-repair state.
  select * into cur from public.misconceptions
  where id = new.misconception_id
  for update;
  if not found then
    return new;
  end if;

  select
    count(*) filter (where kind = 'evidence'),
    count(*) filter (where kind = 'correction')
    into observed, corrected
  from public.misconception_observations
  where misconception_id = new.misconception_id;

  if new.kind = 'evidence' then
    -- Seen again: reopen and void the repair; the failed question can never
    -- count as the "new" one.
    update public.misconceptions set
      times_observed = observed,
      times_corrected = corrected,
      last_seen_at = greatest(last_seen_at, new.occurred_at),
      status = 'open',
      resolved_at = null,
      repaired_at = null,
      retest_due_at = null,
      excluded_question_keys = case
        when new.question_key is null
          or new.question_key = any(cur.excluded_question_keys)
        then cur.excluded_question_keys
        else array_append(cur.excluded_question_keys, new.question_key)
      end
    where id = new.misconception_id;

  elsif new.kind = 'repair' then
    update public.misconceptions set
      repaired_at = new.occurred_at,
      retest_due_at = case
        when cur.status = 'resolved' then null
        else greatest(coalesce(new.due_at, new.occurred_at),
                      new.occurred_at + interval '2 days')
      end,
      excluded_question_keys = case
        when new.question_key is null
          or new.question_key = any(cur.excluded_question_keys)
        then cur.excluded_question_keys
        else array_append(cur.excluded_question_keys, new.question_key)
      end
    where id = new.misconception_id;

  else
    eligible := cur.status <> 'resolved'
      and cur.repaired_at is not null
      and new.occurred_at >= cur.repaired_at + interval '2 days'
      and new.question_key is not null
      and not (new.question_key = any(cur.excluded_question_keys));

    update public.misconceptions set
      times_observed = observed,
      times_corrected = corrected,
      last_seen_at = greatest(last_seen_at, new.occurred_at),
      status = case
        when cur.status = 'resolved' then 'resolved'
        when eligible then 'resolved'
        else 'improving'
      end,
      resolved_at = case when eligible then new.occurred_at else cur.resolved_at end,
      retest_due_at = case when eligible then null else cur.retest_due_at end
    where id = new.misconception_id;
  end if;

  return new;
end;
$$;

-- ── Only the trigger writes loop state ────────────────────────────────────
-- The owner policy lets a student update their own rows (the client upserts
-- summary and severity). Without this, a client could set status='resolved'
-- directly. Writes from inside the observation trigger run at trigger depth
-- 2 and pass; a client's own insert/update runs at depth 1 and has the loop
-- columns held at their current (or initial) values.
create or replace function public.guard_misconception_loop_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.times_observed := 0;
    new.times_corrected := 0;
    new.resolved_at := null;
    new.repaired_at := null;
    new.retest_due_at := null;
    new.excluded_question_keys := '{}';
  else
    new.status := old.status;
    new.times_observed := old.times_observed;
    new.times_corrected := old.times_corrected;
    new.resolved_at := old.resolved_at;
    new.repaired_at := old.repaired_at;
    new.retest_due_at := old.retest_due_at;
    new.excluded_question_keys := old.excluded_question_keys;
  end if;
  return new;
end;
$$;

drop trigger if exists misconceptions_guard_loop on public.misconceptions;
create trigger misconceptions_guard_loop
  before insert or update on public.misconceptions
  for each row execute function public.guard_misconception_loop_columns();

-- ── Observation timestamps ────────────────────────────────────────────────
-- A correction answered offline keeps the time it was answered (so a retest
-- done on day 3 and synced on day 4 counts from day 3), but nothing may claim
-- a future time, and a repair is stamped by the server: backdating a repair
-- is the one way to skip the wait.
create or replace function public.stamp_misconception_observation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'repair' or new.occurred_at is null or new.occurred_at > now() then
    new.occurred_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists misconception_observations_stamp on public.misconception_observations;
create trigger misconception_observations_stamp
  before insert on public.misconception_observations
  for each row execute function public.stamp_misconception_observation();

-- Trigger functions are not for calling directly (as 20260907010000).
revoke all on function public.apply_misconception_observation() from public, anon, authenticated;
revoke all on function public.guard_misconception_loop_columns() from public, anon, authenticated;
revoke all on function public.stamp_misconception_observation() from public, anon, authenticated;
