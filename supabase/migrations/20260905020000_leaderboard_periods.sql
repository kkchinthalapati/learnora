-- Leaderboard time periods.
--
-- The board could only ever answer "this week". A student who studied hard
-- last month, or who is three days into a new week, saw a board that said
-- almost nothing — and the fix is not to change which window is hardcoded,
-- because "this week" is genuinely the right default for a study habit. It is
-- to let them ask a different question.
--
-- `friend_period_minutes` generalises `friend_weekly_minutes`, which is kept
-- (it is still what the dashboard's own reads call) and now delegates, so the
-- two can never drift apart on how a week is bounded.

create or replace function public.friend_period_minutes(
  target uuid,
  tz text,
  period text
)
returns int
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select coalesce(sum(s.minutes), 0)::int
  from public.study_sessions s
  where s.user_id = target
    and (
      -- 'all' has no lower bound. The other two are anchored to the
      -- student's own timezone, so "this week" starts on their Monday
      -- rather than on UTC's.
      period = 'all'
      or (s.started_at at time zone public.safe_timezone(tz))::date
         >= date_trunc(
              case period when 'month' then 'month' else 'week' end,
              now() at time zone public.safe_timezone(tz)
            )::date
    );
$$;

revoke execute on function public.friend_period_minutes(uuid, text, text) from public;
revoke execute on function public.friend_period_minutes(uuid, text, text) from anon;
revoke execute on function public.friend_period_minutes(uuid, text, text) from authenticated;

create or replace function public.friend_weekly_minutes(target uuid, tz text)
returns int
language sql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
  select public.friend_period_minutes(target, tz, 'week');
$$;

revoke execute on function public.friend_weekly_minutes(uuid, text) from public;
revoke execute on function public.friend_weekly_minutes(uuid, text) from anon;
revoke execute on function public.friend_weekly_minutes(uuid, text) from authenticated;

-- The board itself. `period` defaults to 'week', so a client that has not
-- been updated keeps the exact behaviour it had.
create or replace function public.get_friends_leaderboard(
  tz text default 'UTC',
  period text default 'week'
)
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
  -- Anything unrecognised falls back to the default rather than erroring:
  -- a stale client sending a period this function has never heard of should
  -- get a leaderboard, not a failure.
  wanted text := case when period in ('week', 'month', 'all') then period else 'week' end;
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
      public.friend_period_minutes(pe.person_id, tzone, wanted) as mins,
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

revoke execute on function public.get_friends_leaderboard(text, text) from public;
revoke execute on function public.get_friends_leaderboard(text, text) from anon;
grant execute on function public.get_friends_leaderboard(text, text) to authenticated;
