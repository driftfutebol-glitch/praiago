import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { env, getSellerAccessToken, mpRequest, serviceClient } from '../_shared/mercadopago.ts'

type Body = {
  pedido_id?: string
}

type PreferenceResponse = {
  id: string
  init_point?: string
  sandbox_init_point?: string
}

function money(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor do pedido invalido.')
  return Math.round(amount * 100) / 100
}

function nonNegativeMoney(value: unknown) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) return 0
  return Math.round(amount * 100) / 100
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await readJson<Body>(req)
    if (!body.pedido_id) return json({ error: 'Informe pedido_id.' }, { status: 400 })

    const supabase = serviceClient()
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('id,vendedor_id,vendedor_nome,itens,total,pagamento,platform_fee_amount,payment_status')
      .eq('id', body.pedido_id)
      .maybeSingle()

    if (error) throw error
    if (!pedido) return json({ error: 'Pedido nao encontrado.' }, { status: 404 })
    if (!pedido.vendedor_id) return json({ error: 'Pedido sem vendedor.' }, { status: 400 })

    const sellerAccessToken = await getSellerAccessToken(pedido.vendedor_id)
    const accessToken = sellerAccessToken || env('MERCADOPAGO_ACCESS_TOKEN')
    if (!accessToken) return json({ error: 'Configure o token Mercado Pago da empresa antes de vender online.' }, { status: 409 })
    const automaticSplit = Boolean(sellerAccessToken)

    const total = money(pedido.total)
    const fee = Math.min(total, Math.max(0, money(pedido.platform_fee_amount ?? 0)))
    const publicUrl = env('PUBLIC_SITE_URL', env('MERCADOPAGO_DEFAULT_RETURN_URL', 'http://localhost:5175')).replace(/\/+$/, '')
    const autoReturnEnabled = publicUrl.startsWith('https://')
    const webhookUrl = env('MERCADOPAGO_WEBHOOK_URL')

    const preference = await mpRequest<PreferenceResponse>('/checkout/preferences', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          id: pedido.id,
          title: `Pedido PraiaGo - ${pedido.vendedor_nome || 'Vendedor'}`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: total,
        }],
        ...(automaticSplit ? { marketplace_fee: fee } : {}),
        payment_methods: {
          excluded_payment_types: [{ id: 'ticket' }],
          installments: 12,
        },
        external_reference: pedido.id,
        metadata: {
          pedido_id: pedido.id,
          vendedor_id: pedido.vendedor_id,
          pagamento: pedido.pagamento,
          platform: 'praiago',
          split_mode: automaticSplit ? 'automatico_marketplace' : 'repasse_manual',
          platform_fee_amount: fee,
          vendor_amount: nonNegativeMoney(total - fee),
        },
        ...(publicUrl ? {
          back_urls: {
            success: `${publicUrl}/meus-pedidos?pedido=${pedido.id}&payment=success`,
            failure: `${publicUrl}/meus-pedidos?pedido=${pedido.id}&payment=failure`,
            pending: `${publicUrl}/meus-pedidos?pedido=${pedido.id}&payment=pending`,
          },
        } : {}),
        ...(autoReturnEnabled ? { auto_return: 'approved' } : {}),
        ...(webhookUrl ? { notification_url: webhookUrl } : {}),
      }),
    })

    const checkoutUrl = preference.init_point || preference.sandbox_init_point
    if (!checkoutUrl) throw new Error('Mercado Pago nao retornou URL de checkout.')

    const { error: updateError } = await supabase
      .from('pedidos')
      .update({
        payment_provider: 'mercadopago',
        payment_status: 'checkout_criado',
        payment_reference: preference.id,
        mercadopago_preference_id: preference.id,
        payment_checkout_url: checkoutUrl,
        settlement_status: automaticSplit ? 'pendente' : 'repasse_manual_pendente',
        payment_details: {
          checkout: {
            split_mode: automaticSplit ? 'automatico_marketplace' : 'repasse_manual',
            marketplace_fee: automaticSplit ? fee : 0,
            manual_repass_amount: automaticSplit ? 0 : nonNegativeMoney(total - fee),
          },
        },
      })
      .eq('id', pedido.id)

    if (updateError) throw updateError

    return json({
      preference_id: preference.id,
      checkout_url: checkoutUrl,
      sandbox_checkout_url: preference.sandbox_init_point,
      split_mode: automaticSplit ? 'automatico_marketplace' : 'repasse_manual',
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao criar checkout Mercado Pago.' }, { status: 500 })
  }
})
