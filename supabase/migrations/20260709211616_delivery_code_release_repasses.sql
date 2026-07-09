alter table public.pedidos
  add column if not exists codigo_entrega_criado_em timestamptz,
  add column if not exists entrega_confirmada_em timestamptz,
  add column if not exists entrega_confirmada_por uuid references auth.users(id) on delete set null,
  add column if not exists repasse_liberado_em timestamptz;

create or replace function private.generate_delivery_code()
returns text
language sql
set search_path = ''
as $$
  select lpad(floor(random() * 10000)::int::text, 4, '0');
$$;

revoke all on function private.generate_delivery_code() from public, anon, authenticated;

create or replace function public.ensure_delivery_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('saiu_entrega', 'entregando')
     and nullif(trim(coalesce(new.codigo_entrega, '')), '') is null then
    new.codigo_entrega = private.generate_delivery_code();
    new.codigo_entrega_criado_em = now();
  end if;

  return new;
end;
$$;

create or replace function public.block_unconfirmed_delivery()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'entregue'
     and coalesce(old.status, '') <> 'entregue'
     and coalesce(current_setting('praiago.delivery_confirmed', true), '') <> 'true' then
    raise exception 'Entrega precisa ser confirmada pelo codigo do cliente.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ensure_delivery_code on public.pedidos;
create trigger trg_ensure_delivery_code
before insert or update of status on public.pedidos
for each row
execute function public.ensure_delivery_code();

drop trigger if exists trg_block_unconfirmed_delivery on public.pedidos;
create trigger trg_block_unconfirmed_delivery
before update of status on public.pedidos
for each row
execute function public.block_unconfirmed_delivery();

create or replace function public.confirmar_entrega_pedido(
  p_pedido_id uuid,
  p_codigo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pedido public.pedidos%rowtype;
  v_actor uuid := auth.uid();
  v_codigo text := regexp_replace(coalesce(p_codigo, ''), '\D', '', 'g');
  v_provider text;
  v_payment_status text;
  v_manual boolean;
  v_repasse_dias integer := 7;
  v_disponivel_em timestamptz;
  v_settlement_status text;
begin
  if v_actor is null then
    raise exception 'Usuario nao autenticado.'
      using errcode = '28000';
  end if;

  select *
    into v_pedido
    from public.pedidos
   where id = p_pedido_id
   for update;

  if not found then
    raise exception 'Pedido nao encontrado.'
      using errcode = 'P0002';
  end if;

  if not (
    private.is_admin()
    or v_pedido.vendedor_id = v_actor
    or v_pedido.restaurante_id = v_actor
    or v_pedido.ambulante_id = v_actor
  ) then
    raise exception 'Sem permissao para confirmar este pedido.'
      using errcode = '42501';
  end if;

  if v_pedido.status = 'entregue' and coalesce(v_pedido.entrega_confirmada, false) then
    return jsonb_build_object(
      'ok', true,
      'pedido_id', v_pedido.id,
      'status', v_pedido.status,
      'settlement_status', v_pedido.settlement_status,
      'ja_confirmado', true
    );
  end if;

  if v_pedido.status not in ('saiu_entrega', 'entregando') then
    raise exception 'Pedido ainda nao esta em rota de entrega.'
      using errcode = 'P0001';
  end if;

  if nullif(trim(coalesce(v_pedido.codigo_entrega, '')), '') is null then
    raise exception 'Codigo de entrega ainda nao esta disponivel. Reenvie o pedido para rota e tente novamente.'
      using errcode = 'P0001';
  end if;

  if length(v_codigo) <> 4 or v_codigo <> v_pedido.codigo_entrega then
    insert into public.security_audit_logs (
      event_type,
      severity,
      platform,
      user_id,
      actor_id,
      route,
      metadata
    )
    values (
      'delivery_code_mismatch',
      'warning',
      'seller_app',
      v_pedido.cliente_id,
      v_actor,
      'confirmar_entrega_pedido',
      jsonb_build_object(
        'pedido_id', v_pedido.id,
        'vendedor_id', v_pedido.vendedor_id,
        'status', v_pedido.status,
        'codigo_informado_tamanho', length(v_codigo)
      )
    );

    raise exception 'Codigo de entrega incorreto.'
      using errcode = 'P0001';
  end if;

  v_provider := coalesce(v_pedido.payment_provider, 'manual');
  v_payment_status := coalesce(v_pedido.payment_status, 'pendente');
  v_manual := v_provider = 'manual' or v_payment_status = 'presencial';

  select coalesce(repasse_dias, 7)
    into v_repasse_dias
    from public.payment_settings
   where id is true;

  v_disponivel_em := now() + make_interval(days => coalesce(v_repasse_dias, 7));
  v_settlement_status := case
    when v_manual then 'comissao_devida'
    else 'repasse_liberado'
  end;

  perform set_config('praiago.delivery_confirmed', 'true', true);

  update public.pedidos
     set status = 'entregue',
         entrega_confirmada = true,
         entrega_confirmada_em = now(),
         entrega_confirmada_por = v_actor,
         repasse_liberado_em = now(),
         settlement_status = v_settlement_status
   where id = v_pedido.id
   returning * into v_pedido;

  if v_manual then
    update public.financial_ledger
       set tipo = 'comissao_devida',
           status = 'pendente',
           provider = 'presencial',
           settled_at = null,
           disponivel_em = null,
           descricao = 'Comissao PraiaGo da venda presencial'
     where pedido_id = v_pedido.id
       and tipo = 'taxa_plataforma';

    update public.financial_ledger
       set status = 'pago',
           provider = 'presencial',
           settled_at = now(),
           disponivel_em = null,
           descricao = 'Valor recebido pelo vendedor na entrega presencial'
     where pedido_id = v_pedido.id
       and tipo = 'repasse_vendedor';
  else
    update public.financial_ledger
       set status = 'pago',
           provider = 'mercadopago',
           external_reference = coalesce(v_pedido.mercadopago_payment_id, external_reference),
           settled_at = coalesce(v_pedido.paid_at, now()),
           disponivel_em = null,
           descricao = 'Taxa PraiaGo confirmada no Mercado Pago'
     where pedido_id = v_pedido.id
       and tipo = 'taxa_plataforma';

    update public.financial_ledger
       set status = 'em_espera',
           provider = 'mercadopago',
           external_reference = coalesce(v_pedido.mercadopago_payment_id, external_reference),
           settled_at = null,
           disponivel_em = v_disponivel_em,
           descricao = 'Repasse liberado apos entrega confirmada'
     where pedido_id = v_pedido.id
       and tipo = 'repasse_vendedor';
  end if;

  return jsonb_build_object(
    'ok', true,
    'pedido_id', v_pedido.id,
    'status', v_pedido.status,
    'settlement_status', v_pedido.settlement_status,
    'codigo_confirmado', true,
    'platform_fee_amount', coalesce(v_pedido.platform_fee_amount, 0),
    'vendor_amount', coalesce(v_pedido.vendor_amount, 0)
  );
end;
$$;

revoke all on function public.ensure_delivery_code() from public, anon, authenticated;
revoke all on function public.block_unconfirmed_delivery() from public, anon, authenticated;
revoke all on function public.confirmar_entrega_pedido(uuid, text) from public, anon;
grant execute on function public.confirmar_entrega_pedido(uuid, text) to authenticated;

update public.pedidos
   set codigo_entrega = private.generate_delivery_code(),
       codigo_entrega_criado_em = coalesce(codigo_entrega_criado_em, now())
 where status in ('saiu_entrega', 'entregando')
   and nullif(trim(coalesce(codigo_entrega, '')), '') is null;
