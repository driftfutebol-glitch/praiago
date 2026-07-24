import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type EventoTicketCheckout = {
  order_id: string
  preference_id: string
  checkout_url: string
  sandbox_checkout_url?: string
}

export async function criarCheckoutIngresso(params: {
  ticket_lot_id: string
  quantidade: number
  cliente_nome?: string
  cliente_email?: string
  cliente_telefone?: string
}) {
  const { data, error } = await supabase.functions.invoke<EventoTicketCheckout>('evento-ticket-checkout', {
    body: params,
  })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error || 'Nao foi possivel iniciar a compra do ingresso.')
    }
    throw new Error(error.message || 'Nao foi possivel iniciar a compra do ingresso.')
  }
  if (!data?.checkout_url) throw new Error('O pagamento nao retornou a URL de checkout.')
  return data
}
