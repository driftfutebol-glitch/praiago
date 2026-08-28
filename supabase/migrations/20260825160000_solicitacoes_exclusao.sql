-- Caixa de entrada de pedidos de exclusao de conta.
--
-- A Apple exige que o usuario consiga INICIAR a exclusao de dentro do app.
-- Nao exige que ela seja instantanea. Este fluxo cumpre a exigencia com uma
-- peca pequena: o titular abre um pedido pelo app, o pedido cai no painel
-- admin com os dados que ele informou, e a equipe conclui manualmente.
--
-- Esta migration NAO toca em nenhuma tabela, funcao, politica ou gatilho
-- existente. Ela so cria uma tabela nova e as politicas dela. E o tipo de
-- alteracao que nao tem como quebrar o que ja esta rodando.

begin;

create table if not exists public.solicitacoes_exclusao (
  id uuid primary key default gen_random_uuid(),

  -- Identidade autoritativa: vem de auth.uid(), nunca do formulario. Os campos
  -- informados abaixo servem para a equipe conferir, nao para identificar.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- O que o titular digitou. Guardado como texto livre de propósito: se ele
  -- errar o proprio e-mail, a equipe precisa ver o que ele escreveu para
  -- entender a confusao, em vez de receber um dado ja normalizado.
  email_informado text,
  nome_informado text,
  cpf_informado text,
  papel_informado text,

  motivo text,

  status text not null default 'pendente'
    check (status in ('pendente', 'concluida', 'recusada')),

  criada_em timestamptz not null default now(),
  processada_em timestamptz,
  processada_por uuid references auth.users(id) on delete set null,
  observacao text
);

comment on table public.solicitacoes_exclusao is
  'Pedidos de exclusao de conta abertos pelo proprio titular dentro do app. '
  'A equipe processa manualmente pelo painel admin.';

comment on column public.solicitacoes_exclusao.user_id is
  'Sempre auth.uid() de quem abriu. Os campos *_informado sao apenas o que a '
  'pessoa digitou, para conferencia humana.';

-- Um pedido aberto por vez. Sem isto, tocar o botao tres vezes gera tres
-- linhas e a equipe processa a mesma conta em duplicidade.
create unique index if not exists solicitacoes_exclusao_pendente_unica
  on public.solicitacoes_exclusao (user_id)
  where status = 'pendente';

create index if not exists solicitacoes_exclusao_fila_idx
  on public.solicitacoes_exclusao (status, criada_em desc);

alter table public.solicitacoes_exclusao enable row level security;

-- O titular abre o proprio pedido e acompanha o proprio pedido. Nada mais.
-- Nao pode editar depois de aberto, nem apagar para esconder o rastro.
drop policy if exists solicitacoes_exclusao_insert_own on public.solicitacoes_exclusao;
create policy solicitacoes_exclusao_insert_own
  on public.solicitacoes_exclusao
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'pendente'
    and processada_em is null
    and processada_por is null
  );

drop policy if exists solicitacoes_exclusao_select_own on public.solicitacoes_exclusao;
create policy solicitacoes_exclusao_select_own
  on public.solicitacoes_exclusao
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists solicitacoes_exclusao_update_admin on public.solicitacoes_exclusao;
create policy solicitacoes_exclusao_update_admin
  on public.solicitacoes_exclusao
  for update to authenticated
  using (private.is_admin())
  with check (private.is_admin());

revoke delete on public.solicitacoes_exclusao from anon, authenticated;
grant select, insert on public.solicitacoes_exclusao to authenticated;
grant update on public.solicitacoes_exclusao to authenticated;

commit;
