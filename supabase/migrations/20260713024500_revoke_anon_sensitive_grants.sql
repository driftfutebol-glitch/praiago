-- Defense in depth: sensitive tables should not be granted to anon even when
-- RLS would return zero rows. Keep anon only for intentionally public data.

revoke select on table public.profiles from anon;
revoke select on table public.pedidos from anon;
revoke select on table public.payment_settings from anon;
revoke select on table public.payouts from anon;
revoke select on table public.wallets from anon;
revoke select on table public.seller_recipients from anon;
revoke select on table public.payment_webhook_events from anon;
revoke select on table public.settlement_config from anon;
revoke select on table public.signup_ips from anon;
revoke select on table public.signup_rules from anon;
revoke select on table public.authorized_ips from anon;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin on public.profiles
for select to authenticated
using (private.is_admin() or id = (select auth.uid()));

drop policy if exists payment_settings_select_public on public.payment_settings;
drop policy if exists payment_settings_select_authenticated on public.payment_settings;
create policy payment_settings_select_authenticated on public.payment_settings
for select to authenticated
using (id is true);

drop policy if exists payouts_leitura on public.payouts;
create policy payouts_leitura on public.payouts
for select to authenticated
using (vendedor_id = (select auth.uid()) or private.is_admin());

drop policy if exists wallets_leitura on public.wallets;
create policy wallets_leitura on public.wallets
for select to authenticated
using (vendedor_id = (select auth.uid()) or private.is_admin());

drop policy if exists seller_recipients_leitura on public.seller_recipients;
create policy seller_recipients_leitura on public.seller_recipients
for select to authenticated
using (vendedor_id = (select auth.uid()) or private.is_admin());

drop policy if exists webhook_events_admin on public.payment_webhook_events;
create policy webhook_events_admin on public.payment_webhook_events
for select to authenticated
using (private.is_admin());

drop policy if exists settlement_config_admin on public.settlement_config;
create policy settlement_config_admin on public.settlement_config
for select to authenticated
using (private.is_admin());

drop policy if exists signup_ips_admin on public.signup_ips;
create policy signup_ips_admin on public.signup_ips
for select to authenticated
using (private.is_admin());

drop policy if exists signup_rules_admin on public.signup_rules;
create policy signup_rules_admin on public.signup_rules
for all to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists authorized_ips_admin on public.authorized_ips;
create policy authorized_ips_admin on public.authorized_ips
for all to authenticated
using (private.is_admin())
with check (private.is_admin());
