-- Restaurante tem ponto fixo. Depois que existe uma localizacao, qualquer
-- correcao precisa de autorizacao administrativa e pode ser usada uma vez.

create table public.solicitacoes_correcao_localizacao (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'rejeitada', 'utilizada', 'cancelada')),
  motivo text not null check (char_length(btrim(motivo)) between 8 and 500),
  endereco_atual text,
  lat_atual double precision,
  lng_atual double precision,
  novo_endereco text,
  nova_lat double precision,
  nova_lng double precision,
  observacao_admin text,
  revisado_por uuid references auth.users(id),
  solicitado_em timestamptz not null default now(),
  revisado_em timestamptz,
  autorizado_ate timestamptz,
  utilizado_em timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.solicitacoes_correcao_localizacao is
  'Solicitacoes de uso unico para corrigir o ponto fixo de restaurantes.';

create index solicitacoes_correcao_localizacao_restaurante_idx
  on public.solicitacoes_correcao_localizacao (restaurante_id, solicitado_em desc);

create index solicitacoes_correcao_localizacao_status_idx
  on public.solicitacoes_correcao_localizacao (status, solicitado_em desc);

create index solicitacoes_correcao_localizacao_revisado_por_idx
  on public.solicitacoes_correcao_localizacao (revisado_por)
  where revisado_por is not null;

create unique index solicitacoes_correcao_localizacao_ativa_uidx
  on public.solicitacoes_correcao_localizacao (restaurante_id)
  where status in ('pendente', 'aprovada');

alter table public.solicitacoes_correcao_localizacao enable row level security;

revoke all on table public.solicitacoes_correcao_localizacao from anon;
revoke all on table public.solicitacoes_correcao_localizacao from authenticated;
grant select on table public.solicitacoes_correcao_localizacao to authenticated;

create policy solicitacoes_localizacao_select_owner_or_admin
on public.solicitacoes_correcao_localizacao
for select
to authenticated
using (
  restaurante_id = (select auth.uid())
  or private.is_admin()
);

create or replace function public.solicitar_correcao_localizacao(p_motivo text)
returns public.solicitacoes_correcao_localizacao
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_perfil public.profiles%rowtype;
  v_solicitacao public.solicitacoes_correcao_localizacao%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if v_uid is null then
    raise exception 'Sessao invalida.' using errcode = '42501';
  end if;

  if char_length(v_motivo) < 8 or char_length(v_motivo) > 500 then
    raise exception 'Explique o motivo da correcao em 8 a 500 caracteres.'
      using errcode = '22023';
  end if;

  select *
    into v_perfil
    from public.profiles
   where id = v_uid
   for update;

  if not found
     or v_perfil.role <> 'restaurante'
     or coalesce(v_perfil.status, 'ativo') = 'banido' then
    raise exception 'Apenas restaurante ativo pode solicitar correcao.'
      using errcode = '42501';
  end if;

  update public.solicitacoes_correcao_localizacao
     set status = 'cancelada',
         observacao_admin = coalesce(observacao_admin, 'Autorizacao expirada sem uso.'),
         updated_at = now()
   where restaurante_id = v_uid
     and status = 'aprovada'
     and autorizado_ate <= now();

  if exists (
    select 1
      from public.solicitacoes_correcao_localizacao
     where restaurante_id = v_uid
       and status in ('pendente', 'aprovada')
  ) then
    raise exception 'Ja existe uma solicitacao ativa para este restaurante.'
      using errcode = '23505';
  end if;

  insert into public.solicitacoes_correcao_localizacao (
    restaurante_id,
    motivo,
    endereco_atual,
    lat_atual,
    lng_atual
  ) values (
    v_uid,
    v_motivo,
    v_perfil.endereco,
    v_perfil.lat,
    v_perfil.lng
  )
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$function$;

create or replace function public.revisar_correcao_localizacao(
  p_solicitacao_id uuid,
  p_aprovar boolean,
  p_observacao text default null
)
returns public.solicitacoes_correcao_localizacao
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_solicitacao public.solicitacoes_correcao_localizacao%rowtype;
begin
  if v_uid is null or not private.is_admin() then
    raise exception 'Apenas administradores podem revisar a solicitacao.'
      using errcode = '42501';
  end if;

  select *
    into v_solicitacao
    from public.solicitacoes_correcao_localizacao
   where id = p_solicitacao_id
   for update;

  if not found then
    raise exception 'Solicitacao nao encontrada.' using errcode = 'P0002';
  end if;

  if v_solicitacao.status <> 'pendente' then
    raise exception 'Esta solicitacao ja foi revisada.' using errcode = '22023';
  end if;

  update public.solicitacoes_correcao_localizacao
     set status = case when p_aprovar then 'aprovada' else 'rejeitada' end,
         observacao_admin = nullif(btrim(coalesce(p_observacao, '')), ''),
         revisado_por = v_uid,
         revisado_em = now(),
         autorizado_ate = case when p_aprovar then now() + interval '7 days' else null end,
         updated_at = now()
   where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$function$;

