// Camada unica de acesso ao Pagar.me (API v5).
// NENHUMA outra funcao fala HTTP com o gateway direto: tudo passa por aqui.
// Assim, trocar de provedor no futuro mexe so neste arquivo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const BASE = 'https://api.pagar.me/core/v5'

export function env(nome: string) {
  return Deno.env.get(nome) || ''
}

/** Autenticacao da v5: Basic com a secret key como usuario e senha VAZIA. */
function authHeader() {
  const chave = env('PAGARME_SECRET_KEY')
  if (!chave) throw new Error('PAGARME_SECRET_KEY nao configurada.')
  return `Basic ${btoa(`${chave}:`)}`
}

export function gatewayConfigurado() {
  return !!env('PAGARME_SECRET_KEY')
}

export async function pagarme<T = Record<string, unknown>>(
  caminho: string,
  init: RequestInit & { idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  // Evita cobrar duas vezes se a requisicao for repetida (rede instavel).
  if (init.idempotencyKey) headers['Idempotency-Key'] = init.idempotencyKey

  const res = await fetch(`${BASE}${caminho}`, { ...init, headers })
  const texto = await res.text()
  let corpo: unknown = null
  try { corpo = texto ? JSON.parse(texto) : null } catch { corpo = texto }

  if (!res.ok) {
    // Nao registra o corpo: erros podem repetir dados pessoais enviados na
    // requisicao. O id permite correlacionar o erro com o suporte do gateway.
    console.error('Pagar.me erro', {
      status: res.status,
      caminho,
      requestId: res.headers.get('x-request-id') || undefined,
    })
    throw Object.assign(new Error(mensagemAmigavel(res.status, corpo)), { status: res.status, corpo })
  }

  return corpo as T
}

/** Traduz o erro do gateway pra algo que o cliente possa ler. */
function mensagemAmigavel(status: number, corpo: unknown): string {
  const c = corpo as { message?: string; errors?: Record<string, string[]> } | null
  const primeiro = c?.errors ? Object.values(c.errors)[0]?.[0] : undefined
  if (status === 401 || status === 403) return 'Pagamento indisponivel no momento.'
  if (status === 422 && primeiro) return primeiro
  if (status >= 500) return 'O provedor de pagamento esta instavel. Tente de novo em instantes.'
  return c?.message || 'Nao foi possivel processar o pagamento.'
}

/** Reais -> centavos (a API trabalha sempre em centavos, inteiro). */
export function centavos(valor: number) {
  return Math.round(Number(valor) * 100)
}

export function somenteDigitos(v: unknown) {
  return String(v ?? '').replace(/\D/g, '')
}

/**
 * O Pagar.me EXIGE ao menos um telefone do pagador (o PIX falha com
 * "At least one customer phone is required"). Converte "(13) 99999-8888"
 * no formato que a API espera. Devolve null se nao der pra aproveitar.
 */
export function telefonePagarme(bruto: unknown): { mobile_phone: { country_code: string; area_code: string; number: string } } | null {
  let d = somenteDigitos(bruto)
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2) // tira o +55
  if (d.length < 10 || d.length > 11) return null          // precisa de DDD + numero
  return {
    mobile_phone: {
      country_code: '55',
      area_code: d.slice(0, 2),
      number: d.slice(2),
    },
  }
}

/**
 * Mapeia o status do gateway pro nosso vocabulario interno.
 * Referencia: charge.status da v5 (paid, pending, failed, canceled...) e
 * transaction.status (captured, authorized_pending_capture, not_authorized...).
 */
export function mapearStatus(statusGateway: string): 'pendente' | 'pago' | 'falhou' | 'estornado' | 'cancelado' {
  const s = String(statusGateway || '').toLowerCase()
  if (['paid', 'captured', 'partial_capture'].includes(s)) return 'pago'
  if (['pending', 'processing', 'waiting_payment', 'waiting_capture', 'authorized_pending_capture', 'generated'].includes(s)) return 'pendente'
  if (['refunded', 'partial_refunded'].includes(s)) return 'estornado'
  if (['canceled', 'voided', 'partial_void', 'waiting_cancellation'].includes(s)) return 'cancelado'
  return 'falhou'
}

export type ItemPedido = { amount: number; description: string; quantity: number }

export type Cobranca = {
  orderId: string
  chargeId: string
  status: string
  statusDetalhe: string
  pixQrCode?: string
  pixQrCodeUrl?: string
  pixExpiraEm?: string
  raw: unknown
}

