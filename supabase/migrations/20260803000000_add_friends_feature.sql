-- Friends feature: a shareable personal invite code, a friendships table, and
-- the RPCs that let two accepted friends see each other's name, avatar and
-- study stats. Implements FRIENDS_FEATURE.md.
--
-- The governing constraint is that every other table in this schema is
-- owner-only ("(select auth.uid()) = user_id"), and this feature is the first
-- one that needs *cross-user* reads. Loosening `profiles` or `study_sessions`
-- RLS to allow that would expose those rows to every authenticated user, not
-- just to accepted friends — RLS has no way to express "rows of people I am
-- friends with" cheaply without a subquery on every read of every table.
--
-- So: no existing policy is touched. All cross-user access goes through the
-- SECURITY DEFINER functions at the bottom of this file, each of which checks
-- friendship state itself and returns only the minimal columns needed. The
-- `friendships` table gets a SELECT policy and *no* INSERT/UPDATE/DELETE
-- policy at all, so the business rules (no self-friending, no duplicate rows,
-- collapsing a mutual request into an accepted friendship) live in exactly one
-- place instead of being spread across client code and policy expressions.
--
-- Every function here is `set search_path = public, extensions, pg_temp` —
-- pg_temp last, deliberately. An unqualified name in a SECURITY DEFINER
-- function otherwise resolves against the *caller's* temp schema first for
-- tables and types, which is the classic way a definer function gets tricked
-- into reading an attacker-supplied table. Table references are also fully
-- qualified, so the search_path is a second line of defence rather than the
-- only one.

-- =========================================================================
-- 0. public.profiles — make sure it exists and is actually populated.
--
--    The table is already live (the hardening migration alters its "Users can
--    manage own profile" policy), but nothing currently writes to it:
--    handle_new_user() is a dead stub whose insert is commented out
--    (supabase_auth_trigger.sql), and no client code reads or writes profiles
--    at all. An unpopulated profiles table would make every friend render as
--    a blank row, so this feature has to own keeping it in sync.
--
--    A separate trigger rather than un-commenting handle_new_user(): that stub
--    was deliberately left inert and had its RPC EXECUTE grants revoked in
--    20260727010000, so reviving it would undo a prior hardening decision.
--    This trigger does one narrow thing and says so in its name.
-- =========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  updated_at timestamptz not null default now()
);

-- `create table if not exists` is a no-op against the table that is already
-- live, and its real column list has never been checked into this repo — only
-- inferred from a policy name and a commented-out trigger body. These are the
-- four columns the code below writes, so each is asserted independently
-- rather than assumed to have come with the table.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;

-- The pre-existing "Users can manage own profile" policy is left exactly as
-- it is. This only covers the case where the table was just created above.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  ) then
    create policy "Users can manage own profile" on public.profiles
      using ((select auth.uid()) = id);
  end if;
end;
$$;

create or replace function public.sync_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, updated_at)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), ''),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    -- Only overwrite with a non-null value: a user who later clears their
    -- metadata shouldn't blank out a name their friends already see.
    full_name = coalesce(excluded.full_name, profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();
  return new;
end;
$$;

revoke execute on function public.sync_profile_from_auth_user() from public;
revoke execute on function public.sync_profile_from_auth_user() from anon;
revoke execute on function public.sync_profile_from_auth_user() from authenticated;

drop trigger if exists sync_profile_on_auth_user_change on auth.users;
create trigger sync_profile_on_auth_user_change
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_profile_from_auth_user();

-- Backfill anyone who signed up while the stub trigger was inert.
insert into public.profiles (id, email, full_name, avatar_url, updated_at)
select
  u.id,
  u.email,
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'avatar_url', '')), ''),
  now()
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  full_name = coalesce(profiles.full_name, excluded.full_name),
  avatar_url = coalesce(profiles.avatar_url, excluded.avatar_url);

