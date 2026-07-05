// Reembolso de PEDIDO — admin aprova/nega. Ao aprovar:
//  • pago online (Mercado Pago) → dispara o estorno na API do MP (PIX volta
//    rápido, cartão demora dias, conforme a regra da operadora);
//  • pago no dinheiro → marca como aprovado p/ acerto manual (não há o que
//    estornar online).
import { corsHeaders, json } from '../_shared/cors.ts'
import { env, getSellerAccessToken, mpRequest, serviceClient } from '../_shared/mercadopago.ts'

function previsaoPorMetodo(pagamento: string): string {
  const p = (pagamento || '').toLowerCase()
  if (p === 'pix') return 'O valor volta pelo PIX em até 1 hora.'
  if (p.includes('credito') || p === 'cartao') return 'Volta no cartão de crédito em 5 a 10 dias úteis (regra da operadora).'
  if (p.includes('debito')) return 'Volta no cartão de débito em até 7 dias úteis.'
  return 'Reembolso combinado com o suporte (pagamento presencial).'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = serviceClient()

  // só admin autenticado
  const auth = req.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return json({ error: 'Não autorizado.' }, { status: 401 })
  const { data: userData } = await supabase.auth.getUser(token)
  const uid = userData?.user?.id
  if (!uid) return json({ error: 'Não autorizado.' }, { status: 401 })
  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', uid).maybeSingle()
  if (perfil?.role !== 'admin' && perfil?.role !== 'sysadmin') return json({ error: 'Apenas admin.' }, { status: 403 })

  try {
    const body = await req.json().catch(() => ({}))
    const pedidoId = String(body?.pedido_id || '')
    const acao = String(body?.acao || '') // 'aprovar' | 'negar'
    if (!pedidoId || !['aprovar', 'negar'].includes(acao)) return json({ error: 'Parâmetros inválidos.' }, { status: 400 })

    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, vendedor_id, pagamento, payment_provider, mercadopago_payment_id, total')
      .eq('id', pedidoId)
      .maybeSingle()
    if (!pedido) return json({ error: 'Pedido não encontrado.' }, { status: 404 })

    const now = new Date().toISOString()

    if (acao === 'negar') {
      await supabase.from('pedidos').update({ reembolso_status: 'negado', reembolso_resolvido_em: now }).eq('id', pedidoId)
      return json({ ok: true, status: 'negado' })
    }

    // APROVAR
    const online = pedido.payment_provider === 'mercadopago' && !!pedido.mercadopago_payment_id
    const previsao = previsaoPorMetodo(pedido.pagamento)

    if (online) {
      const accessToken = (await getSellerAccessToken(pedido.vendedor_id).catch(() => null)) || env('MERCADOPAGO_ACCESS_TOKEN')
      if (!accessToken) return json({ error: 'Token do Mercado Pago não configurado para estorno.' }, { status: 500 })
      // estorno total
      await mpRequest(`/v1/payments/${encodeURIComponent(pedido.mercadopago_payment_id)}/refunds`, accessToken, { method: 'POST', body: JSON.stringify({}) })
    }

    await supabase.from('pedidos').update({
      reembolso_status: 'processado',
      reembolso_previsao: previsao,
      reembolso_resolvido_em: now,
      payment_status: 'estornado',
      settlement_status: 'cancelado',
      status: 'cancelado',
    }).eq('id', pedidoId)

    // reverte os lançamentos financeiros do pedido
    await supabase.from('financial_ledger').update({ status: 'cancelado', settled_at: null }).eq('pedido_id', pedidoId)

    return json({ ok: true, status: 'processado', online, previsao })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao processar reembolso.' }, { status: 500 })
  }
})
