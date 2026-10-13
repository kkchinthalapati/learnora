-- Drop the one-argument get_friends_leaderboard(tz) overload.
--
-- 20260905020000_leaderboard_periods added get_friends_leaderboard(tz, period)
-- and 20260905030000_leaderboard_visibility taught *that* overload to hide
-- friends who set profiles.leaderboard_opt_out. The original (tz) overload
-- from 20260803000000_add_friends_feature was never dropped, is still
-- SECURITY DEFINER and executable by `authenticated`, and does not check the
-- opt-out. Calling /rest/v1/rpc/get_friends_leaderboard with only {"tz": …}
-- resolves to it and returns opted-out friends' weekly minutes and streaks.
--
-- The webapp always passes `period` (webapp/src/api/friends.ts), so nothing
-- calls the old overload. Found 2026-10-13 reading pg_proc in production.
--
-- Revert: re-run the get_friends_leaderboard(tz text) definition from
--   20260803000000_add_friends_feature.sql (with its revoke/grant lines).
--   Better: don't. Bringing it back reopens the opt-out bypass.

drop function if exists public.get_friends_leaderboard(text);
