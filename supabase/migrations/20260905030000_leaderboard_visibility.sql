-- Leaderboard visibility.
--
-- Being someone's friend and being willing to have your study hours ranked
-- against theirs are two different consents, and the app only ever asked for
-- the first. Accepting a friend request silently enrolled you in a
-- leaderboard; the only way off it was to remove the friend.
--
-- Opting out hides you from other people's boards. It does not hide them from
-- you, and it does not end the friendship — the point is to keep the social
-- feature usable by students who do not want to be measured in public, rather
-- than making them choose between the two.

alter table public.profiles
  add column if not exists leaderboard_opt_out boolean not null default false;

comment on column public.profiles.leaderboard_opt_out is
  'When true, this user is omitted from the friends leaderboards other people see. They still see their own board.';

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
  wanted text := case when period in ('week', 'month', 'all') then period else 'week' end;
begin
  if viewer is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
  with people as (
    -- The caller's own row is never filtered by the opt-out: opting out is
    -- about not being ranked in front of other people, not about losing
    -- sight of your own figures.
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
    -- Filtered in the join rather than after ranking, so an opted-out friend
    -- does not leave a gap in the numbering that gives away that they are
    -- there. The board reads as though they simply are not on it.
    where pe.self or coalesce(pr.leaderboard_opt_out, false) = false
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
