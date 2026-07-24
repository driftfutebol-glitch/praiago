-- Centraliza auditoria de segurança: login suspeito/falho, acesso negado,
-- alteracao de senha e denuncias de fraude. A tabela nao fica aberta ao
-- publico; apps anonimos apenas chamam log_security_event(), que valida e
-- limita os dados antes de inserir.

create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (
    event_type in (
      'login_success',
      'login_failed',
      'access_denied',
      'signup_created',
      'password_reset_requested',
      'password_changed',
      'fraud_flag_created',
      'suspicious_activity'
    )
  ),
  severity text not null default 'info' check (severity in ('info', 'warning', 'high', 'critical')),
  platform text not null default 'unknown' check (platform in ('cliente', 'ambulante', 'restaurante', 'admin', 'supabase', 'system', 'unknown')),
  user_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  email text,
  ip inet,
  user_agent text,
  route text,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_notes text
);

alter table public.security_audit_logs enable row level security;

create index if not exists security_audit_logs_created_idx on public.security_audit_logs (created_at desc);
create index if not exists security_audit_logs_event_idx on public.security_audit_logs (event_type, created_at desc);
create index if not exists security_audit_logs_severity_idx on public.security_audit_logs (severity, created_at desc);
create index if not exists security_audit_logs_email_idx on public.security_audit_logs (lower(email), created_at desc) where email is not null;
create index if not exists security_audit_logs_user_idx on public.security_audit_logs (user_id, created_at desc) where user_id is not null;

grant select, update on table public.security_audit_logs to authenticated;
grant select, insert, update, delete on table public.security_audit_logs to service_role;

drop policy if exists "security_audit_select_admin" on public.security_audit_logs;
create policy "security_audit_select_admin"
on public.security_audit_logs
for select
to authenticated
using (private.is_admin());

drop policy if exists "security_audit_update_admin" on public.security_audit_logs;
create policy "security_audit_update_admin"
on public.security_audit_logs
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create or replace function public.log_security_event(
  p_event_type text,
  p_platform text default 'unknown',
  p_email text default null,
  p_user_agent text default null,
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_event_type text := lower(trim(coalesce(p_event_type, '')));
  v_platform text := lower(trim(coalesce(p_platform, 'unknown')));
  v_email text := nullif(lower(left(trim(coalesce(p_email, '')), 320)), '');
  v_user_agent text := nullif(left(trim(coalesce(p_user_agent, '')), 600), '');
  v_route text := nullif(left(trim(coalesce(p_route, '')), 300), '');
  v_metadata jsonb := '{}'::jsonb;
  v_actor uuid := (select auth.uid());
  v_severity text := 'info';
  v_recent_failures integer := 0;
  v_id uuid;
begin
  if v_event_type not in (
    'login_success',
    'login_failed',
    'access_denied',
    'signup_created',
    'password_reset_requested',
    'password_changed',
    'fraud_flag_created',
    'suspicious_activity'
  ) then
    v_event_type := 'suspicious_activity';
  end if;

  if v_platform not in ('cliente', 'ambulante', 'restaurante', 'admin', 'supabase', 'system', 'unknown') then
    v_platform := 'unknown';
  end if;

  if p_metadata is not null and jsonb_typeof(p_metadata) = 'object' and length(p_metadata::text) <= 4000 then
    v_metadata := p_metadata;
  elsif p_metadata is not null then
    v_metadata := jsonb_build_object('truncated', true, 'reason', 'metadata invalido ou grande demais');
  end if;

  if v_event_type = 'login_failed' then
    select count(*)::integer
      into v_recent_failures
      from public.security_audit_logs
     where event_type = 'login_failed'
       and created_at >= now() - interval '15 minutes'
       and (
         (v_email is not null and lower(email) = v_email)
         or (v_email is null and actor_id = v_actor)
       );

    v_recent_failures := coalesce(v_recent_failures, 0) + 1;
    v_metadata := v_metadata || jsonb_build_object('recent_failures_15m', v_recent_failures);
    v_severity := case
      when v_recent_failures >= 10 then 'critical'
      when v_recent_failures >= 5 then 'high'
      else 'warning'
    end;
  elsif v_event_type in ('access_denied', 'password_reset_requested') then
    v_severity := 'warning';
  elsif v_event_type in ('password_changed', 'fraud_flag_created', 'suspicious_activity') then
    v_severity := 'high';
  else
    v_severity := 'info';
  end if;

  insert into public.security_audit_logs (
    event_type,
    severity,
    platform,
    user_id,
    actor_id,
    email,
    user_agent,
    route,
    metadata
  ) values (
    v_event_type,
    v_severity,
    v_platform,
    v_actor,
    v_actor,
    v_email,
    v_user_agent,
    v_route,
    v_metadata
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.log_security_event(text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.log_security_event(text, text, text, text, text, jsonb) to anon, authenticated, service_role;

create or replace function private.log_auth_password_changed()
returns trigger
language plpgsql
security definer
set search_path = public, private, auth
as $$
begin
  if old.encrypted_password is distinct from new.encrypted_password then
    insert into public.security_audit_logs (
      event_type,
      severity,
      platform,
      user_id,
      email,
      metadata
    ) values (
      'password_changed',
      'high',
      'supabase',
      new.id,
      lower(new.email),
      jsonb_build_object(
        'provider', 'supabase_auth',
        'email_confirmed_at', new.email_confirmed_at,
        'updated_at', new.updated_at
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.log_auth_password_changed() from public, anon, authenticated;

drop trigger if exists trg_auth_users_password_changed on auth.users;
create trigger trg_auth_users_password_changed
after update of encrypted_password on auth.users
for each row
execute function private.log_auth_password_changed();

create or replace function private.log_fraude_flag_created()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_cliente_id uuid;
begin
  if (to_jsonb(new)->>'cliente_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_cliente_id := (to_jsonb(new)->>'cliente_id')::uuid;
  end if;

  insert into public.security_audit_logs (
    event_type,
    severity,
    platform,
    user_id,
    actor_id,
    metadata
  ) values (
    'fraud_flag_created',
    'high',
    'cliente',
    v_cliente_id,
    v_cliente_id,
    jsonb_build_object('fraude_flag', to_jsonb(new))
  );

  return new;
end;
$$;

revoke all on function private.log_fraude_flag_created() from public, anon, authenticated;

drop trigger if exists trg_fraude_flags_security_log on public.fraude_flags;
create trigger trg_fraude_flags_security_log
after insert on public.fraude_flags
for each row
execute function private.log_fraude_flag_created();

create or replace view public.security_login_risk_summary
with (security_invoker = true)
as
select
  lower(email) as email,
  platform,
  count(*) filter (where created_at >= now() - interval '15 minutes') as falhas_15m,
  count(*) filter (where created_at >= now() - interval '24 hours') as falhas_24h,
  max(created_at) as ultima_tentativa,
  max(severity) as maior_severidade
from public.security_audit_logs
where event_type = 'login_failed'
  and email is not null
group by lower(email), platform;

grant select on public.security_login_risk_summary to authenticated;