/** Le a cobranca de dentro da resposta do pedido, sem depender do formato exato. */
// deno-lint-ignore no-explicit-any
export function lerCobranca(pedido: Record<string, any>): Cobranca {
  const charge = Array.isArray(pedido?.charges) ? pedido.charges[0] : null
  const tx = charge?.last_transaction ?? {}
  return {
    orderId: String(pedido?.id ?? ''),
    chargeId: String(charge?.id ?? ''),
    status: String(charge?.status ?? pedido?.status ?? ''),
    statusDetalhe: String(tx?.acquirer_message ?? tx?.gateway_response?.errors?.[0]?.message ?? tx?.status ?? ''),
    pixQrCode: tx?.qr_code ? String(tx.qr_code) : undefined,
    pixQrCodeUrl: tx?.qr_code_url ? String(tx.qr_code_url) : undefined,
    pixExpiraEm: tx?.expires_at ? String(tx.expires_at) : undefined,
    raw: pedido,
  }
}

export type RegraSplit = {
  amount: number
  recipient_id: string
  type: 'flat'
  options: { liable: boolean; charge_processing_fee: boolean; charge_remainder_fee: boolean }
}

/**
 * Monta a divisao do dinheiro entre a PraiaGo e o vendedor.
 *
 * Com split, a parte do vendedor cai DIRETO no saldo dele no gateway — nunca
 * na conta da PraiaGo. Isso tira da plataforma a custodia de dinheiro de
 * terceiro (que poderia enquadra-la como instituicao de pagamento no BACEN).
 *
 * Devolve null quando ainda nao da pra dividir (vendedor sem recebedor, ou
 * plataforma sem recebedor configurado). Nesse caso a cobranca sai SEM split,
 * como era antes — cobrar e mais importante que dividir, e a carteira continua
 * registrando o que cada um tem a receber.
 */
export async function montarSplit(
  admin: ReturnType<typeof adminClient>,
  pedido: { vendedor_id?: string | null; total?: unknown; platform_fee_amount?: unknown },
): Promise<RegraSplit[] | null> {
  if (!pedido.vendedor_id) return null

  const [{ data: config }, { data: recebedor }] = await Promise.all([
    admin.from('payment_settings').select('platform_recipient_id').eq('id', true).maybeSingle(),
    admin.from('seller_recipients')
      .select('recipient_id,status')
      .eq('vendedor_id', pedido.vendedor_id)
      .maybeSingle(),
  ])

  const idPlataforma = config?.platform_recipient_id
  const idVendedor = recebedor?.recipient_id
  if (!idPlataforma || !idVendedor || recebedor?.status === 'bloqueado') return null

  const totalCent = centavos(Number(pedido.total))
  let taxaCent = centavos(Number(pedido.platform_fee_amount ?? 0))

  // A soma do split TEM que fechar com o total do pedido, senao o gateway
  // recusa a cobranca inteira. Limita a taxa pra nunca passar do total.
  if (!Number.isFinite(taxaCent) || taxaCent < 0) taxaCent = 0
  if (taxaCent > totalCent) taxaCent = totalCent
  const vendedorCent = totalCent - taxaCent
  if (totalCent <= 0) return null

  const regras: RegraSplit[] = []

  // A plataforma e a responsavel (liable) e paga as taxas do gateway: o
  // vendedor recebe exatamente o vendor_amount que a carteira prometeu a ele.
  if (taxaCent > 0) {
    regras.push({
      amount: taxaCent,
      recipient_id: idPlataforma,
      type: 'flat',
      options: { liable: true, charge_processing_fee: true, charge_remainder_fee: true },
    })
  }
  if (vendedorCent > 0) {
    regras.push({
      amount: vendedorCent,
      recipient_id: idVendedor,
      type: 'flat',
      options: { liable: false, charge_processing_fee: false, charge_remainder_fee: false },
    })
  }

  // Um unico recebedor nao e split — e cobranca normal. Se a taxa comeu tudo
  // (ou nao sobrou nada pro vendedor), nao ha o que dividir.
  if (regras.length < 2) return null
  return regras
}

/** Cliente com service role: usado so pra gravar o resultado do pagamento. */
export function adminClient() {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })
}

/**
 * Mesma ideia do pedido de comida, mas para ingresso de evento: so aqui a
 * compra vira "pago" e entra na fila de entrega do ingresso.
 * O estoque do lote e devolvido pelo gatilho restore_event_ticket_stock quando
 * o status vira recusado/cancelado.
 */
