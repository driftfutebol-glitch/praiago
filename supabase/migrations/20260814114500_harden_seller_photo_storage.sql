drop policy if exists perfis_vendedores_owner_insert on storage.objects;
create policy perfis_vendedores_owner_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('ambulante', 'restaurante', 'entregador')
      and coalesce(p.status, 'ativo') = 'ativo'
  )
);

drop policy if exists perfis_vendedores_owner_update on storage.objects;
create policy perfis_vendedores_owner_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('ambulante', 'restaurante', 'entregador')
      and coalesce(p.status, 'ativo') = 'ativo'
  )
)
with check (
  bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('ambulante', 'restaurante', 'entregador')
      and coalesce(p.status, 'ativo') = 'ativo'
  )
);

drop policy if exists perfis_vendedores_owner_delete on storage.objects;
create policy perfis_vendedores_owner_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('ambulante', 'restaurante', 'entregador')
      and coalesce(p.status, 'ativo') = 'ativo'
  )
);
