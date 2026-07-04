-- Hardening de grants, RLS e funcoes publicas.
-- Mantem leitura publica apenas onde o app precisa e move escrita sensivel para dono/admin/service_role.

create schema if not exists private;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin', 'sysadmin')
      and coalesce(p.status, 'ativo') <> 'banido'
  );
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

-- Usuarios novos nao podem escolher role privilegiada via raw_user_meta_data.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, nome, email, role, email_verificado)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'cliente',
    (new.email_confirmed_at is not null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null then
    update public.profiles set email_verificado = true where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.atualiza_nota_vendedor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p set
    avaliacao_media = (
      select round(avg(nota)::numeric, 1)
      from public.avaliacoes
      where vendedor_id = new.vendedor_id
    ),
    total_avaliacoes = (
      select count(*)
      from public.avaliacoes
      where vendedor_id = new.vendedor_id
    )
  where p.id = new.vendedor_id;
  return new;
end;
$$;

create or replace function public.create_order_financial_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.financial_ledger (pedido_id, vendedor_id, tipo, valor, status, descricao)
  values
    (new.id, new.vendedor_id, 'taxa_plataforma', coalesce(new.platform_fee_amount, 0), 'pendente', 'Taxa da plataforma PraiaGo'),
    (new.id, new.vendedor_id, 'repasse_vendedor', coalesce(new.vendor_amount, 0), 'pendente', 'Valor do vendedor apos taxa');
  return new;
end;
$$;

create or replace function public.set_cupons_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  if new.codigo is not null then
    new.codigo = upper(regexp_replace(trim(new.codigo), '\s+', '', 'g'));
  end if;
  return new;
end;
$$;

revoke execute on function public.atualiza_nota_vendedor() from public, anon, authenticated;
revoke execute on function public.create_order_financial_ledger() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_confirmed() from public, anon, authenticated;
revoke execute on function public.set_cupons_updated_at() from public, anon, authenticated;

-- Remove grants amplos herdados; concede so o minimo que o app usa.
revoke all privileges on all tables in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on table
  public.profiles,
  public.produtos,
  public.eventos,
  public.cupons,
  public.avisos,
  public.avaliacoes,
  public.payment_settings
to anon, authenticated;

grant insert on table
  public.pedidos,
  public.tickets,
  public.avaliacoes
to anon, authenticated;

grant select, update on table public.pedidos to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.produtos to authenticated;
grant select, insert, update, delete on table public.verificacoes to authenticated;
grant select, insert, update, delete on table public.entregadores to authenticated;
grant insert on table public.avisos to authenticated;

grant select, insert, update, delete on table
  public.cupons,
  public.eventos,
  public.tickets,
  public.payment_settings,
  public.financial_ledger,
  public.vendor_payment_accounts
to authenticated;

-- Policies antigas permissivas.
drop policy if exists "avaliacoes_all" on public.avaliacoes;
drop policy if exists "avisos_all" on public.avisos;
drop policy if exists "cupons_delete_public_admin_local" on public.cupons;
drop policy if exists "cupons_insert_public_admin_local" on public.cupons;
drop policy if exists "cupons_select_public" on public.cupons;
drop policy if exists "cupons_update_public_admin_local" on public.cupons;
drop policy if exists "Allow all entregadores" on public.entregadores;
drop policy if exists "eventos public select" on public.eventos;
drop policy if exists "eventos public write" on public.eventos;
drop policy if exists "Allow all financial_ledger" on public.financial_ledger;
drop policy if exists "Allow all payment_settings" on public.payment_settings;
drop policy if exists "Allow all pedidos" on public.pedidos;
drop policy if exists "Produtos visíveis a todos" on public.produtos;
drop policy if exists "Vendedor pode atualizar seus produtos" on public.produtos;
drop policy if exists "Vendedor pode deletar seus produtos" on public.produtos;
drop policy if exists "Vendedor pode inserir seus produtos" on public.produtos;
drop policy if exists "produtos_all" on public.produtos;
drop policy if exists "Allow all profiles" on public.profiles;
drop policy if exists "Allow anon insert tickets" on public.tickets;
drop policy if exists "Allow public select tickets" on public.tickets;
drop policy if exists "Allow public update tickets" on public.tickets;
drop policy if exists "Allow all vendor_payment_accounts" on public.vendor_payment_accounts;
drop policy if exists "Allow all verificacoes" on public.verificacoes;

-- Profiles: publico le vendedores ativos; usuario ve/edita proprio; admin ve tudo.
create policy "profiles_select_public_vendor_or_self_or_admin"
on public.profiles
for select
to anon, authenticated
using (
  private.is_admin()
  or id = (select auth.uid())
  or (
    coalesce(status, 'ativo') = 'ativo'
    and role in ('ambulante', 'restaurante', 'entregador')
  )
);

create policy "profiles_insert_own_non_admin"
on public.profiles
for insert
to authenticated
with check (
  id = (select auth.uid())
  and coalesce(role, 'cliente') in ('cliente', 'ambulante', 'restaurante', 'entregador')
  and coalesce(status, 'ativo') <> 'banido'
);

create policy "profiles_update_own_non_admin_or_admin"
on public.profiles
for update
to authenticated
using (
  private.is_admin()
  or (id = (select auth.uid()) and coalesce(status, 'ativo') <> 'banido')
)
with check (
  private.is_admin()
  or (
    id = (select auth.uid())
    and coalesce(role, 'cliente') in ('cliente', 'ambulante', 'restaurante', 'entregador')
    and coalesce(status, 'ativo') <> 'banido'
  )
);

create policy "profiles_delete_admin"
on public.profiles
for delete
to authenticated
using (private.is_admin());

-- Produtos: catalogo publico ativo; dono/admin gerencia.
create policy "produtos_select_active_owner_or_admin"
on public.produtos
for select
to anon, authenticated
using (ativo is true or vendedor_id = (select auth.uid()) or private.is_admin());

create policy "produtos_insert_owner_or_admin"
on public.produtos
for insert
to authenticated
with check (private.is_admin() or vendedor_id = (select auth.uid()));

create policy "produtos_update_owner_or_admin"
on public.produtos
for update
to authenticated
using (private.is_admin() or vendedor_id = (select auth.uid()))
with check (private.is_admin() or vendedor_id = (select auth.uid()));

create policy "produtos_delete_owner_or_admin"
on public.produtos
for delete
to authenticated
using (private.is_admin() or vendedor_id = (select auth.uid()));

-- Pedidos: cliente/dono/admin leem; anon preservado para pedidos convidados.
create policy "pedidos_select_related_or_admin"
on public.pedidos
for select
to anon, authenticated
using (
  private.is_admin()
  or cliente_id = (select auth.uid())
  or vendedor_id = (select auth.uid())
  or restaurante_id = (select auth.uid())
  or ambulante_id = (select auth.uid())
  or (cliente_id is null and vendedor_id is not null)
);

create policy "pedidos_insert_checkout_safe"
on public.pedidos
for insert
to anon, authenticated
with check (
  coalesce(status, 'novo') = 'novo'
  and coalesce(total, 0) >= 0
  and (cliente_id is null or cliente_id = (select auth.uid()))
  and coalesce(payment_provider, 'manual') in ('manual', 'mercadopago')
  and coalesce(payment_status, 'pendente') in ('pendente', 'presencial')
);

create policy "pedidos_update_related_or_admin"
on public.pedidos
for update
to authenticated
using (
  private.is_admin()
  or cliente_id = (select auth.uid())
  or vendedor_id = (select auth.uid())
  or restaurante_id = (select auth.uid())
  or ambulante_id = (select auth.uid())
)
with check (
  private.is_admin()
  or cliente_id = (select auth.uid())
  or vendedor_id = (select auth.uid())
  or restaurante_id = (select auth.uid())
  or ambulante_id = (select auth.uid())
);

create policy "pedidos_delete_admin"
on public.pedidos
for delete
to authenticated
using (private.is_admin());

-- Tickets: publico apenas abre; admin administra.
create policy "tickets_insert_support_request"
on public.tickets
for insert
to anon, authenticated
with check (
  length(trim(plataforma)) > 0
  and length(trim(assunto)) > 0
  and length(trim(mensagem)) > 0
);

create policy "tickets_select_admin"
on public.tickets
for select
to authenticated
using (private.is_admin());

create policy "tickets_update_admin"
on public.tickets
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "tickets_delete_admin"
on public.tickets
for delete
to authenticated
using (private.is_admin());

-- Conteudo publico com escrita admin.
create policy "avisos_select_active"
on public.avisos
for select
to anon, authenticated
using (ativo is true);

create policy "avisos_insert_authenticated_notice_or_admin"
on public.avisos
for insert
to authenticated
with check (
  private.is_admin()
  or (
    tipo = 'aviso'
    and publico in ('clientes', 'ambulantes', 'restaurantes', 'todos')
    and length(trim(titulo)) > 0
    and length(trim(mensagem)) > 0
  )
);

create policy "avisos_update_admin"
on public.avisos
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "avisos_delete_admin"
on public.avisos
for delete
to authenticated
using (private.is_admin());

create policy "eventos_select_active"
on public.eventos
for select
to anon, authenticated
using (status = 'ativo');

create policy "eventos_insert_admin"
on public.eventos
for insert
to authenticated
with check (private.is_admin());

create policy "eventos_update_admin"
on public.eventos
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "eventos_delete_admin"
on public.eventos
for delete
to authenticated
using (private.is_admin());

create policy "cupons_select_public_active"
on public.cupons
for select
to anon, authenticated
using (
  private.is_admin()
  or (
    ativo is true
    and publico is true
    and (validade is null or validade >= now())
  )
);

create policy "cupons_insert_admin"
on public.cupons
for insert
to authenticated
with check (private.is_admin());

create policy "cupons_update_admin"
on public.cupons
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "cupons_delete_admin"
on public.cupons
for delete
to authenticated
using (private.is_admin());

-- Avaliacoes: leitura publica; escrita validada; administracao restrita.
create policy "avaliacoes_select_public"
on public.avaliacoes
for select
to anon, authenticated
using (vendedor_id is not null);

create policy "avaliacoes_insert_valid"
on public.avaliacoes
for insert
to anon, authenticated
with check (
  vendedor_id is not null
  and nota between 1 and 5
);

create policy "avaliacoes_update_admin"
on public.avaliacoes
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "avaliacoes_delete_admin"
on public.avaliacoes
for delete
to authenticated
using (private.is_admin());

-- Verificacoes: usuario/restaurante cria e consulta suas solicitacoes; admin gerencia.
create policy "verificacoes_select_owner_or_admin"
on public.verificacoes
for select
to authenticated
using (private.is_admin() or user_id = (select auth.uid()) or restaurante_id = (select auth.uid()));

create policy "verificacoes_insert_owner_pending"
on public.verificacoes
for insert
to authenticated
with check (
  (user_id = (select auth.uid()) or restaurante_id = (select auth.uid()) or private.is_admin())
  and coalesce(status, 'pendente') = 'pendente'
);

create policy "verificacoes_update_admin"
on public.verificacoes
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "verificacoes_delete_admin"
on public.verificacoes
for delete
to authenticated
using (private.is_admin());

-- Entregadores: restaurante dono da equipe ou admin.
create policy "entregadores_select_owner_or_admin"
on public.entregadores
for select
to authenticated
using (private.is_admin() or restaurante_id = (select auth.uid()));

create policy "entregadores_insert_owner_or_admin"
on public.entregadores
for insert
to authenticated
with check (private.is_admin() or restaurante_id = (select auth.uid()));

create policy "entregadores_update_owner_or_admin"
on public.entregadores
for update
to authenticated
using (private.is_admin() or restaurante_id = (select auth.uid()))
with check (private.is_admin() or restaurante_id = (select auth.uid()));

create policy "entregadores_delete_owner_or_admin"
on public.entregadores
for delete
to authenticated
using (private.is_admin() or restaurante_id = (select auth.uid()));

-- Financeiro e pagamentos: leitura publica apenas das regras de taxa; escrita admin/service role.
create policy "payment_settings_select_public"
on public.payment_settings
for select
to anon, authenticated
using (id is true);

create policy "payment_settings_write_admin"
on public.payment_settings
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "financial_ledger_select_vendor_or_admin"
on public.financial_ledger
for select
to authenticated
using (private.is_admin() or vendedor_id = (select auth.uid()));

create policy "financial_ledger_update_admin"
on public.financial_ledger
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "financial_ledger_delete_admin"
on public.financial_ledger
for delete
to authenticated
using (private.is_admin());

create policy "vendor_payment_accounts_select_owner_or_admin"
on public.vendor_payment_accounts
for select
to authenticated
using (private.is_admin() or vendedor_id = (select auth.uid()));

create policy "vendor_payment_accounts_write_admin"
on public.vendor_payment_accounts
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "mercadopago_vendor_accounts_service_role_only"
on public.mercadopago_vendor_accounts
for all
to service_role
using (vendedor_id is not null)
with check (vendedor_id is not null);

notify pgrst, 'reload schema';
