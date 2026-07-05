import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { env, mpRequest, serviceClient } from '../_shared/mercadopago.ts'

type Body = {
  acao?: 'solicitar' | 'aprovar' | 'negar' | 'processar'
  order_id?: string
  refund_id?: string
  motivo?: string
  valor?: number
  resposta_admin?: string
}

async function getAdminUserId(req: Request) {
  const secret = env('EVENT_TICKET_BOT_SECRET')
  if (secret && req.headers.get('x-ticket-bot-secret') === secret) return { userId: null, role: 'bot' as const }

  const authHeader = req.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return null

  const supabase = serviceClient()
  const { data: userData } = await supabase.auth.getUser(token)
  const userId = userData.user?.id
  if (!userId) return null

  const { data: perfil } = await supabase
    .from('profiles')
    .select('role,status')
    .eq('id', userId)
    .maybeSingle()

  if ((perfil?.role === 'admin' || perfil?.role === 'sysadmin') && perfil?.status !== 'banido') {
    return { userId, role: 'admin' as const }
  }

  return null
}

function optionalMoney(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = serviceClient()
    const body = await readJson<Body>(req)
    const acao = body.acao || 'solicitar'

    if (acao === 'solicitar') {
      const authHeader = req.headers.get('Authorization') || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
      if (!token) return json({ error: 'Login obrigatorio para solicitar analise.' }, { status: 401 })

      const { data: userData } = await supabase.auth.getUser(token)
      const userId = userData.user?.id
      if (!userId) return json({ error: 'Usuario invalido.' }, { status: 401 })
      if (!body.order_id) return json({ error: 'Informe order_id.' }, { status: 400 })

      const { data: order } = await supabase
        .from('event_ticket_orders')
        .select('id,total,status,cliente_id')
        .eq('id', body.order_id)
        .eq('cliente_id', userId)
        .maybeSingle()

      if (!order) return json({ error: 'Pedido nao encontrado para este usuario.' }, { status: 404 })
      if (!['pago', 'entrega_pendente', 'entregue'].includes(order.status)) {
        return json({ error: 'Este pedido nao esta elegivel para analise de reembolso.' }, { status: 409 })
      }

      const { data: refund, error } = await supabase
        .from('event_ticket_refunds')
        .insert({
          order_id: order.id,
          requested_by: userId,
          requested_by_role: 'cliente',
          status: 'pendente_admin',
          motivo: body.motivo || 'Cliente solicitou analise de reembolso.',
          valor: optionalMoney(body.valor),
        })
        .select('id,status')
        .single()

      if (error) throw error

      await supabase.from('event_ticket_notifications').insert({
        order_id: order.id,
        tipo: 'reembolso',
        titulo: 'Solicitacao de reembolso de ingresso',
        mensagem: `Cliente solicitou analise do pedido ${order.id}. Motivo: ${body.motivo || 'sem detalhe'}`,
        status: 'pendente',
      })

      return json({ ok: true, refund })
    }

    const admin = await getAdminUserId(req)
    if (!admin) return json({ error: 'Apenas admin ou bot autorizado pode aprovar/processar reembolso.' }, { status: 403 })

    let refundId = body.refund_id || ''
    if (!refundId) {
      if (!body.order_id) return json({ error: 'Informe refund_id ou order_id.' }, { status: 400 })
      const { data: created, error } = await supabase
        .from('event_ticket_refunds')
        .insert({
          order_id: body.order_id,
          requested_by: admin.userId,
          requested_by_role: admin.role,
          status: acao === 'negar' ? 'negado' : 'aprovado',
          motivo: body.motivo || 'Criado por admin/bot.',
          valor: optionalMoney(body.valor),
          approved_by: admin.userId,
          approved_at: new Date().toISOString(),
          resposta_admin: body.resposta_admin || null,
        })
        .select('id')
        .single()
      if (error) throw error
      refundId = created.id
    }

    if (acao === 'aprovar' || acao === 'negar') {
      const status = acao === 'aprovar' ? 'aprovado' : 'negado'
      const { error } = await supabase
        .from('event_ticket_refunds')
        .update({
          status,
          approved_by: admin.userId,
          approved_at: new Date().toISOString(),
          resposta_admin: body.resposta_admin || null,
        })
        .eq('id', refundId)
      if (error) throw error
      return json({ ok: true, status })
    }

    const { data: refund, error: refundError } = await supabase
      .from('event_ticket_refunds')
      .select('id,order_id,valor,status,event_ticket_orders(id,total,mercadopago_payment_id,status)')
      .eq('id', refundId)
      .maybeSingle()

    if (refundError) throw refundError
    if (!refund) return json({ error: 'Reembolso nao encontrado.' }, { status: 404 })

    const order = Array.isArray(refund.event_ticket_orders) ? refund.event_ticket_orders[0] : refund.event_ticket_orders
    if (!order?.mercadopago_payment_id) return json({ error: 'Pedido sem pagamento Mercado Pago aprovado.' }, { status: 409 })
    if (!['aprovado', 'processando'].includes(refund.status)) {
      return json({ error: `Status ${refund.status} nao permite processamento.` }, { status: 409 })
    }

    const accessToken = env('MERCADOPAGO_ACCESS_TOKEN')
    if (!accessToken) return json({ error: 'Configure MERCADOPAGO_ACCESS_TOKEN para processar reembolso.' }, { status: 409 })

    await supabase
      .from('event_ticket_refunds')
      .update({ status: 'processando', approved_by: admin.userId, approved_at: new Date().toISOString() })
      .eq('id', refund.id)

    const valor = optionalMoney(body.valor ?? refund.valor)
    const mpRefund = await mpRequest<Record<string, unknown>>(`/v1/payments/${encodeURIComponent(order.mercadopago_payment_id)}/refunds`, accessToken, {
      method: 'POST',
      headers: { 'X-Idempotency-Key': `praiago-ticket-refund-${refund.id}` },
      ...(valor ? { body: JSON.stringify({ amount: valor }) } : {}),
    })

    await supabase
      .from('event_ticket_refunds')
      .update({
        status: 'reembolsado',
        valor: valor || order.total,
        mercadopago_refund_id: String(mpRefund.id || ''),
        processed_at: new Date().toISOString(),
        metadata: mpRefund,
      })
      .eq('id', refund.id)

    await supabase
      .from('event_ticket_orders')
      .update({
        status: 'reembolsado',
        payment_status: 'estornado',
        delivery_status: 'cancelado',
        refunded_at: new Date().toISOString(),
      })
      .eq('id', order.id)

    await supabase.from('event_ticket_notifications').insert({
      order_id: order.id,
      tipo: 'reembolso',
      titulo: 'Reembolso processado',
      mensagem: `Reembolso do pedido ${order.id} foi processado no Mercado Pago.`,
      status: 'pendente',
      metadata: { mercadopago_refund_id: String(mpRefund.id || '') },
    })

    return json({ ok: true, refund_id: refund.id, mercadopago_refund_id: mpRefund.id || null })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao processar reembolso de ingresso.' }, { status: 500 })
  }
})
