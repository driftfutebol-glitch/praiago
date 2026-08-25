-- Correcao dos dois bloqueadores P0 da exclusao de conta (auditoria do c968801).
--
-- P0-1: entregadores.verificacao_id apontava para verificacoes(id) sem clausula
-- on delete, ou seja NO ACTION. Como verificacoes.user_id cascateia de
-- auth.users, o deleteUser no fim do protocolo tentava apagar a verificacao e o
-- NO ACTION derrubava o DELETE inteiro -- depois de excluir-conta ja ter varrido
-- o Storage, anonimizado os pedidos e pseudonimizado os repasses. O protocolo
-- caia em failed e voltava a cada 6 horas para sempre: dados destruidos, conta
-- viva e titular banido em definitivo. A politica de insercao de entregadores
-- nao olhava o papel de quem escrevia, entao qualquer conta autenticada
-- conseguia armar esse travamento na propria conta.
--
-- P0-2: a rota action 'excluir' de admin-usuarios apagava o usuario direto no
-- Auth. Sem varredura de Storage, sem tombstone e sem protocolo aberto --
-- portanto private.account_deletion_forbids_subject continuava falso para aquele
-- UUID e todos os gatilhos e politicas da v1 ficavam inertes. Essa rota agora
-- abre protocolo, e o painel admin lista tambem restaurante e entregador, papeis
-- que a v1 nao previa porque so os apps Cliente e Ambulante pediam exclusao
-- sozinhos.

begin;

-- ===========================================================================
-- 1. entregadores.verificacao_id: a FK que travava o deleteUser
-- ===========================================================================

-- Nao chuto o nome da constraint. O banco de producao nasceu do
-- praiago-fase5-setup.sql rodado a mao no SQL Editor, entao o nome gerado pode
-- divergir do padrao. Removo qualquer FK de coluna unica sobre verificacao_id e
-- recrio uma so, com nome canonico.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = con.conkey[1]
     where con.conrelid = 'public.entregadores'::regclass
       and con.contype = 'f'
       and cardinality(con.conkey) = 1
       and att.attname = 'verificacao_id'
  loop
    execute format('alter table public.entregadores drop constraint %I', c.conname);
    raise notice 'FK antiga removida de entregadores.verificacao_id: %', c.conname;
  end loop;
end;
$$;

-- set null exige coluna anulavel; hoje ja e, mas o banco divergiu do repo antes.
alter table public.entregadores
  alter column verificacao_id drop not null;

-- Por que set null, e nao no action nem cascade:
--
-- no action e o bug: a verificacao morre no cascade de auth.users e a linha de
-- entregadores rejeita o DELETE do titular inteiro, ja com o Storage varrido.
--
-- cascade seria destruicao silenciosa e ainda por cima incompleta. Destruicao
-- porque resetarPerfil, no painel admin, apaga as verificacoes do usuario para
-- forcar um KYC novo -- com cascade isso levaria junto a equipe inteira do
-- restaurante, que nada tem a ver com o reset. Incompleta porque entregador
-- cadastrado e ainda nao enviado ao KYC tem verificacao_id nulo: sobreviveria ao
-- cascade com CPF e telefone intactos.
--
-- set null preserva a intencao do cadastro (a equipe continua existindo), nunca
-- trava o DELETE do titular, e devolve o entregador ao estado nao verificado --
-- que e exatamente o que status = 'pendente' ja representa nessa tabela. Apagar
-- o CPF e o telefone de terceiros vira responsabilidade explicita da limpeza do
-- protocolo, em excluir-conta, que pega tambem as linhas sem verificacao.
alter table public.entregadores
  add constraint entregadores_verificacao_id_fkey
    foreign key (verificacao_id)
    references public.verificacoes(id)
    on delete set null;

comment on constraint entregadores_verificacao_id_fkey on public.entregadores is
  'set null: apagar a verificacao nao pode nem apagar nem travar o registro do entregador.';

-- O set null varre entregadores a cada verificacao apagada. Sem indice isso vira
-- um seq scan por linha dentro do DELETE do titular.
create index if not exists entregadores_verificacao_idx
  on public.entregadores (verificacao_id)
  where verificacao_id is not null;

-- ===========================================================================
-- 2. entregadores.restaurante_id: o dono sem FK nenhuma
-- ===========================================================================
-- A coluna e uuid not null, guarda o id do restaurante dono e nao referencia
-- nada. As linhas guardam nome, telefone e CPF de terceiros -- o entregador
-- contratado, que nao tem conta no PraiaGo e nunca vai poder pedir exclusao por
-- conta propria. Sem FK, apagar o restaurante deixava esses dados orfaos para
-- sempre, sem titular e sem prazo.
--
-- A constraint entra NOT VALID de proposito. Nao sei quantas linhas orfas o
-- banco de producao ja acumulou, e uma migration de correcao de privacidade nao
-- pode apagar dado por conta propria. NOT VALID ja faz o cascade valer de agora
-- em diante e ja barra insercao nova apontando para restaurante inexistente; so
-- nao varre o passado.
--
-- Depois de conferir o numero reportado pela notice abaixo, o dono roda:
--   delete from public.entregadores e
--    where not exists (select 1 from public.profiles p where p.id = e.restaurante_id);
--   alter table public.entregadores
--     validate constraint entregadores_restaurante_id_fkey;
do $$
declare
  v_orfas bigint;
begin
  select count(*)
    into v_orfas
    from public.entregadores e
   where not exists (
     select 1 from public.profiles p where p.id = e.restaurante_id
   );

  if v_orfas > 0 then
    raise notice
      'entregadores: % linha(s) orfa(s) com CPF e telefone de terceiros sem restaurante dono. Leia o comentario do item 2 desta migration antes de validar a FK.',
      v_orfas;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.entregadores'::regclass
       and conname = 'entregadores_restaurante_id_fkey'
  ) then
    alter table public.entregadores
      add constraint entregadores_restaurante_id_fkey
        foreign key (restaurante_id)
        references public.profiles(id)
        on delete cascade
        not valid;
  end if;
