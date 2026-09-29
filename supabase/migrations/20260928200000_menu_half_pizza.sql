-- Additive menu metadata and server-priced half-and-half pizzas.
-- Apply ONLY this migration after scoped QA; historical migrations are not reconciled.
begin;
alter table public.pedidos add column if not exists estoque_movimentos jsonb;
alter table public.produtos add column if not exists menu_secao text;
alter table public.produtos add column if not exists pizza_meio_a_meio boolean not null default false;
alter table public.produtos add column if not exists pizza_tamanho text;
alter table public.produtos add constraint produtos_menu_secao_valid check (menu_secao is null or (char_length(trim(menu_secao)) between 1 and 60 and menu_secao !~ '[[:cntrl:]]'));
alter table public.produtos add constraint produtos_pizza_config_valid check (not pizza_meio_a_meio or (categoria is not null and categoria = 'Pizza' and pizza_tamanho is not null and pizza_tamanho in ('Broto','Pequena','Média','Grande','Família')));

create or replace function private.preco_produto_cardapio(p_produto uuid)
returns numeric language sql stable security definer set search_path='' as $$
  select round(least(p.preco, coalesce((select min(case pr.desconto_tipo
    when 'preco_promocional' then case when pr.preco_promocional > 0 then pr.preco_promocional else p.preco end
    when 'percentual' then p.preco * (1 - least(greatest(coalesce(pr.desconto_valor,0),0),95)/100)
    else greatest(0,p.preco-coalesce(pr.desconto_valor,0)) end)
    from public.promocoes pr where pr.produto_id=p.id and pr.ativo is true and pr.publico is true
      and pr.data_inicio<=now() and (pr.data_fim is null or pr.data_fim>=now())),p.preco)),2)
  from public.produtos p where p.id=p_produto;
$$;
create or replace function private.pedido_unidades(p_itens jsonb)
returns table(produto_id uuid, qtd integer) language sql immutable set search_path='' as $$
  select id, ceil(sum(units))::int from (
    select (item->>'produto_id')::uuid id,(item->>'qtd')::numeric * case when nullif(item->>'segundo_sabor_id','') is null then 1 else 0.5 end units from jsonb_array_elements(p_itens) item
    union all
    select (item->>'segundo_sabor_id')::uuid,(item->>'qtd')::numeric/2 from jsonb_array_elements(p_itens) item where nullif(item->>'segundo_sabor_id','') is not null
  ) expanded group by id;
$$;
revoke all on function private.preco_produto_cardapio(uuid), private.pedido_unidades(jsonb) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.validar_preco_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_subtotal numeric := 0; v_item jsonb; v_preco numeric; v_promo numeric; v_qtd int; v_desc numeric;
  v_base numeric; v_pct_credito numeric; v_acrescimo numeric := 0;
  v_estoque int; v_nome text; v_second public.produtos; v_first public.produtos;
  v_details jsonb := '[]'::jsonb; v_names text[] := '{}'::text[]; v_units record;
