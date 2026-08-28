insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'kyc-documentos',
  'kyc-documentos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kyc_documentos_insert_owner on storage.objects;
create policy kyc_documentos_insert_owner
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'kyc-documentos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists kyc_documentos_select_admin on storage.objects;
create policy kyc_documentos_select_admin
on storage.objects
for select
to authenticated
using (
  bucket_id = 'kyc-documentos'
  and private.is_admin()
);

drop policy if exists kyc_documentos_delete_unsubmitted_owner on storage.objects;
create policy kyc_documentos_delete_unsubmitted_owner
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'kyc-documentos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (
    select 1
      from public.verificacoes v
     where coalesce(v.user_id, v.restaurante_id) = (select auth.uid())
       and name in (
         coalesce(v.rg_frente_url, ''),
         coalesce(v.rg_verso_url, ''),
         coalesce(v.selfie_url, ''),
         coalesce(v.foto_loja_url, ''),
         coalesce(v.cnh_url, '')
       )
  )
);
