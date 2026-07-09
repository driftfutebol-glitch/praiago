import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { env, getSellerAccessToken, mpRequest, serviceClient, type MercadoPagoPayment } from '../_shared/mercadopago.ts'

type Body = {
  pedido_id?: string
}

type PaymentSearchResponse = {
  results?: MercadoPagoPayment[]
}

function mapPaymentStatus(status?: string) {
  if (status === 'approved') return 'aprovado'
  if (status === 'rejected') return 'rejeitado'
  if (status === 'cancelled') return 'cancelado'
  if (status === 'refunded') return 'estornado'
  if (status === 'charged_back') return 'chargeback'
  return 'pendente'
}

function isTerminal(status: string) {
  return ['rejeitado', 'cancelado', 'estornado', 'chargeback'].includes(status)
}

async function findPayment(pedidoId: string, paymentId: string | null, accessToken: string) {
  if (paymentId) {
    return await mpRequest<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`, accessToken)
  }

  const search = await mpRequest<PaymentSearchResponse>(
    `/v1/payments/search?external_reference=${encodeURIComponent(pedidoId)}&sort=date_created&criteria=desc&limit=5`,
    accessToken,
  )
  const payments = search.results || []
  return payments.find(payment => payment.status === 'approved') || payments[0] || null
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await readJson<Body>(req)
    if (!body.pedido_id) return json({ error: 'Informe pedido_id.' }, { status: 400 })

    const supabase = serviceClient()
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('id,vendedor_id,status,payment_status,mercadopago_payment_id')
      .eq('id', body.pedido_id)
      .maybeSingle()

    if (error) throw error
    if (!pedido) return json({ error: 'Pedido nao encontrado.' }, { status: 404 })

    const currentPedidoStatus = String(pedido.status || 'aguardando_pagamento')
    const currentPaymentStatus = String(pedido.payment_status || 'pendente')
    if (currentPaymentStatus === 'aprovado' && currentPedidoStatus !== 'aguardando_pagamento') {
      return json({ ok: true, payment_status: currentPaymentStatus, pedido_status: currentPedidoStatus })
    }

    const sellerAccessToken = pedido.vendedor_id ? await getSellerAccessToken(String(pedido.vendedor_id)) : null
    const accessToken = sellerAccessToken || env('MERCADOPAGO_ACCESS_TOKEN')
    if (!accessToken) return json({ error: 'Token Mercado Pago nao configurado.' }, { status: 409 })

    const payment = await findPayment(String(pedido.id), pedido.mercadopago_payment_id ? String(pedido.mercadopago_payment_id) : null, accessToken)
    if (!payment) {
      return json({ ok: true, payment_status: currentPaymentStatus, pedido_status: currentPedidoStatus })
    }

    const status = mapPaymentStatus(payment.status)
    const approved = status === 'aprovado'
    const terminal = isTerminal(status)
    const splitMode = String(payment.metadata?.split_mode || '')
    const manualRepass = splitMode === 'repasse_manual'

    const paidAt = payment.date_approved || new Date().toISOString()
    await supabase
      .from('pedidos')
      .update({
        payment_provider: 'mercadopago',
        payment_status: status,
        mercadopago_payment_id: String(payment.id),
        payment_details: payment,
        paid_at: approved ? paidAt : null,
        settlement_status: approved
          ? (manualRepass ? 'repasse_manual_pendente' : 'pago_split')
          : (terminal ? 'cancelado' : 'pendente'),
      })
      .eq('id', pedido.id)

    if (approved) {
      await supabase
        .from('pedidos')
        .update({ status: 'novo' })
        .eq('id', pedido.id)
        .eq('status', 'aguardando_pagamento')
    }

    if (terminal) {
      await supabase
        .from('pedidos')
        .update({ status: 'cancelado' })
        .eq('id', pedido.id)
        .eq('status', 'aguardando_pagamento')

      await supabase
        .from('financial_ledger')
        .update({
          status: 'cancelado',
          provider: 'mercadopago',
          external_reference: String(payment.id),
          settled_at: null,
        })
        .eq('pedido_id', pedido.id)
    }

    if (approved && manualRepass) {
      await supabase
        .from('financial_ledger')
        .update({
          status: 'pago',
          provider: 'mercadopago',
          external_reference: String(payment.id),
          settled_at: paidAt,
        })
        .eq('pedido_id', pedido.id)
        .eq('tipo', 'taxa_plataforma')

      await supabase
        .from('financial_ledger')
        .update({
          status: 'pendente',
          provider: 'repasse_manual',
          external_reference: String(payment.id),
          settled_at: null,
        })
        .eq('pedido_id', pedido.id)
        .eq('tipo', 'repasse_vendedor')
    }

    if (approved && !manualRepass) {
      const { data: cfg } = await supabase.from('payment_settings').select('repasse_dias').eq('id', true).maybeSingle()
      const dias = Number(cfg?.repasse_dias ?? 7)
      const disponivelEm = new Date(new Date(paidAt).getTime() + dias * 86400000).toISOString()

      await supabase
        .from('financial_ledger')
        .update({ status: 'pago', provider: 'mercadopago', external_reference: String(payment.id), settled_at: paidAt })
        .eq('pedido_id', pedido.id)
        .eq('tipo', 'taxa_plataforma')

      await supabase
        .from('financial_ledger')
        .update({ status: 'em_espera', provider: 'mercadopago', external_reference: String(payment.id), disponivel_em: disponivelEm, settled_at: null })
        .eq('pedido_id', pedido.id)
        .eq('tipo', 'repasse_vendedor')
    }

    const { data: updated } = await supabase
      .from('pedidos')
      .select('status,payment_status')
      .eq('id', pedido.id)
      .maybeSingle()

    return json({
      ok: true,
      payment_status: String(updated?.payment_status || status),
      pedido_status: String(updated?.status || currentPedidoStatus),
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao verificar pagamento Mercado Pago.' }, { status: 500 })
  }
})
