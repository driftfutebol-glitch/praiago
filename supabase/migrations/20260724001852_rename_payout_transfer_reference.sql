-- Gateway atual: Pagar.me. Remove nomes tecnicos legados do estado final do schema.
-- Migration criada pelo Supabase CLI em 24/07/2026.

do $$
begin
  if to_regclass('public.payouts') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payouts' and column_name = 'mp_transfer_id'
    ) and not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payouts' and column_name = 'provider_transfer_id'
    ) then
      alter table public.payouts rename column mp_transfer_id to provider_transfer_id;
    elsif exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payouts' and column_name = 'mp_transfer_id'
    ) and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payouts' and column_name = 'provider_transfer_id'
    ) then
      update public.payouts
      set provider_transfer_id = coalesce(provider_transfer_id, mp_transfer_id);
      alter table public.payouts drop column mp_transfer_id;
    elsif not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'payouts' and column_name = 'provider_transfer_id'
    ) then
      alter table public.payouts add column provider_transfer_id text;
    end if;

    alter table public.payouts alter column provider set default 'pendente_config';
    update public.payouts
    set provider = 'pendente_config'
    where provider is null or provider = 'mercadopago';

    comment on column public.payouts.provider_transfer_id is 'Id da transferencia no provedor de pagamento.';
  end if;

  if to_regclass('public.pedidos') is not null then
    alter table public.pedidos alter column payment_provider set default 'manual';
    update public.pedidos
    set payment_provider = 'pagarme'
    where payment_provider = 'mercadopago';
  end if;

  if to_regclass('public.financial_ledger') is not null then
    update public.financial_ledger
    set provider = 'pagarme'
    where provider = 'mercadopago';
  end if;

  if to_regclass('public.event_ticket_sales') is not null then
    alter table public.event_ticket_sales alter column payment_provider set default 'pagarme';
    update public.event_ticket_sales
    set payment_provider = 'pagarme'
    where payment_provider = 'mercadopago';
  end if;

  if to_regclass('public.event_ticket_orders') is not null then
    alter table public.event_ticket_orders alter column payment_provider set default 'pagarme';
    update public.event_ticket_orders
    set payment_provider = 'pagarme'
    where payment_provider = 'mercadopago';
  end if;
end $$;
