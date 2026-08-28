-- Lote: ordem/grupo pra so o lote vigente aparecer, e marca de "visto na fonte"
-- pra encerrar automaticamente o lote que saiu do ar na origem.
-- Markup passa a variar por metodo de pagamento: pix/debito 25%, credito 35%.

alter table public.event_ticket_lots
  add column if not exists lote_ordem integer,
  add column if not exists lote_grupo text,
  add column if not exists visto_na_fonte_em timestamptz,
  add column if not exists markup_percent_credito numeric(6,2) not null default 35,
  add column if not exists preco_venda_credito numeric(10,2) not null default 0;

alter table public.event_ticket_lots
  drop constraint if exists event_ticket_lots_markup_percent_credito_check;
alter table public.event_ticket_lots
  add constraint event_ticket_lots_markup_percent_credito_check
  check (markup_percent_credito >= 0 and markup_percent_credito <= 500);

alter table public.event_ticket_lots
  alter column markup_percent set default 25;

create index if not exists event_ticket_lots_vigencia_idx
  on public.event_ticket_lots (evento_id, lote_grupo, lote_ordem);

create or replace function public.set_event_ticket_lot_pricing()
returns trigger
language plpgsql
set search_path to ''
as $fn$
declare
  v_base numeric(10,2);
begin
  new.updated_at = now();
  new.preco_origem = round(coalesce(new.preco_origem, 0)::numeric, 2);
  new.taxa_origem = round(coalesce(new.taxa_origem, 0)::numeric, 2);
  new.markup_percent = round(coalesce(new.markup_percent, 25)::numeric, 2);
  new.markup_percent_credito = round(coalesce(new.markup_percent_credito, 35)::numeric, 2);
  v_base = round((new.preco_origem + new.taxa_origem)::numeric, 2);
  new.markup_amount = round((v_base * new.markup_percent / 100)::numeric, 2);
  new.preco_venda = round((v_base + new.markup_amount)::numeric, 2);
  new.preco_venda_credito = round((v_base * (1 + new.markup_percent_credito / 100))::numeric, 2);

  if new.estoque_total is not null and new.estoque_disponivel is null then
    new.estoque_disponivel = new.estoque_total;
  end if;

  if new.estoque_disponivel = 0 and new.status = 'disponivel' then
    new.status = 'esgotado';
  end if;

  return new;
end;
$fn$;

-- Recalcula os lotes existentes com o markup novo (25/35).
update public.event_ticket_lots
set markup_percent = 25, markup_percent_credito = 35
where status <> 'esgotado';
