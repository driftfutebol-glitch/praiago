-- Contas de revisao (Apple, Google Play, testes internos).
--
-- Objetivo: permitir contas reais e funcionais, usadas pelos revisores das
-- lojas e por testes internos, que NUNCA aparecem para clientes de verdade.
--
-- O corte e feito na origem: `public.vendedores_publicos` e a unica tabela que
-- o app Cliente le para montar radar, listagens e mapa. Se a conta nao entra
-- la, ela nao existe para nenhum cliente, em nenhuma tela. Nao depende de
-- filtro no frontend, que poderia ser esquecido numa tela nova.

begin;

-- 1. A marca -----------------------------------------------------------------

alter table public.profiles
  add column if not exists conta_demo boolean not null default false;

comment on column public.profiles.conta_demo is
  'Conta de revisao de loja ou teste interno. Nunca entra em vendedores_publicos, '
  'portanto nunca aparece no radar, nas listagens nem no mapa do app Cliente. '
  'Somente sysadmin pode ligar ou desligar.';

create index if not exists profiles_conta_demo_idx
  on public.profiles (conta_demo)
  where conta_demo = true;

-- 2. Somente sysadmin muda a marca -------------------------------------------

create or replace function private.reject_conta_demo_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.conta_demo is distinct from old.conta_demo
     and coalesce((select auth.role()), '') <> 'service_role'
     and not private.is_admin() then
    raise exception
      'Somente um administrador pode marcar ou desmarcar uma conta de revisao.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.reject_conta_demo_change()
  from public, anon, authenticated, service_role;

drop trigger if exists profiles_guard_conta_demo on public.profiles;
create trigger profiles_guard_conta_demo
  before update of conta_demo on public.profiles
  for each row
  execute function private.reject_conta_demo_change();

-- 3. O gatilho publico passa a ignorar contas de revisao ----------------------

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

  -- A unica diferenca em relacao a versao anterior e a condicao conta_demo.
  -- Marcar uma conta existente como demo cai no ramo `else` e a remove da
  -- tabela publica na mesma transacao; desmarcar a traz de volta.
  if new.role in ('ambulante', 'restaurante', 'entregador')
     and coalesce(new.status, 'ativo') = 'ativo'
     and coalesce(new.conta_demo, false) = false then
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

revoke all on function public.sync_vendedor_publico()
  from public, anon, authenticated;

-- O gatilho precisa disparar quando conta_demo muda. Se o gatilho de producao
-- escutar apenas um conjunto de colunas, marcar a conta nao removeria nada.
--
-- Nao chuto o nome dele: descubro pelo catalogo todos os gatilhos de
-- public.profiles que executam esta funcao, removo o que houver, e crio um
-- unico canonico. Assim o resultado e o mesmo qualquer que seja o nome atual,
-- e nao fica gatilho duplicado rodando a funcao duas vezes por linha.
do $$
declare
  t record;
begin
  for t in
    select tg.tgname
      from pg_trigger tg
      join pg_proc p on p.oid = tg.tgfoid
      join pg_namespace np on np.oid = p.pronamespace
     where tg.tgrelid = 'public.profiles'::regclass
       and not tg.tgisinternal
       and np.nspname = 'public'
       and p.proname = 'sync_vendedor_publico'
  loop
    execute format('drop trigger %I on public.profiles', t.tgname);
    raise notice 'gatilho antigo removido: %', t.tgname;
  end loop;
end;
$$;

create trigger profiles_sync_vendedor_publico
  after insert or update or delete on public.profiles
  for each row
  execute function public.sync_vendedor_publico();

-- 4. Limpeza retroativa -------------------------------------------------------
-- Se alguma conta ja estiver marcada quando esta migration rodar, some agora.

delete from public.vendedores_publicos vp
 using public.profiles p
 where p.id = vp.id
   and coalesce(p.conta_demo, false) = true;

commit;
