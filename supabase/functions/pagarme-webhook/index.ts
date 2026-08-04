// Webhook do Pagar.me. A notificacao recebida e apenas um aviso: o status,
// valor, moeda e codigo do pedido sao relidos na API autenticada do gateway
// antes de qualquer alteracao. O corpo publico nunca aprova um pagamento.
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import {
  adminClient,
  centavos,
  gatewayConfigurado,
  lerCobranca,
  pagarme,
  registrarResultado,
} from '../_shared/pagarme.ts'

type WebhookPagarme = {
  id?: unknown
  type?: unknown
  event?: unknown
  data?: Record<string, unknown>
}

const HOOK_ID = /^hook_[A-Za-z0-9]{16}$/
const ORDER_ID = /^or_[A-Za-z0-9]{16}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function eventoDePagamento(tipo: string): boolean {
  return tipo.startsWith('order.') || tipo.startsWith('charge.') || tipo.startsWith('chargeback.')
}

function objeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
}

function extrairPedido(dados: Record<string, unknown>): { orderId: string; pedidoId: string } {
  const order = objeto(dados.order)
  const charge = objeto(dados.charge)
  const chargeOrder = objeto(charge.order)

  const candidatosOrder = [
    dados.id,
    dados.order_id,
    order.id,
    charge.order_id,
    chargeOrder.id,
  ].map(String)

  const candidatosPedido = [
    dados.code,
    order.code,
    chargeOrder.code,
  ].map(String)

  return {
    orderId: candidatosOrder.find(v => ORDER_ID.test(v)) || '',
    pedidoId: candidatosPedido.find(v => UUID.test(v)) || '',
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })
  if (!gatewayConfigurado()) return json({ error: 'gateway nao configurado' }, { status: 503 })

  const recebido = await readJson<WebhookPagarme>(req)
  const hookId = String(recebido.id || '')
  const tipoRecebido = String(recebido.type || recebido.event || '')

  if (!HOOK_ID.test(hookId)) return json({ error: 'evento invalido' }, { status: 400 })

  // A conta pode enviar muitos tipos de evento. Os que nao alteram pagamento
  // sao reconhecidos e encerrados sem uma chamada adicional ao gateway.
  if (tipoRecebido && !eventoDePagamento(tipoRecebido)) {
    return json({ ok: true, ignorado: tipoRecebido })
  }

  const tipo = tipoRecebido
  if (!eventoDePagamento(tipo)) return json({ ok: true, ignorado: tipo || 'desconhecido' })

  const dados = objeto(recebido.data)
  const { orderId, pedidoId } = extrairPedido(dados)
  if (!orderId) return json({ ok: true, ignorado: tipo })

  const admin = adminClient()
  let consulta = await admin
    .from('pagamentos')
    .select('id,status,valor,pedido_id,ticket_order_id')
    .eq('provider', 'pagarme')
    .eq('provider_order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // O webhook pode chegar antes de a resposta da criacao do pedido ser salva.
  // Nesse intervalo, o campo code do Pagar.me permite localizar o pagamento.
  // O code e o id do pedido de comida OU o da compra de ingresso.
  if (!consulta.data && !consulta.error && pedidoId) {
    consulta = await admin
      .from('pagamentos')
      .select('id,status,valor,pedido_id,ticket_order_id')
      .eq('provider', 'pagarme')
      .or(`pedido_id.eq.${pedidoId},ticket_order_id.eq.${pedidoId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  }

  if (consulta.error) {
    console.error('Falha ao localizar pagamento do webhook', { code: consulta.error.code })
    return json({ error: 'falha ao localizar pagamento' }, { status: 500 })
  }
  const pagamento = consulta.data
  if (!pagamento) return json({ ok: true, sem_pagamento: true })

  // Idempotencia: se uma tentativa anterior falhou no meio, ela continua; so
  // eventos ja processados sao encerrados como duplicados.
  const { error: erroEvento } = await admin.from('payment_webhook_events').insert({
    provider: 'pagarme',
    event_type: tipo,
    external_id: hookId,
    signature_valid: false,
    verification_method: 'order_api',
    processed: false,
    // Nao persiste o payload completo (CPF, telefone e dados do cartao).
    payload: { id: hookId, type: tipo, order_id: orderId },
  })

  if (erroEvento) {
    if (erroEvento.code !== '23505') {
      console.error('Falha ao registrar webhook', { code: erroEvento.code })
      return json({ error: 'falha ao registrar evento' }, { status: 500 })
    }

    const { data: existente, error: erroConsultaEvento } = await admin
      .from('payment_webhook_events')
      .select('processed')
      .eq('provider', 'pagarme')
      .eq('event_type', tipo)
      .eq('external_id', hookId)
      .maybeSingle()

    if (erroConsultaEvento) return json({ error: 'falha ao consultar evento' }, { status: 500 })
    if (existente?.processed) return json({ ok: true, duplicado: true })
  }

  try {
    // A autenticacao efetiva e a leitura do pedido com a secret key. O payload
    // publico serve apenas para apontar qual recurso deve ser reconciliado.
    const resposta = await pagarme<Record<string, unknown>>(`/orders/${orderId}`, { method: 'GET' })
    if (String(resposta.id || '') !== orderId) throw new Error('Pedido divergente no gateway.')
    // O code enviado ao gateway e o id do alvo do pagamento: pedido de comida
    // ou compra de ingresso. Um pagamento aponta pra exatamente um dos dois.
    const alvoEsperado = String(pagamento.pedido_id || pagamento.ticket_order_id || '')
    if (String(resposta.code || '') !== alvoEsperado) {
      console.error('Webhook com codigo de pedido divergente')
      return json({ error: 'pagamento divergente' }, { status: 409 })
    }

    const valorGateway = Number(resposta.amount)
    const valorEsperado = centavos(Number(pagamento.valor))
    if (!Number.isInteger(valorGateway) || valorGateway !== valorEsperado || String(resposta.currency || '') !== 'BRL') {
      console.error('Webhook com valor ou moeda divergente')
      return json({ error: 'pagamento divergente' }, { status: 409 })
    }

    const cobranca = lerCobranca(resposta)
    const status = await registrarResultado(admin, pagamento.id, cobranca)

    const { error: erroProcessado } = await admin
      .from('payment_webhook_events')
      .update({ processed: true })
      .eq('provider', 'pagarme')
      .eq('event_type', tipo)
      .eq('external_id', hookId)

    if (erroProcessado) throw new Error('Falha ao concluir evento.')
    return json({ ok: true, status })
  } catch (erro) {
    console.error('Falha ao processar webhook', erro instanceof Error ? erro.message : 'erro desconhecido')
    // 500 faz o gateway reenviar; o registro continua processed=false.
    return json({ error: 'falha ao processar' }, { status: 500 })
  }
})
