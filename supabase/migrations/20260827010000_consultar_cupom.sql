-- Resgate de cupom por codigo.
--
-- A tabela `cupons` so deixa o cliente enxergar cupom publico (policy
-- cupons_select_public_active). Isso esta certo: cupom privado nao pode
-- aparecer numa listagem. Mas o efeito colateral era que cupom privado nao
-- existia para o app — nem digitando o codigo dava para usar, porque o SELECT
-- voltava vazio. A coluna `publico` existia sem servir para nada.
--
-- Esta funcao e o unico caminho para resgatar por codigo. Ela responde sobre
-- UM codigo exato, e devolve so o que a tela precisa mostrar. Quem nao sabe o
-- codigo continua sem ver nada.
--
-- O que ela NAO decide: se o cupom vale para a loja do carrinho e se o
-- subtotal alcanca o minimo. Isso depende do carrinho e fica no checkout, que
-- e quem conhece os dois.

begin;

create or replace function public.consultar_cupom(p_codigo text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := auth.uid();
  v_codigo text := upper(btrim(coalesce(p_codigo, '')));
  c public.cupons%rowtype;
begin
  -- Exigir sessao nao e burocracia: sem isso a funcao vira um oraculo aberto
  -- para adivinhar codigo por tentativa, de graca e sem rastro.
  if v_cliente is null then
    return jsonb_build_object('ok', false, 'motivo', 'entre_na_conta');
  end if;

  if v_codigo = '' or length(v_codigo) > 40 then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado');
  end if;

  select * into c from public.cupons where upper(codigo) = v_codigo limit 1;

  -- Inexistente e inativo respondem igual, de proposito: distinguir os dois
  -- entregaria quais codigos existem.
  if not found or not coalesce(c.ativo, false) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrado');
  end if;

  if c.data_inicio is not null and c.data_inicio > now() then
    return jsonb_build_object('ok', false, 'motivo', 'nao_liberado',
      'liberado_em', c.data_inicio);
  end if;

  if c.validade is not null and c.validade < now() then
    return jsonb_build_object('ok', false, 'motivo', 'expirado');
  end if;

  if c.limite_uso is not null and coalesce(c.usos, 0) >= c.limite_uso then
    return jsonb_build_object('ok', false, 'motivo', 'esgotado');
  end if;

  if exists (
    select 1 from public.cupom_usos u
     where u.cliente_id = v_cliente
       and upper(u.cupom_codigo) = v_codigo
  ) then
    return jsonb_build_object('ok', false, 'motivo', 'ja_usado');
  end if;

  return jsonb_build_object(
    'ok', true,
    'codigo', c.codigo,
    'titulo', c.titulo,
    'descricao', c.descricao,
    'tipo', c.tipo,
    'valor', c.valor,
    'valor_minimo', c.valor_minimo,
    'vendedor_id', c.vendedor_id,
    'vendedor_tipo', c.vendedor_tipo,
    'validade', c.validade,
    'publico', c.publico
  );
end;
$$;

comment on function public.consultar_cupom(text) is
  'Valida UM codigo de cupom para o cliente logado, inclusive cupom privado, '
  'sem expor a tabela. Nao avalia loja nem valor minimo: isso depende do '
  'carrinho e fica no checkout.';

revoke all on function public.consultar_cupom(text) from public, anon;
grant execute on function public.consultar_cupom(text) to authenticated;

commit;
