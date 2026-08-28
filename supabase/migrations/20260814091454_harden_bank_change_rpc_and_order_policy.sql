create or replace function public.pode_trocar_conta(p_vendedor uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null
     or (
       v_actor is distinct from p_vendedor
       and not private.is_admin()
     ) then
    raise exception 'Sem permissao para consultar esta conta.'
      using errcode = '42501';
  end if;

  return
    not exists (
      select 1
        from public.seller_recipients sr
       where sr.vendedor_id = p_vendedor
         and sr.recipient_id is not null
    )
    or exists (
      select 1
        from public.bank_account_change_requests r
       where r.vendedor_id = p_vendedor
         and r.status = 'aprovado'
         and r.liberado_ate is not null
         and r.liberado_ate > now()
    );
end;
$$;

revoke all on function public.pode_trocar_conta(uuid) from public, anon;
grant execute on function public.pode_trocar_conta(uuid) to authenticated, service_role;

alter policy pedidos_insert_checkout_safe
on public.pedidos
with check (
  (select auth.uid()) is not null
  and cliente_id = (select auth.uid())
  and private.has_role('cliente')
  and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) is false
  and coalesce(status, 'novo') in ('novo', 'aguardando_pagamento')
  and coalesce(total, 0) >= 0
  and coalesce(discount_amount, 0) >= 0
  and coalesce(subtotal_amount, total, 0) >= coalesce(total, 0)
  and coalesce(payment_provider, 'manual') in ('manual', 'pagarme')
  and (
    (payment_provider = 'manual' and payment_status = 'presencial')
    or (payment_provider = 'pagarme' and payment_status = 'pendente')
  )
);
