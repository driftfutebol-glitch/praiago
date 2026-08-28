-- ============================================================================
-- SPLIT NO GATEWAY + TROCA DE CONTA BANCARIA COM APROVACAO DO ADMIN
-- ============================================================================
-- Mudanca de arquitetura: a parte do vendedor passa a ir DIRETO pro saldo dele
-- no gateway (split), em vez de cair na conta da PraiaGo e ser repassada
-- depois. A plataforma deixa de custodiar dinheiro de terceiro — o que poderia
-- enquadra-la como instituicao de pagamento perante o Banco Central.
--
-- O saque automatico do gateway fica DESLIGADO: quem decide a hora de mandar
-- pro banco continua sendo a nossa regra (entrega confirmada + D+N). O dinheiro
-- so fica parado no saldo do PROPRIO vendedor enquanto espera.
-- ============================================================================

-- ─── Recebedor da plataforma (destino da comissao no split) ─────────────────
alter table public.payment_settings
  add column if not exists platform_recipient_id text;

comment on column public.payment_settings.platform_recipient_id is
  'Recebedor da PraiaGo no gateway. E o destino da comissao na regra de split — sem ele o split nao pode ser montado.';

-- ─── Dados bancarios do vendedor (espelho, so pra exibir) ──────────────────
-- O numero da conta NAO fica aqui: quem guarda e o gateway. Aqui fica so o
-- suficiente pra o vendedor reconhecer a conta ("Nubank ...123-4") e pro admin
-- conferir uma troca. Guardar conta completa seria dado sensivel sem ganho.
alter table public.seller_recipients
  add column if not exists banco_codigo text,
  add column if not exists banco_nome text,
  add column if not exists conta_mascarada text,
  add column if not exists titular_nome text,
  add column if not exists titular_documento_final text;

-- ─── Pedido de troca de conta bancaria ──────────────────────────────────────
-- Trocar a conta que recebe o dinheiro e o golpe classico de marketplace: se
-- a conta do vendedor for invadida, o atacante so precisa apontar o recebimento
-- pra conta dele. Por isso a troca NUNCA e automatica — passa por analise.
create table if not exists public.bank_account_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  vendedor_id        uuid not null references public.profiles(id) on delete cascade,
  status             text not null default 'pendente'
                       check (status in ('pendente','em_analise','aprovado','recusado','cancelado')),
  -- Conta que ele quer passar a usar (mascarada; a completa so vai pro gateway
  -- depois da aprovacao, enviada de novo pelo vendedor).
  banco_codigo       text not null,
  banco_nome         text,
  agencia            text not null,
  conta_mascarada    text not null,
  titular_nome       text not null,
  titular_documento  text not null,          -- so digitos; precisa bater com o do cadastro
  motivo             text,                   -- o que o vendedor alegou
  -- Analise
  analisado_por      uuid references public.profiles(id) on delete set null,
  analisado_em       timestamptz,
  parecer            text,                   -- por que aprovou/recusou
  -- Janela de liberacao: aprovado nao e "trocado", e "pode trocar ate X".
  liberado_ate       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists bank_change_vendedor_idx
  on public.bank_account_change_requests(vendedor_id, created_at desc);
create index if not exists bank_change_pendentes_idx
  on public.bank_account_change_requests(created_at)
  where status in ('pendente','em_analise');

-- Um pedido em aberto por vendedor: evita fila de pedidos repetidos e o
-- vendedor tentando "cansar" o admin ate alguem aprovar sem olhar.
create unique index if not exists bank_change_um_aberto_por_vendedor
  on public.bank_account_change_requests(vendedor_id)
  where status in ('pendente','em_analise');

alter table public.bank_account_change_requests enable row level security;

-- Vendedor ve e cria os PROPRIOS pedidos; admin ve todos.
drop policy if exists bank_change_select on public.bank_account_change_requests;
create policy bank_change_select on public.bank_account_change_requests for select
  using (
    vendedor_id = (select auth.uid())
    or exists (select 1 from public.profiles p
                where p.id = (select auth.uid()) and p.role = 'sysadmin')
  );

