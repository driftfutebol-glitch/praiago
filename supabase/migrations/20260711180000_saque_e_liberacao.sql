-- ============================================================================
-- Saque (payout) atômico + liberação D+N (settlement) — provider-agnostic
-- ============================================================================

-- Solicitar saque: valida saldo disponível e registra payout + ledger, atômico.
-- Não move dinheiro real — só registra a intenção. O provedor (Asaas) é chamado
-- pela edge function 'solicitar-saque' DEPOIS, e o webhook confirma.
create or replace function public.solicitar_saque(p_vendedor uuid, p_valor numeric)
returns public.payouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liberado   numeric;
  v_ja_sacado  numeric;
  v_disponivel numeric;
  v_chave      text;
  v_provider   text;
  v_payout     public.payouts;
  v_ledger_id  uuid;
begin
  if p_valor is null or p_valor <= 0 then raise exception 'Valor inválido.'; end if;

  select coalesce(sum(valor),0) into v_liberado
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'repasse_vendedor' and status = 'disponivel';

  select coalesce(sum(valor),0) into v_ja_sacado
  from public.payouts
  where vendedor_id = p_vendedor and status in ('solicitado','processando','pago');

  v_disponivel := v_liberado - v_ja_sacado;
  if p_valor > v_disponivel then
    raise exception 'Saldo disponível insuficiente (disponível: %).', v_disponivel;
  end if;

  select pix_key into v_chave from public.vendor_payment_accounts where vendedor_id = p_vendedor;
  if v_chave is null or v_chave = '' then raise exception 'Cadastre uma chave Pix antes de sacar.'; end if;

  select provider into v_provider from public.seller_recipients where vendedor_id = p_vendedor;

  insert into public.payouts (vendedor_id, valor, chave_pix, status, provider)
  values (p_vendedor, p_valor, v_chave, 'solicitado', coalesce(v_provider, 'pendente_config'))
  returning * into v_payout;

  insert into public.financial_ledger (vendedor_id, tipo, valor, status, descricao, provider)
  values (p_vendedor, 'saque', p_valor, 'solicitado', 'Saque solicitado pelo vendedor', coalesce(v_provider,'pendente_config'))
  returning id into v_ledger_id;

  update public.payouts set ledger_entry_id = v_ledger_id where id = v_payout.id;

  perform public.reconciliar_carteira(p_vendedor);
  return v_payout;
end;
$$;

-- Liberação D+N: repasses em_espera cujo disponivel_em já passou viram 'disponivel'.
-- Job diário (cron). Reconciliação da carteira em seguida.
create or replace function public.liberar_repasses()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_liberados integer;
begin
  with atualizados as (
    update public.financial_ledger
    set status = 'disponivel', settled_at = now()
    where tipo = 'repasse_vendedor' and status = 'em_espera'
      and disponivel_em is not null and disponivel_em <= now()
    returning vendedor_id
  )
  select count(*) into v_liberados from atualizados;

  -- reconcilia as carteiras afetadas
  perform public.reconciliar_carteira(vendedor_id)
  from (select distinct vendedor_id from public.financial_ledger
        where tipo='repasse_vendedor' and status='disponivel' and vendedor_id is not null) t
  where exists (select 1 from public.profiles p where p.id = t.vendedor_id);

  return v_liberados;
end;
$$;

-- Agenda o job diário às 09:00 (se o pg_cron estiver disponível). Sem quebrar a migration.
do $$
begin
  perform cron.schedule('liberar-repasses-diario', '0 9 * * *', 'select public.liberar_repasses();');
exception when others then
  raise notice 'pg_cron indisponível — agendar liberar_repasses() manualmente. %', sqlerrm;
end;
$$;
