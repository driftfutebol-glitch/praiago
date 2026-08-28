-- Fix QA #5/#10: auditoria de segurança precisa registrar eventos PRÉ-login
-- (login_failed, access_denied, password_reset, suspicious_activity) — o cliente
-- não exige mais sessão, então o RPC tem que ser chamável por anon.
grant execute on function public.log_security_event(text, text, text, text, text, jsonb) to anon;