-- =========================================================================
-- 1. friend_code — one evergreen, regenerable invite code per profile.
--
--    8 characters from a 31-symbol alphabet with 0/1/I/L/O removed (they're
--    the pairs people mis-transcribe when a link gets read aloud or retyped),
--    so ~39.6 bits. Guessing one only ever buys the guesser the ability to
--    *ask* to be someone's friend — the code holder still has to accept — and
--    a code can be rotated from Settings, so this is sized for
--    "unguessable over HTTP", not for secret-key duty.
-- =========================================================================
create or replace function public.generate_friend_code()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  candidate text;
  byte int;
  attempts int := 0;
begin
  loop
    candidate := '';
    for i in 1 .. 8 loop
      -- Rejection-sample so the modulo below stays uniform: 248 is the
      -- largest multiple of 31 that fits in a byte, so bytes 248..255 are
      -- redrawn rather than biasing the first 8 symbols of the alphabet.
      loop
        byte := get_byte(gen_random_bytes(1), 0);
        exit when byte < 248;
      end loop;
      candidate := candidate || substr(alphabet, 1 + (byte % 31), 1);
    end loop;

    exit when not exists (
      select 1 from public.profiles p where p.friend_code = candidate
    );

    attempts := attempts + 1;
    if attempts > 20 then
      raise exception 'could not generate a unique friend code after % attempts', attempts;
    end if;
  end loop;

  return candidate;
end;
$$;

revoke execute on function public.generate_friend_code() from public;
revoke execute on function public.generate_friend_code() from anon;
revoke execute on function public.generate_friend_code() from authenticated;

alter table public.profiles add column if not exists friend_code text;

-- Row at a time, not one set-based UPDATE: generate_friend_code() checks its
-- candidate against public.profiles, and inside a single statement that check
-- reads the pre-statement snapshot — so a batch update could hand two rows the
-- same code and then fail on the unique index below. Separate statements each
-- see the previous one's assignment.
do $$
declare
  r record;
begin
  for r in select p.id from public.profiles p where p.friend_code is null loop
    update public.profiles
    set friend_code = public.generate_friend_code()
    where id = r.id;
  end loop;
end;
$$;

create unique index if not exists profiles_friend_code_key
  on public.profiles (friend_code);

alter table public.profiles alter column friend_code set not null;

create or replace function public.set_friend_code_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if new.friend_code is null then
    new.friend_code := public.generate_friend_code();
  end if;
  return new;
end;
$$;

revoke execute on function public.set_friend_code_on_insert() from public;
revoke execute on function public.set_friend_code_on_insert() from anon;
revoke execute on function public.set_friend_code_on_insert() from authenticated;

drop trigger if exists profiles_set_friend_code on public.profiles;
create trigger profiles_set_friend_code
  before insert on public.profiles
  for each row execute function public.set_friend_code_on_insert();

-- =========================================================================
-- 2. friendships
--
--    One row per ordered pair. `unique (requester_id, addressee_id)` stops
--    the same person requesting twice; the reverse pair is collapsed in
--    request_or_accept_friend() rather than by a constraint, because
--    Postgres can't express "unique on the unordered pair" without either a
--    generated least/greatest column or an expression index that would then
--    need the RPC to normalise direction anyway — and direction is real
--    information here (it decides who gets the "accept?" prompt).
-- =========================================================================
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users (id) on delete cascade,
  addressee_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_no_self check (requester_id <> addressee_id),
  constraint friendships_unique_pair unique (requester_id, addressee_id)
);

create index if not exists friendships_requester_id_idx
  on public.friendships (requester_id);
create index if not exists friendships_addressee_id_idx
  on public.friendships (addressee_id);
create index if not exists friendships_status_idx
  on public.friendships (status);

alter table public.friendships enable row level security;

-- SELECT only, and only rows you are part of. There is deliberately no
-- INSERT/UPDATE/DELETE policy: with RLS enabled and no permissive policy for
-- a command, that command is denied for every non-superuser, so the RPCs
-- below (which run as the table owner and bypass RLS) are the only write path.
drop policy if exists "friendships_select_own" on public.friendships;
create policy "friendships_select_own" on public.friendships
  for select using ((select auth.uid()) in (requester_id, addressee_id));

