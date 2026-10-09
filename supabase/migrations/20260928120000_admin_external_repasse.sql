-- Accounting-only exceptions. These routines NEVER call a payment gateway.
-- Apply this migration alone after schema inspection; do not push historical migrations.
begin;

create unique index if not exists payouts_external_repasse_once
  on public.payouts (ledger_entry_id)
  where provider = 'repasse_externo';

create or replace function private.admin_exception_audit(p_action text, p_target uuid, p_reason text, p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.security_audit_logs(event_type, severity, platform, user_id, actor_id, route, metadata)
  values ('admin_action', 'warning', 'admin', auth.uid(), auth.uid(), '/admin/excecoes',
    jsonb_build_object('acao', p_action, 'alvo_id', p_target, 'motivo', p_reason,
      'origem', case when auth.uid() is null then 'manutencao_sql_autorizada' else 'painel_admin' end) || p_details);
end;
$$;

create or replace function private.admin_registrar_repasse_externo(p_pedido uuid, p_valor numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.pedidos;
  v_ledger public.financial_ledger;
  v_payout public.payouts;
  v_vendor uuid;
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
  update public.pedidos set settlement_status = 'repasse_manual_pago' where id = p_pedido;
  -- Commission is NOT marked received: an external seller repasse does not prove fee collection.
  perform public.reconciliar_carteira(v_vendor);
  perform private.admin_exception_audit('registrar_repasse_externo', p_pedido, trim(p_motivo),
    jsonb_build_object('vendedor_id', v_vendor, 'payout_id', v_payout.id, 'ledger_id', v_ledger.id,
      'valor', p_valor, 'saldo_anterior', v_ledger.status, 'transferencia_gateway', false));
  return jsonb_build_object('ok', true, 'idempotente', false, 'payout_id', v_payout.id, 'valor', p_valor);
end;
$$;

create or replace function public.admin_registrar_repasse_externo(p_pedido uuid, p_valor numeric, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(private.has_permission('financeiro'), false)
     or not coalesce(public.account_can_write(auth.uid()), false) then
    raise exception 'Sem permissao financeira.' using errcode = '42501';
  end if;
  return private.admin_registrar_repasse_externo(p_pedido, p_valor, p_motivo);
end;
$$;

create or replace function private.admin_concluir_entrega_externa(p_pedido uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.pedidos;
  v_vendor uuid;
begin
  if char_length(trim(coalesce(p_motivo, ''))) not between 15 and 500 then
    raise exception 'Informe o motivo da excecao, de 15 a 500 caracteres.';
  end if;
  select vendedor_id into v_vendor from public.pedidos where id = p_pedido;
  if v_vendor is null then raise exception 'Pedido ou vendedor nao encontrado.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_vendor::text, 17017));
  select * into strict v_order from public.pedidos where id = p_pedido for update;
  if v_order.vendedor_id is distinct from v_vendor then raise exception 'O vendedor mudou. Recarregue o pedido.'; end if;
  if private.account_deletion_forbids_subject(v_vendor) then raise exception 'Conta em exclusao.'; end if;
  if coalesce(v_order.payment_status, '') not in ('aprovado', 'pago')
     or coalesce(v_order.reembolso_status, 'nenhum') not in ('nenhum', 'rejeitado')
     or v_order.settlement_status is distinct from 'repasse_manual_pago'
     or not exists(select 1 from public.payouts po join public.financial_ledger fl on fl.id = po.ledger_entry_id
       where fl.pedido_id = p_pedido and fl.tipo = 'repasse_vendedor' and fl.status = 'pago'
         and fl.provider = 'repasse_externo' and fl.vendedor_id = v_vendor
         and po.vendedor_id = v_vendor and po.provider = 'repasse_externo' and po.status = 'pago' and po.valor = fl.valor) then
    raise exception 'Registre e confira primeiro o repasse externo recebido pela loja.';
  end if;
  if v_order.status = 'entregue' and v_order.entrega_confirmada is true then
    return jsonb_build_object('ok', true, 'idempotente', true, 'pedido_id', p_pedido);
  end if;
  if v_order.status is null or v_order.status not in ('entregando', 'saiu_entrega') then
    raise exception 'A excecao so pode concluir um pedido que esta em entrega.';
  end if;
  perform set_config('praiago.delivery_confirmed', 'true', true);
  update public.pedidos set status = 'entregue', entrega_confirmada = true,
    entrega_confirmada_em = now(), entrega_confirmada_por = auth.uid()
    where id = p_pedido;
  -- Do NOT validate/read the customer's secret or re-release a previously paid ledger.
  perform private.admin_exception_audit('concluir_entrega_externa', p_pedido, trim(p_motivo),
    jsonb_build_object('status_anterior', v_order.status, 'sem_codigo', true, 'confirmacao', 'administrativa',
      'settlement_preservado', v_order.settlement_status, 'transferencia_gateway', false));
  return jsonb_build_object('ok', true, 'idempotente', false, 'pedido_id', p_pedido);
end;
$$;

create or replace function public.admin_concluir_entrega_externa(p_pedido uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(private.has_permission('pedidos'), false)
     or not coalesce(public.account_can_write(auth.uid()), false) then
    raise exception 'Sem permissao para concluir pedidos.' using errcode = '42501';
  end if;
  return private.admin_concluir_entrega_externa(p_pedido, p_motivo);
end;
$$;

create or replace function private.admin_encerrar_aviso_kyc(p_ticket uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ticket public.tickets;
begin
  if char_length(trim(coalesce(p_motivo, ''))) not between 15 and 500 then
    raise exception 'Informe o motivo do encerramento, de 15 a 500 caracteres.';
  end if;
  select * into v_ticket from public.tickets where id = p_ticket for update;
  if not found or v_ticket.origem is distinct from 'kyc' then raise exception 'Aviso KYC nao encontrado.'; end if;
  if v_ticket.status = 'fechado' then return jsonb_build_object('ok', true, 'idempotente', true); end if;
  if v_ticket.status not in ('aberto', 'em_andamento', 'resolvido') or v_ticket.status is null then
    raise exception 'Status do chamado nao permite encerramento.';
  end if;
  update public.tickets set status = 'fechado', nao_lida_admin = false, nao_lida_usuario = false,
    updated_at = now() where id = p_ticket;
  perform private.admin_exception_audit('encerrar_aviso_kyc', p_ticket, trim(p_motivo),
    jsonb_build_object('status_anterior', v_ticket.status, 'kyc_aprovado_manualmente', false));
  return jsonb_build_object('ok', true, 'idempotente', false);
end;
$$;

create or replace function public.admin_encerrar_aviso_kyc(p_ticket uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not coalesce(private.has_permission('atendimento'), false)
     or not coalesce(public.account_can_write(auth.uid()), false) then
    raise exception 'Sem permissao de atendimento.' using errcode = '42501';
  end if;
  return private.admin_encerrar_aviso_kyc(p_ticket, p_motivo);
end;
$$;

create or replace function private.protect_external_paid_repasse()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.tipo = 'repasse_vendedor' and old.status = 'pago' and old.provider = 'repasse_externo'
     and (new.status is distinct from old.status or new.valor is distinct from old.valor
       or new.provider is distinct from old.provider or new.pedido_id is distinct from old.pedido_id
       or new.vendedor_id is distinct from old.vendedor_id) then
    -- Allow account-deletion anonymization only; never allow restoring a paid balance.
    if new.vendedor_id is null and new.status = old.status and new.valor = old.valor
       and new.provider = old.provider and new.pedido_id is not distinct from old.pedido_id then
      return new;
    end if;
    raise exception 'Repasse externo ja recebido. Nao e permitido liberar esse saldo novamente.';
  end if;
  return new;
end;
$$;
create trigger trg_protect_external_paid_repasse before update on public.financial_ledger
  for each row execute function private.protect_external_paid_repasse();

create or replace function private.protect_external_paid_payout()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.provider = 'repasse_externo' and old.status = 'pago'
     and (new.status is distinct from old.status or new.valor is distinct from old.valor
       or new.provider is distinct from old.provider or new.ledger_entry_id is distinct from old.ledger_entry_id
       or (new.vendedor_id is distinct from old.vendedor_id and new.vendedor_id is not null)) then
    raise exception 'Baixa externa paga nao pode voltar a ser um saque pendente.';
  end if;
  return new;
end;
$$;
create trigger trg_protect_external_paid_payout before update on public.payouts
  for each row execute function private.protect_external_paid_payout();

-- External payouts are history, not a second reservation against future available sales.
CREATE OR REPLACE FUNCTION public.carteira_espelho(p_vendedor uuid)
 RETURNS TABLE(vendedor_id uuid, vendas_brutas numeric, comissao_praiago numeric, taxa_provedor numeric, valor_liquido numeric, saldo_pendente numeric, saldo_disponivel numeric, transferido numeric, estornos numeric, chargebacks numeric, proxima_liquidacao timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      coalesce(sum(po.valor) filter (where po.status in ('solicitado','processando','pago') and coalesce(po.provider, '') <> 'repasse_externo'), 0) as em_andamento_ou_pago,
      coalesce(sum(po.valor) filter (where po.status = 'pago'), 0) as pago
    from public.payouts po where po.vendedor_id = p_vendedor
  )
  select
    p_vendedor,
    coalesce(sum(l.valor) filter (where l.tipo in ('repasse_vendedor','taxa_plataforma','taxa_provedor') and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'taxa_plataforma' and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'taxa_provedor' and l.status <> 'cancelado'), 0),
    -- liquido do vendedor ja descontando a taxa de antecipacao
    coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status <> 'cancelado'), 0)
      - coalesce(sum(l.valor) filter (where l.tipo = 'taxa_antecipacao' and l.status <> 'cancelado'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status in ('pendente','em_espera')), 0),
    greatest(0,
      coalesce(sum(l.valor) filter (where l.tipo = 'repasse_vendedor' and l.status = 'disponivel'), 0)
      - coalesce(sum(l.valor) filter (where l.tipo = 'taxa_antecipacao' and l.status <> 'cancelado'), 0)
      - (select em_andamento_ou_pago from t)),
    (select pago from t),
    coalesce(sum(l.valor) filter (where l.tipo = 'estorno'), 0),
    coalesce(sum(l.valor) filter (where l.tipo = 'chargeback'), 0),
    min(l.disponivel_em) filter (where l.tipo = 'repasse_vendedor' and l.status = 'em_espera')
  from l;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reconciliar_carteira(p_vendedor uuid)
 RETURNS wallets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a_liberar  numeric;
  v_disponivel numeric;
  v_taxas      numeric;
  v_sacado     numeric;
  v_row        public.wallets;
begin
  select coalesce(sum(valor), 0) into v_a_liberar
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'repasse_vendedor'
    and status in ('pendente', 'em_espera');

  select coalesce(sum(valor), 0) into v_disponivel
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'repasse_vendedor'
    and status = 'disponivel';

  -- Taxas cobradas do vendedor reduzem o que ele pode sacar.
  select coalesce(sum(valor), 0) into v_taxas
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'taxa_antecipacao'
    and status <> 'cancelado';

  select coalesce(sum(valor), 0) into v_sacado
  from public.payouts
  where vendedor_id = p_vendedor and status in ('solicitado','processando','pago')
    and coalesce(provider, '') <> 'repasse_externo';

  insert into public.wallets (vendedor_id, saldo_a_liberar, saldo_disponivel, total_sacado, updated_at)
  values (p_vendedor, v_a_liberar, greatest(0, v_disponivel - v_taxas - v_sacado),
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
$function$;


revoke all on function private.admin_exception_audit(text, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.admin_registrar_repasse_externo(uuid, numeric, text) from public, anon, authenticated, service_role;
revoke all on function private.admin_concluir_entrega_externa(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.admin_encerrar_aviso_kyc(uuid, text) from public, anon, authenticated, service_role;
revoke all on function private.protect_external_paid_repasse() from public, anon, authenticated, service_role;
revoke all on function private.protect_external_paid_payout() from public, anon, authenticated, service_role;
revoke all on function public.admin_registrar_repasse_externo(uuid, numeric, text) from public, anon;
revoke all on function public.admin_concluir_entrega_externa(uuid, text) from public, anon;
revoke all on function public.admin_encerrar_aviso_kyc(uuid, text) from public, anon;
grant execute on function public.admin_registrar_repasse_externo(uuid, numeric, text) to authenticated;
grant execute on function public.admin_concluir_entrega_externa(uuid, text) to authenticated;
grant execute on function public.admin_encerrar_aviso_kyc(uuid, text) to authenticated;
CREATE OR REPLACE FUNCTION private.account_deletion_unchecked_solicitar_saque(p_vendedor uuid, p_valor numeric)
 RETURNS payouts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_liberado    numeric;
  v_taxas       numeric;
  v_ja_sacado   numeric;
  v_disponivel  numeric;
  v_recebedor   text;
  v_provider    text;
  v_payout      public.payouts;
  v_ledger_id   uuid;
begin
  if p_valor is null or p_valor <= 0 then raise exception 'Valor invalido.'; end if;

  -- Normaliza pra centavos antes de qualquer conferencia.
  p_valor := round(p_valor, 2);
  if p_valor <= 0 then raise exception 'Valor invalido.'; end if;

  -- Trava por vendedor: segura a segunda chamada simultanea ate a primeira
  -- terminar, entao ela releia o saldo ja com o payout da primeira contado.
  perform pg_advisory_xact_lock(hashtextextended(p_vendedor::text, 0));

  select coalesce(sum(valor),0) into v_liberado
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'repasse_vendedor' and status = 'disponivel';

  -- Mesma regra do reconciliar_carteira/carteira_espelho: taxa cobrada do
  -- vendedor reduz o que ele pode sacar.
  select coalesce(sum(valor),0) into v_taxas
  from public.financial_ledger
  where vendedor_id = p_vendedor and tipo = 'taxa_antecipacao' and status <> 'cancelado';

  select coalesce(sum(valor),0) into v_ja_sacado
  from public.payouts
  where vendedor_id = p_vendedor and status in ('solicitado','processando','pago')
    and coalesce(provider, '') <> 'repasse_externo';

  v_disponivel := v_liberado - v_taxas - v_ja_sacado;
  if p_valor > v_disponivel then
    raise exception 'Saldo disponivel insuficiente (disponivel: %).', greatest(0, v_disponivel);
  end if;

  select recipient_id, provider into v_recebedor, v_provider
  from public.seller_recipients where vendedor_id = p_vendedor;

  -- Único caminho válido: conta bancária cadastrada no gateway.
  if coalesce(v_recebedor, '') = '' then
    raise exception 'Cadastre sua conta bancaria antes de sacar.';
  end if;

  insert into public.payouts (vendedor_id, valor, chave_pix, status, provider)
  values (p_vendedor, p_valor, null, 'solicitado', coalesce(v_provider, 'pendente_config'))
  returning * into v_payout;

  insert into public.financial_ledger (vendedor_id, tipo, valor, status, descricao, provider)
  values (p_vendedor, 'saque', p_valor, 'solicitado', 'Saque solicitado pelo vendedor', coalesce(v_provider,'pendente_config'))
  returning id into v_ledger_id;

  update public.payouts set ledger_entry_id = v_ledger_id where id = v_payout.id;
  -- Devolve a linha ja com o ledger preenchido (antes voltava com null, o que
  -- deixava a edge function sem saber qual lancamento cancelar num erro).
  v_payout.ledger_entry_id := v_ledger_id;

  perform public.reconciliar_carteira(p_vendedor);
  return v_payout;
end;
$function$;
notify pgrst, 'reload schema';
commit;
