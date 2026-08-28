-- Restaurantes podem cadastrar entregadores somente de moto ou bicicleta.
alter table public.entregadores
  add column if not exists veiculo text;

update public.entregadores
set veiculo = 'moto'
where veiculo is null
   or veiculo not in ('moto', 'bicicleta');

alter table public.entregadores
  alter column veiculo set default 'moto',
  alter column veiculo set not null;

alter table public.entregadores
  drop constraint if exists entregadores_veiculo_check;

alter table public.entregadores
  add constraint entregadores_veiculo_check
  check (veiculo in ('moto', 'bicicleta'));

update public.verificacoes
set tipo_veiculo = null
where tipo_veiculo is not null
  and tipo_veiculo not in ('moto', 'bicicleta');

alter table public.verificacoes
  drop constraint if exists verificacoes_tipo_veiculo_check;

alter table public.verificacoes
  add constraint verificacoes_tipo_veiculo_check
  check (tipo_veiculo is null or tipo_veiculo in ('moto', 'bicicleta'));

-- O cardapio do restaurante usa o mesmo bucket publico de produtos.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'produtos',
  'produtos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Cada vendedor so pode gerenciar imagens dentro da propria pasta.
drop policy if exists produtos_auth_select on storage.objects;
drop policy if exists produtos_auth_insert on storage.objects;
drop policy if exists produtos_auth_update on storage.objects;
drop policy if exists produtos_auth_delete on storage.objects;

create policy produtos_auth_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy produtos_auth_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy produtos_auth_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy produtos_auth_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'produtos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
