-- Conversa entre cliente e vendedor, dentro do pedido.
--
-- O que existia antes: um componente no app do cliente que fingia. Ele
-- adicionava, 900 ms depois de qualquer mensagem, um balao dizendo "Combinado!
-- To chegando" assinado com o NOME DA LOJA. O cliente lia aquilo como se o
-- restaurante tivesse respondido. Nenhuma dessas mensagens saia do aparelho —
-- o vendedor jamais soube que alguem falou com ele.
--
-- Isso nao e chat quebrado, e mensagem inventada em nome de um negocio real.
-- Aqui esta o de verdade.
--
-- Regras:
--   Le e escreve quem e parte do pedido — o cliente e o vendedor (seja pela
--   coluna vendedor_id, restaurante_id ou ambulante_id). Admin com permissao
--   de pedidos tambem le, porque disputa cai no colo dele.
--
--   Escrever so enquanto o pedido esta vivo, ou ate 4 horas depois da entrega
--   confirmada — a mesma janela do reembolso. Se ainda da para pedir dinheiro
--   de volta, tem que dar para conversar.
--
--   Ninguem edita e ninguem apaga. A conversa e prova em disputa; se desse
--   para apagar, a parte interessada apagaria.

begin;

create table if not exists public.mensagens_pedido (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  autor_id uuid not null,
  -- Preenchido pelo gatilho a partir do pedido, nunca pelo app: se viesse do
  -- cliente, qualquer um se anunciaria como a loja.
  autor_papel text not null check (autor_papel in ('cliente', 'vendedor')),
  texto text not null,
  criada_em timestamptz not null default now(),
  lida_em timestamptz,

  constraint mensagens_pedido_texto_tamanho
    check (length(btrim(texto)) between 1 and 1000)
);

comment on table public.mensagens_pedido is
  'Conversa entre cliente e vendedor dentro de um pedido. Sem update e sem '
  'delete de proposito: e prova em disputa de entrega ou reembolso.';

create index if not exists mensagens_pedido_conversa_idx
  on public.mensagens_pedido (pedido_id, criada_em);

create index if not exists mensagens_pedido_nao_lidas_idx
  on public.mensagens_pedido (pedido_id)
  where lida_em is null;

-- 1. Quem e parte do pedido ---------------------------------------------

create or replace function private.papel_no_pedido(p_pedido_id uuid, p_ator uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.cliente_id = p_ator then 'cliente'
    when p_ator in (p.vendedor_id, p.restaurante_id, p.ambulante_id) then 'vendedor'
    else null
  end
  from public.pedidos p
  where p.id = p_pedido_id;
$$;

comment on function private.papel_no_pedido(uuid, uuid) is
  'Devolve cliente, vendedor ou null. E o unico lugar que decide de que lado '
  'da conversa alguem esta — nao confie no que o app mandar.';

-- 2. A janela em que ainda da para escrever -----------------------------

create or replace function private.pedido_aceita_mensagem(p_pedido_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p.status not in ('entregue', 'cancelado')
    or p.entrega_confirmada_em > now() - interval '4 hours',
    false
  )
  from public.pedidos p
  where p.id = p_pedido_id;
$$;

-- 3. Gatilho: carimba autor e papel -------------------------------------

create or replace function public.preparar_mensagem_pedido()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ator uuid := auth.uid();
  v_papel text;
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if v_ator is null then
    raise exception 'Sem sessao para enviar mensagem.' using errcode = '42501';
  end if;

  v_papel := private.papel_no_pedido(new.pedido_id, v_ator);
  if v_papel is null then
    raise exception 'Voce nao participa deste pedido.' using errcode = '42501';
  end if;

  if not private.pedido_aceita_mensagem(new.pedido_id) then
    raise exception 'Esta conversa foi encerrada. Fale com o suporte.'
      using errcode = '23514';
  end if;

  -- O app nao escolhe quem ele e.
  new.autor_id := v_ator;
  new.autor_papel := v_papel;
  new.criada_em := now();
  new.lida_em := null;
  new.texto := left(btrim(new.texto), 1000);

  return new;
end;
$$;

revoke all on function public.preparar_mensagem_pedido()
from public, anon, authenticated;

drop trigger if exists trg_preparar_mensagem_pedido on public.mensagens_pedido;
create trigger trg_preparar_mensagem_pedido
before insert on public.mensagens_pedido
for each row
execute function public.preparar_mensagem_pedido();

-- 4. RLS ----------------------------------------------------------------

alter table public.mensagens_pedido enable row level security;

revoke all on table public.mensagens_pedido from anon;
grant select, insert on table public.mensagens_pedido to authenticated;
grant all on table public.mensagens_pedido to service_role;

drop policy if exists mensagens_pedido_select on public.mensagens_pedido;
create policy mensagens_pedido_select
  on public.mensagens_pedido
  for select to authenticated
  using (
    private.papel_no_pedido(pedido_id, (select auth.uid())) is not null
    or private.has_permission('pedidos')
  );

drop policy if exists mensagens_pedido_insert on public.mensagens_pedido;
create policy mensagens_pedido_insert
  on public.mensagens_pedido
  for insert to authenticated
  with check (
    private.papel_no_pedido(pedido_id, (select auth.uid())) is not null
  );

-- Sem policy de update e de delete: sem policy, ninguem faz.

-- 5. Marcar como lida ---------------------------------------------------
-- Update direto esta bloqueado (nao ha policy). A leitura passa por aqui, e a
-- funcao so mexe em `lida_em` das mensagens que a OUTRA ponta escreveu — nao
-- da para marcar as suas proprias, nem tocar em texto.

create or replace function public.marcar_mensagens_lidas(p_pedido_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_papel text := private.papel_no_pedido(p_pedido_id, auth.uid());
  v_n integer;
begin
  if v_papel is null then
    raise exception 'Voce nao participa deste pedido.' using errcode = '42501';
  end if;

  update public.mensagens_pedido
     set lida_em = now()
   where pedido_id = p_pedido_id
     and lida_em is null
     and autor_papel <> v_papel;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.marcar_mensagens_lidas(uuid) from public, anon;
grant execute on function public.marcar_mensagens_lidas(uuid) to authenticated;

-- 6. Tempo real ---------------------------------------------------------
-- Sem isto o outro lado so veria a mensagem ao recarregar a tela, e um chat
-- que precisa de refresh nao e um chat.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'mensagens_pedido'
    ) then
      alter publication supabase_realtime add table public.mensagens_pedido;
      raise notice 'mensagens_pedido entrou no realtime';
    end if;
  else
    raise notice 'publicacao supabase_realtime ausente';
  end if;
end;
$$;

commit;
