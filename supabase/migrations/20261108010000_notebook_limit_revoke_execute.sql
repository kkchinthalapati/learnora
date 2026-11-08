-- enforce_notebook_limit() is a trigger function. Its migration revoked
-- EXECUTE from public, but Supabase grants anon and authenticated directly,
-- so the security advisor listed it as callable over /rest/v1/rpc. Calling
-- it there only errors (trigger functions can't be called directly), and a
-- trigger fires whatever the caller's EXECUTE rights, so this changes
-- nothing for students; it just closes the advisor warning.
--
-- Revert: grant execute on function public.enforce_notebook_limit() to anon, authenticated;

revoke execute on function public.enforce_notebook_limit() from anon, authenticated;
