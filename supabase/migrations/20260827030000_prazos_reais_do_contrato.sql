-- Prazos de liquidacao: alinhar com o contrato real da Pagar.me.
--
-- O `settlement_config` foi preenchido em julho com valores de referencia, nao
-- com o contrato. Conferindo o painel da conta agora:
--
--   metodo    tinhamos aqui   contrato real
--   ------------------------------------------
--   PIX       D+1             na hora (D+0)
--   credito   D+30            15 dias corridos
--   debito    D+2             (nao consta; mantido)
--
-- As duas diferencas seguravam dinheiro do vendedor MAIS tempo do que o
-- necessario: um dia a mais no PIX, e o dobro do prazo no credito. Como a
-- nossa regra e que decide quando o saldo fica `disponivel`, era a nossa
-- tabela — nao a Pagar.me — que estava atrasando o repasse.
--
-- Isto NAO mexe na trava de entrega confirmada. Essa e nossa, existe por outro
-- motivo (nao liberar dinheiro de pedido que nao chegou) e continua valendo
-- por cima do prazo do gateway.

begin;

update public.settlement_config
   set delay_days = 0, updated_at = now()
 where provider = 'pagarme' and metodo = 'pix';

update public.settlement_config
   set delay_days = 15, updated_at = now()
 where provider = 'pagarme' and metodo = 'credito';

comment on table public.settlement_config is
  'Prazo, por provedor e metodo, entre o pagamento e o dinheiro ficar '
  'disponivel. Deve espelhar o CONTRATO do provedor — quando divergir para '
  'mais, estamos segurando dinheiro do vendedor por conta propria.';

-- Taxa de antecipacao: separar o custo do provedor da nossa margem ---------
--
-- Ate aqui existia so `saque_rapido_percent`, um numero unico, e o comentario
-- da coluna dizia que era receita pura. Com o contrato na mao isso ficou
-- errado: a Pagar.me cobra 1,7% pela antecipacao dela. Se a gente cobrar so a
-- nossa margem, a diferenca sai do nosso bolso sem ninguem perceber.
--
-- Duas colunas, entao, e o total sendo a soma. O vendedor continua vendo UM
-- percentual na tela (a soma) — o que ele precisa saber e quanto vai pagar,
-- nao como reparte entre nos e o provedor.

alter table public.payment_settings
  add column if not exists antecipacao_taxa_gateway_percent numeric not null default 1.7;

comment on column public.payment_settings.antecipacao_taxa_gateway_percent is
  'Taxa de antecipacao cobrada pelo PROVEDOR (contrato Pagar.me: 1,7%). Custo, '
  'nao receita. A margem da plataforma e saque_rapido_percent; o vendedor paga '
  'a soma das duas.';

comment on column public.payment_settings.saque_rapido_percent is
  'MARGEM da plataforma na antecipacao, por cima da taxa do provedor '
  '(antecipacao_taxa_gateway_percent). O que o vendedor paga e a soma.';

comment on column public.payment_settings.saque_rapido_percent_credito is
  'MARGEM da plataforma na antecipacao de credito, por cima da taxa do '
  'provedor. O que o vendedor paga e a soma.';

-- Passa a cobrar provedor + margem --------------------------------------

create or replace function private.account_deletion_unchecked_antecipar_saldo(
  p_vendedor uuid,
  p_grupo text default 'rapido'
)
returns table(liberado numeric, taxa numeric)
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pct numeric; v_ativo boolean; v_bruto numeric; v_taxa numeric;
  v_pct_gateway numeric;
begin
  if auth.uid() is distinct from p_vendedor then raise exception 'sem permissao'; end if;
  if p_grupo not in ('rapido', 'credito') then raise exception 'grupo invalido'; end if;

  select coalesce(antecipacao_taxa_gateway_percent, 0)
    into v_pct_gateway from public.payment_settings where id is true;

  if p_grupo = 'credito' then
    select coalesce(saque_rapido_percent_credito, 8), coalesce(saque_rapido_credito_ativo, false)
      into v_pct, v_ativo from public.payment_settings where id is true;
    if not v_ativo then
      raise exception 'A antecipacao de vendas no cartao de credito ainda nao esta disponivel.';
    end if;
  else
    select coalesce(saque_rapido_percent, 5), coalesce(saque_rapido_ativo, false)
      into v_pct, v_ativo from public.payment_settings where id is true;
    if not v_ativo then
      raise exception 'O saque rapido esta indisponivel no momento.';
    end if;
  end if;

  -- Provedor + margem. Antes cobrava so a margem e a taxa da Pagar.me saia do
  -- nosso resultado sem aparecer em lugar nenhum.
  v_pct := v_pct + v_pct_gateway;

  with liberados as (
    update public.financial_ledger fl
       set status = 'disponivel', settled_at = now(), descricao = 'Liberado por saque rapido'
     where fl.vendedor_id = p_vendedor
       and fl.tipo = 'repasse_vendedor'
       and fl.status = 'em_espera'
       and (
         select case when p_grupo = 'credito'
                     then coalesce(pe.pagamento,'') = 'credito_online'
                     else coalesce(pe.pagamento,'pix') <> 'credito_online' end
           from public.pedidos pe where pe.id = fl.pedido_id
       )
    returning fl.valor
  )
  select coalesce(sum(valor), 0) into v_bruto from liberados;

  if v_bruto <= 0 then
    raise exception 'Voce nao tem saldo desse tipo pra antecipar.';
  end if;

  v_taxa := round(v_bruto * v_pct / 100, 2);

  if v_taxa > 0 then
    insert into public.financial_ledger (vendedor_id, tipo, valor, status, descricao, provider)
    values (p_vendedor, 'taxa_antecipacao', v_taxa, 'pago',
            format('Taxa de antecipacao%s (%s%%)',
                   case when p_grupo = 'credito' then ' do credito' else '' end, v_pct),
            'praiago');
  end if;

  perform public.reconciliar_carteira(p_vendedor);
  return query select v_bruto, v_taxa;
end;
$$;

commit;
