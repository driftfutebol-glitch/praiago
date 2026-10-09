-- Refuse historical amount drift caused by legacy settlement triggers.
begin;
CREATE OR REPLACE FUNCTION private.admin_registrar_repasse_externo(p_pedido uuid, p_valor numeric, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_order public.pedidos;
  v_ledger public.financial_ledger;
  v_payout public.payouts;
  v_vendor uuid;
  v_updated public.pedidos;
begin
  if char_length(trim(coalesce(p_motivo, ''))) not between 15 and 500 then
    raise exception 'Informe um motivo de 15 a 500 caracteres.';
  end if;
  if p_valor is null or p_valor::text in ('NaN', 'Infinity', '-Infinity') or p_valor <= 0 or p_valor <> round(p_valor, 2) then
    raise exception 'Informe o valor efetivamente repassado, com ate duas casas decimais.';
  end if;
  -- Same seller lock as solicitar_saque/account deletion. Acquire BEFORE row locks.
  select vendedor_id into v_vendor from public.pedidos where id = p_pedido;
  if v_vendor is null then raise exception 'Pedido ou vendedor nao encontrado.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_vendor::text, 17017));
  select * into strict v_order from public.pedidos where id = p_pedido for update;
  if v_order.vendedor_id is distinct from v_vendor then raise exception 'O vendedor mudou. Recarregue o pedido.'; end if;
  if private.account_deletion_forbids_subject(v_vendor) then
    raise exception 'Conta em exclusao. Encaminhe para reconciliacao financeira.' using errcode = '42501';
  end if;
  if coalesce(v_order.payment_status, '') not in ('aprovado', 'pago')
     or v_order.payment_provider is distinct from 'pagarme'
     or coalesce(v_order.status, '') not in ('novo', 'preparando', 'pronto', 'saiu_entrega', 'entregando', 'entregue')
     or coalesce(v_order.reembolso_status, 'nenhum') not in ('nenhum', 'rejeitado') then
    raise exception 'Baixa externa aceita somente pagamento online aprovado, sem cancelamento ou reembolso.';
  end if;
  select * into v_ledger from public.financial_ledger
    where pedido_id = p_pedido and tipo = 'repasse_vendedor' for update;
  if not found or v_ledger.vendedor_id is distinct from v_vendor
     or v_ledger.valor is null or v_ledger.valor <= 0
     or v_ledger.valor is distinct from v_order.vendor_amount then
    raise exception 'Repasse inconsistente. Revise os lancamentos antes da baixa.';
  end if;
  if p_valor is distinct from v_ledger.valor then
    raise exception 'Valor diferente do liquido da loja (%). Nao registrar baixa automatica: reconcilie a diferenca.', v_ledger.valor;
  end if;
  select * into v_payout from public.payouts
    where ledger_entry_id = v_ledger.id and provider = 'repasse_externo' for update;
  if found then
    if v_payout.valor <> p_valor or v_payout.status <> 'pago'
       or v_ledger.status <> 'pago' or v_order.settlement_status <> 'repasse_manual_pago' then
      raise exception 'Baixa existente divergente. Solicite reconciliacao.';
    end if;
    return jsonb_build_object('ok', true, 'idempotente', true, 'payout_id', v_payout.id, 'valor', p_valor);
  end if;
  if v_ledger.status not in ('pendente', 'em_espera', 'disponivel')
     or coalesce(v_order.settlement_status, '') in ('repasse_manual_pago', 'pago_split', 'pago') then
    raise exception 'O repasse ja foi liquidado ou nao pode receber baixa externa.';
  end if;
  if exists(select 1 from public.payouts where vendedor_id = v_vendor
     and status in ('solicitado', 'processando', 'pago') and coalesce(provider, '') <> 'repasse_externo') then
    -- Regular withdrawals may cover multiple sales without a per-order allocation.
    raise exception 'Ha saque pago ou em andamento. Concilie os saques para evitar pagamento duplicado.';
  end if;
  insert into public.payouts(vendedor_id, valor, status, provider, ledger_entry_id)
    values(v_vendor, p_valor, 'pago', 'repasse_externo', v_ledger.id) returning * into v_payout;
  update public.financial_ledger set status = 'pago', provider = 'repasse_externo',
    settled_at = now(), disponivel_em = null, external_reference = v_payout.id::text,
    descricao = 'Repasse recebido fora do aplicativo; baixa administrativa'
    where id = v_ledger.id;
  update public.pedidos set settlement_status = 'repasse_manual_pago' where id = p_pedido returning * into v_updated;
  -- Legacy finance triggers may reprice a historic sale using today's fee settings.
  -- A bookkeeping-only settlement must never change the approved sale's amounts.
  if v_updated.total is distinct from v_order.total
     or v_updated.gross_amount is distinct from v_order.gross_amount
     or v_updated.platform_fee_amount is distinct from v_order.platform_fee_amount
     or v_updated.vendor_amount is distinct from v_order.vendor_amount
     or v_updated.payment_provider is distinct from v_order.payment_provider
     or v_updated.payment_status is distinct from v_order.payment_status then
    raise exception 'Regra financeira alteraria os valores historicos. Concilie o pedido antes da baixa.';
  end if;
  -- Commission is NOT marked received: an external seller repasse does not prove fee collection.
  perform public.reconciliar_carteira(v_vendor);
  perform private.admin_exception_audit('registrar_repasse_externo', p_pedido, trim(p_motivo),
    jsonb_build_object('vendedor_id', v_vendor, 'payout_id', v_payout.id, 'ledger_id', v_ledger.id,
      'valor', p_valor, 'saldo_anterior', v_ledger.status, 'transferencia_gateway', false));
  return jsonb_build_object('ok', true, 'idempotente', false, 'payout_id', v_payout.id, 'valor', p_valor);
end;
$function$;
commit;