drop policy if exists bank_change_insert on public.bank_account_change_requests;
create policy bank_change_insert on public.bank_account_change_requests for insert
  with check (
    vendedor_id = (select auth.uid())
    and status = 'pendente'
    -- Campos de analise sao do admin: o vendedor nao pode ja nascer aprovado.
    and analisado_por is null and analisado_em is null and liberado_ate is null
  );

-- Vendedor so pode CANCELAR o proprio pedido. Aprovar/recusar e do admin, e
-- passa pela funcao abaixo (nao por UPDATE direto).
drop policy if exists bank_change_update_cancelar on public.bank_account_change_requests;
create policy bank_change_update_cancelar on public.bank_account_change_requests for update
  using (vendedor_id = (select auth.uid()) and status in ('pendente','em_analise'))
  with check (vendedor_id = (select auth.uid()) and status = 'cancelado');

grant select, insert, update on table public.bank_account_change_requests to authenticated;

-- ─── Analise do pedido (so sysadmin) ────────────────────────────────────────
-- Aprovar NAO troca a conta: abre uma janela em que o vendedor pode reenviar os
-- dados. A conta completa nunca passa por aqui — vai direto do app pro gateway.
create or replace function public.analisar_troca_conta(
  p_pedido   uuid,
  p_decisao  text,               -- 'aprovado' | 'recusado' | 'em_analise'
  p_parecer  text default null,
  p_horas    integer default 48  -- validade da janela de troca
)
returns public.bank_account_change_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.bank_account_change_requests;
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = auth.uid() and p.role = 'sysadmin'
  ) then
    raise exception 'sem permissao';
  end if;

  if p_decisao not in ('aprovado','recusado','em_analise') then
    raise exception 'decisao invalida';
  end if;

  update public.bank_account_change_requests
     set status        = p_decisao,
         parecer       = coalesce(p_parecer, parecer),
         analisado_por = auth.uid(),
         analisado_em  = now(),
         liberado_ate  = case
                           when p_decisao = 'aprovado'
                           then now() + make_interval(hours => greatest(1, coalesce(p_horas, 48)))
                           else null
                         end,
         updated_at    = now()
   where id = p_pedido
     and status in ('pendente','em_analise')
  returning * into v_row;

  if v_row.id is null then
    raise exception 'pedido nao encontrado ou ja analisado';
  end if;

  return v_row;
end;
$$;

revoke all on function public.analisar_troca_conta(uuid, text, text, integer) from public, anon;
grant execute on function public.analisar_troca_conta(uuid, text, text, integer) to authenticated;

-- ─── O vendedor pode trocar a conta agora? ──────────────────────────────────
-- Fonte unica da regra: a edge function pergunta aqui antes de mexer no
-- gateway. Sem isso, cada tela reimplementaria a checagem do seu jeito.
create or replace function public.pode_trocar_conta(p_vendedor uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Primeiro cadastro nao precisa de aprovacao: nao ha conta pra desviar.
    not exists (
      select 1 from public.seller_recipients sr
       where sr.vendedor_id = p_vendedor and sr.recipient_id is not null
    )
    or exists (
      select 1 from public.bank_account_change_requests r
       where r.vendedor_id = p_vendedor
         and r.status = 'aprovado'
         and r.liberado_ate is not null
         and r.liberado_ate > now()
    );
$$;

revoke all on function public.pode_trocar_conta(uuid) from public, anon;
grant execute on function public.pode_trocar_conta(uuid) to authenticated, service_role;

comment on table public.bank_account_change_requests is
  'Pedido de troca da conta que recebe o dinheiro. Nunca automatico: conta invadida + troca livre = dinheiro do vendedor desviado. Aprovar abre uma janela (liberado_ate), nao troca a conta.';
