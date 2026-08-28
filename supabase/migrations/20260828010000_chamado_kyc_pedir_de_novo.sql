-- O vendedor pedindo outro link reacende o chamado.
--
-- O link de verificacao da Pagar.me vale poucos minutos. Ate agora, depois de
-- vencido, o vendedor ficava olhando um botao morto: tocava, abria uma pagina
-- expirada e nao tinha como avisar ninguem. E o admin nao tinha como saber
-- que precisava gerar outro — o chamado ja estava em `em_andamento`, fora da
-- fila de quem espera atendimento.
--
-- Agora, quando o DONO do chamado escreve numa conversa de KYC, o chamado
-- volta para `aberto` e volta a piscar como nao lida no painel. E o espelho
-- do gatilho que ja existia no sentido admin -> vendedor.

begin;

create or replace function private.reacender_chamado_kyc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  -- So mensagem de gente do outro lado. 'admin' ja tem o gatilho dele e
  -- 'sistema' e o proprio banco falando — nenhum dos dois pede atendimento.
  if new.autor <> 'usuario' then
    return new;
  end if;

  select * into v_ticket from public.tickets where id = new.ticket_id;
  if not found or v_ticket.origem <> 'kyc' then
    return new;
  end if;

  update public.tickets
     set status = case when status = 'resolvido' then status else 'aberto' end,
         nao_lida_admin = true,
         updated_at = now()
   where id = new.ticket_id;

  return new;
end;
$$;

comment on function private.reacender_chamado_kyc() is
  'Mensagem do vendedor num chamado de KYC devolve o chamado para a fila do '
  'admin. Chamado ja resolvido continua resolvido: reabrir por mensagem '
  'solta faria conta aprovada voltar a pedir atendimento.';

revoke all on function private.reacender_chamado_kyc() from public, anon, authenticated;

drop trigger if exists trg_reacender_chamado_kyc on public.ticket_mensagens;
create trigger trg_reacender_chamado_kyc
after insert on public.ticket_mensagens
for each row
execute function private.reacender_chamado_kyc();

commit;