begin
  if new.cliente_id is null then return new; end if;
  if new.itens_detalhe is null or jsonb_typeof(new.itens_detalhe) <> 'array' or jsonb_array_length(new.itens_detalhe) = 0 then
    raise exception 'Pedido sem itens com identificador de produto. Atualize o aplicativo.' using errcode = '23514';
  end if;
  if jsonb_array_length(new.itens_detalhe) > 100 then raise exception 'Pedido com itens demais.'; end if;
  for v_item in select * from jsonb_array_elements(new.itens_detalhe) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'qtd', '') !~ '^[1-9][0-9]{0,2}$' then
      raise exception 'Quantidade invalida no pedido.' using errcode = '23514';
    end if;
    v_qtd := (v_item->>'qtd')::int;
    select * into v_first from public.produtos
      where id = (v_item->>'produto_id')::uuid and vendedor_id = new.vendedor_id and ativo is true;
    if not found then raise exception 'Produto invalido, inativo ou de outra loja no pedido.' using errcode = '23514'; end if;
    v_preco := private.preco_produto_cardapio(v_first.id);
    v_nome := v_first.nome;
    if nullif(v_item->>'segundo_sabor_id', '') is not null then
      select * into v_second from public.produtos
        where id = (v_item->>'segundo_sabor_id')::uuid and vendedor_id = new.vendedor_id and ativo is true;
      if not found or v_second.id = v_first.id or v_first.categoria is distinct from 'Pizza' or v_second.categoria is distinct from 'Pizza'
        or not v_first.pizza_meio_a_meio or not v_second.pizza_meio_a_meio
        or v_first.pizza_tamanho is null or v_first.pizza_tamanho is distinct from v_second.pizza_tamanho then
        raise exception 'Sabores invalidos para pizza meio a meio. Escolha dois sabores habilitados do mesmo tamanho e loja.' using errcode = '23514';
      end if;
      v_preco := round((v_preco + private.preco_produto_cardapio(v_second.id)) / 2, 2);
      v_nome := format('Pizza meio a meio (%s): ½ %s + ½ %s', v_first.pizza_tamanho, v_first.nome, v_second.nome);
      v_details := v_details || jsonb_build_array(jsonb_build_object('produto_id',v_first.id,'segundo_sabor_id',v_second.id,'qtd',v_qtd,'nome',v_nome,'preco_unitario',v_preco,'pizza_tamanho',v_first.pizza_tamanho));
    else
      v_details := v_details || jsonb_build_array(jsonb_build_object('produto_id',v_first.id,'qtd',v_qtd,'nome',v_nome,'preco_unitario',v_preco));
    end if;
    v_names := array_append(v_names, format('%sx %s',v_qtd,v_nome));
    v_subtotal := v_subtotal + v_preco * v_qtd;
  end loop;
  -- Aggregate repeated flavors, including halves, before checking inventory.
  for v_units in select * from private.pedido_unidades(v_details) order by produto_id loop
    select estoque,nome into v_estoque,v_nome from public.produtos where id=v_units.produto_id and vendedor_id=new.vendedor_id for update;
    if v_estoque is not null and v_units.qtd > v_estoque then
      if v_estoque=0 then raise exception '% esgotou. Tire do carrinho pra fechar o pedido.',v_nome using errcode='23514';
      else raise exception 'Restam so % de %. Ajuste a quantidade.',v_estoque,v_nome using errcode='23514'; end if;
    end if;
  end loop;
  new.itens_detalhe := v_details;
  -- Names and flavor proportions come from the server, not a forged client.
  new.itens := v_names || coalesce((select array_agg(left(line, 160)) from unnest(new.itens) line where line like 'Talheres: %' or line like 'Observação: %'), '{}'::text[]);
  v_subtotal := round(v_subtotal::numeric, 2);
  if v_subtotal <= 0 then raise exception 'Pedido sem valor valido.' using errcode = '23514'; end if;

  if nullif(trim(coalesce(new.discount_code, '')), '') is null then v_desc := 0;
  else v_desc := least(greatest(coalesce(new.discount_amount, 0), 0), v_subtotal); end if;

  v_base := greatest(0, round((v_subtotal - v_desc)::numeric, 2));

  if coalesce(new.pagamento, '') = 'credito_online' then
    select coalesce(taxa_credito_cliente_percent, 0) into v_pct_credito
      from public.payment_settings where id is true;
    v_acrescimo := round((v_base * coalesce(v_pct_credito, 0) / 100)::numeric, 2);
  end if;

  new.discount_amount := v_desc;
  new.subtotal_amount := v_subtotal;
  new.credit_surcharge_amount := v_acrescimo;
  new.total := round((v_base + v_acrescimo)::numeric, 2);
  new.gross_amount := new.total;
  new.platform_fee_amount := null;
  new.vendor_amount := null;
  return new;
end;
$function$;

create or replace function public.mover_estoque_do_pedido()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_item record; v_stock int; v_used int; v_moves jsonb:='{}'::jsonb; v_real boolean; v_dead boolean;
begin
  if new.itens_detalhe is null or jsonb_typeof(new.itens_detalhe)<>'array' then return new; end if;
  v_real:=coalesce(new.status,'') not in ('aguardando_pagamento','cancelado');
  v_dead:=coalesce(new.status,'')='cancelado' or new.refunded_at is not null or coalesce(new.payment_status,'') in ('recusado','estornado','expirado');
  if v_real and not v_dead and not coalesce(new.estoque_baixado,false) then
    for v_item in select * from private.pedido_unidades(new.itens_detalhe) order by produto_id loop
      select estoque into v_stock from public.produtos where id=v_item.produto_id and vendedor_id=new.vendedor_id for update;
      if found and v_stock is not null then
        -- Preserve existing online-payment debit behavior; remember actual debit.
        v_used:=least(greatest(0,v_stock),v_item.qtd);
        update public.produtos set estoque=estoque-v_used where id=v_item.produto_id;
        v_moves:=v_moves||jsonb_build_object(v_item.produto_id::text,v_used);
      end if;
    end loop;
    update public.pedidos set estoque_baixado=true,estoque_movimentos=v_moves where id=new.id;
  elsif v_dead and coalesce(new.estoque_baixado,false) then
    if new.estoque_movimentos is null then
      -- Legacy orders retain the previous restoration semantics.
      for v_item in select * from private.pedido_unidades(new.itens_detalhe) order by produto_id loop
        update public.produtos set estoque=estoque+v_item.qtd where id=v_item.produto_id and vendedor_id=new.vendedor_id and estoque is not null;
      end loop;
    else
      for v_item in select key::uuid produto_id,value::int qtd from jsonb_each_text(new.estoque_movimentos) order by key loop
        update public.produtos set estoque=estoque+v_item.qtd where id=v_item.produto_id and vendedor_id=new.vendedor_id and estoque is not null;
      end loop;
    end if;
    update public.pedidos set estoque_baixado=false,estoque_movimentos=null where id=new.id;
  end if;
  return new;
end;
$$;
commit;