-- =========================================================================
-- 3. Shared helpers. Not callable over the REST RPC surface — they take a
--    target user id and would otherwise be a way to read any user's stats.
--    The definer functions in section 4 run as the owner, so they can still
--    call these.
-- =========================================================================

-- Falls back to UTC rather than raising: a client sending a garbage IANA name
-- should get a slightly-off streak, not a broken leaderboard.
create or replace function public.safe_timezone(tz text)
returns text
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select case
    when tz is not null and exists (
      select 1 from pg_catalog.pg_timezone_names n where n.name = tz
    ) then tz
    else 'UTC'
  end;
$$;

revoke execute on function public.safe_timezone(text) from public;
revoke execute on function public.safe_timezone(text) from anon;
revoke execute on function public.safe_timezone(text) from authenticated;

-- SQL port of computeStreak() in webapp/src/views/dashboard/analytics.ts:
-- a day counts once it totals >= 5 minutes, today is a grace day (not having
-- studied *yet* today must not read as a broken streak), and only a fully
-- missed day ends the run. The client computes days in the browser's local
-- zone, so the zone is a parameter here instead of being hard-coded to UTC —
-- otherwise a friend's streak would tick over at a different moment than
-- their own dashboard says it does.
create or replace function public.friend_streak(target uuid, tz text)
returns int
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  tzone text := public.safe_timezone(tz);
  qualifying date[];
  day_cursor date;
  run_length int := 0;
begin
  select coalesce(array_agg(q.d), '{}'::date[])
  into qualifying
  from (
    select (s.started_at at time zone tzone)::date as d
    from public.study_sessions s
    where s.user_id = target
      and s.started_at >= now() - interval '400 days'
    group by 1
    having sum(coalesce(s.minutes, 0)) >= 5
  ) q;

  day_cursor := (now() at time zone tzone)::date;
  if not (day_cursor = any (qualifying)) then
    day_cursor := day_cursor - 1;
  end if;

  while day_cursor = any (qualifying) loop
    run_length := run_length + 1;
    day_cursor := day_cursor - 1;
  end loop;

  return run_length;
end;
$$;

revoke execute on function public.friend_streak(uuid, text) from public;
revoke execute on function public.friend_streak(uuid, text) from anon;
revoke execute on function public.friend_streak(uuid, text) from authenticated;

-- Minutes since Monday, matching mondayOfWeek() in webapp/src/lib/date.ts —
-- date_trunc('week', ...) is Monday-based in Postgres, so the two agree.
create or replace function public.friend_weekly_minutes(target uuid, tz text)
returns int
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(sum(s.minutes), 0)::int
  from public.study_sessions s
  where s.user_id = target
    and (s.started_at at time zone public.safe_timezone(tz))::date
        >= date_trunc('week', now() at time zone public.safe_timezone(tz))::date;
$$;

revoke execute on function public.friend_weekly_minutes(uuid, text) from public;
revoke execute on function public.friend_weekly_minutes(uuid, text) from anon;
revoke execute on function public.friend_weekly_minutes(uuid, text) from authenticated;

-- =========================================================================
-- 4. The client-facing RPCs.
--
--    Each one re-reads auth.uid() itself rather than trusting a caller-passed
--    user id — a SECURITY DEFINER function that took "who am I" as an
--    argument would let any signed-in user act as anyone else.
-- =========================================================================

