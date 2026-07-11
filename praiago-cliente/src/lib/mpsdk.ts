// SDK do Mercado Pago (v2) — tokenização de cartão DENTRO do app.
// O número do cartão nunca toca nosso servidor: vira um token de uso único
// direto no MP, e só o token vai pra edge function cobrar.

const PUBLIC_KEY = (import.meta.env.VITE_MP_PUBLIC_KEY as string | undefined)
  || 'APP_USR-cf996971-c2f1-4f7e-bac4-c3dd329af1ff' // public key (pública mesmo, sem segredo)

type MercadoPagoSDK = {
  createCardToken: (dados: Record<string, string>) => Promise<{ id: string }>
  getPaymentMethods: (opts: { bin: string }) => Promise<{ results?: Array<{ id: string; payment_type_id: string }> }>
}

declare global {
  interface Window { MercadoPago?: new (key: string, opts?: { locale?: string }) => MercadoPagoSDK }
}

let instancia: MercadoPagoSDK | null = null

export function getMercadoPagoSDK(): MercadoPagoSDK {
  if (instancia) return instancia
  if (!window.MercadoPago) {
    throw new Error('O módulo de pagamento não carregou. Confira sua internet e tente de novo.')
  }
  instancia = new window.MercadoPago(PUBLIC_KEY, { locale: 'pt-BR' })
  return instancia
}

export type DadosCartao = {
  numero: string        // só dígitos
  nome: string
  validade: string      // MM/AA
  cvv: string
  cpf: string           // só dígitos
}

/** Tokeniza o cartão e descobre a bandeira (payment_method_id) pelo BIN. */
export async function tokenizarCartao(dados: DadosCartao, tipo: 'credit' | 'debit') {
  const mp = getMercadoPagoSDK()
  const [mes, ano] = dados.validade.split('/')
  if (!mes || !ano) throw new Error('Validade inválida. Use o formato MM/AA.')

  const token = await mp.createCardToken({
    cardNumber: dados.numero,
    cardholderName: dados.nome.trim(),
    cardExpirationMonth: mes.padStart(2, '0'),
    cardExpirationYear: ano.length === 2 ? `20${ano}` : ano,
    securityCode: dados.cvv,
    identificationType: 'CPF',
    identificationNumber: dados.cpf,
  }).catch((err: unknown) => {
    const causa = (err as { cause?: Array<{ description?: string }> })?.cause?.[0]?.description
    throw new Error(causa || 'Confira os dados do cartão e tente de novo.')
  })

  const bin = dados.numero.slice(0, 6)
  const { results = [] } = await mp.getPaymentMethods({ bin }).catch(() => ({ results: [] }))
  const alvo = tipo === 'debit' ? 'debit_card' : 'credit_card'
  const metodo = results.find(r => r.payment_type_id === alvo) || results[0]
  if (!metodo) throw new Error('Não reconhecemos esse cartão. Confira o número.')
  if (tipo === 'debit' && metodo.payment_type_id !== 'debit_card') {
    throw new Error('Esse cartão não aceita débito online. Tente crédito ou PIX.')
  }

  return { token: token.id, paymentMethodId: metodo.id }
}
