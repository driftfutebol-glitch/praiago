-- Janela de reembolso: 4 horas.
--
-- Ate agora o cliente podia abrir uma solicitacao de reembolso a qualquer
-- momento, para qualquer pedido, inclusive um que nunca foi pago. Isso enche
-- a fila do atendimento de caso que nao tem o que reembolsar e nao da nenhum
-- limite ao vendedor: um pedido de tres semanas atras podia virar disputa.
--
-- Regra nova, valendo no banco (nao so na tela):
--
--   1. So reembolsa pedido efetivamente pago online.
--   2. A contagem comeca na entrega confirmada; sem confirmacao, no pagamento;
--      sem pagamento, na criacao. E vale por 4 horas.
--   3. Fora disso o caminho e o suporte, que tem admin com permissao
--      financeira do outro lado.
--
-- A tela do cliente mostra o mesmo prazo e some com o botao quando ele passa,
-- mas quem manda e este arquivo: tela e sugestao, banco e regra.

begin;

-- 1. O prazo, em um lugar so -------------------------------------------
-- Funcao (e nao constante espalhada) para que app, admin e trigger leiam o
-- mesmo numero. Mudar a politica no futuro = mudar aqui.

create or replace function public.prazo_reembolso(
  p_entrega_confirmada_em timestamptz,
  p_paid_at timestamptz,
  p_created_at timestamptz
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_entrega_confirmada_em, p_paid_at, p_created_at)
       + interval '4 hours';
$$;

comment on function public.prazo_reembolso(timestamptz, timestamptz, timestamptz) is
  'Instante em que a janela de reembolso do cliente fecha: 4 horas contadas da '
  'entrega confirmada, ou do pagamento, ou da criacao do pedido - nesta ordem.';

grant execute on function public.prazo_reembolso(timestamptz, timestamptz, timestamptz)
  to authenticated;

-- 2. A regra no gatilho -------------------------------------------------
-- Redefine protect_order_update inteiro (nao da pra remendar so um ramo) a
-- partir de 20260727160000_security_hardening_auth_orders.sql. Unica mudanca:
-- o bloco de reembolso do cliente.

create or replace function public.protect_order_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_client boolean := old.cliente_id = v_actor;
  v_seller boolean := (
    old.vendedor_id = v_actor
    or old.restaurante_id = v_actor
    or old.ambulante_id = v_actor
  );
  v_finance_changed boolean := (
    new.total is distinct from old.total
    or new.subtotal_amount is distinct from old.subtotal_amount
    or new.discount_amount is distinct from old.discount_amount
    or new.discount_code is distinct from old.discount_code
    or new.discount_reason is distinct from old.discount_reason
    or new.pagamento is distinct from old.pagamento
    or new.payment_provider is distinct from old.payment_provider
    or new.payment_status is distinct from old.payment_status
    or new.payment_reference is distinct from old.payment_reference
    or new.gross_amount is distinct from old.gross_amount
    or new.platform_fee_amount is distinct from old.platform_fee_amount
    or new.vendor_amount is distinct from old.vendor_amount
    or new.settlement_status is distinct from old.settlement_status
    or new.paid_at is distinct from old.paid_at
    or new.refunded_at is distinct from old.refunded_at
    or new.payment_checkout_url is distinct from old.payment_checkout_url
    or new.payment_details is distinct from old.payment_details
    or new.repasse_liberado_em is distinct from old.repasse_liberado_em
  );
  v_prazo timestamptz;
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if private.is_admin() then
    if v_finance_changed and not private.has_permission('financeiro') then
      raise exception 'Sem permissao financeira para alterar este pedido.'
        using errcode = '42501';
    end if;
    if not (
      private.has_permission('pedidos')
      or private.has_permission('financeiro')
    ) then
      raise exception 'Sem permissao para alterar pedidos.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if v_client then
    if (to_jsonb(new) - array[
      'status',
      'reembolso_status',
      'reembolso_motivo',
      'reembolso_solicitado_em'
    ]) is distinct from (to_jsonb(old) - array[
      'status',
      'reembolso_status',
      'reembolso_motivo',
      'reembolso_solicitado_em'
    ]) then
      raise exception 'Cliente tentou alterar campos protegidos do pedido.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status
       and not (
         new.status = 'cancelado'
         and old.status in ('novo', 'aguardando_pagamento')
       ) then
      raise exception 'Pedido nao pode ser cancelado nesta etapa.'
        using errcode = '23514';
    end if;

    if new.reembolso_status is distinct from old.reembolso_status then
      if new.reembolso_status <> 'solicitado'
         or old.reembolso_status not in ('nenhum', 'rejeitado') then
        raise exception 'Transicao de reembolso invalida.'
          using errcode = '23514';
      end if;

      -- Nao existe reembolso de dinheiro que nunca entrou. Pagamento na
      -- entrega (presencial) tambem nao passa por aqui: quem devolve o
      -- troco e o vendedor, na hora.
      if coalesce(old.payment_status, '') not in ('aprovado', 'pago') then
        raise exception 'Este pedido nao tem pagamento online aprovado para reembolsar.'
          using errcode = '23514';
      end if;

      v_prazo := public.prazo_reembolso(
        old.entrega_confirmada_em, old.paid_at, old.created_at
      );
      if now() > v_prazo then
        raise exception 'O prazo de 4 horas para pedir reembolso deste pedido ja passou. Fale com o suporte.'
          using errcode = '23514';
      end if;

      new.reembolso_solicitado_em := now();
      new.reembolso_motivo := left(
        coalesce(nullif(trim(new.reembolso_motivo), ''), 'Solicitado pelo cliente.'),
        500
      );
    elsif new.reembolso_motivo is distinct from old.reembolso_motivo
       or new.reembolso_solicitado_em is distinct from old.reembolso_solicitado_em then
      raise exception 'Campos de reembolso so podem mudar ao abrir a solicitacao.'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if v_seller then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Vendedor so pode atualizar o andamento do pedido.'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status
       and not (
         (old.status = 'novo' and new.status in ('preparando', 'cancelado'))
         or (old.status = 'preparando' and new.status in ('pronto', 'saiu_entrega', 'cancelado'))
         or (old.status = 'pronto' and new.status in ('entregando', 'saiu_entrega', 'cancelado'))
         or (
           old.status in ('entregando', 'saiu_entrega')
           and new.status = 'entregue'
           and coalesce(current_setting('praiago.delivery_confirmed', true), '') = 'true'
         )
       ) then
      raise exception 'Transicao de status do pedido invalida.'
        using errcode = '23514';
    end if;

    return new;
  end if;

  raise exception 'Sem permissao para alterar este pedido.'
    using errcode = '42501';
end;
$$;

revoke all on function public.protect_order_update()
from public, anon, authenticated;

-- 3. Limpeza do que ficou preso em pagamento ----------------------------
-- O cliente pediu para tirar TODO o historico parado em "verificando
-- pagamento", nao so o antigo. p_dias => 0 pega tudo que ainda esta em
-- aguardando_pagamento sem aprovacao. Nada e apagado de verdade: vai para
-- pedidos_expirados, criado em 20260826120000.

do $$
declare
  n integer;
begin
  n := private.expirar_pedidos_sem_pagamento(0);
  raise notice 'pedidos em aguardando_pagamento arquivados agora: %', n;
end;
$$;

commit;
