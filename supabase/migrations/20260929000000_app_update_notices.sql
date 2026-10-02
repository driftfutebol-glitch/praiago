begin;

create table public.app_update_notices (
  id uuid primary key default gen_random_uuid(),
  app text not null check (app in ('cliente','ambulante')),
  platform text not null check (platform in ('android','ios')),
  version text not null check (version ~ '^[0-9]{1,6}(\.[0-9]{1,6}){0,2}$'),
  message text not null check (length(trim(message)) between 1 and 300),
  status text not null default 'pending' check (status in ('pending','verified','approved','rejected','paused')),
  verification_method text check (verification_method in ('apple_lookup','play_console_manual')),
  verified_at timestamptz,
  evidence jsonb,
  created_by uuid not null,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status not in ('verified','approved') or (verified_at is not null and evidence is not null))
);
create unique index app_update_one_active on public.app_update_notices(app,platform) where status = 'approved';
create table public.app_update_notice_events (
  id bigint generated always as identity primary key,
  notice_id uuid not null references public.app_update_notices(id),
  actor_id uuid not null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create function public.app_updates_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.account_can_write(auth.uid()),false)
    and exists(select 1 from public.profiles where id=auth.uid() and role='sysadmin');
$$;
revoke all on function public.app_updates_owner() from public, anon;
grant execute on function public.app_updates_owner() to authenticated, service_role;
alter table public.app_update_notices enable row level security;
alter table public.app_update_notice_events enable row level security;
revoke all on public.app_update_notices, public.app_update_notice_events from anon, authenticated;
grant select on public.app_update_notices, public.app_update_notice_events to authenticated;
grant all on public.app_update_notices, public.app_update_notice_events to service_role;
grant usage, select on sequence public.app_update_notice_events_id_seq to service_role;
create policy app_updates_owner_read on public.app_update_notices for select to authenticated using (public.app_updates_owner());
create policy app_updates_events_owner_read on public.app_update_notice_events for select to authenticated using (public.app_updates_owner());
create policy app_updates_service on public.app_update_notices to service_role using (true) with check (true);
create policy app_updates_events_service on public.app_update_notice_events to service_role using (true) with check (true);

-- Only the owner can draft/approve. A store verification alone NEVER activates a notice.
create function public.admin_app_update_action(p_action text, p_id uuid default null, p_app text default null,
  p_platform text default null, p_version text default null, p_message text default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.app_update_notices; v_id uuid; old_row record;
begin
  if not public.app_updates_owner() then raise exception 'Apenas o dono pode controlar atualizacoes.' using errcode='42501'; end if;
  if p_action='create' then
    insert into public.app_update_notices(app,platform,version,message,created_by)
    values(p_app,p_platform,trim(p_version),trim(p_message),auth.uid()) returning id into v_id;
  elsif p_action in ('approve','reject','pause') then
    -- Serialize transitions across both stores/apps, including replacing an active notice.
    perform pg_advisory_xact_lock(29092026);
    select * into v from public.app_update_notices where id=p_id for update;
    if not found then raise exception 'Aviso nao encontrado.'; end if;
    v_id:=v.id;
    if p_action='approve' then
      if v.status<>'verified' or v.verified_at<now()-interval '24 hours' then
        raise exception 'Confira a publicacao na loja novamente antes de aprovar.';
      end if;
      for old_row in select id from public.app_update_notices where app=v.app and platform=v.platform and status='approved' for update loop
        update public.app_update_notices set status='paused',updated_at=now() where id=old_row.id;
        insert into public.app_update_notice_events(notice_id,actor_id,action,detail)
          values(old_row.id,auth.uid(),'replaced',jsonb_build_object('replacement',v.id));
      end loop;
      update public.app_update_notices set status='approved',approved_by=auth.uid(),updated_at=now() where id=v.id;
    else
      if length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Informe um motivo de 5 a 500 caracteres.'; end if;
      if (p_action='pause' and v.status<>'approved') or (p_action='reject' and v.status not in ('pending','verified')) then
        raise exception 'Este aviso nao permite essa acao.';
      end if;
      update public.app_update_notices set status=case when p_action='pause' then 'paused' else 'rejected' end,updated_at=now() where id=v.id;
    end if;
  else raise exception 'Acao invalida.';
  end if;
  insert into public.app_update_notice_events(notice_id,actor_id,action,detail)
    values(v_id,auth.uid(),p_action,jsonb_build_object('reason',p_reason));
  return v_id;
end;
$$;
revoke all on function public.admin_app_update_action(text,uuid,text,text,text,text,text) from public, anon;
grant execute on function public.admin_app_update_action(text,uuid,text,text,text,text,text) to authenticated;

-- Store proof is accepted ONLY from the authenticated server, never directly from the browser.
create function public.record_app_update_verification(p_id uuid,p_actor uuid,p_method text,p_evidence jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.app_update_notices;
begin
  if auth.role() is distinct from 'service_role' or not exists(select 1 from public.profiles where id=p_actor and role='sysadmin' and coalesce(status,'ativo')='ativo') then
    raise exception 'Sem permissao.' using errcode='42501';
  end if;
  select * into v from public.app_update_notices where id=p_id for update;
  if not found or v.status not in ('pending','verified','paused') then raise exception 'Aviso indisponivel para verificacao.'; end if;
  if (v.platform='ios' and p_method<>'apple_lookup') or (v.platform='android' and p_method<>'play_console_manual')
     or p_evidence->>'version' is distinct from v.version then raise exception 'Prova de publicacao invalida.'; end if;
  update public.app_update_notices set status='verified',verification_method=p_method,evidence=p_evidence,
    verified_at=now(),updated_at=now() where id=p_id;
  insert into public.app_update_notice_events(notice_id,actor_id,action,detail) values(p_id,p_actor,'verified',p_evidence);
end;
$$;
revoke all on function public.record_app_update_verification(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_app_update_verification(uuid,uuid,text,jsonb) to service_role;

alter table public.ota_releases add column max_native_version text;
alter table public.ota_releases add constraint ota_max_native_format check
  (max_native_version is null or max_native_version ~ '^[0-9]{1,6}(\.[0-9]{1,6}){0,2}$');
commit;
