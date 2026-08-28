-- ============================================================================
-- REPASSE ESTILO IFOOD — Fase 2 (modelo de dados que faltava)
-- ============================================================================
-- Reaproveita o que já existe:
--   • financial_ledger  → livro-razão (tipo=repasse_vendedor|taxa_plataforma|comissao_devida,
--                          status=pendente|em_espera|disponivel|pago|cancelado, disponivel_em=D+7)
--   • payment_settings.repasse_dias      → D+N configurável (default 7)
--   • payment_settings.platform_fee_*    → comissão GLOBAL da plataforma
--   • mercadopago_vendor_accounts        → credenciais OAuth do vendedor (seller_credentials)
--   • vendor_payment_accounts (pix_key)  → chave Pix p/ saque
--
-- Adiciona o que faltava p/ carteira + saque estilo iFood:
--   • profiles.comissao_percent  → comissão POR VENDEDOR (sobrepõe a global)
--   • wallets                    → carteira (saldo_a_liberar / saldo_disponivel), cache reconciliável
--   • payouts                    → saques via Pix
--   • status 'disponivel' e tipos 'saque'/'estorno' no ledger (texto livre, sem enum)
--   • reconciliar_carteira()     → recomputa a carteira a partir do ledger (fonte de verdade)
--
-- ⚠️ COMPLIANCE (Banco Central) — ver supabase/REPASSE-IFOOD.md:
--   Quando o vendedor NÃO tem Mercado Pago vinculado, o dinheiro cai na conta da
--   PLATAFORMA (settlement_status='repasse_manual_pendente') e nós repassamos depois.
--   Segurar dinheiro de terceiros pode nos enquadrar como instituição de pagamento.
--   Quando o vendedor TEM MP vinculado (split), o dinheiro vai DIRETO pra conta dele
--   menos a comissão — sem custódia, sem risco. Preferir sempre o split.
-- ============================================================================

-- Comissão por vendedor (null = usa a global de payment_settings.platform_fee_percent)
alter table public.profiles add column if not exists comissao_percent numeric;

-- ─── Carteira do vendedor (1 por vendedor) ─────────────────────────────────
create table if not exists public.wallets (
  vendedor_id      uuid primary key references public.profiles(id) on delete cascade,
  saldo_a_liberar  numeric not null default 0,  -- repasses retidos (pendente/em_espera) — NÃO sacável
  saldo_disponivel numeric not null default 0,  -- liberado (D+7 passou) e ainda não sacado
  total_sacado     numeric not null default 0,  -- histórico de saques concluídos
  updated_at       timestamptz not null default now()
);

-- ─── Saques (payout via Pix) ───────────────────────────────────────────────
create table if not exists public.payouts (
  id              uuid primary key default gen_random_uuid(),
  vendedor_id     uuid not null references public.profiles(id) on delete cascade,
  valor           numeric not null check (valor > 0),
  chave_pix       text,
  status          text not null default 'solicitado', -- solicitado|processando|pago|falhou|cancelado
  provider        text default 'mercadopago',
  mp_transfer_id  text,                                -- id da transferência no provedor (idempotência)
  ledger_entry_id uuid references public.financial_ledger(id),
  erro            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists payouts_vendedor_idx on public.payouts(vendedor_id, created_at desc);
create index if not exists payouts_status_idx on public.payouts(status);

-- ─── Idempotência do ledger: 1 entrada por (pedido, tipo) ──────────────────
-- Impede o webmook creditar 2x o mesmo pedido se o evento chegar repetido.
create unique index if not exists financial_ledger_pedido_tipo_uidx
  on public.financial_ledger(pedido_id, tipo)
  where pedido_id is not null;

-- ─── Reconciliação: recomputa a carteira a partir do ledger (fonte de verdade)
-- Nunca confiar só no número da wallet: isto recalcula e devolve o correto.
create or replace function public.reconciliar_carteira(p_vendedor uuid)
returns public.wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a_liberar  numeric;
  v_disponivel numeric;
  v_sacado     numeric;
  v_row        public.wallets;
begin
  -- Retido: repasse do vendedor ainda não liberado (aguardando entrega ou D+7)
  select coalesce(sum(valor), 0) into v_a_liberar
  from public.financial_ledger
  where vendedor_id = p_vendedor
    and tipo = 'repasse_vendedor'
    and status in ('pendente', 'em_espera');

  -- Liberado: repasse já disponível (D+7 passou)
  select coalesce(sum(valor), 0) into v_disponivel
  from public.financial_ledger
  where vendedor_id = p_vendedor
    and tipo = 'repasse_vendedor'
    and status = 'disponivel';

  -- Saques concluídos ou em andamento reduzem o disponível
  select coalesce(sum(valor), 0) into v_sacado
  from public.payouts
  where vendedor_id = p_vendedor
    and status in ('solicitado', 'processando', 'pago');

  insert into public.wallets (vendedor_id, saldo_a_liberar, saldo_disponivel, total_sacado, updated_at)
  values (p_vendedor, v_a_liberar, greatest(0, v_disponivel - v_sacado),
          (select coalesce(sum(valor),0) from public.payouts where vendedor_id = p_vendedor and status = 'pago'),
          now())
  on conflict (vendedor_id) do update
    set saldo_a_liberar  = excluded.saldo_a_liberar,
        saldo_disponivel = excluded.saldo_disponivel,
        total_sacado     = excluded.total_sacado,
        updated_at       = now()
  returning * into v_row;

  return v_row;
end;
$$;

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table public.wallets enable row level security;
alter table public.payouts enable row level security;

-- Vendedor lê a PRÓPRIA carteira e os PRÓPRIOS saques; sysadmin lê tudo.
-- Escrita é só via service role (edge functions) — nenhuma policy de insert/update
-- pública, então o cliente nunca mexe em saldo direto.
drop policy if exists wallets_leitura on public.wallets;
create policy wallets_leitura on public.wallets for select
  using (
    vendedor_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sysadmin')
  );

drop policy if exists payouts_leitura on public.payouts;
create policy payouts_leitura on public.payouts for select
  using (
    vendedor_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sysadmin')
  );

comment on table public.wallets is 'Carteira do vendedor (cache reconciliável via reconciliar_carteira). saldo_a_liberar=retido, saldo_disponivel=sacável.';
comment on table public.payouts is 'Saques via Pix. Todo saque tem 1 ledger_entry tipo=saque correspondente.';
comment on column public.profiles.comissao_percent is 'Comissão da plataforma por vendedor (%). Null = usa payment_settings.platform_fee_percent.';
