-- Reforco da limpeza automatica de eventos e protecao contra lotes com preco invalido.
-- O admin passa a trabalhar somente com eventos atuais; no banco, eventos vencidos
-- sao inativados e lotes sem preco vendavel ficam pausados.

create or replace function private.run_eventos_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  amanha date := ((now() at time zone 'America/Sao_Paulo')::date + 1);
  eventos_encerrados integer := 0;
  lotes_encerrados_por_evento integer := 0;
  lotes_esgotados integer := 0;
  lotes_preco_invalido integer := 0;
  eventos_sem_ingresso integer := 0;
  eventos_destacados integer := 0;
  ids_encerrados uuid[];
begin
  update public.event_ticket_lots
  set status = 'esgotado',
      updated_at = now()
  where status in ('disponivel', 'pausado', 'pendente_aprovacao')
    and estoque_disponivel is not null
    and estoque_disponivel <= 0;
  get diagnostics lotes_esgotados = row_count;

  update public.event_ticket_lots
  set status = 'pausado',
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{price_guard}',
        jsonb_build_object(
          'motivo', 'preco_origem_ou_preco_venda_invalido',
          'limpo_em', now()
        ),
        true
      ),
      updated_at = now()
  where status in ('disponivel', 'pendente_aprovacao')
    and (preco_origem <= 0 or preco_venda <= 0);
  get diagnostics lotes_preco_invalido = row_count;

  with encerrados as (
    update public.eventos
    set status = 'inativo',
        destaque = false
    where status in ('ativo', 'pendente')
      and data is not null
      and data < hoje
    returning id
  )
  select coalesce(array_agg(id), '{}'::uuid[]), count(*)::integer
  into ids_encerrados, eventos_encerrados
  from encerrados;

  if eventos_encerrados > 0 then
    update public.event_ticket_lots
    set status = 'esgotado',
        updated_at = now()
    where evento_id = any(ids_encerrados)
      and status in ('disponivel', 'pausado', 'pendente_aprovacao');
    get diagnostics lotes_encerrados_por_evento = row_count;
  end if;

  update public.eventos e
  set ingressos_enabled = false,
      destaque = false
  where e.ingressos_enabled is true
    and exists (
      select 1
      from public.event_ticket_lots l
      where l.evento_id = e.id
    )
    and not exists (
      select 1
      from public.event_ticket_lots l
      where l.evento_id = e.id
        and l.status = 'disponivel'
    );
  get diagnostics eventos_sem_ingresso = row_count;

  update public.eventos e
  set destaque = true
  where e.status = 'ativo'
    and e.data between hoje and amanha
    and (
      not exists (
        select 1
        from public.event_ticket_lots l
        where l.evento_id = e.id
      )
      or exists (
        select 1
        from public.event_ticket_lots l
        where l.evento_id = e.id
          and l.status <> 'esgotado'
          and l.preco_venda > 0
      )
    );
  get diagnostics eventos_destacados = row_count;

  return jsonb_build_object(
    'hoje_sp', hoje,
    'amanha_sp', amanha,
    'eventos_encerrados', eventos_encerrados,
    'lotes_encerrados_por_evento', lotes_encerrados_por_evento,
    'lotes_esgotados', lotes_esgotados,
    'lotes_preco_invalido', lotes_preco_invalido,
    'eventos_sem_ingresso', eventos_sem_ingresso,
    'eventos_destacados', eventos_destacados
  );
end;
$$;

revoke all on function private.run_eventos_lifecycle() from public, anon, authenticated;
grant execute on function private.run_eventos_lifecycle() to service_role;

notify pgrst, 'reload schema';
