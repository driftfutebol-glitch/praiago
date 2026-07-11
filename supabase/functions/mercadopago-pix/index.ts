// PIX transparente (dentro do app): cria o pagamento direto na API do Mercado
// Pago e devolve o QR Code + copia-e-cola pro cliente pagar SEM sair do app.
// O webhook (mercadopago-webhook) continua sendo quem confirma o pagamento e
// libera o pedido pro vendedor — aqui só nasce a cobrança.
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { env, getSellerAccessToken, mpRequest, serviceClient } from '../_shared/mercadopago.ts'

type Body = { pedido_id?: string }

type PixPayment = {
  id: number
  status?: string
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string
      qr_code_base64?: string
      ticket_url?: string
    }
  }
  date_of_expiration?: string
}

function money(value: unknown) {
  return Math.round((Number(value) || 0) * 100) / 100
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await readJson<Body>(req)
    const pedidoId = String(body.pedido_id || '').trim()
    if (!pedidoId) return json({ error: 'pedido_id obrigatorio.' }, { status: 400 })

    const supabase = serviceClient()
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('id,vendedor_id,vendedor_nome,cliente_nome,total,status,payment_provider,payment_status,platform_fee_amount')
      .eq('id', pedidoId)
      .maybeSingle()

    if (error) throw error
    if (!pedido) return json({ error: 'Pedido nao encontrado.' }, { status: 404 })
    if (!pedido.vendedor_id) return json({ error: 'Pedido sem vendedor.' }, { status: 400 })
    if (pedido.payment_status === 'aprovado') return json({ error: 'Este pedido ja foi pago.' }, { status: 409 })

    const sellerAccessToken = await getSellerAccessToken(pedido.vendedor_id)
    const platformToken = env('MERCADOPAGO_ACCESS_TOKEN')
    if (!sellerAccessToken && !platformToken) return json({ error: 'Pagamento online indisponivel no momento.' }, { status: 409 })

    const total = money(pedido.total)
    if (total <= 0) return json({ error: 'Valor do pedido invalido.' }, { status: 400 })
    const fee = Math.min(total, Math.max(0, money(pedido.platform_fee_amount ?? 0)))
    const expiraEm = new Date(Date.now() + 30 * 60 * 1000)

    function corpoPagamento(split: boolean) {
      return JSON.stringify({
        transaction_amount: total,
        payment_method_id: 'pix',
        description: `Pedido PraiaGo - ${pedido.vendedor_nome || 'Vendedor'}`,
        external_reference: pedido.id,
        // PIX exige um e-mail de pagador; cliente pode ser anônimo, então usa
        // um endereço técnico por pedido (não recebe nada, só identifica).
        payer: {
          email: `pedido-${String(pedido.id).slice(0, 8)}@praiago.com.br`,
          first_name: pedido.cliente_nome || 'Cliente PraiaGo',
        },
        metadata: {
          pedido_id: pedido.id,
          vendedor_id: pedido.vendedor_id,
          platform: 'praiago',
          split_mode: split ? 'automatico_marketplace' : 'repasse_manual',
          platform_fee_amount: fee,
          vendor_amount: Math.max(0, money(total - fee)),
        },
        ...(split ? { application_fee: fee } : {}),
        notification_url: env('MERCADOPAGO_WEBHOOK_URL') || undefined,
        date_of_expiration: expiraEm.toISOString(),
      })
    }

    // 1ª tentativa: split automático na conta do vendedor (quando vinculada).
    // Se o MP recusar o application_fee (ex: vendedor e plataforma são a mesma
    // conta), cai pro modo plataforma-recebe + repasse manual — o cliente nunca
    // fica travado por causa disso.
    let automaticSplit = Boolean(sellerAccessToken)
    let payment: PixPayment
    try {
      payment = await mpRequest<PixPayment>('/v1/payments', (sellerAccessToken || platformToken) as string, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        body: corpoPagamento(automaticSplit),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (!automaticSplit || !/application_fee/i.test(msg) || !platformToken) throw err
      automaticSplit = false
      payment = await mpRequest<PixPayment>('/v1/payments', platformToken, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        body: corpoPagamento(false),
      })
    }

    // Marca no pedido como o dinheiro vai fluir (o admin/financeiro usa isso).
    await supabase.from('pedidos').update({
      settlement_status: automaticSplit ? 'pendente' : 'repasse_manual_pendente',
    }).eq('id', pedido.id)

    const dados = payment.point_of_interaction?.transaction_data
    if (!dados?.qr_code) throw new Error('Mercado Pago nao devolveu o QR Code PIX.')

    return json({
      ok: true,
      payment_id: payment.id,
      status: payment.status || 'pending',
      qr_code: dados.qr_code,
      qr_code_base64: dados.qr_code_base64 || null,
      ticket_url: dados.ticket_url || null,
      expires_at: payment.date_of_expiration || expiraEm.toISOString(),
      split_mode: automaticSplit ? 'automatico_marketplace' : 'repasse_manual',
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao criar o PIX.' }, { status: 500 })
  }
})