create or replace function public.aplicar_correcao_localizacao(
  p_solicitacao_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_endereco text
)
returns public.solicitacoes_correcao_localizacao
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_solicitacao public.solicitacoes_correcao_localizacao%rowtype;
  v_endereco text := btrim(coalesce(p_endereco, ''));
begin
  if v_uid is null then
    raise exception 'Sessao invalida.' using errcode = '42501';
  end if;

  if p_lat is null or p_lat not between -90 and 90
     or p_lng is null or p_lng not between -180 and 180 then
    raise exception 'Coordenadas invalidas.' using errcode = '22023';
  end if;

  if char_length(v_endereco) < 5 or char_length(v_endereco) > 300 then
    raise exception 'Informe o endereco correto da loja.'
      using errcode = '22023';
  end if;

  select *
    into v_solicitacao
    from public.solicitacoes_correcao_localizacao
   where id = p_solicitacao_id
   for update;

  if not found or v_solicitacao.restaurante_id <> v_uid then
    raise exception 'Solicitacao nao encontrada.' using errcode = '42501';
  end if;

  if v_solicitacao.status <> 'aprovada' then
    raise exception 'A correcao ainda nao foi aprovada.' using errcode = '22023';
  end if;

  if v_solicitacao.autorizado_ate is null or v_solicitacao.autorizado_ate <= now() then
    update public.solicitacoes_correcao_localizacao
       set status = 'cancelada',
           observacao_admin = coalesce(observacao_admin, 'Autorizacao expirada sem uso.'),
           updated_at = now()
     where id = p_solicitacao_id;
    raise exception 'A autorizacao expirou. Envie uma nova solicitacao.'
      using errcode = '22023';
  end if;

  perform set_config('praiago.location_write_authorized', 'on', true);

  update public.profiles
     set lat = p_lat,
         lng = p_lng,
         endereco = v_endereco
   where id = v_uid
     and role = 'restaurante'
     and coalesce(status, 'ativo') <> 'banido';

  if not found then
    raise exception 'Restaurante nao encontrado ou bloqueado.' using errcode = '42501';
  end if;

  perform set_config('praiago.location_write_authorized', 'off', true);

  update public.solicitacoes_correcao_localizacao
     set status = 'utilizada',
         novo_endereco = v_endereco,
         nova_lat = p_lat,
         nova_lng = p_lng,
         utilizado_em = now(),
         updated_at = now()
   where id = p_solicitacao_id
  returning * into v_solicitacao;

  return v_solicitacao;
end;
$function$;

create or replace function public.proteger_localizacao_fixa_restaurante()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if coalesce(new.role, old.role) = 'restaurante'
     and (
       new.lat is distinct from old.lat
       or new.lng is distinct from old.lng
       or new.endereco is distinct from old.endereco
     )
     and not (old.lat is null and old.lng is null)
     and coalesce(current_setting('praiago.location_write_authorized', true), '') <> 'on'
     and current_user not in ('postgres', 'service_role')
     and not private.is_admin() then
    raise exception 'Localizacao fixa. Solicite autorizacao no perfil antes de corrigir.'
      using errcode = '42501';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_proteger_localizacao_fixa_restaurante on public.profiles;
create trigger trg_proteger_localizacao_fixa_restaurante
before update of lat, lng, endereco on public.profiles
for each row
execute function public.proteger_localizacao_fixa_restaurante();

revoke all on function public.solicitar_correcao_localizacao(text) from public, anon;
revoke all on function public.revisar_correcao_localizacao(uuid, boolean, text) from public, anon;
revoke all on function public.aplicar_correcao_localizacao(uuid, double precision, double precision, text) from public, anon;
grant execute on function public.solicitar_correcao_localizacao(text) to authenticated;
grant execute on function public.revisar_correcao_localizacao(uuid, boolean, text) to authenticated;
grant execute on function public.aplicar_correcao_localizacao(uuid, double precision, double precision, text) to authenticated;

alter publication supabase_realtime
  add table public.solicitacoes_correcao_localizacao;
