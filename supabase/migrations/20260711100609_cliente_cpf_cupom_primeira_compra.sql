-- Cliente: CPF validado, pedido somente logado e desconto de boas-vindas.
-- Aplicado primeiro no banco remoto via MCP e registrado aqui para historico.

alter table public.profiles
  add column if not exists cpf text,
  add column if not exists cpf_check_status text not null default 'pendente',
  add column if not exists cpf_confirmado_em timestamptz;

alter table public.profiles
  drop constraint if exists profiles_cpf_check_status_chk;

alter table public.profiles
  add constraint profiles_cpf_check_status_chk
  check (cpf_check_status in ('pendente','aprovado','rejeitado','dispensado'));

alter table public.pedidos
  add column if not exists subtotal_amount numeric,
  add column if not exists discount_amount numeric not null default 0,
  add column if not exists discount_code text,
  add column if not exists discount_reason text;

create index if not exists pedidos_cliente_id_idx on public.pedidos(cliente_id);
create index if not exists profiles_cpf_idx on public.profiles(cpf) where cpf is not null;

create or replace function public.prepare_profile_cliente_cpf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.cpf := nullif(private.only_digits(new.cpf), '');

  if coalesce(new.role, 'cliente') = 'cliente' then
    if new.cpf is null then
      new.cpf_check_status := 'pendente';
      new.cpf_confirmado_em := null;
    elsif private.is_valid_cpf(new.cpf) then
      new.cpf_check_status := 'aprovado';
      new.cpf_confirmado_em := coalesce(new.cpf_confirmado_em, now());
    else
      new.cpf_check_status := 'rejeitado';
      new.cpf_confirmado_em := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.prepare_profile_cliente_cpf() from public, anon, authenticated;

drop trigger if exists trg_prepare_profile_cliente_cpf on public.profiles;
create trigger trg_prepare_profile_cliente_cpf
before insert or update of cpf, role
on public.profiles
for each row
execute function public.prepare_profile_cliente_cpf();

insert into public.cupons (
  codigo, titulo, descricao, tipo, valor, valor_minimo,
  limite_uso, ativo, publico, vendedor_id, vendedor_tipo
)
values (
  'BEMVINDO20',
  'Boas-vindas PraiaGo',
  '20% de desconto na primeira compra com e-mail confirmado e CPF valido.',
  'percentual',
  20,
  0,
  null,
  true,
  true,
  null,
  null
)
on conflict (codigo) do update
set titulo = excluded.titulo,
    descricao = excluded.descricao,
    tipo = excluded.tipo,
    valor = excluded.valor,
    valor_minimo = excluded.valor_minimo,
    ativo = true,
    publico = true,
    updated_at = now();

alter policy pedidos_insert_checkout_safe on public.pedidos
  to authenticated
  with check (
    (select auth.uid()) is not null
    and cliente_id = (select auth.uid())
    and coalesce(status, 'novo') in ('novo','aguardando_pagamento')
    and coalesce(total, 0) >= 0
    and coalesce(discount_amount, 0) >= 0
    and coalesce(subtotal_amount, total, 0) >= coalesce(total, 0)
    and coalesce(payment_provider, 'manual') in ('manual','mercadopago')
    and coalesce(payment_status, 'pendente') in ('pendente','presencial')
    and exists (
      select 1
      from auth.users u
      where u.id = (select auth.uid())
        and coalesce(u.is_anonymous, false) is false
    )
  );

alter policy pedidos_select_related_or_admin on public.pedidos
  to authenticated
  using (
    private.is_admin()
    or cliente_id = (select auth.uid())
    or vendedor_id = (select auth.uid())
    or restaurante_id = (select auth.uid())
    or ambulante_id = (select auth.uid())
  );
