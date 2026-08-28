-- Checkout/payment reliability:
--  * persist the Pagar.me PIX image URL returned by the authenticated API;
--  * keep an auditable, RLS-protected payment notification feed for admins;
--  * release a coupon reservation only when an unpaid order is canceled.

alter table public.pagamentos
  add column if not exists pix_qr_code_url text;

alter table public.payment_webhook_events
  add column if not exists verification_method text not null default 'legacy';

update public.pagamentos
   set pix_qr_code_url = nullif(raw #>> '{charges,0,last_transaction,qr_code_url}', '')
 where pix_qr_code_url is null
   and nullif(raw #>> '{charges,0,last_transaction,qr_code_url}', '') is not null;

create table if not exists public.payment_notifications (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  tipo text not null check (tipo in ('pendente','aprovado','recusado','cancelado','estornado')),
  payment_status text not null,
  pagamento text,
  valor numeric(10,2) not null default 0 check (valor >= 0),
  created_at timestamptz not null default now(),
  unique (pedido_id, tipo)
);

create index if not exists payment_notifications_created_at_idx
on public.payment_notifications (created_at desc);

alter table public.payment_notifications enable row level security;

revoke all on table public.payment_notifications from anon;
grant select on table public.payment_notifications to authenticated;
grant all on table public.payment_notifications to service_role;

drop policy if exists payment_notifications_select_admin on public.payment_notifications;
create policy payment_notifications_select_admin
on public.payment_notifications
for select
to authenticated
using (
  private.has_permission('financeiro')
  or private.has_permission('pedidos')
);

create or replace function public.emit_payment_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
begin
  if coalesce(new.payment_provider, 'manual') <> 'pagarme' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.payment_status = 'pendente' then
      v_tipo := 'pendente';
    end if;
  elsif new.payment_status is distinct from old.payment_status then
    v_tipo := case new.payment_status
      when 'pendente' then 'pendente'
      when 'aprovado' then 'aprovado'
      when 'recusado' then 'recusado'
      when 'rejeitado' then 'recusado'
      when 'cancelado' then 'cancelado'
      when 'estornado' then 'estornado'
      when 'chargeback' then 'estornado'
      else null
    end;
  end if;

  if v_tipo is not null then
    insert into public.payment_notifications (
      pedido_id,
      tipo,
      payment_status,
      pagamento,
      valor
    ) values (
      new.id,
      v_tipo,
      new.payment_status,
      new.pagamento,
      coalesce(new.total, 0)
    )
    on conflict (pedido_id, tipo) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.emit_payment_notification()
from public, anon, authenticated;

drop trigger if exists trg_payment_notification on public.pedidos;
create trigger trg_payment_notification
after insert or update of payment_status
on public.pedidos
for each row
execute function public.emit_payment_notification();

create or replace function public.release_coupon_on_unpaid_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if new.status <> 'cancelado'
     or old.status = 'cancelado'
     or new.discount_code is null
     or old.payment_status = 'aprovado'
     or new.payment_status = 'aprovado' then
    return new;
  end if;

  delete from public.cupom_usos
   where pedido_id = new.id;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    update public.cupons
       set usos = greatest(0, coalesce(usos, 0) - v_deleted),
           updated_at = now()
     where codigo = new.discount_code;
  end if;

  return new;
end;
$$;

revoke all on function public.release_coupon_on_unpaid_cancel()
from public, anon, authenticated;

drop trigger if exists trg_release_coupon_on_unpaid_cancel on public.pedidos;
create trigger trg_release_coupon_on_unpaid_cancel
after update of status, payment_status
on public.pedidos
for each row
execute function public.release_coupon_on_unpaid_cancel();

insert into public.payment_notifications (
  pedido_id,
  tipo,
  payment_status,
  pagamento,
  valor,
  created_at
)
select
  p.id,
  case p.payment_status
    when 'aprovado' then 'aprovado'
    when 'recusado' then 'recusado'
    when 'rejeitado' then 'recusado'
    when 'cancelado' then 'cancelado'
    when 'estornado' then 'estornado'
    when 'chargeback' then 'estornado'
    else 'pendente'
  end,
  p.payment_status,
  p.pagamento,
  coalesce(p.total, 0),
  p.created_at
from public.pedidos p
where p.payment_provider = 'pagarme'
  and p.payment_status in (
    'pendente','aprovado','recusado','rejeitado','cancelado','estornado','chargeback'
  )
on conflict (pedido_id, tipo) do nothing;

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'payment_notifications'
  ) then
    alter publication supabase_realtime add table public.payment_notifications;
  end if;
end;
$$;

comment on table public.payment_notifications is
  'Eventos financeiros sem dados pessoais, visiveis apenas a admins autorizados.';
