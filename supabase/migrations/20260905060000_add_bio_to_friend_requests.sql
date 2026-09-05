-- Surface bio on incoming/outgoing friend requests.
--
-- Bio is friends-only, and deciding whether to *become* friends is exactly
-- the moment it is useful — the same reasoning `get_friend_requests()`
-- already uses for shipping the requester's full name instead of a
-- boardName()-shortened one. It is deliberately not added to
-- `get_friends_leaderboard`: that row is already tight (rank, name, focus
-- time, streak) and bio has no use once the decision to accept is made.

drop function if exists public.get_friend_requests();

create or replace function public.get_friend_requests()
returns table (
  friendship_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  bio text,
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
    p.bio,
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
