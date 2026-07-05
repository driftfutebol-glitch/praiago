import { corsHeaders, json } from '../_shared/cors.ts'
import { env, getAccessTokenByMpUserId, mpRequest, serviceClient, type MercadoPagoPayment } from '../_shared/mercadopago.ts'
import { emailEnv, sendTransactionalEmail } from '../_shared/email.ts'

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

async function validSignature(req: Request, dataId: string) {
  const secret = env('MERCADOPAGO_WEBHOOK_SECRET')
  if (!secret) return true

  const xSignature = req.headers.get('x-signature') || ''
  const xRequestId = req.headers.get('x-request-id') || ''
  let ts = ''
  let v1 = ''
  for (const part of xSignature.split(',')) {
    const [key, value] = part.split('=').map(item => item.trim())
    if (key === 'ts') ts = value
    if (key === 'v1') v1 = value
  }
  if (!ts || !v1) return false

  const pieces = []
  if (dataId) pieces.push(`id:${dataId.toLowerCase()}`)
  if (xRequestId) pieces.push(`request-id:${xRequestId}`)
  pieces.push(`ts:${ts}`)
  const manifest = `${pieces.join(';')};`
  return await hmac(secret, manifest) === v1
}

function mapPaymentStatus(status?: string) {
  if (status === 'approved') return 'aprovado'
  if (status === 'rejected') return 'rejeitado'
  if (status === 'cancelled') return 'cancelado'
  if (status === 'refunded') return 'estornado'
  if (status === 'charged_back') return 'chargeback'
  return 'pendente'
}