async function registrarResultadoIngresso(
  admin: ReturnType<typeof adminClient>,
  ticketOrderId: string,
  status: 'pendente' | 'pago' | 'falhou' | 'estornado' | 'cancelado',
  cobranca: Cobranca,
  agora: string,
) {
  const referencia = cobranca.chargeId || cobranca.orderId || null
  const patch: Record<string, unknown> = {
    payment_status: status === 'pago' ? 'aprovado'
      : status === 'estornado' ? 'estornado'
      : status === 'cancelado' ? 'cancelado'
      : status === 'falhou' ? 'recusado'
      : 'pendente',
    payment_reference: referencia,
    updated_at: agora,
  }

  if (status === 'pago') {
    patch.status = 'entrega_pendente'
    patch.delivery_status = 'entrega_pendente'
    patch.paid_at = agora
  } else if (status === 'falhou') {
    patch.status = 'pagamento_recusado'
  } else if (status === 'cancelado') {
    patch.status = 'cancelado'
    patch.canceled_at = agora
  } else if (status === 'estornado') {
    patch.status = 'reembolsado'
    patch.refunded_at = agora
  }

  const query = admin.from('event_ticket_orders').update(patch).eq('id', ticketOrderId)
  // So avanca compra que ainda estava esperando: evita que um evento atrasado
  // do gateway reabra ou rebaixe uma compra ja resolvida.
  const { error } = status === 'pago' || status === 'falhou'
    ? await query.eq('status', 'aguardando_pagamento')
    : await query

  if (error) {
    console.error('Falha ao registrar resultado do ingresso', { code: error.code })
    throw new Error('Nao foi possivel confirmar a compra do ingresso agora.')
  }
}

/**
 * Confirma (ou nao) o pagamento no BANCO — ponto unico de verdade.
 * Só aqui o pedido vira "pago" e fica visivel pro vendedor.
 */
export async function registrarResultado(
  admin: ReturnType<typeof adminClient>,
  pagamentoId: string,
  cobranca: Cobranca,
) {
  const status = mapearStatus(cobranca.status)
  const agora = new Date().toISOString()

  // The database trigger is the authoritative privacy fence. This read avoids
  // even attempting to send a gateway payload back for an already-erased
  // payment; the trigger still closes the race if erasure happens afterwards.
  const { data: privacyState, error: privacyError } = await admin
    .from('pagamentos')
    .select('personal_data_erased_at')
    .eq('id', pagamentoId)
    .maybeSingle()
  if (privacyError || !privacyState) {
    console.error('Falha ao conferir privacidade do pagamento', { code: privacyError?.code || 'sem_linha' })
    throw new Error('Nao foi possivel confirmar o pagamento agora.')
  }
  const personalDataErased = Boolean(privacyState.personal_data_erased_at)

  const { data: pag, error: erroPagamento } = await admin
    .from('pagamentos')
    .update({
      provider_order_id: cobranca.orderId || null,
      provider_charge_id: cobranca.chargeId || null,
      status,
      status_detalhe: personalDataErased ? null : cobranca.statusDetalhe || null,
      raw: personalDataErased ? {} : cobranca.raw as Record<string, unknown>,
      paid_at: status === 'pago' ? agora : null,
      updated_at: agora,
    })
    .eq('id', pagamentoId)
    .select('pedido_id,ticket_order_id,personal_data_erased_at')
    .maybeSingle()

  if (erroPagamento || !pag) {
    console.error('Falha ao persistir pagamento', { code: erroPagamento?.code || 'sem_linha' })
    throw new Error('Nao foi possivel confirmar o pagamento agora.')
  }

  // Ingresso de evento vive em outra tabela (event_ticket_orders) e tem o seu
  // proprio vocabulario de status. Um pagamento aponta para um OU para o outro.
  if (pag.ticket_order_id) {
    await registrarResultadoIngresso(admin, String(pag.ticket_order_id), status, cobranca, agora)
    return status
  }

  const pedidoId = pag?.pedido_id
  if (!pedidoId) return status

  if (status === 'pago') {
    // libera o pedido pro vendedor
    const { error } = await admin
      .from('pedidos')
      .update({
        payment_status: 'aprovado',
        status: 'novo',
        paid_at: agora,
        payment_reference: cobranca.chargeId || cobranca.orderId || null,
      })
      .eq('id', pedidoId)
      .eq('payment_status', 'pendente')
    if (error) {
      console.error('Falha ao aprovar pedido pago', { code: error.code })
      throw new Error('Nao foi possivel confirmar o pedido agora.')
    }
  } else if (status === 'falhou' || status === 'cancelado') {
    const { error } = await admin
      .from('pedidos')
      .update({
        payment_status: status === 'cancelado' ? 'cancelado' : 'recusado',
        payment_reference: cobranca.chargeId || cobranca.orderId || null,
      })
      .eq('id', pedidoId)
      .eq('payment_status', 'pendente')
    if (error) {
      console.error('Falha ao registrar pedido recusado', { code: error.code })
      throw new Error('Nao foi possivel atualizar o pedido agora.')
    }
  } else if (status === 'estornado') {
    const { error } = await admin
      .from('pedidos')
      .update({
        payment_status: 'estornado',
        refunded_at: agora,
      })
      .eq('id', pedidoId)
    if (error) {
      console.error('Falha ao registrar estorno', { code: error.code })
      throw new Error('Nao foi possivel atualizar o estorno agora.')
    }
  }

  return status
}
