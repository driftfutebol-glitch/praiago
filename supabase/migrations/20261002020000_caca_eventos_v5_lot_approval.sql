-- A aprovação do grupo precisa sobreviver ao esgotamento do lote vigente.
-- Sem esta marca, o segundo lote descoberto depois do primeiro esgotar
-- voltava a ficar pendente apesar de o admin já ter liberado a venda.
alter table public.event_ticket_lots
  add column if not exists aprovado_admin boolean not null default false;

-- Preserva o estado já publicado e as filas automáticas autorizadas. Pausas
-- manuais não se tornam disponíveis por causa desta migração.
update public.event_ticket_lots
set aprovado_admin = true
where aprovado_admin = false
  and (status = 'disponivel' or (status = 'pausado' and pausado_admin = false));

create index if not exists event_ticket_lots_approved_group_idx
  on public.event_ticket_lots (evento_id, lote_grupo)
  where aprovado_admin = true;

notify pgrst, 'reload schema';
