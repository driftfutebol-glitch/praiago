import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type MercadoPagoPreference = {
  preference_id: string
  checkout_url: string
  sandbox_checkout_url?: string
  split_mode?: 'automatico_marketplace' | 'repasse_manual'
}

export type MercadoPagoPaymentCheck = {
  ok: boolean
  payment_status: string
  pedido_status: string
}

export function isMercadoPagoMethod(method: string) {
  return ['pix', 'cartao', 'credito_online', 'debito_online', 'mercadopago'].includes(method)
}

export async function criarCheckoutMercadoPago(pedidoId: string): Promise<MercadoPagoPreference> {
  const { data, error } = await supabase.functions.invoke<MercadoPagoPreference>('mercadopago-create-preference', {
    body: { pedido_id: pedidoId },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error || 'Nao foi possivel iniciar o Mercado Pago.')
    }
    throw new Error(error.message || 'Nao foi possivel iniciar o Mercado Pago.')
  }
  if (!data?.checkout_url) throw new Error('Mercado Pago nao retornou a URL de checkout.')

  return data
}

export type PixCobranca = {
  ok: boolean
  payment_id: number
  status: string
  qr_code: string
  qr_code_base64: string | null
  ticket_url: string | null
  expires_at: string
}

/** PIX transparente: gera QR + copia-e-cola pra pagar SEM sair do app. */
export async function criarPixMercadoPago(pedidoId: string): Promise<PixCobranca> {
  const { data, error } = await supabase.functions.invoke<PixCobranca>('mercadopago-pix', {
    body: { pedido_id: pedidoId },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error || 'Nao foi possivel gerar o PIX.')
    }
    throw new Error(error.message || 'Nao foi possivel gerar o PIX.')
  }
  if (!data?.qr_code) throw new Error('O Mercado Pago nao devolveu o codigo PIX.')
  return data
}

export type CartaoResultado = {
  ok: boolean
  payment_id: number
  status: string          // approved | in_process | rejected
  status_detail: string
}

/** Cobra o cartão tokenizado direto no MP (sem sair do app). */
export async function pagarComCartao(pedidoId: string, dados: { token: string; paymentMethodId: string; cpf: string; email?: string }): Promise<CartaoResultado> {
  const { data, error } = await supabase.functions.invoke<CartaoResultado>('mercadopago-card', {
    body: {
      pedido_id: pedidoId,
      token: dados.token,
      payment_method_id: dados.paymentMethodId,
      cpf: dados.cpf,
      email: dados.email,
    },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error || 'Nao foi possivel processar o cartao.')
    }
    throw new Error(error.message || 'Nao foi possivel processar o cartao.')
  }
  if (!data?.status) throw new Error('O Mercado Pago nao respondeu o pagamento.')
  return data
}

/** Traduz o status_detail do MP pra mensagem amigável em PT-BR. */
export function mensagemRecusaCartao(detail: string): string {
  const mapa: Record<string, string> = {
    cc_rejected_bad_filled_card_number: 'Número do cartão inválido. Confere e tenta de novo.',
    cc_rejected_bad_filled_date: 'Validade incorreta. Confere o MM/AA.',
    cc_rejected_bad_filled_security_code: 'CVV incorreto.',
    cc_rejected_bad_filled_other: 'Algum dado do cartão está errado. Confere tudo.',
    cc_rejected_insufficient_amount: 'Saldo ou limite insuficiente.',
    cc_rejected_call_for_authorize: 'Seu banco pediu autorização. Liga pro banco e tenta de novo.',
    cc_rejected_card_disabled: 'Cartão desativado. Fala com seu banco.',
    cc_rejected_duplicated_payment: 'Pagamento duplicado. Aguarda uns minutos.',
    cc_rejected_high_risk: 'Recusado por segurança. Tenta pagar com PIX. 💚',
    cc_rejected_max_attempts: 'Muitas tentativas. Aguarda um pouco ou usa PIX.',
    cc_rejected_other_reason: 'O banco recusou o pagamento. Tenta outro cartão ou PIX.',
  }
  return mapa[detail] || 'Pagamento recusado. Tenta outro cartão ou PIX. 💳'
}

export async function verificarPagamentoMercadoPago(pedidoId: string): Promise<MercadoPagoPaymentCheck> {
  const { data, error } = await supabase.functions.invoke<MercadoPagoPaymentCheck>('mercadopago-check-payment', {
    body: { pedido_id: pedidoId },
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error || 'Nao foi possivel verificar o pagamento.')
    }
    throw new Error(error.message || 'Nao foi possivel verificar o pagamento.')
  }

  if (!data) throw new Error('Verificacao de pagamento sem resposta.')
  return data
}
