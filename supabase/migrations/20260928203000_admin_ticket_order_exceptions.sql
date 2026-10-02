-- Administrative accounting and support recovery only. No gateway operation.
begin;
create or replace function private.require_order_ticket(p_ticket uuid, p_order public.pedidos)
returns void language plpgsql security definer set search_path='' as $$
declare t public.tickets;
begin
  select * into t from public.tickets where id=p_ticket for update;
  if not found or coalesce(t.status,'') not in ('aberto','em_andamento')
     or t.usuario_id is null or (t.usuario_id is distinct from p_order.cliente_id and t.usuario_id is distinct from p_order.vendedor_id)
     or (t.pedido_ref is distinct from p_order.id::text and not (t.pedido_ref is null and position(p_order.id::text in t.assunto)>0)) then
    raise exception 'Chamado aberto nao corresponde ao pedido e ao solicitante.' using errcode='42501';
  end if;
  if t.pedido_ref is null then
    update public.tickets set pedido_ref=p_order.id::text where id=p_ticket;
    perform private.admin_exception_audit('vincular_chamado_pedido',p_order.id,'Vinculo confirmado pelo identificador completo e solicitante do chamado.',jsonb_build_object('ticket_id',p_ticket));
  end if;
end;
$$;

create or replace function public.admin_regenerar_codigo_por_ticket(p_ticket uuid,p_pedido uuid,p_motivo text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pedidos; secret private.pedido_codigos_entrega; code text;
begin
  if auth.uid() is null or not coalesce(private.has_permission('atendimento'),false) or not coalesce(private.has_permission('pedidos'),false)
     or not coalesce(public.account_can_write(auth.uid()),false) then raise exception 'Sem permissao de atendimento e pedidos.' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_motivo,''))) not between 15 and 500 then raise exception 'Informe motivo com 15 a 500 caracteres.'; end if;
  select * into o from public.pedidos where id=p_pedido for update;
  if not found or o.cliente_id is null or o.vendedor_id is null then raise exception 'Pedido ou participantes indisponiveis.'; end if;
  if coalesce(o.status,'') not in ('pronto','entregando','saiu_entrega') or o.entrega_confirmada is true
     or coalesce(o.payment_status,'') not in ('aprovado','pago','presencial')
     or coalesce(o.reembolso_status,'nenhum') not in ('nenhum','rejeitado') or o.refunded_at is not null then
    raise exception 'Somente pedido pago, nao finalizado, sem reembolso e pronto para entrega pode receber novo codigo.'; end if;
  if private.account_deletion_forbids_subject(o.cliente_id) or private.account_deletion_forbids_subject(o.vendedor_id) then raise exception 'Participante em exclusao.'; end if;
  perform private.require_order_ticket(p_ticket,o);
  select * into secret from private.pedido_codigos_entrega where pedido_id=p_pedido for update;
  if secret.confirmado_em is not null then raise exception 'Codigo ja confirmado. Nao regenerar.'; end if;
  -- A retry after a network failure must not invalidate a just-generated code.
  if exists(select 1 from public.security_audit_logs where actor_id=auth.uid() and metadata->>'acao'='regenerar_codigo_entrega'
      and metadata->>'alvo_id'=p_pedido::text and metadata->>'ticket_id'=p_ticket::text and created_at>now()-interval '1 minute') then
    return jsonb_build_object('ok',true,'idempotente',true,'pedido_id',p_pedido);
  end if;
  loop code:=private.generate_delivery_code(); exit when code is distinct from secret.codigo; end loop;
  insert into private.pedido_codigos_entrega(pedido_id,cliente_id,codigo,tentativas,bloqueado_ate,created_at)
    values(p_pedido,o.cliente_id,code,0,null,now())
    on conflict(pedido_id) do update set codigo=excluded.codigo,cliente_id=excluded.cliente_id,tentativas=0,bloqueado_ate=null,created_at=now();
  insert into public.ticket_mensagens(ticket_id,autor,mensagem)
    values(p_ticket,'admin','O suporte atualizou o codigo de entrega deste pedido. O cliente deve abrir Meus Pedidos para consultar o novo codigo; o anterior nao e mais valido. Nenhum pagamento ou saldo foi alterado.');
  update public.tickets set nao_lida_usuario=true,updated_at=now() where id=p_ticket;
  perform private.admin_exception_audit('regenerar_codigo_entrega',p_pedido,trim(p_motivo),jsonb_build_object('ticket_id',p_ticket,'codigo_exposto',false,'transferencia_gateway',false));
  return jsonb_build_object('ok',true,'idempotente',false,'pedido_id',p_pedido);
