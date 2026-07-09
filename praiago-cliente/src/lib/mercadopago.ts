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
