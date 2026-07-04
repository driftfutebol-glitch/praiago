create table if not exists public.promocoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  produto_id uuid not null references public.produtos(id) on delete cascade,
  vendedor_id uuid not null references public.profiles(id) on delete cascade,
  desconto_tipo text not null default 'preco_promocional',
  desconto_valor numeric(10,2),
  preco_original numeric(10,2) not null default 0,
  preco_promocional numeric(10,2),
  selo text not null default 'Oferta',
  ativo boolean not null default true,
  publico boolean not null default true,
  prioridade integer not null default 0,
  data_inicio timestamptz not null default now(),
  data_fim timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promocoes_desconto_tipo_check check (desconto_tipo in ('preco_promocional', 'percentual', 'valor_fixo')),
  constraint promocoes_preco_original_check check (preco_original >= 0),
  constraint promocoes_desconto_valor_check check (desconto_valor is null or desconto_valor >= 0),
  constraint promocoes_preco_promocional_check check (preco_promocional is null or preco_promocional >= 0),
  constraint promocoes_periodo_check check (data_fim is null or data_fim > data_inicio),
  constraint promocoes_desconto_obrigatorio_check check (
    (desconto_tipo = 'preco_promocional' and preco_promocional is not null and preco_promocional < preco_original)
    or
    (desconto_tipo = 'percentual' and desconto_valor is not null and desconto_valor > 0 and desconto_valor <= 95)
    or
    (desconto_tipo = 'valor_fixo' and desconto_valor is not null and desconto_valor > 0 and desconto_valor < preco_original)
  )
);

create index if not exists promocoes_publicas_idx
on public.promocoes (ativo, publico, data_inicio, data_fim, prioridade desc);

create index if not exists promocoes_produto_idx
on public.promocoes (produto_id);

create index if not exists promocoes_vendedor_idx
on public.promocoes (vendedor_id);

create or replace function public.set_promocoes_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_promocoes_updated_at on public.promocoes;
create trigger set_promocoes_updated_at
before update on public.promocoes
for each row execute function public.set_promocoes_updated_at();

revoke execute on function public.set_promocoes_updated_at() from public, anon, authenticated;

grant select on table public.promocoes to anon;
grant select, insert, update, delete on table public.promocoes to authenticated;
grant select, insert, update, delete on table public.promocoes to service_role;

alter table public.promocoes enable row level security;

drop policy if exists "promocoes_select_public_active_or_admin" on public.promocoes;
drop policy if exists "promocoes_insert_admin" on public.promocoes;
drop policy if exists "promocoes_update_admin" on public.promocoes;
drop policy if exists "promocoes_delete_admin" on public.promocoes;

create policy "promocoes_select_public_active_or_admin"
on public.promocoes
for select
to anon, authenticated
using (
  private.is_admin()
  or (
    ativo is true
    and publico is true
    and data_inicio <= now()
    and (data_fim is null or data_fim >= now())
  )
);

create policy "promocoes_insert_admin"
on public.promocoes
for insert
to authenticated
with check (private.is_admin());

create policy "promocoes_update_admin"
on public.promocoes
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "promocoes_delete_admin"
on public.promocoes
for delete
to authenticated
using (private.is_admin());
