// Webhook do Pagar.me: e o que confirma o pagamento sozinho (o PIX cai em
// segundos e o cliente nem precisa ficar na tela).
//
// Seguranca em duas camadas:
//  1) o remetente precisa provar quem e (Basic auth configurado no painel do
//     gateway) — sem isso, qualquer um poderia "confirmar" um pedido;
//  2) MESMO assim, nunca confiamos no corpo da notificacao: relemos o pedido
//     direto na API do gateway antes de marcar como pago.
// Idempotente: o mesmo evento pode chegar varias vezes sem efeito duplicado.
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { adminClient, env, gatewayConfigurado, lerCobranca, pagarme, registrarResultado } from '../_shared/pagarme.ts'

function remetenteConfere(req: Request): boolean {
  const usuario = env('PAGARME_WEBHOOK_USER')
  const senha = env('PAGARME_WEBHOOK_PASS')
  // Sem credencial configurada nao ha como validar: recusa (fail-closed).
  if (!usuario || !senha) return false

  const header = req.headers.get('Authorization') || ''
  if (!header.startsWith('Basic ')) return false
  try {
    const [u, s] = atob(header.slice(6)).split(':')
    return u === usuario && s === senha
  } catch {
    return false
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  if (!remetenteConfere(req)) {
    console.error('Webhook recusado: credencial invalida')
    return json({ error: 'nao autorizado' }, { status: 401 })
  }
  if (!gatewayConfigurado()) return json({ error: 'gateway nao configurado' }, { status: 503 })

  const evento = await readJson<{ id?: string; type?: string; data?: Record<string, unknown> }>(req)
  const tipo = String(evento.type || '')
  const dados = (evento.data ?? {}) as Record<string, any>

  // O id do pedido no gateway pode vir como o proprio recurso (order) ou
  // dentro da cobranca (charge.order.id).
  const orderId = String(dados?.id?.toString?.().startsWith('or_') ? dados.id : dados?.order?.id ?? '')
  if (!orderId) {
    // Evento que nao interessa (ex.: recebedor, assinatura): responde ok pra
    // o gateway parar de reenviar.
    return json({ ok: true, ignorado: tipo })
  }

  const admin = adminClient()

  // Idempotencia: registra o evento; se ja veio antes, para por aqui.
  const eventoId = String(evento.id || `${tipo}_${orderId}`)
  const { error: erroEvento } = await admin.from('payment_webhook_events').insert({
    provider: 'pagarme',
    event_type: tipo || 'desconhecido',
    external_id: eventoId,
    signature_valid: true,
    processed: false,
    payload: evento as Record<string, unknown>,
  })
  if (erroEvento && (erroEvento as { code?: string }).code === '23505') {
    return json({ ok: true, duplicado: true })
  }

  const { data: pagamento } = await admin
    .from('pagamentos')
    .select('id,status')
    .eq('provider_order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!pagamento) {
    console.error('Webhook sem pagamento correspondente', orderId)
    return json({ ok: true, sem_pagamento: true })
  }

  try {
    // NUNCA confia no corpo: le o estado real na API do gateway.
    const resposta = await pagarme<Record<string, unknown>>(`/orders/${orderId}`, { method: 'GET' })
    const cobranca = lerCobranca(resposta)
    const status = await registrarResultado(admin, pagamento.id, cobranca)

    await admin.from('payment_webhook_events')
      .update({ processed: true })
      .eq('provider', 'pagarme')
      .eq('event_type', tipo || 'desconhecido')
      .eq('external_id', eventoId)

    return json({ ok: true, status })
  } catch (erro) {
    console.error('Falha ao processar webhook', erro instanceof Error ? erro.message : erro)
    // 500 faz o gateway reenviar depois — melhor do que perder a confirmacao.
    return json({ error: 'falha ao processar' }, { status: 500 })
  }
})
