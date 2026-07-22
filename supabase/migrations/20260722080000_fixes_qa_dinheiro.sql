-- Fixes da auditoria QA (agentes) — integridade de dinheiro no servidor:
--  #1 desconto: sem cupom => 0; com cupom => clampa ao subtotal (cupom valida o valor)
--  #7 platform_fee/vendor: nao aceita do app; zera pra o set_order_finance_fields recalcular
--  #8 saque: advisory lock por vendedor (evita saque duplicado em corrida)

create or replace function public.validar_preco_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_subtotal numeric := 0; v_item jsonb; v_preco numeric; v_promo numeric; v_qtd int; v_desc numeric;
begin
  if new.cliente_id is null then return new; end if;
  if new.itens_detalhe is null or jsonb_typeof(new.itens_detalhe) <> 'array' or jsonb_array_length(new.itens_detalhe) = 0 then
    raise exception 'Pedido sem itens com identificador de produto. Atualize o aplicativo.' using errcode = '23514';
  end if;
  for v_item in select * from jsonb_array_elements(new.itens_detalhe) loop
    v_qtd := greatest(coalesce((v_item->>'qtd')::int, 0), 0);
    if v_qtd <= 0 then continue; end if;
    select preco into v_preco from public.produtos
      where id = (v_item->>'produto_id')::uuid and vendedor_id = new.vendedor_id and ativo is true;
    if v_preco is null then raise exception 'Produto invalido, inativo ou de outra loja no pedido.' using errcode = '23514'; end if;
    select min(case desconto_tipo
        when 'preco_promocional' then preco_promocional
        when 'percentual' then v_preco * (1 - least(greatest(coalesce(desconto_valor,0),0),95)/100)
        else greatest(0, v_preco - coalesce(desconto_valor,0)) end)
    into v_promo from public.promocoes
    where produto_id = (v_item->>'produto_id')::uuid and ativo is true and publico is true
      and data_inicio <= now() and (data_fim is null or data_fim >= now());
    v_preco := least(v_preco, coalesce(v_promo, v_preco));
    v_subtotal := v_subtotal + v_preco * v_qtd;
  end loop;
  v_subtotal := round(v_subtotal::numeric, 2);
  if v_subtotal <= 0 then raise exception 'Pedido sem valor valido.' using errcode = '23514'; end if;
  if nullif(trim(coalesce(new.discount_code, '')), '') is null then v_desc := 0;
  else v_desc := least(greatest(coalesce(new.discount_amount, 0), 0), v_subtotal); end if;
  new.discount_amount := v_desc;
  new.subtotal_amount := v_subtotal;
  new.total := greatest(0, round((v_subtotal - v_desc)::numeric, 2));
  new.gross_amount := new.total;
  new.platform_fee_amount := null;  -- recalculado pelo servidor
  new.vendor_amount := null;        -- recalculado pelo servidor
  return new;
end; $$;

create or replace function public.solicitar_saque(p_vendedor uuid, p_valor numeric)
returns public.payouts language plpgsql security definer set search_path = public as $$
declare
  v_liberado numeric; v_ja_sacado numeric; v_disponivel numeric;
  v_chave text; v_provider text; v_payout public.payouts; v_ledger_id uuid;
begin
  if p_valor is null or p_valor <= 0 then raise exception 'Valor inválido.'; end if;
  perform pg_advisory_xact_lock(hashtext('saque:'||p_vendedor::text));
  select coalesce(sum(valor),0) into v_liberado from public.financial_ledger
    where vendedor_id = p_vendedor and tipo = 'repasse_vendedor' and status = 'disponivel';
  select coalesce(sum(valor),0) into v_ja_sacado from public.payouts
    where vendedor_id = p_vendedor and status in ('solicitado','processando','pago');
  v_disponivel := v_liberado - v_ja_sacado;
  if p_valor > v_disponivel then raise exception 'Saldo disponível insuficiente (disponível: %).', v_disponivel; end if;
  select pix_key into v_chave from public.vendor_payment_accounts where vendedor_id = p_vendedor;
  if v_chave is null or v_chave = '' then raise exception 'Cadastre uma chave Pix antes de sacar.'; end if;
  select provider into v_provider from public.seller_recipients where vendedor_id = p_vendedor;
  insert into public.payouts (vendedor_id, valor, chave_pix, status, provider)
    values (p_vendedor, p_valor, v_chave, 'solicitado', coalesce(v_provider, 'pendente_config')) returning * into v_payout;
  insert into public.financial_ledger (vendedor_id, tipo, valor, status, descricao, provider)
    values (p_vendedor, 'saque', p_valor, 'solicitado', 'Saque solicitado pelo vendedor', coalesce(v_provider,'pendente_config')) returning id into v_ledger_id;
  update public.payouts set ledger_entry_id = v_ledger_id where id = v_payout.id;
  perform public.reconciliar_carteira(p_vendedor);
  return v_payout;
end; $$;
revoke all on function public.solicitar_saque(uuid, numeric) from public, anon, authenticated;
