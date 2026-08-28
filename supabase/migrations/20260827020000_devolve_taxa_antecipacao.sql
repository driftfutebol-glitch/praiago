-- Devolve a taxa de antecipacao quando o saque nao acontece.
--
-- O buraco: `antecipar_saldo` cobra a taxa na hora, gravando
-- `taxa_antecipacao` com status 'pago'. Depois, se o saque falha no gateway
-- (412 — "esse saldo ainda nao esta liquidado aqui"), a edge function cancela
-- o lancamento do saque e reconcilia a carteira, mas NAO toca na taxa. O
-- vendedor ficava sem o dinheiro e sem os 5%.
--
-- E nao e caso raro. A antecipacao so mexe em lancamento `em_espera`, e o
-- nosso prazo por metodo e o mesmo da Pagar.me (PIX D+1, debito D+2, credito
-- D+30). Ou seja: tudo que da para "antecipar" aqui esta, necessariamente,
-- retido la — o saque seguinte falha sempre.
--
-- Esta funcao nao conserta a antecipacao (isso exige chamar a API de
-- antecipacao do gateway, que ainda nao existe no projeto). Ela garante que
-- ninguem pague por um servico que nao foi prestado.

begin;

create or replace function private.devolver_taxa_antecipacao(p_vendedor uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_devolvido numeric := 0;
begin
  -- Só as taxas do dia, e só enquanto ainda não houve saque concluído. Uma
  -- taxa de semanas atrás pode ter sido de uma antecipação que funcionou;
  -- devolver aquilo seria inventar credito.
  with estornadas as (
    update public.financial_ledger fl
       set status = 'cancelado',
           descricao = 'Taxa devolvida: o saque nao foi concluido pelo provedor'
     where fl.vendedor_id = p_vendedor
       and fl.tipo = 'taxa_antecipacao'
       and fl.status = 'pago'
       and fl.created_at > now() - interval '24 hours'
       and not exists (
         select 1 from public.payouts p
          where p.vendedor_id = p_vendedor
            and p.status in ('pago', 'processando')
            and p.created_at > fl.created_at
       )
    returning fl.valor
  )
  select coalesce(sum(valor), 0) into v_devolvido from estornadas;

  if v_devolvido > 0 then
    perform public.reconciliar_carteira(p_vendedor);
  end if;

  return v_devolvido;
end;
$$;

comment on function private.devolver_taxa_antecipacao(uuid) is
  'Cancela a taxa de antecipacao das ultimas 24h quando o saque nao foi '
  'concluido pelo provedor. Evita cobrar por servico nao prestado enquanto a '
  'antecipacao de verdade (API do gateway) nao existe.';

revoke all on function private.devolver_taxa_antecipacao(uuid)
  from public, anon, authenticated;

commit;
