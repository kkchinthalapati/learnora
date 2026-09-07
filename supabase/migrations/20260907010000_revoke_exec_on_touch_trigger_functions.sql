-- Take the ledger's trigger functions off the public API.
--
-- `apply_misconception_observation` and `touch_misconception_updated_at` are
-- SECURITY DEFINER, which is correct — they must update `public.misconceptions`
-- on behalf of a caller whose RLS policy only covers their own rows. But
-- PostgREST exposes every function in the `public` schema as an RPC endpoint,
-- and `EXECUTE` defaults to PUBLIC, so both were callable directly as
-- `/rest/v1/rpc/...` by `anon` and `authenticated`. The database linter flags
-- this as 0028/0029.
--
-- Calling them by hand does nothing useful — a trigger function dereferences
-- `NEW`, which is null outside a trigger, so a direct call errors rather than
-- writing anything. That makes this hardening rather than a bug fix. But a
-- SECURITY DEFINER function reachable by an anonymous caller is not something
-- to leave standing on the argument that today's function body happens to be
-- harmless, and the same reasoning already produced
-- 20260727010000_revoke_public_exec_handle_new_user.sql.
--
-- Revoking EXECUTE does not affect the triggers. A trigger runs as part of the
-- statement that fires it and is not subject to the invoking role's EXECUTE
-- privilege on the trigger function.
--
-- `touch_notebook_updated_at` is included because it is the same function shape
-- with the same exposure, flagged by the same two lints — this migration
-- introduced the pattern's third instance, so it cleans up all three rather
-- than leaving a known-identical hole open next to the ones it closes.

revoke all on function public.apply_misconception_observation() from public;
revoke all on function public.apply_misconception_observation() from anon;
revoke all on function public.apply_misconception_observation() from authenticated;

revoke all on function public.touch_misconception_updated_at() from public;
revoke all on function public.touch_misconception_updated_at() from anon;
revoke all on function public.touch_misconception_updated_at() from authenticated;

revoke all on function public.touch_notebook_updated_at() from public;
revoke all on function public.touch_notebook_updated_at() from anon;
revoke all on function public.touch_notebook_updated_at() from authenticated;