-- Who does this invite code belong to, and what is my current relationship to
-- them? Called before any friendship exists, to render the "Add Alex?" card.
create or replace function public.resolve_friend_code(code text)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  is_self boolean,
  relationship text
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := (select auth.uid());
  normalized text := upper(btrim(coalesce(code, '')));
  owner_id uuid;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Cheap shape check before touching the index; also keeps a multi-megabyte
  -- "code" from ever reaching the query.
  if normalized !~ '^[2-9A-HJKMNP-Z]{8}$' then
    return;
  end if;

  select p.id into owner_id
  from public.profiles p
  where p.friend_code = normalized;

  -- No row: the caller renders "this link is not valid any more". Returning
  -- an empty set rather than raising keeps a bad/rotated link from looking
  -- like a server error.
  if owner_id is null then
    return;
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.id = viewer as is_self,
    coalesce(
      (
        select case
          when f.status = 'accepted' then 'accepted'
          when f.status = 'pending' and f.requester_id = viewer then 'outgoing'
          when f.status = 'pending' then 'incoming'
          else 'none'
        end
        from public.friendships f
        where (f.requester_id = viewer and f.addressee_id = p.id)
           or (f.requester_id = p.id and f.addressee_id = viewer)
        order by case f.status when 'accepted' then 0 when 'pending' then 1 else 2 end
        limit 1
      ),
      'none'
    ) as relationship
  from public.profiles p
  where p.id = owner_id;
end;
$$;

revoke execute on function public.resolve_friend_code(text) from public;
revoke execute on function public.resolve_friend_code(text) from anon;
grant execute on function public.resolve_friend_code(text) to authenticated;

-- The single mutating entry point for "I followed someone's invite link".
-- Returns the resulting status: 'pending' (request sent) or 'accepted' (they
-- had already requested me, so this collapses into a mutual friendship).
create or replace function public.request_or_accept_friend(code text)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := (select auth.uid());
  normalized text := upper(btrim(coalesce(code, '')));
  owner_id uuid;
  existing_row public.friendships;
  reverse_row public.friendships;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if normalized !~ '^[2-9A-HJKMNP-Z]{8}$' then
    raise exception 'invalid friend code' using errcode = '22023';
  end if;

  select p.id into owner_id
  from public.profiles p
  where p.friend_code = normalized;

  if owner_id is null then
    raise exception 'invalid friend code' using errcode = '22023';
  end if;

  if owner_id = viewer then
    raise exception 'you cannot add yourself' using errcode = '22023';
  end if;

  -- Lock both directions for the rest of the transaction so two people
  -- opening each other's links at the same moment can't each insert a
  -- pending row and end up with two half-friendships.
  select * into existing_row
  from public.friendships f
  where f.requester_id = viewer and f.addressee_id = owner_id
  for update;

  select * into reverse_row
  from public.friendships f
  where f.requester_id = owner_id and f.addressee_id = viewer
  for update;

  if reverse_row.id is not null then
    if reverse_row.status = 'accepted' then
      return 'accepted';
    end if;
    -- They asked first (or I declined them earlier and have now changed my
    -- mind by following their link) — either way this is consent from both
    -- sides, so it becomes a friendship without a second prompt.
    update public.friendships
    set status = 'accepted', responded_at = now()
    where id = reverse_row.id;
    return 'accepted';
  end if;

  if existing_row.id is not null then
    if existing_row.status = 'accepted' then
      return 'accepted';
    end if;
    -- Re-asking after being declined resets the request rather than
    -- inserting a duplicate the unique constraint would reject.
    update public.friendships
    set status = 'pending', created_at = now(), responded_at = null
    where id = existing_row.id;
    return 'pending';
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (viewer, owner_id, 'pending');
  return 'pending';
end;
$$;

revoke execute on function public.request_or_accept_friend(text) from public;
revoke execute on function public.request_or_accept_friend(text) from anon;
grant execute on function public.request_or_accept_friend(text) to authenticated;

-- Accept or decline a request that was sent *to me*.
create or replace function public.respond_to_friend_request(
  request_id uuid,
  accept boolean
)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := (select auth.uid());
  next_status text := case when accept then 'accepted' else 'declined' end;
  updated int;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- The addressee_id check is the authorisation: only the person who was
  -- asked can answer, and only while it is still pending.
  update public.friendships f
  set status = next_status, responded_at = now()
  where f.id = request_id
    and f.addressee_id = viewer
    and f.status = 'pending';

  get diagnostics updated = row_count;
  if updated = 0 then
    raise exception 'no pending friend request to respond to' using errcode = '22023';
  end if;

  return next_status;
end;
$$;