end;
$$;

create or replace function public.admin_baixa_externa_completa(p_pedido uuid,p_valor numeric,p_comissao numeric,p_motivo text,p_referencia text,p_ticket uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.pedidos; fee public.financial_ledger; result jsonb; fee_new boolean:=false; vendor uuid;
begin
  if auth.uid() is null or not coalesce(private.has_permission('financeiro'),false)
     or not coalesce(public.account_can_write(auth.uid()),false) then raise exception 'Sem permissao financeira.' using errcode='42501'; end if;
  if p_comissao is null or p_comissao::text in ('NaN','Infinity','-Infinity') or p_comissao<0 or p_comissao<>round(p_comissao,2) then raise exception 'Comissao invalida.'; end if;
  if char_length(trim(coalesce(p_referencia,''))) not between 3 and 160 then raise exception 'Informe referencia do repasse, sem dados bancarios completos.'; end if;
  select vendedor_id into vendor from public.pedidos where id=p_pedido;
  if vendor is null then raise exception 'Pedido nao encontrado.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(vendor::text,17017));
  select * into o from public.pedidos where id=p_pedido for update;
  if p_ticket is not null then
    if not coalesce(private.has_permission('atendimento'),false) then raise exception 'Sem permissao de atendimento.' using errcode='42501'; end if;
    perform private.require_order_ticket(p_ticket,o);
  end if;
  result:=private.admin_registrar_repasse_externo(p_pedido,p_valor,p_motivo);
  if p_comissao>0 then
    select * into fee from public.financial_ledger where pedido_id=p_pedido and tipo in ('taxa_plataforma','comissao_devida') for update;
    if not found or fee.valor is distinct from p_comissao or o.platform_fee_amount is distinct from p_comissao then raise exception 'Comissao deve corresponder ao valor registrado do pedido.'; end if;
    if fee.status='pago' then
      if fee.provider is distinct from 'comissao_externa' then raise exception 'Comissao ja recebida por outro meio. Nao registre novamente.'; end if;
    elsif fee.status in ('pendente','em_espera','disponivel') then
      update public.financial_ledger set status='pago',provider='comissao_externa',settled_at=now(),disponivel_em=null,
        external_reference='baixa_manual:'||(result->>'payout_id'),descricao='Comissao recebida por fora; baixa administrativa' where id=fee.id;
      fee_new:=true;
      perform private.admin_exception_audit('registrar_comissao_recebida',p_pedido,trim(p_motivo),jsonb_build_object('ledger_id',fee.id,'valor',p_comissao,'referencia',trim(p_referencia),'ticket_id',p_ticket,'transferencia_gateway',false));
    else raise exception 'Comissao cancelada ou inconsistente.'; end if;
  end if;
  if not coalesce((result->>'idempotente')::boolean,false) or fee_new then
    perform private.admin_exception_audit('conferir_baixa_externa',p_pedido,trim(p_motivo),jsonb_build_object('valor_loja',p_valor,'comissao_recebida',p_comissao,'referencia',trim(p_referencia),'ticket_id',p_ticket,'transferencia_gateway',false));
  end if;
  return result||jsonb_build_object('comissao',p_comissao);
end;
$$;
revoke all on function private.require_order_ticket(uuid,public.pedidos) from public,anon,authenticated,service_role;
revoke all on function public.admin_regenerar_codigo_por_ticket(uuid,uuid,text),public.admin_baixa_externa_completa(uuid,numeric,numeric,text,text,uuid) from public,anon,service_role;
grant execute on function public.admin_regenerar_codigo_por_ticket(uuid,uuid,text),public.admin_baixa_externa_completa(uuid,numeric,numeric,text,text,uuid) to authenticated;
commit;
