import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { env, mpRequest, serviceClient } from '../_shared/mercadopago.ts'

type Body = {
  ticket_lot_id?: string
  quantidade?: number
  cliente_nome?: string
  cliente_email?: string
  cliente_telefone?: string
}

type PreferenceResponse = {
  id: string
  init_point?: string
  sandbox_init_point?: string
}

function cleanText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function money(value: unknown) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error('Valor invalido.')
  return Math.round(n * 100) / 100
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await readJson<Body>(req)
    if (!body.ticket_lot_id) return json({ error: 'Informe ticket_lot_id.' }, { status: 400 })

    const accessToken = env('MERCADOPAGO_ACCESS_TOKEN')
    if (!accessToken) return json({ error: 'Configure MERCADOPAGO_ACCESS_TOKEN da empresa antes de vender ingressos.' }, { status: 409 })

    const quantidade = Math.max(1, Math.min(20, Math.floor(Number(body.quantidade || 1))))
    const supabase = serviceClient()

    const { data: lote, error: loteError } = await supabase
      .from('event_ticket_lots')
      .select('id,evento_id,nome,preco_venda,preco_origem,estoque_disponivel,status,eventos!inner(id,titulo,data,hora,local_nome,status)')
      .eq('id', body.ticket_lot_id)
      .maybeSingle()

    if (loteError) throw loteError
    if (!lote) return json({ error: 'Lote de ingresso nao encontrado.' }, { status: 404 })
    if (lote.status !== 'disponivel') return json({ error: 'Este lote ainda nao esta disponivel para venda.' }, { status: 409 })
    const evento = Array.isArray(lote.eventos) ? lote.eventos[0] : lote.eventos
    if (!evento || evento.status !== 'ativo') return json({ error: 'Evento indisponivel para venda.' }, { status: 409 })
    if (lote.estoque_disponivel !== null && Number(lote.estoque_disponivel) < quantidade) {
      return json({ error: 'Estoque insuficiente para este lote.' }, { status: 409 })
    }

    const authHeader = req.headers.get('Authorization') || ''
    let clienteId: string | null = null
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      const { data } = await supabase.auth.getUser(token)
      clienteId = data.user?.id || null
    }

    const { data: order, error: orderError } = await supabase
      .from('event_ticket_orders')
      .insert({
        ticket_lot_id: lote.id,
        evento_id: lote.evento_id,
        cliente_id: clienteId,
        cliente_nome: cleanText(body.cliente_nome, 'Cliente PraiaGo'),
        cliente_email: cleanText(body.cliente_email) || null,
        cliente_telefone: cleanText(body.cliente_telefone) || null,
        quantidade,
        status: 'aguardando_pagamento',
        payment_provider: 'mercadopago',
        payment_status: 'pendente',
      })
      .select('id,total,preco_unit,markup_total,subtotal_origem,cliente_email')
      .single()

    if (orderError) throw orderError

    try {
      const total = money(order.total)
      const publicUrl = env('PUBLIC_SITE_URL', env('MERCADOPAGO_DEFAULT_RETURN_URL', 'http://localhost:5175')).replace(/\/+$/, '')
      const autoReturnEnabled = publicUrl.startsWith('https://')
      const webhookUrl = env('MERCADOPAGO_WEBHOOK_URL')
      const title = `Ingresso PraiaGo - ${evento.titulo}`.slice(0, 120)
      const description = `${lote.nome} - ${evento.local_nome || 'Praia Grande'}${evento.data ? ` - ${evento.data}` : ''}`.slice(0, 250)

      const preference = await mpRequest<PreferenceResponse>('/checkout/preferences', accessToken, {
        method: 'POST',
        body: JSON.stringify({
          items: [{
            id: order.id,
            title,
            description,
            quantity: 1,
            currency_id: 'BRL',
            unit_price: total,
          }],
          payment_methods: {
            installments: 12,
          },
          external_reference: order.id,
          metadata: {
            tipo: 'evento_ingresso',
            event_ticket_order_id: order.id,
            evento_id: lote.evento_id,
            ticket_lot_id: lote.id,
            platform: 'praiago',
            markup_total: order.markup_total,
            subtotal_origem: order.subtotal_origem,
          },
          ...(publicUrl ? {
            back_urls: {
              success: `${publicUrl}/eventos?ticket=${order.id}&payment=success`,
              failure: `${publicUrl}/eventos?ticket=${order.id}&payment=failure`,
              pending: `${publicUrl}/eventos?ticket=${order.id}&payment=pending`,
            },
          } : {}),
          ...(autoReturnEnabled ? { auto_return: 'approved' } : {}),
          ...(webhookUrl ? { notification_url: webhookUrl } : {}),
        }),
      })

      const checkoutUrl = preference.init_point || preference.sandbox_init_point
      if (!checkoutUrl) throw new Error('Mercado Pago nao retornou URL de checkout.')

      const { error: updateError } = await supabase
        .from('event_ticket_orders')
        .update({
          payment_status: 'checkout_criado',
          payment_reference: preference.id,
          mercadopago_preference_id: preference.id,
          payment_checkout_url: checkoutUrl,
        })
        .eq('id', order.id)

      if (updateError) throw updateError

      return json({
        order_id: order.id,
        preference_id: preference.id,
        checkout_url: checkoutUrl,
        sandbox_checkout_url: preference.sandbox_init_point,
      })
    } catch (err) {
      await supabase
        .from('event_ticket_orders')
        .update({ status: 'cancelado', payment_status: 'checkout_falhou', canceled_at: new Date().toISOString() })
        .eq('id', order.id)
      throw err
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao criar checkout de ingresso.' }, { status: 500 })
  }
})
