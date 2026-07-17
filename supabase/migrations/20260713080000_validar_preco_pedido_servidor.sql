-- "Nunca confie no front": o servidor RECALCULA o preço do pedido pelo preço
-- real dos produtos (com promoção), sobrescrevendo o total/subtotal que o app
-- enviou. Fecha manipulação de preço (pagar R$0,01 num pedido de R$100).
alter table public.pedidos add column if not exists itens_detalhe jsonb;

create or replace function public.validar_preco_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_subtotal numeric := 0;
  v_item jsonb;
  v_preco numeric;
  v_promo numeric;
  v_qtd int;
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
    if v_preco is null then
      raise exception 'Produto invalido, inativo ou de outra loja no pedido.' using errcode = '23514';
    end if;

    select min(case desconto_tipo
        when 'preco_promocional' then preco_promocional
        when 'percentual' then v_preco * (1 - least(greatest(coalesce(desconto_valor,0),0),95)/100)
        else greatest(0, v_preco - coalesce(desconto_valor,0)) end)
    into v_promo
    from public.promocoes
    where produto_id = (v_item->>'produto_id')::uuid and ativo is true and publico is true
      and data_inicio <= now() and (data_fim is null or data_fim >= now());

    v_preco := least(v_preco, coalesce(v_promo, v_preco));
    v_subtotal := v_subtotal + v_preco * v_qtd;
  end loop;

  v_subtotal := round(v_subtotal::numeric, 2);
  if v_subtotal <= 0 then raise exception 'Pedido sem valor valido.' using errcode = '23514'; end if;

  new.subtotal_amount := v_subtotal;
  new.total := greatest(0, round((v_subtotal - coalesce(new.discount_amount, 0))::numeric, 2));
  new.gross_amount := new.total;
  return new;
end;
$$;

drop trigger if exists trg_00_validar_preco_pedido on public.pedidos;
create trigger trg_00_validar_preco_pedido
  before insert on public.pedidos
  for each row execute function public.validar_preco_pedido();
