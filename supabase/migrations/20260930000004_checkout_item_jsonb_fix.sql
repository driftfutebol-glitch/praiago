-- Checkout hotfix: pedidos.itens is jsonb, not text[]. The menu migration
-- accidentally used unnest(new.itens), aborting every INSERT before payment.
-- Patch only the affected statement so the rest of the deployed pricing logic
-- (including half pizzas and credit surcharge) stays unchanged.
begin;
do $fix$
declare
  v_definition text;
  v_old text := $old$new.itens := v_names || coalesce((select array_agg(left(line, 160)) from unnest(new.itens) line where line like 'Talheres: %' or line like 'Observação: %'), '{}'::text[]);$old$;
  v_new text := $new$if jsonb_typeof(new.itens) <> 'array' then
    raise exception 'Itens do pedido devem formar uma lista.' using errcode = '23514';
  end if;
  new.itens := to_jsonb(v_names) || coalesce((
    select jsonb_agg(left(line, 160) order by ordinal)
    from jsonb_array_elements_text(new.itens) with ordinality as item(line, ordinal)
    where line like 'Talheres: %' or line like 'Observação: %'
  ), '[]'::jsonb);$new$;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pedidos'
      and column_name = 'itens' and data_type = 'jsonb'
  ) then
    raise exception 'Expected public.pedidos.itens to be jsonb';
  end if;

  v_definition := pg_get_functiondef('public.validar_preco_pedido()'::regprocedure);
  if strpos(v_definition, v_new) > 0 then
    return; -- safe to re-apply
  end if;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'Unexpected validar_preco_pedido body; inspect before patching';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$fix$;

-- A second validation rejected first-order credit purchases with a coupon:
-- server-priced credit surcharge was missing from the expected order total.
do $fix$
declare
  v_definition text;
  v_old text := $old$if round(coalesce(new.total, 0)::numeric, 2) <> round((coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total) - coalesce(new.discount_amount, 0))::numeric, 2) then$old$;
  v_new text := $new$if round(coalesce(new.total, 0)::numeric, 2) <> round((coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total) - coalesce(new.discount_amount, 0) + coalesce(new.credit_surcharge_amount, 0))::numeric, 2) then$new$;
begin
  v_definition := pg_get_functiondef('public.validate_and_register_coupon_usage()'::regprocedure);
  if strpos(v_definition, v_new) > 0 then
    return;
  end if;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'Unexpected coupon validation body; inspect before patching';
  end if;
  execute replace(v_definition, v_old, v_new);
end;
$fix$;
commit;
