-- Chamado de verificacao da conta (KYC), atendido a mao.
--
-- POR QUE ISTO EXISTE
--
-- O jeito automatico esta pronto e nao funciona: `POST /recipients/{id}/
-- kyc_link` na Pagar.me responde 401 "IP de origem nao autorizado" para esta
-- conta, de qualquer IP — conferido do servidor e da maquina do dono, com a
-- allowlist vazia. A MESMA operacao funciona pelo painel deles, que usa uma
-- API interna autenticada por sessao de login. Enquanto a Pagar.me nao libera
-- o endpoint publico, alguem precisa gerar o link no painel e entregar.
--
-- Este arquivo transforma esse "alguem entrega por fora" num fluxo de dentro
-- do app: o vendedor abre um chamado, o admin cola o link na resposta, o
-- vendedor recebe aviso e abre. Quando a conta e aprovada, o chamado fecha
-- sozinho.
--
-- Reaproveita `tickets` e `ticket_mensagens`, que ja existem e ja tem tela de
-- atendimento no admin. Tabela nova aqui seria uma segunda caixa de entrada
-- para o admin vigiar, e ninguem vigia duas.

begin;

-- 1. O dono passa a enxergar o proprio chamado -------------------------------
--
-- `ticket_mensagens` ja deixava o dono ler as mensagens, mas `tickets` era
-- select so de admin. Ou seja: dava para ler a conversa e nao dava para saber
-- se o chamado ainda estava aberto. Sem isto, a tela do vendedor nao tem como
-- fechar sozinha.

drop policy if exists "tickets_select_dono" on public.tickets;
create policy "tickets_select_dono"
on public.tickets
for select
to authenticated
using (usuario_id = (select auth.uid()));

-- 2. Abrir (ou reencontrar) o chamado ----------------------------------------

