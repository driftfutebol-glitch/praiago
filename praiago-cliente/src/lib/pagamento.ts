// Camada de pagamento do PraiaGo — genérica, apontando pro gateway (Pagar.me).
// O app NUNCA fala o nome do provedor na tela: aqui só existem "PIX" e "cartão".
// Trocar de gateway no futuro = mexer só nas edge functions, não no app.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** Métodos cobrados DENTRO do app (online). O resto é "na entrega" (presencial). */
export function isPagamentoOnline(method: string) {
  return ['pix', 'credito_online', 'debito_online'].includes(method)
}

export type PixCobranca = {
  ok: boolean
  payment_id: string
  status: string
  qr_code: string               // copia-e-cola (EMV)
  qr_code_base64: string | null // imagem do QR em base64 (opcional)
  qr_code_url: string | null    // ou a URL da imagem do QR (opcional)
  expires_at: string
}

export type CartaoResultado = {
  ok: boolean
  payment_id: string
  status: string        // paid | approved | pending | in_process | failed | refused
  status_detail: string
}

export type PagamentoCheck = {
  ok: boolean
  payment_status: string
  pedido_status: string
}

async function chamar<T>(fn: string, body: Record<string, unknown>, msgErro: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(fn, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw new Error(payload?.error || msgErro)
    }
    throw new Error(error.message || msgErro)
  }
  if (!data) throw new Error(msgErro)
  return data
}

/** PIX transparente: gera QR + copia-e-cola pra pagar SEM sair do app. */
export async function criarPix(pedidoId: string): Promise<PixCobranca> {
  const data = await chamar<PixCobranca>('pagarme-pix', { pedido_id: pedidoId }, 'Nao foi possivel gerar o PIX.')
  if (!data.qr_code) throw new Error('O PIX nao foi gerado. Tente de novo em instantes.')
  return data
}

/** Cobra o cartão tokenizado (crédito/débito) direto no gateway, sem sair do app. */
export async function pagarComCartao(
  pedidoId: string,
  dados: { token: string; tipo: 'credit' | 'debit'; installments?: number; cpf: string; email?: string },
): Promise<CartaoResultado> {
  const data = await chamar<CartaoResultado>('pagarme-card', {
    pedido_id: pedidoId,
    token: dados.token,
    tipo: dados.tipo,
    installments: dados.installments ?? 1,
    cpf: dados.cpf,
    email: dados.email,
  }, 'Nao foi possivel processar o cartao.')
  if (!data.status) throw new Error('O pagamento nao respondeu. Tente de novo.')
  return data
}

/** Traduz o motivo da recusa pra uma mensagem amigável em PT-BR. */
export function mensagemRecusaCartao(detail: string): string {
  const mapa: Record<string, string> = {
    insufficient_funds: 'Saldo ou limite insuficiente.',
    card_declined: 'O banco recusou o cartão. Tente outro cartão ou PIX. 💳',
    invalid_card_number: 'Número do cartão inválido. Confere e tenta de novo.',
    invalid_number: 'Número do cartão inválido. Confere e tenta de novo.',
    invalid_expiry_date: 'Validade incorreta. Confere o MM/AA.',
    invalid_cvv: 'CVV incorreto.',
    invalid_security_code: 'CVV incorreto.',
    expired_card: 'Cartão vencido. Use outro cartão ou PIX.',
    blocked_card: 'Cartão bloqueado. Fala com seu banco.',
    high_risk: 'Recusado por segurança. Tenta pagar com PIX. 💚',
    fraud: 'Recusado por segurança. Tenta pagar com PIX. 💚',
    max_attempts: 'Muitas tentativas. Aguarda um pouco ou usa PIX.',
  }
  return mapa[detail] || 'Pagamento recusado. Tenta outro cartão ou PIX. 💳'
}

/** Confere no servidor se o pagamento do pedido já foi aprovado. */
export async function verificarPagamento(pedidoId: string): Promise<PagamentoCheck> {
  return chamar<PagamentoCheck>('pagarme-check-payment', { pedido_id: pedidoId }, 'Nao foi possivel verificar o pagamento.')
}
