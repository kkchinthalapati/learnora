-- Postgres grants EXECUTE to PUBLIC by default on function creation, which
-- anon/authenticated inherit regardless of the explicit per-role revokes in
-- 20260727000000 — PUBLIC has to be revoked directly to actually close the
-- /rest/v1/rpc/handle_new_user exposure. The auth trigger itself is
-- unaffected: trigger invocation doesn't go through a role's EXECUTE check.
revoke execute on function public.handle_new_user() from public;