create or replace function public.abrir_chamado_kyc()
returns table (ticket_id uuid, criado_agora boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_perfil public.profiles%rowtype;
  v_recebedor public.seller_recipients%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Precisa estar logado.' using errcode = '42501';
  end if;

  select * into v_perfil from public.profiles where id = v_uid;
  if not found then
    raise exception 'Perfil nao encontrado.' using errcode = '42501';
  end if;

  -- Sem conta de recebimento nao ha o que verificar, e um chamado aqui so
  -- geraria trabalho para o admin descobrir que o vendedor errou de tela.
  select * into v_recebedor
    from public.seller_recipients where vendedor_id = v_uid;
  if not found or v_recebedor.recipient_id is null then
    raise exception 'Cadastre a sua conta bancaria na Carteira antes de pedir a verificacao.'
      using errcode = '23514';
  end if;

  if v_recebedor.status = 'ativo' then
    raise exception 'A sua conta ja esta verificada.' using errcode = '23514';
  end if;

  -- Um chamado por vendedor. Sem esta busca, cada toque no botao abriria um
  -- chamado novo e o admin veria a mesma pessoa dez vezes na fila.
  select id into v_id
    from public.tickets
   where usuario_id = v_uid
     and origem = 'kyc'
     and status in ('aberto', 'em_andamento')
   order by created_at desc
   limit 1;

  if v_id is not null then
    return query select v_id, false;
    return;
  end if;

  insert into public.tickets (
    plataforma, usuario_id, usuario_nome, usuario_email,
    assunto, mensagem, status, prioridade, origem, nao_lida_admin
  )
  values (
    case when v_perfil.role = 'restaurante' then 'restaurante' else 'ambulante' end,
    v_uid,
    coalesce(nullif(btrim(v_perfil.nome), ''), 'Vendedor'),
    v_perfil.email,
    'Verificacao da conta de recebimento',
    'O vendedor pediu a liberacao da movimentacao do saldo. '
      || 'Recebedor: ' || coalesce(v_recebedor.recipient_id, '(sem id)') || '. '
      || 'Gere o link no painel da Pagar.me e responda este chamado com ele.',
    'aberto', 'urgente', 'kyc', true
  )
  returning id into v_id;

  insert into public.ticket_mensagens (ticket_id, autor, mensagem)
  values (
    v_id, 'sistema',
    'Chamado aberto. Estamos gerando o seu link de verificacao — ele chega aqui '
      || 'nesta conversa e voce recebe um aviso no aparelho. Pode fechar esta tela: '
      || 'o chamado continua aberto e nao some da sua conta.'
  );

  return query select v_id, true;
end;
$$;

comment on function public.abrir_chamado_kyc() is
  'Abre o chamado de verificacao do recebedor, ou devolve o que ja estava aberto. '
  'Um por vendedor: tocar o botao de novo nao enfileira duplicado.';

revoke all on function public.abrir_chamado_kyc() from public, anon;
grant execute on function public.abrir_chamado_kyc() to authenticated;

-- 3. Resposta do admin vira aviso no aparelho --------------------------------
--
-- `notificacoes_vendedor` ja existe e ja chega por realtime com toast. O
-- gatilho so liga uma coisa na outra.

create or replace function private.avisar_resposta_chamado_kyc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if new.autor <> 'admin' then
    return new;
  end if;

  select * into v_ticket from public.tickets where id = new.ticket_id;
  if not found or v_ticket.origem <> 'kyc' or v_ticket.usuario_id is null then
    return new;
  end if;

  insert into public.notificacoes_vendedor (vendedor_id, tipo, titulo, mensagem, acao)
  values (
    v_ticket.usuario_id,
    'kyc_link',
    'Seu link de verificacao chegou',
    'Abra a Carteira para fazer a verificacao. O link vale poucos minutos.',
    '/carteira'
  );

  -- Sai de 'aberto' assim que alguem responde: a fila do admin passa a
  -- mostrar so quem ainda nao foi atendido.
  update public.tickets
     set status = 'em_andamento', nao_lida_usuario = true, updated_at = now()
   where id = new.ticket_id and status = 'aberto';

  return new;
end;
$$;

revoke all on function private.avisar_resposta_chamado_kyc() from public, anon, authenticated;

drop trigger if exists trg_avisar_resposta_chamado_kyc on public.ticket_mensagens;
create trigger trg_avisar_resposta_chamado_kyc
after insert on public.ticket_mensagens
for each row
execute function private.avisar_resposta_chamado_kyc();

-- 4. Aprovou no gateway, fecha o chamado -------------------------------------
--
-- Estende a funcao que a varredura de 15 minutos ja chama. O vendedor nao
-- precisa fechar nada a mao, e o admin nao precisa lembrar.

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

  -- O aviso so nasce na virada. Sem esta guarda, a sincronizacao agendada
  -- encheria a caixa do vendedor de "aprovado" a cada volta.
  if not v_mudou then return false; end if;

  update public.seller_recipients
     set status = coalesce(p_status, status),
         kyc_status = coalesce(p_kyc_status, kyc_status),
         kyc_motivo = p_motivo,
         aprovado_em = case when p_status = 'ativo' and aprovado_em is null
                            then now() else aprovado_em end,
         updated_at = now()
   where vendedor_id = p_vendedor;

  if p_status = 'ativo' then
    insert into public.notificacoes_vendedor (vendedor_id, tipo, titulo, mensagem, acao)
    values (
      p_vendedor, 'kyc_aprovado',
      'Cadastro aprovado',
      'Sua conta de recebimento foi aprovada. Voce ja pode vender e sacar o seu dinheiro.',
      '/carteira'
    );

    -- Fecha o chamado de verificacao que estiver aberto: o motivo dele
    -- deixou de existir. O `returning` alimenta a mensagem de encerramento,
    -- entao fecha e escreve exatamente nos mesmos chamados — sem depender de
    -- reler por janela de tempo, que erraria se duas viradas caissem juntas.
    with fechados as (
      update public.tickets
         set status = 'resolvido', nao_lida_usuario = true, updated_at = now()
       where usuario_id = p_vendedor
         and origem = 'kyc'
         and status in ('aberto', 'em_andamento')
      returning id
    )
    insert into public.ticket_mensagens (ticket_id, autor, mensagem)
    select id, 'sistema',
           'Conta verificada e liberada. Este chamado foi encerrado — voce ja pode sacar.'
      from fechados;

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

-- 5. Realtime ----------------------------------------------------------------
--
-- Sem isto a tela do vendedor so descobre a resposta se ele fechar e abrir o
-- app — que e exatamente a espera que este chamado existe para evitar.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ticket_mensagens'
  ) then
    alter publication supabase_realtime add table public.ticket_mensagens;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tickets'
  ) then
    alter publication supabase_realtime add table public.tickets;
  end if;
end;
$$;

commit;
