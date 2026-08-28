-- ============================================================================
-- CORRIGE A CADEIA DE REPASSE (carteira -> liberacao D+N -> saque)
-- ============================================================================
-- A carteira nunca funcionou. Tres defeitos independentes, todos silenciosos:
--
--   1. carteira_espelho() quebrava com "column reference vendedor_id is
--      ambiguous" — o parametro de saida colide com a coluna da tabela. Toda
--      chamada dava erro, entao a tela de carteira do vendedor nunca carregava.
--
--   2. As CHECK constraints do financial_ledger nunca receberam os valores que
--      a migration da carteira (20260711160000) prometeu: status 'disponivel'/
--      'solicitado' e tipo 'saque'/'estorno'. Resultado: liberar_repasses()
--      (cron diario das 09:00) e solicitar_saque() SEMPRE falhavam — dinheiro
--      nenhum jamais virou sacavel.
--
--   3. O lancamento nascia no INSERT do pedido, ANTES do pagamento. Pedido
--      abandonado no checkout ja creditava repasse: o saldo mostrava dinheiro
--      que nunca entrou (R$106,72 "pendente" com R$10,80 realmente pago).
-- ============================================================================

-- ─── 1. Constraints: aceitar o vocabulario que a carteira realmente usa ─────
alter table public.financial_ledger drop constraint if exists financial_ledger_status_check;
alter table public.financial_ledger add constraint financial_ledger_status_check
  check (status in (
    'pendente',    -- lancado, aguardando entrega
    'em_espera',   -- entrega confirmada, contando o D+N
    'disponivel',  -- D+N venceu, o vendedor ja pode sacar
    'solicitado',  -- saque pedido
    'processando', -- saque em transito no provedor
    'pago',        -- liquidado
    'cancelado'
  ));

alter table public.financial_ledger drop constraint if exists financial_ledger_tipo_check;
alter table public.financial_ledger add constraint financial_ledger_tipo_check
  check (tipo in (
    'taxa_plataforma', 'repasse_vendedor', 'comissao_devida',
    'taxa_provedor', 'saque', 'estorno', 'chargeback',
    'reembolso', 'ajuste'
  ));

-- ─── 2. carteira_espelho: resolve a ambiguidade qualificando as colunas ─────
-- O nome `vendedor_id` existe duas vezes no escopo (coluna de retorno da
-- funcao E coluna da tabela). Sem alias o Postgres recusa a query inteira.
create or replace function public.carteira_espelho(p_vendedor uuid)
returns table (
  vendedor_id        uuid,
  vendas_brutas      numeric,
  comissao_praiago   numeric,
  taxa_provedor      numeric,
  valor_liquido      numeric,
  saldo_pendente     numeric,
  saldo_disponivel   numeric,
  transferido        numeric,
  estornos           numeric,
  chargebacks        numeric,
  proxima_liquidacao timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is distinct from p_vendedor
     and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sysadmin') then
    raise exception 'sem permissao';
  end if;

  return query
  with l as (
    select fl.* from public.financial_ledger fl where fl.vendedor_id = p_vendedor
  ), t as (
    select
      coalesce(sum(po.valor) filter (where po.status in ('solicitado','processando','pago')), 0) as em_andamento_ou_pago,
      coalesce(sum(po.valor) filter (where po.status = 'pago'), 0) as pago
    from public.payouts po where po.vendedor_id = p_vendedor
  )
  select
    p_vendedor,
    coalesce(sum(l.valor) filter (where l.tipo in ('repasse_vendedor','taxa_plataforma','taxa_provedor') and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'taxa_plataforma' and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'taxa_provedor' and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status in ('pendente','em_espera')), 0),
    greatest(0, coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status = 'disponivel'), 0) - (select em_andamento_ou_pago from t)),
    (select pago from t),
    coalesce(sum(l.valor) filter (where l.tipo = 'estorno'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'chargeback'), 0),
    min(l.disponivel_em) filter (where l.tipo = 'repasse_vendedor' and l.status = 'em_espera')
  from l;
end;
$$;

