alter table public.pedidos
  add column if not exists cliente_telefone text;

comment on column public.pedidos.cliente_telefone is
  'Telefone do perfil do cliente no momento da criacao do pedido; visivel somente pelas politicas do pedido.';

alter table public.pedidos
  drop constraint if exists pedidos_cliente_telefone_format;

alter table public.pedidos
  add constraint pedidos_cliente_telefone_format
  check (
    cliente_telefone is null
    or cliente_telefone ~ '^[0-9]{10,13}$'
  ) not valid;

update public.pedidos as pedido
set cliente_telefone = contato.telefone
from (
  select
    perfil.id,
    nullif(regexp_replace(coalesce(perfil.telefone, ''), '[^0-9]', '', 'g'), '') as telefone
  from public.profiles as perfil
) as contato
where pedido.cliente_id = contato.id
  and pedido.cliente_telefone is null
  and char_length(contato.telefone) between 10 and 13;

alter table public.pedidos
  validate constraint pedidos_cliente_telefone_format;

create or replace function public.set_pedido_customer_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_phone text;
begin
  if new.cliente_id is null then
    new.cliente_telefone := null;
    return new;
  end if;

  select nullif(regexp_replace(coalesce(profile.telefone, ''), '[^0-9]', '', 'g'), '')
    into profile_phone
  from public.profiles as profile
  where profile.id = new.cliente_id;

  new.cliente_telefone := case
    when char_length(profile_phone) between 10 and 13 then profile_phone
    else null
  end;

  return new;
end;
$$;

revoke all on function public.set_pedido_customer_contact() from public;
revoke all on function public.set_pedido_customer_contact() from anon;
revoke all on function public.set_pedido_customer_contact() from authenticated;

drop trigger if exists set_pedido_customer_contact on public.pedidos;
create trigger set_pedido_customer_contact
before insert or update of cliente_id, cliente_telefone
on public.pedidos
for each row
execute function public.set_pedido_customer_contact();