revoke execute on function public.respond_to_friend_request(uuid, boolean) from public;
revoke execute on function public.respond_to_friend_request(uuid, boolean) from anon;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;

-- Either side can end a friendship, and either side can withdraw a request
-- they sent. Deleting rather than marking 'declined' so the pair is free to
-- start over later without tripping the unique constraint.
create or replace function public.remove_friend(friendship_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := (select auth.uid());
  deleted int;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  delete from public.friendships f
  where f.id = friendship_id
    and viewer in (f.requester_id, f.addressee_id);

  get diagnostics deleted = row_count;
  if deleted = 0 then
    raise exception 'no such friendship' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.remove_friend(uuid) from public;
revoke execute on function public.remove_friend(uuid) from anon;
grant execute on function public.remove_friend(uuid) to authenticated;

-- Pending requests in both directions, with the other person's name attached.
-- This can't be a plain `friendships` table read from the client: the row is
-- readable under the SELECT policy, but the *name* on it is not — profiles
-- stays owner-only, so resolving requester_id to a human being has to happen
-- server-side.
create or replace function public.get_friend_requests()
returns table (
  friendship_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  direction text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := (select auth.uid());
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
  select
    f.id,
    p.id,
    p.full_name,
    p.avatar_url,
    case when f.addressee_id = viewer then 'incoming' else 'outgoing' end,
    f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.addressee_id = viewer then f.requester_id else f.addressee_id end
  where f.status = 'pending'
    and viewer in (f.requester_id, f.addressee_id)
  order by f.created_at desc;
end;
$$;

revoke execute on function public.get_friend_requests() from public;
revoke execute on function public.get_friend_requests() from anon;
grant execute on function public.get_friend_requests() to authenticated;

-- The leaderboard: accepted friends plus the caller, ranked by minutes
-- studied this week. Aggregating here is the whole point — the client never
-- gets another user's study_sessions rows, only these two numbers.
create or replace function public.get_friends_leaderboard(tz text default 'UTC')
returns table (
  friendship_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  weekly_minutes int,
  streak int,
  is_self boolean,
  rank int
)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := (select auth.uid());
  tzone text := public.safe_timezone(tz);
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
  with people as (
    -- The caller's own row, so the board reads as a standing rather than a
    -- list of other people's numbers.
    select null::uuid as friendship_id, viewer as person_id, true as self
    union all
    select
      f.id,
      case when f.requester_id = viewer then f.addressee_id else f.requester_id end,
      false
    from public.friendships f
    where f.status = 'accepted'
      and viewer in (f.requester_id, f.addressee_id)
  ),
  scored as (
    select
      pe.friendship_id,
      pe.person_id,
      pr.full_name,
      pr.avatar_url,
      public.friend_weekly_minutes(pe.person_id, tzone) as mins,
      public.friend_streak(pe.person_id, tzone) as days,
      pe.self
    from people pe
    join public.profiles pr on pr.id = pe.person_id
  )
  select
    s.friendship_id,
    s.person_id,
    s.full_name,
    s.avatar_url,
    s.mins,
    s.days,
    s.self,
    (rank() over (order by s.mins desc))::int
  from scored s
  order by s.mins desc, s.full_name asc nulls last;
end;
$$;

revoke execute on function public.get_friends_leaderboard(text) from public;
revoke execute on function public.get_friends_leaderboard(text) from anon;
grant execute on function public.get_friends_leaderboard(text) to authenticated;

-- Rotate my own invite code, invalidating any link I have already shared.
create or replace function public.regenerate_friend_code()
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  viewer uuid := (select auth.uid());
  fresh text;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  fresh := public.generate_friend_code();

  update public.profiles p
  set friend_code = fresh, updated_at = now()
  where p.id = viewer;

  if not found then
    raise exception 'no profile for the current user' using errcode = '22023';
  end if;

  return fresh;
end;
$$;

revoke execute on function public.regenerate_friend_code() from public;
revoke execute on function public.regenerate_friend_code() from anon;
grant execute on function public.regenerate_friend_code() to authenticated;
