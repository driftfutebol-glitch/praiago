// Cartão transparente (dentro do app): recebe o TOKEN do cartão (gerado pelo
// SDK no app — o número nunca passa por aqui) e cobra direto na API do MP.
// Mesmo modelo do PIX in-app: split automático quando o vendedor tem conta
// vinculada; se o MP recusar o application_fee, cai pra plataforma-recebe +
// repasse manual. O webhook confirma e libera o pedido pro vendedor.
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { env, getSellerAccessToken, mpRequest, serviceClient } from '../_shared/mercadopago.ts'

type Body = {
  pedido_id?: string
  token?: string
  payment_method_id?: string
  cpf?: string
  email?: string
}

type CardPayment = {
  id: number
  status?: string
  status_detail?: string
}

function money(value: unknown) {
  return Math.round((Number(value) || 0) * 100) / 100
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await readJson<Body>(req)
    const pedidoId = String(body.pedido_id || '').trim()
    const token = String(body.token || '').trim()
    const paymentMethodId = String(body.payment_method_id || '').trim()
    const cpf = String(body.cpf || '').replace(/\D/g, '')
    if (!pedidoId || !token || !paymentMethodId) return json({ error: 'Dados do pagamento incompletos.' }, { status: 400 })
    if (cpf.length !== 11) return json({ error: 'CPF invalido.' }, { status: 400 })

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
    const emailPagador = String(body.email || '').trim() || `pedido-${String(pedido.id).slice(0, 8)}@praiago.com.br`

    function corpoPagamento(split: boolean) {
      return JSON.stringify({
        transaction_amount: total,
        token,
        installments: 1,
        payment_method_id: paymentMethodId,
        description: `Pedido PraiaGo - ${pedido.vendedor_nome || 'Vendedor'}`,
        external_reference: pedido.id,
        payer: {
          email: emailPagador,
          identification: { type: 'CPF', number: cpf },
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
      })
    }

    let automaticSplit = Boolean(sellerAccessToken)
    let payment: CardPayment
    try {
      payment = await mpRequest<CardPayment>('/v1/payments', (sellerAccessToken || platformToken) as string, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        body: corpoPagamento(automaticSplit),
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      // Token de cartão é de USO ÚNICO e morre na 1ª tentativa — só dá pra
      // cair no fallback se o erro foi o application_fee (recusado ANTES de
      // consumir o token não acontece; por isso pedimos novo token no app se
      // esse retry também falhar).
      if (!automaticSplit || !/application_fee/i.test(msg) || !platformToken) throw err
      automaticSplit = false
      payment = await mpRequest<CardPayment>('/v1/payments', platformToken, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': crypto.randomUUID() },
        body: corpoPagamento(false),
      })
    }

    await supabase.from('pedidos').update({
      settlement_status: automaticSplit ? 'pendente' : 'repasse_manual_pendente',
    }).eq('id', pedido.id)

    return json({
      ok: true,
      payment_id: payment.id,
      status: payment.status || 'in_process',
      status_detail: payment.status_detail || '',
      split_mode: automaticSplit ? 'automatico_marketplace' : 'repasse_manual',
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Erro ao processar o cartao.' }, { status: 500 })
  }
})
