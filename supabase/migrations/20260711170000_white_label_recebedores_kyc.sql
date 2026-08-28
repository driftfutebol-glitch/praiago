-- ============================================================================
-- WHITE-LABEL MARKETPLACE — recebedores/subcontas + KYC + espelho contábil
-- ============================================================================
-- Spec: provedor (Asaas/Pagar.me/Iugu) custodia o dinheiro; a Praia Go só
-- ESPELHA a contabilidade. Vendedor não sai do app; recebedor criado por API.
-- NADA de pagamento real aqui — só o modelo de dados + config.
-- ============================================================================

-- ── Cadastro financeiro / KYC do vendedor (dados p/ criar o recebedor) ──────
-- razao_social, telefone_comercial e endereco já existem em profiles.
alter table public.profiles add column if not exists documento text;         -- CPF ou CNPJ (só dígitos)
alter table public.profiles add column if not exists documento_tipo text;    -- 'CPF' | 'CNPJ'
alter table public.profiles add column if not exists data_nascimento date;   -- exigido p/ CPF no KYC

-- ── Recebedor/subconta do vendedor no provedor (criado por API) ─────────────
create table if not exists public.seller_recipients (
  vendedor_id           uuid primary key references public.profiles(id) on delete cascade,
  provider              text not null,                       -- asaas | pagarme | iugu
  recipient_id          text,                                -- id do recebedor no provedor
  status                text not null default 'pendente',    -- pendente | ativo | bloqueado | recusado
  kyc_status            text not null default 'pendente',    -- pendente | em_analise | aprovado | reprovado
  kyc_motivo            text,
  settlement_delay_days integer,                             -- sobrepõe o default (null = usa settlement_config)
  kyc_enviado_em        timestamptz,
  aprovado_em           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ── Prazo de liquidação CONFIGURÁVEL (nunca fixar D+7 no código) ────────────
-- Depende do provedor + método de pagamento (contrato). Fallback: payment_settings.repasse_dias.
create table if not exists public.settlement_config (
  provider    text not null,                 -- asaas | pagarme | iugu
  metodo      text not null,                 -- pix | credito | debito
  delay_days  integer not null,              -- D+N
  updated_at  timestamptz not null default now(),
  primary key (provider, metodo)
);

-- ── Webhooks: log idempotente + auditoria (assinatura validada na função) ───
create table if not exists public.payment_webhook_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  event_type      text not null,             -- pagamento_aprovado | transferencia_realizada | chargeback | ...
  external_id     text not null,             -- id do recurso no provedor
  signature_valid boolean not null default false,
  processed       boolean not null default false,
  payload         jsonb,
  created_at      timestamptz not null default now(),
  -- IDEMPOTÊNCIA: o mesmo evento do provedor nunca é processado 2x
  unique (provider, event_type, external_id)
);
create index if not exists webhook_events_unprocessed_idx
  on public.payment_webhook_events(created_at) where processed = false;

-- ── Espelho contábil da carteira (SECURITY DEFINER: vendedor vê a própria; admin vê todas) ──
-- Read-only. Recomputa tudo do financial_ledger + payouts — nunca "número solto".
create or replace function public.carteira_espelho(p_vendedor uuid)
returns table (
  vendedor_id        uuid,
  vendas_brutas      numeric,
  comissao_praiago   numeric,
  taxa_provedor      numeric,
  valor_liquido      numeric,
  saldo_pendente     numeric,   -- retido (aguardando entrega/liquidação)
  saldo_disponivel   numeric,   -- liberado e ainda não transferido
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
    select * from public.financial_ledger where vendedor_id = p_vendedor
  ), t as (
    select
      coalesce(sum(valor) filter (where status in ('solicitado','processando','pago')), 0) as em_andamento_ou_pago,
      coalesce(sum(valor) filter (where status = 'pago'), 0) as pago
    from public.payouts where vendedor_id = p_vendedor
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

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.seller_recipients enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.settlement_config enable row level security;

drop policy if exists seller_recipients_leitura on public.seller_recipients;
create policy seller_recipients_leitura on public.seller_recipients for select
  using (vendedor_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sysadmin'));

-- webhook events e settlement_config: só sysadmin lê; escrita só service role.
drop policy if exists webhook_events_admin on public.payment_webhook_events;
create policy webhook_events_admin on public.payment_webhook_events for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sysadmin'));

drop policy if exists settlement_config_admin on public.settlement_config;
create policy settlement_config_admin on public.settlement_config for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'sysadmin'));

comment on table public.seller_recipients is 'Recebedor/subconta do vendedor no provedor de pagamento (criado por API, white-label).';
comment on table public.settlement_config is 'Prazo de liquidação (D+N) por provedor+método. Nunca fixar no código.';
comment on table public.payment_webhook_events is 'Log idempotente de webhooks (unique provider+event+external_id).';