async function handleEventTicketPayment(supabase: ReturnType<typeof serviceClient>, payment: MercadoPagoPayment, status: string) {
  const orderId = String(payment.metadata?.event_ticket_order_id || payment.external_reference || '')
  if (!orderId) return false

  const approved = status === 'aprovado'
  const terminal = ['rejeitado', 'cancelado', 'estornado', 'chargeback'].includes(status)
  const nextStatus = approved ? 'entrega_pendente' : terminal ? (status === 'estornado' ? 'reembolsado' : status === 'chargeback' ? 'chargeback' : 'pagamento_recusado') : 'aguardando_pagamento'

  const { error } = await supabase
    .from('event_ticket_orders')
    .update({
      payment_provider: 'mercadopago',
      payment_status: status,
      mercadopago_payment_id: String(payment.id),
      payment_details: payment,
      status: nextStatus,
      delivery_status: approved ? 'entrega_pendente' : terminal ? 'cancelado' : 'aguardando_pagamento',
      paid_at: approved ? (payment.date_approved || new Date().toISOString()) : null,
      canceled_at: terminal && !approved ? new Date().toISOString() : null,
      refunded_at: status === 'estornado' ? new Date().toISOString() : null,
    })
    .eq('id', orderId)

  if (error) throw error

  if (approved) {
    const { data: order } = await supabase
      .from('event_ticket_orders')
      .select('id,cliente_nome,cliente_email,cliente_telefone,quantidade,total,eventos(titulo,data,hora,local_nome),event_ticket_lots(nome,preco_venda,fonte_url)')
      .eq('id', orderId)
      .maybeSingle()

    const evento = Array.isArray(order?.eventos) ? order?.eventos[0] : order?.eventos
    const lote = Array.isArray(order?.event_ticket_lots) ? order?.event_ticket_lots[0] : order?.event_ticket_lots
    const titulo = 'Ingresso pago: entregar ao cliente'
    const mensagem = `${order?.cliente_nome || 'Cliente'} comprou ${order?.quantidade || 1}x ${lote?.nome || 'ingresso'} para ${evento?.titulo || 'evento'} no valor de R$ ${Number(order?.total || 0).toFixed(2)}.`

    await supabase.from('event_ticket_notifications').insert({
      order_id: orderId,
      tipo: 'nova_venda',
      titulo,
      mensagem,
      destinatario_email: emailEnv('EVENT_TICKET_ADMIN_EMAIL', emailEnv('ADMIN_EMAIL')),
      metadata: {
        mercadopago_payment_id: String(payment.id),
        cliente_email: order?.cliente_email || null,
        cliente_telefone: order?.cliente_telefone || null,
        fonte_url: lote?.fonte_url || null,
      },
    })

    const adminEmail = emailEnv('EVENT_TICKET_ADMIN_EMAIL', emailEnv('ADMIN_EMAIL'))
    if (adminEmail) {
      const emailResult = await sendTransactionalEmail({
        to: adminEmail,
        subject: `[PraiaGo] ${titulo}`,
        html: `
          <h2>${titulo}</h2>
          <p>${mensagem}</p>
          <p><strong>Pedido:</strong> ${orderId}</p>
          <p><strong>Cliente:</strong> ${order?.cliente_nome || '-'} ${order?.cliente_email ? `(${order.cliente_email})` : ''}</p>
          <p><strong>Evento:</strong> ${evento?.titulo || '-'}</p>
          <p><strong>Lote:</strong> ${lote?.nome || '-'}</p>
          <p><strong>Origem:</strong> ${lote?.fonte_url || '-'}</p>
        `,
      })

      await supabase
        .from('event_ticket_orders')
        .update({ delivery_email_status: emailResult.provider === 'not_configured' ? 'nao_configurado' : 'enviado' })
        .eq('id', orderId)
    }
  }

  return true
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const url = new URL(req.url)
    const payload = await req.json().catch(() => ({}))
    const dataId = String(payload?.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '')
    const type = String(payload?.type || url.searchParams.get('type') || '')

    if (!dataId || type !== 'payment') return json({ ok: true, ignored: true })
    if (!await validSignature(req, dataId)) return json({ error: 'Assinatura invalida.' }, { status: 401 })

    const mpUserId = payload?.user_id ? String(payload.user_id) : ''
    const accessToken = (mpUserId ? await getAccessTokenByMpUserId(mpUserId) : undefined) || env('MERCADOPAGO_ACCESS_TOKEN')
    if (!accessToken) return json({ error: 'Token Mercado Pago nao encontrado para webhook.' }, { status: 202 })

    const payment = await mpRequest<MercadoPagoPayment>(`/v1/payments/${encodeURIComponent(dataId)}`, accessToken)
    const pedidoId = payment.external_reference || String(payment.metadata?.pedido_id || '')
    if (!pedidoId) return json({ ok: true, ignored: true })

    const status = mapPaymentStatus(payment.status)
    const supabase = serviceClient()
    const isEventTicket = String(payment.metadata?.tipo || '') === 'evento_ingresso' || !!payment.metadata?.event_ticket_order_id
    if (isEventTicket) {
      await handleEventTicketPayment(supabase, payment, status)
      return json({ ok: true, tipo: 'evento_ingresso' })
    }

    const approved = status === 'aprovado'
    const terminal = ['rejeitado', 'cancelado', 'estornado', 'chargeback'].includes(status)
    const splitMode = String(payment.metadata?.split_mode || '')
    const manualRepass = splitMode === 'repasse_manual'

    const { error } = await supabase
      .from('pedidos')
      .update({
        payment_provider: 'mercadopago',
        payment_status: status,
        mercadopago_payment_id: String(payment.id),
        payment_details: payment,
        paid_at: approved ? (payment.date_approved || new Date().toISOString()) : null,
        settlement_status: approved
          ? (manualRepass ? 'repasse_manual_pendente' : 'pago_split')
          : (terminal ? 'cancelado' : 'pendente'),
      })
      .eq('id', pedidoId)

    if (error) throw error

    // LIBERAÇÃO DO PEDIDO: pagamento aprovado destrava 'aguardando_pagamento' →
    // 'novo' (o vendedor só vê/ouve o pedido a partir daqui). Pagamento que
    // morreu (rejeitado/cancelado/estornado) cancela o pedido travado. O filtro
    // por status impede que um reenvio do webhook regrida um pedido já aceito.
    if (approved) {
      await supabase
        .from('pedidos')
        .update({ status: 'novo' })
        .eq('id', pedidoId)
        .eq('status', 'aguardando_pagamento')
    }
    if (terminal) {
      await supabase
        .from('pedidos')
        .update({ status: 'cancelado' })
        .eq('id', pedidoId)
        .eq('status', 'aguardando_pagamento')
    }

    if (terminal) {
      await supabase
        .from('financial_ledger')
        .update({
          status: 'cancelado',
          provider: 'mercadopago',
          external_reference: String(payment.id),
          settled_at: null,
        })
        .eq('pedido_id', pedidoId)
    }

    if (approved && manualRepass) {
      await supabase
        .from('financial_ledger')
        .update({
          status: 'pago',
          provider: 'mercadopago',
          external_reference: String(payment.id),
          settled_at: new Date().toISOString(),
        })
        .eq('pedido_id', pedidoId)
        .eq('tipo', 'taxa_plataforma')

      await supabase
        .from('financial_ledger')
        .update({
          status: 'pendente',
          provider: 'repasse_manual',
          external_reference: String(payment.id),
          settled_at: null,
        })
        .eq('pedido_id', pedidoId)
        .eq('tipo', 'repasse_vendedor')
    }

    if (approved && !manualRepass) {
      const paidAt = payment.date_approved || new Date().toISOString()
      // janela de repasse (padrão 7 dias): o repasse do vendedor fica "em espera"
      // e só vira disponível para saque N dias após o pagamento.
      const { data: cfg } = await supabase.from('payment_settings').select('repasse_dias').eq('id', true).maybeSingle()
      const dias = Number(cfg?.repasse_dias ?? 7)
      const disponivelEm = new Date(new Date(paidAt).getTime() + dias * 86400000).toISOString()

      // taxa da plataforma: receita confirmada na hora
      await supabase
        .from('financial_ledger')
        .update({ status: 'pago', provider: 'mercadopago', external_reference: String(payment.id), settled_at: paidAt })
        .eq('pedido_id', pedidoId)
        .eq('tipo', 'taxa_plataforma')

      // repasse do vendedor: entra na janela de espera de N dias
      await supabase
        .from('financial_ledger')
        .update({ status: 'em_espera', provider: 'mercadopago', external_reference: String(payment.id), disponivel_em: disponivelEm, settled_at: null })
        .eq('pedido_id', pedidoId)
        .eq('tipo', 'repasse_vendedor')
    }

    return json({ ok: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro no webhook Mercado Pago.' }, { status: 500 })
  }
})
