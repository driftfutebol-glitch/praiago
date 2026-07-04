import { corsHeaders, json } from '../_shared/cors.ts'
import { env, getAccessTokenByMpUserId, mpRequest, serviceClient, type MercadoPagoPayment } from '../_shared/mercadopago.ts'

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
    const approved = status === 'aprovado'
    const terminal = ['rejeitado', 'cancelado', 'estornado', 'chargeback'].includes(status)
    const splitMode = String(payment.metadata?.split_mode || '')
    const manualRepass = splitMode === 'repasse_manual'
    const supabase = serviceClient()

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
      await supabase
        .from('financial_ledger')
        .update({
          status: 'pago',
          provider: 'mercadopago',
          external_reference: String(payment.id),
          settled_at: new Date().toISOString(),
        })
        .eq('pedido_id', pedidoId)
    }

    return json({ ok: true })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro no webhook Mercado Pago.' }, { status: 500 })
  }
})
