-- Acompanhamento do KYC do recebedor, do cadastro ate a aprovacao.
--
-- Hoje o vendedor cadastra a conta bancaria, a sub-conta nasce em AFILIACAO, e
-- acabou: ninguem avisa que falta liberar a movimentacao do saldo, ninguem
-- avisa quando a Pagar.me aprova. Ele so descobre tentando sacar e levando
-- erro — foi exatamente o que aconteceu.
--
-- Tres pecas aqui:
--   1. Uma caixa de avisos POR VENDEDOR. A tabela `avisos` que existia e
--      broadcast por publico ('ambulantes', 'todos'), nao serve para dizer
--      algo a uma pessoa.
--   2. Um registrador da mudanca de status do recebedor, que so avisa quando
--      o status REALMENTE muda — a sincronizacao roda de tempos em tempos e
--      nao pode gerar aviso repetido a cada volta.
--   3. O agendamento que chama a sincronizacao sozinho.

begin;

-- 1. Avisos por vendedor -------------------------------------------------

create table if not exists public.notificacoes_vendedor (
  id uuid primary key default gen_random_uuid(),
  vendedor_id uuid not null,
  tipo text not null,
  titulo text not null,
  mensagem text not null,
  /** Rota do app para onde o toque leva, quando faz sentido. */
  acao text,
  lida_em timestamptz,
  criada_em timestamptz not null default now()
);

comment on table public.notificacoes_vendedor is
  'Avisos dirigidos a UM vendedor (KYC aprovado, conta recusada, etc). '
  'Diferente de `avisos`, que e broadcast por publico.';

create index if not exists notificacoes_vendedor_caixa_idx
  on public.notificacoes_vendedor (vendedor_id, criada_em desc);

create index if not exists notificacoes_vendedor_nao_lidas_idx
  on public.notificacoes_vendedor (vendedor_id)
  where lida_em is null;

alter table public.notificacoes_vendedor enable row level security;

revoke all on table public.notificacoes_vendedor from anon;
grant select on table public.notificacoes_vendedor to authenticated;
grant all on table public.notificacoes_vendedor to service_role;

drop policy if exists notificacoes_vendedor_select_dono on public.notificacoes_vendedor;
create policy notificacoes_vendedor_select_dono
  on public.notificacoes_vendedor
  for select to authenticated
  using (vendedor_id = (select auth.uid()) or private.has_permission('usuarios'));

-- Sem policy de insert/update/delete para `authenticated`: quem escreve aviso
-- e o servidor. Vendedor criando o proprio "KYC aprovado" seria enfeite.

create or replace function public.marcar_notificacoes_vendedor_lidas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.notificacoes_vendedor
     set lida_em = now()
   where vendedor_id = auth.uid() and lida_em is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.marcar_notificacoes_vendedor_lidas() from public, anon;
grant execute on function public.marcar_notificacoes_vendedor_lidas() to authenticated;

-- 2. Registrar a mudanca de status --------------------------------------
-- Chamada pela edge function depois de perguntar ao gateway. Devolve true
-- quando houve mudanca — e so nesse caso o aviso e criado.

create or replace function private.registrar_status_recebedor(
  p_vendedor uuid,
  p_status text,
  p_kyc_status text,
  p_motivo text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes public.seller_recipients%rowtype;
  v_mudou boolean;
begin
  select * into v_antes from public.seller_recipients where vendedor_id = p_vendedor;
  if not found then return false; end if;

  v_mudou := coalesce(v_antes.status, '') is distinct from coalesce(p_status, '')
          or coalesce(v_antes.kyc_status, '') is distinct from coalesce(p_kyc_status, '');

  if not v_mudou then return false; end if;

  update public.seller_recipients
     set status = coalesce(p_status, status),
         kyc_status = coalesce(p_kyc_status, kyc_status),
         kyc_motivo = p_motivo,
         aprovado_em = case when p_status = 'ativo' and aprovado_em is null
                            then now() else aprovado_em end,
         updated_at = now()
   where vendedor_id = p_vendedor;

  -- O aviso so nasce na virada. Sem esta guarda, a sincronizacao agendada
  -- encheria a caixa do vendedor de "aprovado" a cada volta.
  if p_status = 'ativo' then
    insert into public.notificacoes_vendedor (vendedor_id, tipo, titulo, mensagem, acao)
    values (
      p_vendedor, 'kyc_aprovado',
      'Cadastro aprovado',
      'Sua conta de recebimento foi aprovada. Voce ja pode vender e sacar o seu dinheiro.',
      '/carteira'
    );
  elsif p_kyc_status in ('recusado', 'refused', 'rejected') then
    insert into public.notificacoes_vendedor (vendedor_id, tipo, titulo, mensagem, acao)
    values (
      p_vendedor, 'kyc_recusado',
      'Cadastro nao aprovado',
      coalesce(nullif(btrim(p_motivo), ''),
               'A verificacao da sua conta de recebimento nao foi aprovada. Confira seus dados na Carteira.'),
      '/carteira'
    );
  end if;

  return true;
end;
$$;

revoke all on function private.registrar_status_recebedor(uuid, text, text, text)
  from public, anon, authenticated;

-- 3. Tempo real ---------------------------------------------------------
-- Com o app aberto o aviso aparece na hora, sem esperar a proxima leitura.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'notificacoes_vendedor'
    ) then
      alter publication supabase_realtime add table public.notificacoes_vendedor;
    end if;
  end if;
end;
$$;

commit;
