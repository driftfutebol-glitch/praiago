-- Caça Eventos v5: preço comprovado, pausa administrativa e auditoria de rodadas.
alter table public.eventos
  add column if not exists preco_situacao text not null default 'a_confirmar',
  add column if not exists preco_verificado_em timestamptz;

alter table public.eventos drop constraint if exists eventos_preco_situacao_check;
alter table public.eventos add constraint eventos_preco_situacao_check
  check (preco_situacao in ('a_confirmar', 'gratuito', 'pago'));

-- Nunca inferir que preço zero significa entrada gratuita. Lotes positivos
-- comprovam preço pago; os demais aguardam fonte ou revisão do admin.
update public.eventos e
set preco_situacao = case when e.preco > 0 or exists (
  select 1 from public.event_ticket_lots l
  where l.evento_id = e.id and l.preco_origem > 0
) then 'pago' else 'a_confirmar' end
where e.preco_situacao = 'a_confirmar';

alter table public.event_ticket_lots
  add column if not exists pausado_admin boolean not null default false;

-- Pausas anteriores não têm origem registrada. Preservá-las exige liberação
-- consciente pelo admin, em vez de o robô reabrir um ingresso por suposição.
update public.event_ticket_lots
set pausado_admin = true
where status = 'pausado' and pausado_admin = false;

create table if not exists public.event_crawler_runs (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  origem text not null check (origem in ('admin', 'cron')),
  status text not null check (status in ('rodando', 'concluido', 'falhou')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  stats jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb
);

create index if not exists event_crawler_runs_started_idx
  on public.event_crawler_runs (started_at desc);

alter table public.event_crawler_runs enable row level security;
drop policy if exists "event_crawler_runs_admin_select" on public.event_crawler_runs;
create policy "event_crawler_runs_admin_select"
on public.event_crawler_runs for select to authenticated
using (private.is_admin());

grant select on public.event_crawler_runs to authenticated;
grant all on public.event_crawler_runs to service_role;

notify pgrst, 'reload schema';
