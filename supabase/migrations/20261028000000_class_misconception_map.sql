-- Class misconception map. NOT FOR STUDENTS YET: the webapp shows it only
-- behind the `classMap` flag, which is off in production, and it needs a
-- privacy review before that flag is turned on (WAITINGONLEDGER.md).
--
-- A teacher creates a class and shares its join code. A student joins with
-- the code and then, as a separate choice, turns on sharing. The teacher
-- never reads a membership row or a ledger row. All they can call is
-- class_misconception_map(), which returns how many sharing students hold
-- each catalogue belief:
--   - nothing at all until at least 5 students in the class share;
--   - only beliefs held by at least 2 of them, so no count points at one
--     student;
--   - only catalogue beliefs (misconceptions.catalogue_id), so no text a
--     student wrote, or a model wrote about them, leaves their account.
-- The two thresholds are mirrored in webapp/src/lib/classMap.ts, and a test
-- there reads this file to keep them equal.
--
-- 1. classes: the teacher's. Owner reads and writes; a member can read the
--    name of a class they are in.
-- 2. class_members: one row per student per class. share_mistakes is false
--    until the student turns it on. A student sees, updates and deletes only
--    their own row; nobody inserts directly (join_class does).
-- 3. join_class(code): adds the caller to the class with that code.
-- 4. class_member_counts(class), class_misconception_map(class): owner only.
--
-- Revert: drop function if exists public.class_misconception_map(uuid);
--   drop function if exists public.class_member_counts(uuid);
--   drop function if exists public.join_class(text);
--   drop table if exists public.class_members;
--   drop table if exists public.classes;

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  join_code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_at timestamptz not null default now()
);

alter table public.classes drop constraint if exists classes_name_length;
alter table public.classes
  add constraint classes_name_length check (char_length(btrim(name)) between 1 and 80);

create unique index if not exists classes_join_code_key on public.classes (join_code);
create index if not exists classes_owner_idx on public.classes (owner_id);

alter table public.classes enable row level security;

create table if not exists public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  share_mistakes boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (class_id, user_id)
);

create index if not exists class_members_user_idx on public.class_members (user_id);

alter table public.class_members enable row level security;

drop policy if exists "classes_owner" on public.classes;
create policy "classes_owner" on public.classes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "classes_member_read" on public.classes;
create policy "classes_member_read" on public.classes
  for select to authenticated
  using (
    exists (
      select 1 from public.class_members m
      where m.class_id = classes.id and m.user_id = (select auth.uid())
    )
  );

drop policy if exists "class_members_self_read" on public.class_members;
create policy "class_members_self_read" on public.class_members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "class_members_self_update" on public.class_members;
create policy "class_members_self_update" on public.class_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "class_members_self_delete" on public.class_members;
create policy "class_members_self_delete" on public.class_members
  for delete to authenticated
  using (user_id = (select auth.uid()));

/* Joining goes through join_class, which checks the code. */
revoke insert on public.class_members from anon, authenticated;
revoke all on public.classes, public.class_members from anon;

create or replace function public.join_class(p_code text)
returns table (class_id uuid, class_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_id uuid;
  found_name text;
begin
  if (select auth.uid()) is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  select c.id, c.name into found_id, found_name
  from public.classes c
  where c.join_code = upper(btrim(p_code));
  if found_id is null then
    return;
  end if;
  insert into public.class_members (class_id, user_id)
  values (found_id, (select auth.uid()))
  on conflict do nothing;
  return query select found_id, found_name;
end;
$$;

create or replace function public.class_member_counts(p_class uuid)
returns table (joined integer, sharing integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.classes c where c.id = p_class and c.owner_id = (select auth.uid())
  ) then
    raise exception 'not your class' using errcode = '42501';
  end if;
  return query
    select count(*)::integer, count(*) filter (where m.share_mistakes)::integer
    from public.class_members m
    where m.class_id = p_class;
end;
$$;

create or replace function public.class_misconception_map(p_class uuid)
returns table (catalogue_id text, students integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  sharing integer;
begin
  if not exists (
    select 1 from public.classes c where c.id = p_class and c.owner_id = (select auth.uid())
  ) then
    raise exception 'not your class' using errcode = '42501';
  end if;
  select count(*) into sharing
  from public.class_members m
  where m.class_id = p_class and m.share_mistakes;
  if sharing < 5 then
    return;
  end if;
  return query
    select mc.catalogue_id, count(distinct mc.user_id)::integer
    from public.misconceptions mc
    join public.class_members m
      on m.user_id = mc.user_id and m.class_id = p_class and m.share_mistakes
    where mc.catalogue_id is not null
      and mc.status <> 'resolved'
      and (not coalesce(mc.provisional, false) or mc.times_observed >= 2)
    group by mc.catalogue_id
    having count(distinct mc.user_id) >= 2
    order by 2 desc, 1;
end;
$$;

revoke all on function public.join_class(text) from public, anon;
revoke all on function public.class_member_counts(uuid) from public, anon;
revoke all on function public.class_misconception_map(uuid) from public, anon;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.class_member_counts(uuid) to authenticated;
grant execute on function public.class_misconception_map(uuid) to authenticated;
