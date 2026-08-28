-- Robo caca-eventos v2: margem padrao PraiaGo = 10%.
-- O preco de venda considera preco de origem + taxa da origem antes da margem.

alter table public.eventos
  alter column markup_ingresso_percent set default 10;

alter table public.event_ticket_lots
  alter column markup_percent set default 10;

create or replace function public.set_event_ticket_lot_pricing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_base numeric(10,2);
begin
  new.updated_at = now();
  new.preco_origem = round(coalesce(new.preco_origem, 0)::numeric, 2);
  new.taxa_origem = round(coalesce(new.taxa_origem, 0)::numeric, 2);
  new.markup_percent = round(coalesce(new.markup_percent, 10)::numeric, 2);
  v_base = round((new.preco_origem + new.taxa_origem)::numeric, 2);
  new.markup_amount = round((v_base * new.markup_percent / 100)::numeric, 2);
  new.preco_venda = round((v_base + new.markup_amount)::numeric, 2);

  if new.estoque_total is not null and new.estoque_disponivel is null then
    new.estoque_disponivel = new.estoque_total;
  end if;

  if new.estoque_disponivel = 0 and new.status = 'disponivel' then
    new.status = 'esgotado';
  end if;

  return new;
end;
$$;

-- Recalcula lotes de robo ainda pendentes com a regra nova.
update public.event_ticket_lots
   set markup_percent = 10
 where criado_por = 'robo'
   and status = 'pendente_aprovacao'
   and markup_percent = 25;

update public.eventos
   set markup_ingresso_percent = 10
 where markup_ingresso_percent = 25;

update public.app_policies
   set conteudo = replace(conteudo, 'Mercado Pago', 'gateway de pagamento'),
       updated_at = now()
 where slug = 'ingressos-cancelamento-reembolso'
   and conteudo ilike '%Mercado Pago%';

notify pgrst, 'reload schema';
