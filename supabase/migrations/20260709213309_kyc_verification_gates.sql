alter table public.verificacoes
  add column if not exists nome_check_status text not null default 'pendente',
  add column if not exists cpf_check_status text not null default 'pendente',
  add column if not exists cnpj_check_status text not null default 'pendente',
  add column if not exists nascimento_check_status text not null default 'pendente',
  add column if not exists email_check_status text not null default 'pendente',
  add column if not exists documento_check_status text not null default 'pendente',
  add column if not exists face_check_status text not null default 'pendente',
  add column if not exists local_check_status text not null default 'pendente',
  add column if not exists kyc_override boolean not null default false,
  add column if not exists kyc_override_reason text,
  add column if not exists kyc_override_by uuid references auth.users(id) on delete set null,
  add column if not exists kyc_override_at timestamptz,
  add column if not exists validation_errors jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'verificacoes_check_status_values'
  ) then
    alter table public.verificacoes
      add constraint verificacoes_check_status_values
      check (
        nome_check_status in ('pendente','aprovado','rejeitado','dispensado')
        and cpf_check_status in ('pendente','aprovado','rejeitado','dispensado')
        and cnpj_check_status in ('pendente','aprovado','rejeitado','dispensado')
        and nascimento_check_status in ('pendente','aprovado','rejeitado','dispensado')
        and email_check_status in ('pendente','aprovado','rejeitado','dispensado')
        and documento_check_status in ('pendente','aprovado','rejeitado','dispensado')
        and face_check_status in ('pendente','aprovado','rejeitado','dispensado')
        and local_check_status in ('pendente','aprovado','rejeitado','dispensado')
      );
  end if;
end $$;

