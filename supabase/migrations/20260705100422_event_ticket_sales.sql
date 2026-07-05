-- Sistema de venda de ingressos PraiaGo.
-- Fluxo:
-- 1) robo/admin cadastra lotes por evento;
-- 2) preco de venda = preco de origem + margem PraiaGo;
-- 3) cliente paga pelo Mercado Pago da empresa;
-- 4) admin recebe notificacao para entregar o ingresso;
-- 5) reembolso/cancelamento so e processado por admin/bot.

alter table public.eventos
  add column if not exists ingressos_enabled boolean not null default false,
  add column if not exists markup_ingresso_percent numeric(6,2) not null default 25;

create table if not exists public.event_ticket_lots (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  source_ticket_id text,
  nome text not null,
  descricao text,
  preco_origem numeric(10,2) not null default 0 check (preco_origem >= 0),
  markup_percent numeric(6,2) not null default 25 check (markup_percent >= 0 and markup_percent <= 500),
  markup_amount numeric(10,2) not null default 0 check (markup_amount >= 0),
  preco_venda numeric(10,2) not null default 0 check (preco_venda >= 0),
  moeda text not null default 'BRL',
  taxa_origem numeric(10,2) not null default 0 check (taxa_origem >= 0),
  estoque_total integer check (estoque_total is null or estoque_total >= 0),
  estoque_disponivel integer check (estoque_disponivel is null or estoque_disponivel >= 0),
  status text not null default 'pendente_aprovacao'
    check (status in ('pendente_aprovacao','disponivel','pausado','esgotado')),
  fonte_url text,
  metadata jsonb not null default '{}'::jsonb,
  criado_por text not null default 'robo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (evento_id, source_ticket_id),
  unique (evento_id, nome, preco_origem)
);

create index if not exists event_ticket_lots_evento_idx
on public.event_ticket_lots(evento_id);

create index if not exists event_ticket_lots_status_idx
on public.event_ticket_lots(status);

