create table if not exists public.ota_releases (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  platform text not null default 'all' check (platform in ('all', 'android', 'ios')),
  channel text not null default 'production',
  version text not null,
  bundle_url text not null,
  checksum text,
  min_native_version text,
  enabled boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  unique (app_id, platform, channel, version)
);

alter table public.ota_releases enable row level security;

revoke all on table public.ota_releases from anon, authenticated;
grant select, insert, update, delete on table public.ota_releases to service_role;

create index if not exists idx_ota_releases_lookup
  on public.ota_releases (app_id, channel, platform, enabled, created_at desc);

drop policy if exists "No public OTA release access" on public.ota_releases;
create policy "No public OTA release access"
  on public.ota_releases
  for all
  to anon, authenticated
  using (false)
  with check (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ota-bundles', 'ota-bundles', true, 52428800, array['application/zip', 'application/octet-stream'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public OTA bundle read" on storage.objects;
