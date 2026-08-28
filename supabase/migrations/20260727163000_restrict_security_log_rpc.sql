-- Anonymous authentication failures are already recorded by Supabase Auth.
-- Keeping this SECURITY DEFINER RPC public would allow unauthenticated log
-- flooding with attacker-controlled metadata.
revoke all on function public.log_security_event(
  text,
  text,
  text,
  text,
  text,
  jsonb
) from public, anon;

grant execute on function public.log_security_event(
  text,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;
