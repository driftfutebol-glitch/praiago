-- Reduce Supabase Realtime exposure. The anon/publishable key is visible by
-- design, so sensitive tables must not be published to websocket channels.

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime drop table public.profiles;
  end if;

  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'financial_ledger') then
    alter publication supabase_realtime drop table public.financial_ledger;
  end if;

  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vendor_payment_accounts') then
    alter publication supabase_realtime drop table public.vendor_payment_accounts;
  end if;

  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payment_settings') then
    alter publication supabase_realtime drop table public.payment_settings;
  end if;

  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_ticket_notifications') then
    alter publication supabase_realtime drop table public.event_ticket_notifications;
  end if;

  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'entregadores') then
    alter publication supabase_realtime drop table public.entregadores;
  end if;

  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vendedores_publicos') then
    alter publication supabase_realtime add table public.vendedores_publicos;
  end if;
end $$;
