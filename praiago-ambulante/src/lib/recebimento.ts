// Dados de recebimento do vendedor (conta bancaria no gateway).
//
// Por que conta bancaria e nao chave Pix: com o split, a parte do vendedor cai
// DIRETO no saldo dele dentro do gateway, e o gateway exige conta bancaria pra
// abrir esse saldo. Em troca, o dinheiro nunca passa pela conta da PraiaGo.
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

export type ContaRecebimento = {
  banco: string
  agencia: string
  agencia_dv?: string
  conta: string
  conta_dv: string
  tipo_conta: 'corrente' | 'poupanca'
  titular_nome: string
  titular_documento: string
}

export type StatusRecebimento = {
  ok: boolean
  cadastrado: boolean
  status: string
  kyc_status?: string
}

/** Bancos mais usados. O codigo (COMPE) e o que o gateway espera. */
export const BANCOS = [
  { codigo: '001', nome: 'Banco do Brasil' },
  { codigo: '033', nome: 'Santander' },
  { codigo: '104', nome: 'Caixa Econômica' },
  { codigo: '237', nome: 'Bradesco' },
  { codigo: '260', nome: 'Nu Pagamentos (Nubank)' },
  { codigo: '290', nome: 'PagBank / PagSeguro' },
  { codigo: '323', nome: 'Mercado Pago' },
  { codigo: '336', nome: 'Banco C6' },
  { codigo: '341', nome: 'Itaú' },
  { codigo: '380', nome: 'PicPay' },
  { codigo: '077', nome: 'Banco Inter' },
  { codigo: '212', nome: 'Banco Original' },
  { codigo: '756', nome: 'Sicoob' },
  { codigo: '748', nome: 'Sicredi' },
]

async function chamar<T>(body: Record<string, unknown>, msgErro: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('pagarme-recebedor', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null)
      throw Object.assign(new Error(payload?.error || msgErro), {
        precisaAprovacao: !!payload?.precisa_aprovacao,
      })
    }
    throw new Error(error.message || msgErro)
  }
  if (!data) throw new Error(msgErro)
  return data
}

export function consultarRecebimento() {
  return chamar<StatusRecebimento>({ acao: 'consultar' }, 'Nao foi possivel consultar seus dados de recebimento.')
}

export function cadastrarRecebimento(conta: ContaRecebimento) {
  return chamar<StatusRecebimento & { conta_mascarada?: string }>(
    { acao: 'criar', ...conta },
    'Nao foi possivel salvar seus dados de recebimento.',
  )
}

/** Valida no navegador o que o gateway rejeitaria depois — erro cedo e melhor. */
export function validarConta(c: Partial<ContaRecebimento>): string {
  const d = (v?: string) => String(v ?? '').replace(/\D/g, '')
  if (d(c.banco).length !== 3) return 'Escolha o banco.'
  if (!d(c.agencia)) return 'Informe a agência (só números).'
  if (!d(c.conta)) return 'Informe o número da conta.'
  if (!d(c.conta_dv)) return 'Informe o dígito da conta (vem depois do traço).'
  if (String(c.titular_nome ?? '').trim().length < 3) return 'Informe o nome do titular da conta.'
  const doc = d(c.titular_documento)
  if (doc.length !== 11 && doc.length !== 14) return 'Informe o CPF ou CNPJ do titular.'
  return ''
}