-- ─── 3. Lancamento so quando o dinheiro e real ──────────────────────────────
-- Pedido com pagamento online nasce 'pendente' e so vira dinheiro quando o
-- gateway confirma. Pedido presencial (dinheiro na entrega) ja vale no INSERT.
create or replace function public.create_order_financial_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Pagamento online ainda nao confirmado: nao lanca nada. Antes lancava aqui
  -- e o saldo do vendedor contava pedido abandonado no checkout.
  if coalesce(new.payment_status, '') = 'pendente' then
    return new;
  end if;

  -- Idempotente: o indice unico (pedido_id, tipo) garante 1 lancamento por
  -- tipo mesmo se o gateway reenviar a confirmacao.
  -- O WHERE do ON CONFLICT nao e enfeite: o indice e PARCIAL, e sem repetir o
  -- mesmo predicado o Postgres nao o encontra e o trigger inteiro estoura.
  insert into public.financial_ledger (pedido_id, vendedor_id, tipo, valor, status, descricao)
  values
    (new.id, new.vendedor_id, 'taxa_plataforma',  coalesce(new.platform_fee_amount, 0), 'pendente', 'Taxa da plataforma PraiaGo'),
    (new.id, new.vendedor_id, 'repasse_vendedor', coalesce(new.vendor_amount, 0),       'pendente', 'Valor do vendedor apos taxa')
  -- DO UPDATE (e nao DO NOTHING): se o pedido ja tinha lancamento CANCELADO
  -- (pedido cancelado e refeito, ou limpeza da carteira), o DO NOTHING deixava
  -- o vendedor sem receber em silencio quando o pagamento finalmente caia.
  -- Lancamento ja ativo ou ja 'pago' fica intocado — webhook repetido nao
  -- credita duas vezes nem rebaixa o que ja foi liquidado.
  on conflict (pedido_id, tipo) where pedido_id is not null do update
    set status      = 'pendente',
        valor       = excluded.valor,
        vendedor_id = excluded.vendedor_id,
        descricao   = excluded.descricao
    where public.financial_ledger.status = 'cancelado';

  return new;
end;
$$;

revoke execute on function public.create_order_financial_ledger() from public, anon, authenticated;

-- Dispara tambem quando o pagamento e aprovado (era so no INSERT).
drop trigger if exists trg_create_order_financial_ledger_pago on public.pedidos;
create trigger trg_create_order_financial_ledger_pago
after update of payment_status on public.pedidos
for each row
when (new.payment_status in ('aprovado','presencial')
      and old.payment_status is distinct from new.payment_status)
execute function public.create_order_financial_ledger();

-- ─── 4. Pedido cancelado/estornado nao pode continuar somando saldo ─────────
create or replace function public.cancelar_ledger_do_pedido()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.financial_ledger
     set status = 'cancelado',
         descricao = case
           when new.payment_status = 'estornado' then 'Cancelado: pagamento estornado'
           else 'Cancelado: pedido cancelado'
         end
   where pedido_id = new.id
     -- saque ja liquidado nao volta atras
     and status not in ('pago', 'cancelado');
  return new;
end;
$$;

revoke execute on function public.cancelar_ledger_do_pedido() from public, anon, authenticated;

drop trigger if exists trg_cancelar_ledger_do_pedido on public.pedidos;
create trigger trg_cancelar_ledger_do_pedido
after update of status, payment_status on public.pedidos
for each row
when ((new.status = 'cancelado' or new.payment_status in ('estornado','recusado','cancelado'))
      and (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status))
execute function public.cancelar_ledger_do_pedido();

-- ─── 5. Limpeza do estrago acumulado ────────────────────────────────────────
-- Lancamentos criados pelo bug 3 (pedido nunca pago) e orfaos de pedido
-- apagado. Marca como cancelado em vez de apagar: mantem a trilha de auditoria.
update public.financial_ledger fl
   set status = 'cancelado',
       descricao = 'Cancelado na correcao da carteira: pedido nunca foi pago'
 where fl.status not in ('cancelado', 'pago')
   and fl.pedido_id is not null
   and not exists (
     select 1 from public.pedidos p
      where p.id = fl.pedido_id
        and p.payment_status in ('aprovado', 'presencial')
   );

-- Recalcula as carteiras a partir do ledger ja corrigido.
do $$
declare v_vendedor uuid;
begin
  for v_vendedor in
    select distinct vendedor_id from public.financial_ledger where vendedor_id is not null
  loop
    begin
      perform public.reconciliar_carteira(v_vendedor);
    exception when others then
      raise notice 'carteira do vendedor % nao reconciliou: %', v_vendedor, sqlerrm;
    end;
  end loop;
end;
$$;

comment on constraint financial_ledger_status_check on public.financial_ledger is
  'Ciclo de vida do lancamento: pendente -> em_espera -> disponivel -> solicitado/processando -> pago. Se faltar um valor aqui, liberar_repasses() e solicitar_saque() falham em silencio.';
