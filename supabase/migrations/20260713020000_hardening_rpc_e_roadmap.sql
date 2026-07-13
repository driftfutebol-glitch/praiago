-- Security audit hardening:
-- - Do not expose full profiles rows for public vendor discovery.
-- - Keep financial/admin RPCs behind explicit grants and internal checks.
-- - Prevent broad public listing of product storage objects.
-- - Make duplicate CPF/CNPJ/email enforcement database-backed.

drop view if exists public.vendedores_publicos;

create table if not exists public.vendedores_publicos (
  id uuid primary key,
  nome text,
  categoria text,
  emoji text,
  role text,
  avaliacao_media numeric,
  total_avaliacoes integer,
  online boolean,
  lat double precision,
  lng double precision,
  zona text,
  verificado boolean,
  status text,
  horario_abre text,
  horario_fecha text,
  updated_at timestamptz not null default now()
);

alter table public.vendedores_publicos enable row level security;
revoke insert, update, delete on public.vendedores_publicos from anon, authenticated;
grant select on public.vendedores_publicos to anon, authenticated;

drop policy if exists vendedores_publicos_select on public.vendedores_publicos;
create policy vendedores_publicos_select on public.vendedores_publicos
for select to anon, authenticated using (true);

insert into public.vendedores_publicos (
  id, nome, categoria, emoji, role, avaliacao_media, total_avaliacoes,
  online, lat, lng, zona, verificado, status, horario_abre, horario_fecha, updated_at
)
select id, nome, categoria, emoji, role, avaliacao_media, total_avaliacoes,
       online, lat, lng, zona, verificado, status, horario_abre, horario_fecha, now()
from public.profiles
where role in ('ambulante','restaurante','entregador')
  and coalesce(status, 'ativo') = 'ativo'
on conflict (id) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  emoji = excluded.emoji,
  role = excluded.role,
  avaliacao_media = excluded.avaliacao_media,
  total_avaliacoes = excluded.total_avaliacoes,
  online = excluded.online,
  lat = excluded.lat,
  lng = excluded.lng,
  zona = excluded.zona,
  verificado = excluded.verificado,
  status = excluded.status,
  horario_abre = excluded.horario_abre,
  horario_fecha = excluded.horario_fecha,
  updated_at = now();

create or replace function public.sync_vendedor_publico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.vendedores_publicos where id = old.id;
    return old;
  end if;

  if new.role in ('ambulante','restaurante','entregador') and coalesce(new.status, 'ativo') = 'ativo' then
    insert into public.vendedores_publicos (
      id, nome, categoria, emoji, role, avaliacao_media, total_avaliacoes,
      online, lat, lng, zona, verificado, status, horario_abre, horario_fecha, updated_at
    ) values (
      new.id, new.nome, new.categoria, new.emoji, new.role, new.avaliacao_media, new.total_avaliacoes,
      new.online, new.lat, new.lng, new.zona, new.verificado, new.status, new.horario_abre, new.horario_fecha, now()
    ) on conflict (id) do update set
      nome = excluded.nome,
      categoria = excluded.categoria,
      emoji = excluded.emoji,
      role = excluded.role,
      avaliacao_media = excluded.avaliacao_media,
      total_avaliacoes = excluded.total_avaliacoes,
      online = excluded.online,
      lat = excluded.lat,
      lng = excluded.lng,
      zona = excluded.zona,
      verificado = excluded.verificado,
      status = excluded.status,
      horario_abre = excluded.horario_abre,
      horario_fecha = excluded.horario_fecha,
      updated_at = now();
  else
    delete from public.vendedores_publicos where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_vendedor_publico() from public, anon, authenticated;

drop trigger if exists trg_sync_vendedor_publico on public.profiles;
create trigger trg_sync_vendedor_publico
after insert or update or delete on public.profiles
for each row execute function public.sync_vendedor_publico();

drop policy if exists profiles_select_public_vendor_or_self_or_admin on public.profiles;
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to anon, authenticated
using (private.is_admin() or id = (select auth.uid()));

create unique index if not exists profiles_email_lower_uidx
on public.profiles (lower(email))
where nullif(trim(email), '') is not null;

create unique index if not exists profiles_cpf_uidx
on public.profiles (cpf)
where nullif(cpf, '') is not null;

create unique index if not exists profiles_cnpj_uidx
on public.profiles (cnpj)
where nullif(cnpj, '') is not null;

drop function if exists public.email_ja_cadastrado(text);
drop function if exists public.cnpj_ja_cadastrado(text);

revoke all on function public.solicitar_saque(uuid, numeric) from public, anon, authenticated;
revoke all on function public.liberar_repasses() from public, anon, authenticated;
revoke all on function public.reconciliar_carteira(uuid) from public, anon, authenticated;
revoke all on function public.carteira_espelho(uuid) from public, anon;
grant execute on function public.carteira_espelho(uuid) to authenticated;
revoke all on function public.checar_ma_fe() from public, anon, authenticated;

drop policy if exists ff_insert on public.fraude_flags;
create policy ff_insert on public.fraude_flags
for insert to authenticated
with check (cliente_id = (select auth.uid()));

drop policy if exists roadmap_write on public.roadmap_ideias;
drop policy if exists roadmap_ideias_insert on public.roadmap_ideias;
drop policy if exists roadmap_ideias_modify on public.roadmap_ideias;
drop policy if exists roadmap_ideias_delete on public.roadmap_ideias;

create policy roadmap_ideias_insert on public.roadmap_ideias
for insert to authenticated
with check (length(trim(coalesce(titulo, ''))) between 3 and 120);

create policy roadmap_ideias_modify on public.roadmap_ideias
for update to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy roadmap_ideias_delete on public.roadmap_ideias
for delete to authenticated
using (private.is_admin());

drop policy if exists produtos_public_read on storage.objects;

alter function public.set_codigo_entrega() set search_path = '';
