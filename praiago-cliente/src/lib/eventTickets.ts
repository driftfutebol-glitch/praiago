import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** The server sets the price for each settlement policy. Only configured
 * installment interest is added to the price shown to the customer. */
export type MetodoIngresso = 'pix' | 'credito' | 'debito'

export type EventBillingAddress = {
  zip_code: string
  street: string
  number: string
  neighborhood: string
  city: string
  state: string
  complement?: string
}

export type IngressoPix = {
  ok: boolean
  order_id: string
  payment_id: string
  metodo: 'pix'
  total: number
  status: 'pendente' | 'pending' | 'paid' | 'refused'
  qr_code: string | null
  qr_code_url: string | null
  expires_at: string | null
}

export type IngressoCartao = {
  ok: boolean
  order_id: string
  payment_id: string
  metodo: 'credito' | 'debito'
  total: number
  status: 'paid' | 'pending' | 'refused'
  status_detail?: string
}

export class EventTicketCheckoutError extends Error {
  readonly code: string
  readonly orderId: string | null
  constructor(message: string, code = '', orderId: string | null = null) {
    super(message); this.name = 'EventTicketCheckoutError'; this.code = code; this.orderId = orderId
  }
}

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('evento-ticket-checkout', { body })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new EventTicketCheckoutError(payload?.error || 'Não foi possível iniciar a compra do ingresso.', typeof payload?.code === 'string' ? payload.code : '', typeof payload?.order_id === 'string' ? payload.order_id : null)
    }
    throw new Error(error.message || 'Nao foi possivel iniciar a compra do ingresso.')
  }
  if (!data) throw new Error('O pagamento nao respondeu. Tente de novo.')
  return data
}

/** PIX transparente: devolve o copia-e-cola pra pagar dentro do app. */
export async function comprarIngressoPix(params: {
  client_request_id: string
  ticket_lot_id: string
  quantidade: number
  cliente_nome?: string
  cliente_telefone?: string
  cpf?: string
  billing_address: EventBillingAddress
  quote_id?: string
}) {
  const pix = await chamar<IngressoPix>({ ...params, metodo: 'pix' })
  if (!pix.qr_code && !['pending', 'paid', 'refused'].includes(pix.status)) throw new Error('O PIX não respondeu. Consulte Meus ingressos antes de tentar novamente.')
  return pix
}

/** Cartao: o token vem da tokenizacao feita no proprio gateway — o numero do
 *  cartao nunca passa pelo nosso servidor. */
export async function comprarIngressoCartao(params: {
  client_request_id: string
  ticket_lot_id: string
  quantidade: number
  metodo: 'credito' | 'debito'
  token: string
  installments?: number
  cliente_nome?: string
  cliente_telefone?: string
  cpf?: string
  billing_address: EventBillingAddress
  quote_id?: string
}) {
  return await chamar<IngressoCartao>(params)
}

export type EventTicketQuote = {
  quote_id: string
  installments: number
  total: number
  interest: number
  base: number
  platform: number
  expires_at: string | null
  installment_floor: number
  remainder_cents: number
}

export async function cotarIngresso(lotId: string, quantity: number, installments = 1): Promise<EventTicketQuote> {
  const { data, error } = await supabase.rpc('event_ticket_quote', { p_lot: lotId, p_quantity: quantity, p_installments: installments })
  if (error) throw new Error(error.message || 'Não foi possível conferir o preço. Atualize e tente novamente.')
  if (!data || !/^[0-9a-f-]{36}$/i.test(data.quote_id || '') || !Number.isFinite(Number(data.total)) || Number(data.total) <= 0
    || !['interest', 'base', 'platform', 'installment_floor', 'remainder_cents'].every(field => Number.isFinite(Number(data[field])) && Number(data[field]) >= 0)
    || Math.abs(Number(data.total) - Number(data.base) - Number(data.platform) - Number(data.interest)) > .011
    || !Number.isInteger(Number(data.remainder_cents)) || Number(data.remainder_cents) >= installments
    || Math.abs(Number(data.installment_floor) * installments + Number(data.remainder_cents) / 100 - Number(data.total)) > .011
    || !Number.isFinite(Date.parse(data.expires_at || '')) || Number(data.installments) !== installments) throw new Error('A cotação não respondeu corretamente. Não houve cobrança.')
  return { ...data, total: Number(data.total), interest: Number(data.interest), base: Number(data.base), platform: Number(data.platform), installment_floor: Number(data.installment_floor), remainder_cents: Number(data.remainder_cents) }
}

export type EventInstallmentOption = { installments: number; total: number; interest: number }
export async function parcelasIngresso(lotId: string, quantity: number): Promise<EventInstallmentOption[]> {
  const { data, error } = await supabase.rpc('event_ticket_installment_options', { p_lot: lotId, p_quantity: quantity })
  if (error) throw new Error(error.message || 'Não foi possível consultar as parcelas disponíveis.')
  const source = Array.isArray(data) ? data : data?.options
  if (!Array.isArray(source)) throw new Error('As opções de parcelamento não responderam corretamente.')
  const amounts: EventInstallmentOption[] = source.flatMap(item => {
    const installments = Number(item?.installments), total = Number(item?.total), interest = Number(item?.interest)
    return Number.isInteger(installments) && installments >= 1 && installments <= 12 && Number.isFinite(total) && total > 0 && Number.isFinite(interest) && interest >= 0 && interest < total && (installments !== 1 || interest === 0) ? [{ installments, total, interest }] : []
  }).sort((a, b) => a.installments - b.installments)
  if (!amounts.some(option => option.installments === 1)) throw new Error('O pagamento de ingressos está temporariamente indisponível.')
  return amounts
}
