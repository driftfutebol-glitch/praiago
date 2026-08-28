-- Pedidos que ficam presos em "verificando pagamento".
--
-- Quando o cliente abre o checkout online e nao conclui o PIX ou o cartao, o
-- pedido nasce em `aguardando_pagamento` e fica la para sempre. Ele nao
-- aparece no painel do vendedor (a consulta exclui esse status, de proposito),
-- mas continua ocupando a tabela e poluindo o historico do cliente.
--
-- Regra: apos 7 dias sem pagamento, o pedido sai de `pedidos` e vai para um
-- arquivo separado. Nada e apagado de verdade — obrigacao fiscal e disputa de
-- pagamento podem precisar do registro depois.

begin;

-- 1. O arquivo -----------------------------------------------------------
-- Tabela propria, fora do caminho quente. Nao entra em nenhuma consulta do
-- app; existe para consulta administrativa e para nao perder historico.

create table if not exists public.pedidos_expirados (
  id uuid primary key,
  cliente_id uuid,
  vendedor_id uuid,
  restaurante_id uuid,
  ambulante_id uuid,

  status_original text,
  payment_status text,
  payment_provider text,
  payment_reference text,

  total numeric,
  itens jsonb,
  zona text,

  criado_em timestamptz,
  expirado_em timestamptz not null default now(),
  motivo text not null default 'sem pagamento em 7 dias'
);

comment on table public.pedidos_expirados is
  'Arquivo de pedidos que expiraram sem pagamento. Fora do caminho quente do '
  'app: existe para consulta administrativa, obrigacao fiscal e disputa de '
  'pagamento. Nenhuma tela do cliente ou do vendedor le esta tabela.';

create index if not exists pedidos_expirados_criado_idx
  on public.pedidos_expirados (expirado_em desc);
create index if not exists pedidos_expirados_cliente_idx
  on public.pedidos_expirados (cliente_id);

alter table public.pedidos_expirados enable row level security;

-- Ninguem le pelo app. Só admin, e nunca escrita direta.
revoke all on public.pedidos_expirados from anon, authenticated;

drop policy if exists pedidos_expirados_select_admin on public.pedidos_expirados;
create policy pedidos_expirados_select_admin
  on public.pedidos_expirados
  for select to authenticated
  using (private.is_admin());

grant select on public.pedidos_expirados to authenticated;

-- 2. A rotina ------------------------------------------------------------

create or replace function private.expirar_pedidos_sem_pagamento(p_dias integer default 7)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movidos integer;
begin
  with alvos as (
    select *
      from public.pedidos
     where status = 'aguardando_pagamento'
       and coalesce(payment_status, 'pendente') not in ('aprovado', 'pago')
       and created_at < now() - make_interval(days => p_dias)
     for update skip locked
  ),
  arquivados as (
    insert into public.pedidos_expirados (
      id, cliente_id, vendedor_id, restaurante_id, ambulante_id,
      status_original, payment_status, payment_provider, payment_reference,
      total, itens, zona, criado_em
    )
    select
      a.id, a.cliente_id, a.vendedor_id, a.restaurante_id, a.ambulante_id,
      a.status, a.payment_status, a.payment_provider, a.payment_reference,
      a.total, a.itens, a.zona, a.created_at
      from alvos a
    on conflict (id) do nothing
    returning id
  )
  delete from public.pedidos p
   using arquivados x
   where p.id = x.id;

  get diagnostics v_movidos = row_count;
  return v_movidos;
end;
$$;

revoke all on function private.expirar_pedidos_sem_pagamento(integer)
  from public, anon, authenticated;

comment on function private.expirar_pedidos_sem_pagamento(integer) is
  'Move para pedidos_expirados os pedidos parados em aguardando_pagamento ha '
  'mais de N dias. Usa FOR UPDATE SKIP LOCKED para nao brigar com um webhook '
  'de pagamento que chegue no mesmo instante.';

-- 3. Limpeza retroativa --------------------------------------------------
-- Roda uma vez agora, para tirar o historico antigo que ja esta acumulado.

do $$
declare
  n integer;
begin
  n := private.expirar_pedidos_sem_pagamento(7);
  raise notice 'pedidos antigos arquivados agora: %', n;
end;
$$;

-- 4. Agendamento ---------------------------------------------------------
-- Todo dia as 04:10 UTC (01:10 em Brasilia), fora do horario de movimento.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('praiago_expirar_pedidos')
      where exists (select 1 from cron.job where jobname = 'praiago_expirar_pedidos');

    perform cron.schedule(
      'praiago_expirar_pedidos',
      '10 4 * * *',
      $cron$ select private.expirar_pedidos_sem_pagamento(7); $cron$
    );
    raise notice 'limpeza diaria agendada no pg_cron';
  else
    raise notice 'pg_cron ausente: rode a funcao manualmente ou por Edge Function';
  end if;
end;
$$;

commit;
