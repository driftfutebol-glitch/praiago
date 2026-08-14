alter table public.profiles
  add column if not exists foto_perfil_path text,
  add column if not exists foto_capa_path text;

alter table public.vendedores_publicos
  add column if not exists foto_perfil_path text,
  add column if not exists foto_capa_path text;

alter table public.profiles
  drop constraint if exists profiles_foto_perfil_path_owner,
  drop constraint if exists profiles_foto_capa_path_owner;

alter table public.profiles
  add constraint profiles_foto_perfil_path_owner check (
    foto_perfil_path is null or foto_perfil_path like id::text || '/perfil-%'
  ),
  add constraint profiles_foto_capa_path_owner check (
    foto_capa_path is null or foto_capa_path like id::text || '/capa-%'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'perfis-vendedores',
  'perfis-vendedores',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists perfis_vendedores_public_select on storage.objects;
create policy perfis_vendedores_public_select
on storage.objects for select
to anon, authenticated
using (bucket_id = 'perfis-vendedores');

drop policy if exists perfis_vendedores_owner_insert on storage.objects;
create policy perfis_vendedores_owner_insert
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
);

drop policy if exists perfis_vendedores_owner_update on storage.objects;
create policy perfis_vendedores_owner_update
on storage.objects for update
to authenticated
using (
  bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) = any (array['jpg', 'jpeg', 'png', 'webp'])
);

drop policy if exists perfis_vendedores_owner_delete on storage.objects;
create policy perfis_vendedores_owner_delete
on storage.objects for delete
to authenticated
using (
  bucket_id = 'perfis-vendedores'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.sync_vendedor_publico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.vendedores_publicos where id = old.id;
    return old;
  end if;

  if new.role in ('ambulante', 'restaurante', 'entregador')
     and coalesce(new.status, 'ativo') = 'ativo' then
    insert into public.vendedores_publicos (
      id, nome, categoria, emoji, role, avaliacao_media, total_avaliacoes,
      online, lat, lng, zona, verificado, status, horario_abre, horario_fecha,
      foto_perfil_path, foto_capa_path, updated_at
    ) values (
      new.id, new.nome, new.categoria, new.emoji, new.role, new.avaliacao_media, new.total_avaliacoes,
      new.online, new.lat, new.lng, new.zona, new.verificado, new.status, new.horario_abre, new.horario_fecha,
      new.foto_perfil_path, new.foto_capa_path, now()
    ) on conflict (id) do update set
      nome = excluded.nome,
      categoria = excluded.categoria,
      emoji = excluded.emoji,
      role = excluded.role,
      avaliacao_media = excluded.avaliacao_media,
      total_avaliacoes = excluded.total_avaliacoes,
      online = excluded.online,
      lat = excluded.lat,
      lng = excluded.lng,
      zona = excluded.zona,
      verificado = excluded.verificado,
      status = excluded.status,
      horario_abre = excluded.horario_abre,
      horario_fecha = excluded.horario_fecha,
      foto_perfil_path = excluded.foto_perfil_path,
      foto_capa_path = excluded.foto_capa_path,
      updated_at = now();
  else
    delete from public.vendedores_publicos where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_vendedor_publico() from public, anon, authenticated;

insert into public.vendedores_publicos (
  id, nome, categoria, emoji, role, avaliacao_media, total_avaliacoes,
  online, lat, lng, zona, verificado, status, horario_abre, horario_fecha,
  foto_perfil_path, foto_capa_path, updated_at
)
select
  id, nome, categoria, emoji, role, avaliacao_media, total_avaliacoes,
  online, lat, lng, zona, verificado, status, horario_abre, horario_fecha,
  foto_perfil_path, foto_capa_path, now()
from public.profiles
where role in ('ambulante', 'restaurante', 'entregador')
  and coalesce(status, 'ativo') = 'ativo'
on conflict (id) do update set
  foto_perfil_path = excluded.foto_perfil_path,
  foto_capa_path = excluded.foto_capa_path,
  updated_at = now();

comment on column public.profiles.foto_perfil_path is 'Caminho publico da foto de perfil no bucket perfis-vendedores.';
comment on column public.profiles.foto_capa_path is 'Caminho publico da capa da vitrine no bucket perfis-vendedores.';