create or replace function private.only_digits(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
$$;

create or replace function private.is_valid_cpf(p_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := private.only_digits(p_cpf);
  s int;
  r int;
  i int;
begin
  if length(d) <> 11 or d = repeat(substring(d, 1, 1), 11) then
    return false;
  end if;

  s := 0;
  for i in 1..9 loop
    s := s + substring(d, i, 1)::int * (11 - i);
  end loop;
  r := 11 - (s % 11);
  if r >= 10 then r := 0; end if;
  if r <> substring(d, 10, 1)::int then
    return false;
  end if;

  s := 0;
  for i in 1..10 loop
    s := s + substring(d, i, 1)::int * (12 - i);
  end loop;
  r := 11 - (s % 11);
  if r >= 10 then r := 0; end if;
  return r = substring(d, 11, 1)::int;
end;
$$;

create or replace function private.is_valid_cnpj(p_cnpj text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := private.only_digits(p_cnpj);
  weights1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  weights2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int;
  r int;
  i int;
begin
  if length(d) <> 14 or d = repeat(substring(d, 1, 1), 14) then
    return false;
  end if;

  s := 0;
  for i in 1..12 loop
    s := s + substring(d, i, 1)::int * weights1[i];
  end loop;
  r := s % 11;
  r := case when r < 2 then 0 else 11 - r end;
  if r <> substring(d, 13, 1)::int then
    return false;
  end if;

  s := 0;
  for i in 1..13 loop
    s := s + substring(d, i, 1)::int * weights2[i];
  end loop;
  r := s % 11;
  r := case when r < 2 then 0 else 11 - r end;
  return r = substring(d, 14, 1)::int;
end;
$$;

create or replace function private.is_adult_birthdate(p_birth text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  d date;
begin
  if nullif(trim(coalesce(p_birth, '')), '') is null then
    return false;
  end if;

  begin
    d := p_birth::date;
  exception when others then
    return false;
  end;

  return d <= (current_date - interval '18 years')::date
     and d >= date '1900-01-01';
end;
$$;

create or replace function private.has_realistic_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select trim(coalesce(p_name, '')) ~* '^[[:alpha:]À-ÿ]{2,}([ ''-][[:alpha:]À-ÿ]{2,})+$';
$$;

create or replace function public.prepare_kyc_check_statuses()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_ok boolean := false;
  v_profile public.profiles%rowtype;
begin
  new.cpf := nullif(private.only_digits(new.cpf), '');
  new.cnpj := nullif(private.only_digits(new.cnpj), '');

  select * into v_profile
    from public.profiles
   where id = coalesce(new.user_id, new.restaurante_id);

  select exists (
    select 1
      from auth.users u
     where u.id = coalesce(new.user_id, new.restaurante_id)
       and u.email_confirmed_at is not null
  )
    into v_email_ok;

  new.nome_check_status := case
    when private.has_realistic_name(new.nome_completo) then 'aprovado'
    else 'rejeitado'
  end;

  new.cpf_check_status := case
    when private.is_valid_cpf(new.cpf) then 'aprovado'
    else 'rejeitado'
  end;

  new.cnpj_check_status := case
    when coalesce(new.tipo, '') = 'restaurante' then
      case when private.is_valid_cnpj(new.cnpj) then 'aprovado' else 'rejeitado' end
    when nullif(new.cnpj, '') is null then 'dispensado'
    when private.is_valid_cnpj(new.cnpj) then 'aprovado'
    else 'rejeitado'
  end;

  new.nascimento_check_status := case
    when coalesce(new.tipo, '') = 'restaurante' then 'dispensado'
    when private.is_adult_birthdate(new.data_nascimento) then 'aprovado'
    else 'rejeitado'
  end;

  new.email_check_status := case when v_email_ok then 'aprovado' else 'rejeitado' end;

  new.documento_check_status := case
    when nullif(coalesce(new.rg_frente_url, new.cnh_url, ''), '') is not null then coalesce(nullif(new.documento_check_status, 'pendente'), 'pendente')
    else 'rejeitado'
  end;

  new.face_check_status := case
    when nullif(coalesce(new.selfie_url, ''), '') is not null then coalesce(nullif(new.face_check_status, 'pendente'), 'pendente')
    else 'rejeitado'
  end;

  new.local_check_status := case
    when coalesce(new.tipo, '') = 'restaurante'
      and nullif(coalesce(new.foto_loja_url, v_profile.endereco, ''), '') is not null then coalesce(nullif(new.local_check_status, 'pendente'), 'pendente')
    when coalesce(new.tipo, '') = 'ambulante'
      and nullif(coalesce(new.praia_principal, ''), '') is not null then coalesce(nullif(new.local_check_status, 'pendente'), 'pendente')
    when coalesce(new.tipo, '') = 'entregador' then 'dispensado'
    else 'rejeitado'
  end;

  new.validation_errors := jsonb_strip_nulls(jsonb_build_object(
    'nome', case when new.nome_check_status = 'rejeitado' then 'Nome real incompleto ou invalido.' end,
    'cpf', case when new.cpf_check_status = 'rejeitado' then 'CPF invalido.' end,
    'cnpj', case when new.cnpj_check_status = 'rejeitado' then 'CNPJ invalido ou ausente.' end,
    'nascimento', case when new.nascimento_check_status = 'rejeitado' then 'Data de nascimento invalida ou menor de 18 anos.' end,
    'email', case when new.email_check_status = 'rejeitado' then 'E-mail ainda nao confirmado.' end,
    'documento', case when new.documento_check_status = 'rejeitado' then 'Documento oficial ausente.' end,
    'face', case when new.face_check_status = 'rejeitado' then 'Selfie/rosto ausente.' end,
    'local', case when new.local_check_status = 'rejeitado' then 'Local/base ainda nao comprovado.' end
  ));

  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.block_invalid_kyc_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_override_ok boolean;
begin
  if new.status <> 'aprovado' then
    return new;
  end if;

  if exists (
    select 1
      from public.profiles p
     where p.id = coalesce(new.user_id, new.restaurante_id)
       and coalesce(p.status, 'ativo') = 'banido'
  ) then
    raise exception 'Usuario banido nao pode ser aprovado no KYC.'
      using errcode = 'P0001';
  end if;

  v_override_ok :=
    new.kyc_override is true
    and new.kyc_override_by is not null
    and length(trim(coalesce(new.kyc_override_reason, ''))) >= 10;

  if v_override_ok then
    new.kyc_override_at := coalesce(new.kyc_override_at, now());
    return new;
  end if;

  if not (
    new.nome_check_status = 'aprovado'
    and new.cpf_check_status = 'aprovado'
    and new.email_check_status = 'aprovado'
    and new.documento_check_status = 'aprovado'
    and new.face_check_status = 'aprovado'
    and new.local_check_status in ('aprovado','dispensado')
    and new.nascimento_check_status in ('aprovado','dispensado')
    and new.cnpj_check_status in ('aprovado','dispensado')
  ) then
    raise exception 'KYC incompleto: CPF, e-mail, documento, rosto e local precisam estar aprovados, ou use override admin com motivo.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function public.sync_profile_verification_from_kyc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'aprovado' then
    update public.profiles
       set verificado = true,
           email_verificado = case when new.email_check_status = 'aprovado' then true else email_verificado end
     where id = coalesce(new.user_id, new.restaurante_id)
       and coalesce(status, 'ativo') <> 'banido';
  elsif new.status = 'rejeitado' then
    update public.profiles
       set verificado = false
     where id = coalesce(new.user_id, new.restaurante_id)
       and not exists (
         select 1
           from public.verificacoes v
          where coalesce(v.user_id, v.restaurante_id) = coalesce(new.user_id, new.restaurante_id)
            and v.id <> new.id
            and v.status = 'aprovado'
       );
  end if;

  return new;
end;
$$;

create or replace function public.enforce_banned_profile_visibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.status, 'ativo') = 'banido' then
    new.online := false;
    new.verificado := false;

    update public.produtos
       set ativo = false
     where vendedor_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prepare_kyc_check_statuses on public.verificacoes;
create trigger trg_prepare_kyc_check_statuses
before insert or update on public.verificacoes
for each row
execute function public.prepare_kyc_check_statuses();

drop trigger if exists trg_block_invalid_kyc_approval on public.verificacoes;
create trigger trg_block_invalid_kyc_approval
before update of status, kyc_override, kyc_override_reason on public.verificacoes
for each row
execute function public.block_invalid_kyc_approval();

drop trigger if exists trg_sync_profile_verification_from_kyc on public.verificacoes;
create trigger trg_sync_profile_verification_from_kyc
after update of status on public.verificacoes
for each row
execute function public.sync_profile_verification_from_kyc();

drop trigger if exists trg_enforce_banned_profile_visibility on public.profiles;
create trigger trg_enforce_banned_profile_visibility
before update of status on public.profiles
for each row
execute function public.enforce_banned_profile_visibility();

create or replace function public.aprovar_verificacao(
  p_verificacao_id uuid,
  p_override boolean default false,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v public.verificacoes%rowtype;
begin
  if v_actor is null or not private.is_admin() then
    raise exception 'Apenas administradores podem aprovar KYC.'
      using errcode = '42501';
  end if;

  select * into v
    from public.verificacoes
   where id = p_verificacao_id
   for update;

  if not found then
    raise exception 'Verificacao nao encontrada.'
      using errcode = 'P0002';
  end if;

  update public.verificacoes
     set documento_check_status = case when nullif(coalesce(rg_frente_url, cnh_url, ''), '') is not null then 'aprovado' else documento_check_status end,
         face_check_status = case when nullif(coalesce(selfie_url, ''), '') is not null then 'aprovado' else face_check_status end,
         local_check_status = case
           when tipo = 'entregador' then 'dispensado'
           when tipo = 'restaurante' and nullif(coalesce(foto_loja_url, ''), '') is not null then 'aprovado'
           when tipo = 'ambulante' and nullif(coalesce(praia_principal, ''), '') is not null then 'aprovado'
           else local_check_status
         end,
         kyc_override = p_override,
         kyc_override_reason = case when p_override then nullif(trim(coalesce(p_override_reason, '')), '') else null end,
         kyc_override_by = case when p_override then v_actor else null end,
         kyc_override_at = case when p_override then now() else null end,
         status = 'aprovado',
         motivo_rejeicao = null
   where id = p_verificacao_id
   returning * into v;

  return jsonb_build_object(
    'ok', true,
    'verificacao_id', v.id,
    'user_id', coalesce(v.user_id, v.restaurante_id),
    'override', v.kyc_override,
    'status', v.status
  );
end;
$$;

create or replace function public.rejeitar_verificacao(
  p_verificacao_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v public.verificacoes%rowtype;
begin
  if v_actor is null or not private.is_admin() then
    raise exception 'Apenas administradores podem rejeitar KYC.'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Informe o motivo da rejeicao.'
      using errcode = 'P0001';
  end if;

  update public.verificacoes
     set status = 'rejeitado',
         motivo_rejeicao = trim(p_motivo),
         kyc_override = false,
         kyc_override_reason = null,
         kyc_override_by = null,
         kyc_override_at = null
   where id = p_verificacao_id
   returning * into v;

  if not found then
    raise exception 'Verificacao nao encontrada.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object('ok', true, 'verificacao_id', v.id, 'status', v.status);
end;
$$;

drop policy if exists produtos_select_active_owner_or_admin on public.produtos;
create policy produtos_select_active_owner_or_admin
on public.produtos
for select
using (
  private.is_admin()
  or vendedor_id = (select auth.uid())
  or (
    ativo is true
    and exists (
      select 1 from public.profiles p
       where p.id = vendedor_id
         and p.verificado is true
         and coalesce(p.status, 'ativo') = 'ativo'
    )
  )
);

alter policy produtos_insert_owner_or_admin on public.produtos
with check (
  private.is_admin()
  or (
    vendedor_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid())
         and p.verificado is true
         and coalesce(p.status, 'ativo') = 'ativo'
    )
  )
);

alter policy produtos_update_owner_or_admin on public.produtos
with check (
  private.is_admin()
  or (
    vendedor_id = (select auth.uid())
    and (
      ativo is not true
      or exists (
        select 1 from public.profiles p
         where p.id = (select auth.uid())
           and p.verificado is true
           and coalesce(p.status, 'ativo') = 'ativo'
      )
    )
  )
);

revoke all on function private.only_digits(text) from public, anon, authenticated;
revoke all on function private.is_valid_cpf(text) from public, anon, authenticated;
revoke all on function private.is_valid_cnpj(text) from public, anon, authenticated;
revoke all on function private.is_adult_birthdate(text) from public, anon, authenticated;
revoke all on function private.has_realistic_name(text) from public, anon, authenticated;
revoke all on function public.prepare_kyc_check_statuses() from public, anon, authenticated;
revoke all on function public.block_invalid_kyc_approval() from public, anon, authenticated;
revoke all on function public.sync_profile_verification_from_kyc() from public, anon, authenticated;
revoke all on function public.enforce_banned_profile_visibility() from public, anon, authenticated;
revoke all on function public.aprovar_verificacao(uuid, boolean, text) from public, anon;
revoke all on function public.rejeitar_verificacao(uuid, text) from public, anon;
grant execute on function public.aprovar_verificacao(uuid, boolean, text) to authenticated;
grant execute on function public.rejeitar_verificacao(uuid, text) to authenticated;