end;
$$;

comment on constraint entregadores_restaurante_id_fkey on public.entregadores is
  'cascade: dado de terceiro so existe enquanto existir o restaurante que o cadastrou. NOT VALID ate o dono limpar as linhas orfas do passado.';

create index if not exists entregadores_restaurante_idx
  on public.entregadores (restaurante_id);

-- ===========================================================================
-- 3. Politicas de entregadores: quem pode plantar a linha
-- ===========================================================================
-- with check (private.is_admin() or restaurante_id = auth.uid()) nao olhava o
-- papel de quem insere nem a dona da verificacao apontada. Um cliente qualquer
-- criava a propria linha de entregadores, criava a propria verificacao e ligava
-- as duas -- armando na propria conta o travamento do item 1, de graca.
--
-- Uso drop policy if exists + create policy, e nao alter policy: o historico de
-- migrations deste projeto divergiu do banco, e alter policy sobre politica
-- inexistente levanta 42704 e aborta a migration inteira.

create or replace function private.is_restaurante_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'restaurante'
       and coalesce(p.status, 'ativo') = 'ativo'
  );
$$;

revoke all on function private.is_restaurante_ativo() from public, anon;
grant execute on function private.is_restaurante_ativo() to authenticated, service_role;

comment on function private.is_restaurante_ativo() is
  'Verdadeiro quando o ator autenticado e um restaurante ativo. Usada nas politicas de entregadores.';

create or replace function private.verificacao_do_ator(p_verificacao uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_verificacao is null
    or exists (
      select 1
        from public.verificacoes v
       where v.id = p_verificacao
         and v.user_id = (select auth.uid())
         and v.tipo = 'entregador'
    );
$$;

revoke all on function private.verificacao_do_ator(uuid) from public, anon;
grant execute on function private.verificacao_do_ator(uuid) to authenticated, service_role;

comment on function private.verificacao_do_ator(uuid) is
  'Verdadeiro quando a verificacao de entregador informada pertence ao ator autenticado. Impede apontar a equipe para o KYC de outra conta.';

drop policy if exists "entregadores_select_owner_or_admin" on public.entregadores;
create policy "entregadores_select_owner_or_admin"
on public.entregadores
for select
to authenticated
using (private.is_admin() or restaurante_id = (select auth.uid()));

drop policy if exists "entregadores_insert_owner_or_admin" on public.entregadores;
create policy "entregadores_insert_owner_or_admin"
on public.entregadores
for insert
to authenticated
with check (
  private.is_admin()
  or (
    restaurante_id = (select auth.uid())
    and private.is_restaurante_ativo()
    -- Mesma cerca das demais escritas de autoatendimento da v1: um JWT ainda
    -- valido nao pode criar dado novo depois que o protocolo de exclusao abre.
    and public.account_can_write()
    and private.verificacao_do_ator(verificacao_id)
  )
);

drop policy if exists "entregadores_update_owner_or_admin" on public.entregadores;
create policy "entregadores_update_owner_or_admin"
on public.entregadores
for update
to authenticated
using (private.is_admin() or restaurante_id = (select auth.uid()))
with check (
  private.is_admin()
  or (
    restaurante_id = (select auth.uid())
    and private.is_restaurante_ativo()
    and public.account_can_write()
    and private.verificacao_do_ator(verificacao_id)
  )
);

-- Apagar continua livre para o dono: remover dado nunca precisa da cerca de
-- exclusao, e a limpeza do protocolo depende de conseguir apagar essas linhas.
drop policy if exists "entregadores_delete_owner_or_admin" on public.entregadores;
create policy "entregadores_delete_owner_or_admin"
on public.entregadores
for delete
to authenticated
using (private.is_admin() or restaurante_id = (select auth.uid()));

-- ===========================================================================
-- 4. O protocolo passa a aceitar restaurante e entregador
-- ===========================================================================
-- A v1 restringiu role a cliente e ambulante porque so esses dois papeis tem app
-- movel e pedem exclusao sozinhos. A rota do painel admin, que agora tambem
-- passa pelo protocolo, precisa cobrir os quatro papeis de usuario final que a
-- tela de Usuarios lista.
--
-- get_account_deletion_blockers nao muda. Ela conhece dois conjuntos de
-- impedimentos, o de cliente e o de vendedor, e todo teste do conjunto de
-- vendedor e um 'existe pendencia com este uuid' -- independente do papel.
-- Restaurante e entregador vendem pela mesma cadeia (wallets, payouts,
-- financial_ledger, recebedor no Pagar.me), entao a Edge Function guarda o papel
-- real nesta coluna e normaliza para 'ambulante' na chamada da RPC, em vez de
-- duplicar 150 linhas de SQL so para repetir os mesmos EXISTS com outro nome.
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_attribute att
        on att.attrelid = con.conrelid
       and att.attnum = any (con.conkey)
     where con.conrelid = 'public.account_deletion_requests'::regclass
       and con.contype = 'c'
       and cardinality(con.conkey) = 1
       and att.attname = 'role'
  loop
    execute format(
      'alter table public.account_deletion_requests drop constraint %I',
      c.conname
    );
  end loop;
end;
$$;

alter table public.account_deletion_requests
  add constraint account_deletion_requests_role_check
    check (role in ('cliente', 'ambulante', 'restaurante', 'entregador'));

comment on column public.account_deletion_requests.role is
  'Papel real da conta no momento do pedido. cliente usa o conjunto de impedimentos de cliente; os demais usam o de vendedor.';

commit;
