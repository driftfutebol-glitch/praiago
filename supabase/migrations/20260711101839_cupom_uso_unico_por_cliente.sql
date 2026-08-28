-- Cupons: cada cliente usa cada cupom uma unica vez.
-- A trava fica no banco para impedir repeticao mesmo fora da interface.

create table if not exists public.cupom_usos (
  id uuid primary key default gen_random_uuid(),
  cupom_codigo text not null references public.cupons(codigo) on update cascade on delete restrict,
  cliente_id uuid not null references auth.users(id) on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  discount_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (cliente_id, cupom_codigo),
  unique (pedido_id)
);

alter table public.cupom_usos enable row level security;

grant select on table public.cupom_usos to authenticated;
grant all on table public.cupom_usos to service_role;

drop policy if exists cupom_usos_select_own_or_admin on public.cupom_usos;
create policy cupom_usos_select_own_or_admin
on public.cupom_usos
for select
to authenticated
using (private.is_admin() or cliente_id = (select auth.uid()));

create or replace function public.validate_and_register_coupon_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cupom public.cupons%rowtype;
  v_expected numeric := 0;
  v_prior_orders int := 0;
begin
  if nullif(trim(coalesce(new.discount_code, '')), '') is null or coalesce(new.discount_amount, 0) <= 0 then
    return new;
  end if;

  new.discount_code := upper(trim(new.discount_code));

  if new.cliente_id is null then
    raise exception 'Cupom exige cliente logado.' using errcode = '23514';
  end if;

  select * into v_cupom
    from public.cupons
   where codigo = new.discount_code
     and ativo is true
     and (validade is null or validade >= now())
     and data_inicio <= now();

  if not found then
    raise exception 'Cupom invalido ou expirado.' using errcode = '23514';
  end if;

  if v_cupom.limite_uso is not null and coalesce(v_cupom.usos, 0) >= v_cupom.limite_uso then
    raise exception 'Cupom esgotado.' using errcode = '23514';
  end if;

  if v_cupom.vendedor_id is not null and v_cupom.vendedor_id <> new.vendedor_id then
    raise exception 'Cupom nao vale para esta loja.' using errcode = '23514';
  end if;

  if coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total) < coalesce(v_cupom.valor_minimo, 0) then
    raise exception 'Pedido minimo do cupom nao atingido.' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.cupom_usos u
     where u.cliente_id = new.cliente_id
       and u.cupom_codigo = new.discount_code
  ) then
    raise exception 'Cupom ja usado por este cliente.' using errcode = '23505';
  end if;

  if new.discount_code = 'BEMVINDO20' then
    if not exists (
      select 1
        from auth.users u
        join public.profiles p on p.id = u.id
       where u.id = new.cliente_id
         and u.email_confirmed_at is not null
         and p.cpf_check_status = 'aprovado'
    ) then
      raise exception 'BEMVINDO20 exige e-mail confirmado e CPF valido.' using errcode = '23514';
    end if;

    select count(*) into v_prior_orders
      from public.pedidos p
     where p.cliente_id = new.cliente_id
       and p.id <> new.id
       and coalesce(p.status, '') not in ('cancelado','pagamento_recusado');

    if v_prior_orders > 0 then
      raise exception 'BEMVINDO20 vale somente na primeira compra.' using errcode = '23514';
    end if;
  end if;

  v_expected := case v_cupom.tipo
    when 'valor_fixo' then v_cupom.valor
    when 'percentual' then coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total) * v_cupom.valor / 100
    when 'frete_gratis' then 0
    else 0
  end;
  v_expected := round(least(coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total), greatest(v_expected, 0))::numeric, 2);

  if round(coalesce(new.discount_amount, 0)::numeric, 2) > v_expected + 0.01 then
    raise exception 'Desconto maior que o permitido pelo cupom.' using errcode = '23514';
  end if;

  if round(coalesce(new.total, 0)::numeric, 2) <> round((coalesce(new.subtotal_amount, new.total + new.discount_amount, new.total) - coalesce(new.discount_amount, 0))::numeric, 2) then
    raise exception 'Total do pedido nao confere com o desconto.' using errcode = '23514';
  end if;

  insert into public.cupom_usos (cupom_codigo, cliente_id, pedido_id, discount_amount)
  values (new.discount_code, new.cliente_id, new.id, coalesce(new.discount_amount, 0));

  update public.cupons
     set usos = coalesce(usos, 0) + 1,
         updated_at = now()
   where codigo = new.discount_code;

  return new;
end;
$$;

revoke all on function public.validate_and_register_coupon_usage() from public, anon, authenticated;

drop trigger if exists trg_validate_and_register_coupon_usage on public.pedidos;
create trigger trg_validate_and_register_coupon_usage
after insert on public.pedidos
for each row
execute function public.validate_and_register_coupon_usage();
