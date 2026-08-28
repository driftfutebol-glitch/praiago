import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Metodo escolhido pelo cliente. O credito custa mais (taxa maior do gateway),
 *  mas ele ve so o preco final — a diferenca nao aparece como taxa. */
export type MetodoIngresso = 'pix' | 'credito' | 'debito'

export type IngressoPix = {
  ok: boolean
  order_id: string
  payment_id: string
  metodo: 'pix'
  total: number
  status: 'pendente'
  qr_code: string
  qr_code_url: string | null
  expires_at: string
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

async function chamar<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('evento-ticket-checkout', { body })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error || 'Nao foi possivel iniciar a compra do ingresso.')
    }
    throw new Error(error.message || 'Nao foi possivel iniciar a compra do ingresso.')
  }
  if (!data) throw new Error('O pagamento nao respondeu. Tente de novo.')
  return data
}

/** PIX transparente: devolve o copia-e-cola pra pagar dentro do app. */
export async function comprarIngressoPix(params: {
  ticket_lot_id: string
  quantidade: number
  cliente_nome?: string
  cliente_telefone?: string
  cpf?: string
}) {
  const pix = await chamar<IngressoPix>({ ...params, metodo: 'pix' })
  if (!pix.qr_code) throw new Error('O PIX nao foi gerado. Tente de novo.')
  return pix
}

/** Cartao: o token vem da tokenizacao feita no proprio gateway — o numero do
 *  cartao nunca passa pelo nosso servidor. */
export async function comprarIngressoCartao(params: {
  ticket_lot_id: string
  quantidade: number
  metodo: 'credito' | 'debito'
  token: string
  installments?: number
  cliente_nome?: string
  cliente_telefone?: string
  cpf?: string
}) {
  return await chamar<IngressoCartao>(params)
}