create table if not exists public.event_ticket_orders (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete restrict,
  ticket_lot_id uuid not null references public.event_ticket_lots(id) on delete restrict,
  cliente_id uuid references auth.users(id) on delete set null,
  cliente_nome text not null default 'Cliente PraiaGo',
  cliente_email text,
  cliente_telefone text,
  quantidade integer not null default 1 check (quantidade > 0 and quantidade <= 20),
  preco_origem_unit numeric(10,2) not null default 0,
  preco_unit numeric(10,2) not null default 0,
  subtotal_origem numeric(10,2) not null default 0,
  markup_total numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status text not null default 'aguardando_pagamento'
    check (status in (
      'aguardando_pagamento','pago','entrega_pendente','entregue',
      'cancelado','pagamento_recusado','reembolso_solicitado',
      'reembolso_aprovado','reembolsado','reembolso_negado','chargeback'
    )),
  payment_provider text not null default 'mercadopago',
  payment_status text not null default 'pendente',
  payment_reference text,
  payment_checkout_url text,
  mercadopago_preference_id text,
  mercadopago_payment_id text,
  payment_details jsonb not null default '{}'::jsonb,
  delivery_status text not null default 'aguardando_pagamento'
    check (delivery_status in ('aguardando_pagamento','entrega_pendente','enviado','falhou','cancelado')),
  delivery_email_status text not null default 'pendente'
    check (delivery_email_status in ('pendente','enviado','falhou','nao_configurado')),
  entrega_observacao text,
  entregue_por uuid references auth.users(id) on delete set null,
  delivered_at timestamptz,
  paid_at timestamptz,
  canceled_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_ticket_orders_evento_idx
on public.event_ticket_orders(evento_id);

create index if not exists event_ticket_orders_cliente_idx
on public.event_ticket_orders(cliente_id);

create index if not exists event_ticket_orders_status_idx
on public.event_ticket_orders(status);

create table if not exists public.event_ticket_refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.event_ticket_orders(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requested_by_role text not null default 'cliente'
    check (requested_by_role in ('cliente','bot','admin')),
  status text not null default 'pendente_admin'
    check (status in ('pendente_admin','aprovado','negado','processando','reembolsado','falhou')),
  motivo text not null,
  valor numeric(10,2),
  mercadopago_refund_id text,
  resposta_admin text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_ticket_refunds_order_idx
on public.event_ticket_refunds(order_id);

create index if not exists event_ticket_refunds_status_idx
on public.event_ticket_refunds(status);

create table if not exists public.event_ticket_notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.event_ticket_orders(id) on delete cascade,
  tipo text not null check (tipo in ('nova_venda','entrega_ingresso','reembolso','falha_email','admin')),
  titulo text not null,
  mensagem text not null,
  destinatario_email text,
  status text not null default 'pendente'
    check (status in ('pendente','lida','resolvida','falhou')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists event_ticket_notifications_status_idx
on public.event_ticket_notifications(status, created_at desc);

create table if not exists public.app_policies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  titulo text not null,
  conteudo text not null,
  ativo boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_policies (slug, titulo, conteudo, ativo, version)
values (
  'ingressos-cancelamento-reembolso',
  'Politica de cancelamento e reembolso de ingressos PraiaGo',
  '1. A compra de ingresso pelo PraiaGo e uma solicitacao de intermediacao e entrega manual/digital. O ingresso so e considerado entregue quando constar como enviado ou entregue no painel.\n\n2. Cancelamentos podem ser solicitados antes da entrega do ingresso. Depois da entrega, o reembolso depende das regras do organizador, da plataforma emissora e da validacao do admin PraiaGo.\n\n3. Reembolso nao e automatico. Toda solicitacao entra em analise e so pode ser aprovada por admin ou bot autorizado. O cliente nao consegue executar estorno diretamente pelo app.\n\n4. Quando aprovado, o estorno e processado pelo Mercado Pago, total ou parcialmente, conforme disponibilidade do pagamento e regras antifraude.\n\n5. Taxas de servico de terceiros, indisponibilidade de lote, evento cancelado ou mudanca de data podem gerar tratamento especifico. O PraiaGo pode oferecer remarcacao, credito ou reembolso quando aplicavel.\n\n6. Tentativas de fraude, uso indevido, chargeback irregular, dados falsos ou pedido ja entregue/validado podem negar o reembolso.\n\n7. Prazos bancarios e de cartao dependem do Mercado Pago e da instituicao emissora.',
  true,
  1
)
on conflict (slug) do update set
  titulo = excluded.titulo,
  conteudo = excluded.conteudo,
  ativo = true,
  version = public.app_policies.version + 1,
  updated_at = now();

create or replace function public.set_event_ticket_lot_pricing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.preco_origem = round(coalesce(new.preco_origem, 0)::numeric, 2);
  new.markup_percent = round(coalesce(new.markup_percent, 25)::numeric, 2);
  new.markup_amount = round((new.preco_origem * new.markup_percent / 100)::numeric, 2);
  new.preco_venda = round((new.preco_origem + new.markup_amount)::numeric, 2);

  if new.estoque_total is not null and new.estoque_disponivel is null then
    new.estoque_disponivel = new.estoque_total;
  end if;

  if new.estoque_disponivel = 0 and new.status = 'disponivel' then
    new.status = 'esgotado';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_event_ticket_lot_pricing on public.event_ticket_lots;
create trigger trg_set_event_ticket_lot_pricing
before insert or update on public.event_ticket_lots
for each row execute function public.set_event_ticket_lot_pricing();

create or replace function public.set_event_ticket_order_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lote public.event_ticket_lots%rowtype;
begin
  select *
  into lote
  from public.event_ticket_lots
  where id = new.ticket_lot_id;

  if not found then
    raise exception 'Lote de ingresso nao encontrado.';
  end if;

  new.evento_id = lote.evento_id;
  new.quantidade = greatest(1, least(coalesce(new.quantidade, 1), 20));
  new.preco_origem_unit = lote.preco_origem;
  new.preco_unit = lote.preco_venda;
  new.subtotal_origem = round((lote.preco_origem * new.quantidade)::numeric, 2);
  new.total = round((lote.preco_venda * new.quantidade)::numeric, 2);
  new.markup_total = round((new.total - new.subtotal_origem)::numeric, 2);
  new.updated_at = now();

  if new.status is null then
    new.status = 'aguardando_pagamento';
  end if;
  if new.delivery_status is null then
    new.delivery_status = 'aguardando_pagamento';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_event_ticket_order_totals on public.event_ticket_orders;
create trigger trg_set_event_ticket_order_totals
before insert or update of ticket_lot_id, quantidade on public.event_ticket_orders
for each row execute function public.set_event_ticket_order_totals();

create or replace function public.reserve_event_ticket_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.event_ticket_lots
  set estoque_disponivel = case
      when estoque_disponivel is null then null
      else estoque_disponivel - new.quantidade
    end,
    status = case
      when estoque_disponivel is not null and estoque_disponivel - new.quantidade <= 0 then 'esgotado'
      else status
    end,
    updated_at = now()
  where id = new.ticket_lot_id
    and status = 'disponivel'
    and (estoque_disponivel is null or estoque_disponivel >= new.quantidade);

  if not found then
    raise exception 'Ingresso indisponivel ou estoque insuficiente.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reserve_event_ticket_stock on public.event_ticket_orders;
create trigger trg_reserve_event_ticket_stock
after insert on public.event_ticket_orders
for each row execute function public.reserve_event_ticket_stock();

create or replace function public.restore_event_ticket_stock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status not in ('cancelado','pagamento_recusado','reembolsado','chargeback')
     and new.status in ('cancelado','pagamento_recusado','reembolsado','chargeback') then
    update public.event_ticket_lots
    set estoque_disponivel = case
        when estoque_disponivel is null then null
        else estoque_disponivel + old.quantidade
      end,
      status = case
        when status = 'esgotado' then 'disponivel'
        else status
      end,
      updated_at = now()
    where id = old.ticket_lot_id;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_restore_event_ticket_stock on public.event_ticket_orders;
create trigger trg_restore_event_ticket_stock
before update of status on public.event_ticket_orders
for each row execute function public.restore_event_ticket_stock();

alter table public.event_ticket_lots enable row level security;
alter table public.event_ticket_orders enable row level security;
alter table public.event_ticket_refunds enable row level security;
alter table public.event_ticket_notifications enable row level security;
alter table public.app_policies enable row level security;

do $$
begin
  begin
    alter publication supabase_realtime add table public.event_ticket_notifications;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

grant select on table public.event_ticket_lots, public.app_policies to anon, authenticated;
grant insert on table public.event_ticket_orders, public.event_ticket_refunds to authenticated;
grant select on table public.event_ticket_orders, public.event_ticket_refunds to authenticated;
grant select, insert, update, delete on table
  public.event_ticket_lots,
  public.event_ticket_orders,
  public.event_ticket_refunds,
  public.event_ticket_notifications,
  public.app_policies
to authenticated;
grant all on table
  public.event_ticket_lots,
  public.event_ticket_orders,
  public.event_ticket_refunds,
  public.event_ticket_notifications,
  public.app_policies
to service_role;

drop policy if exists "event_ticket_lots_public_available" on public.event_ticket_lots;
create policy "event_ticket_lots_public_available"
on public.event_ticket_lots
for select
to anon, authenticated
using (
  private.is_admin()
  or (
    status = 'disponivel'
    and exists (
      select 1 from public.eventos e
      where e.id = evento_id and e.status = 'ativo'
    )
  )
);

drop policy if exists "event_ticket_lots_admin_write" on public.event_ticket_lots;
create policy "event_ticket_lots_admin_write"
on public.event_ticket_lots
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "event_ticket_orders_select_owner_admin" on public.event_ticket_orders;
create policy "event_ticket_orders_select_owner_admin"
on public.event_ticket_orders
for select
to authenticated
using (private.is_admin() or cliente_id = (select auth.uid()));

drop policy if exists "event_ticket_orders_admin_write" on public.event_ticket_orders;
create policy "event_ticket_orders_admin_write"
on public.event_ticket_orders
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "event_ticket_refunds_select_owner_admin" on public.event_ticket_refunds;
create policy "event_ticket_refunds_select_owner_admin"
on public.event_ticket_refunds
for select
to authenticated
using (
  private.is_admin()
  or exists (
    select 1 from public.event_ticket_orders o
    where o.id = order_id and o.cliente_id = (select auth.uid())
  )
);

drop policy if exists "event_ticket_refunds_insert_owner_request" on public.event_ticket_refunds;
create policy "event_ticket_refunds_insert_owner_request"
on public.event_ticket_refunds
for insert
to authenticated
with check (
  requested_by = (select auth.uid())
  and requested_by_role = 'cliente'
  and status = 'pendente_admin'
  and exists (
    select 1 from public.event_ticket_orders o
    where o.id = order_id
      and o.cliente_id = (select auth.uid())
      and o.status in ('pago','entrega_pendente','entregue')
  )
);

drop policy if exists "event_ticket_refunds_admin_write" on public.event_ticket_refunds;
create policy "event_ticket_refunds_admin_write"
on public.event_ticket_refunds
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "event_ticket_notifications_admin" on public.event_ticket_notifications;
create policy "event_ticket_notifications_admin"
on public.event_ticket_notifications
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "app_policies_public_active" on public.app_policies;
create policy "app_policies_public_active"
on public.app_policies
for select
to anon, authenticated
using (ativo is true or private.is_admin());

drop policy if exists "app_policies_admin_write" on public.app_policies;
create policy "app_policies_admin_write"
on public.app_policies
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

revoke execute on function public.set_event_ticket_lot_pricing() from public, anon, authenticated;
revoke execute on function public.set_event_ticket_order_totals() from public, anon, authenticated;
revoke execute on function public.reserve_event_ticket_stock() from public, anon, authenticated;
revoke execute on function public.restore_event_ticket_stock() from public, anon, authenticated;

notify pgrst, 'reload schema';
