// Tokenização de cartão DENTRO do app, direto no gateway (Pagar.me v5).
// O número do cartão NUNCA toca nosso servidor: ele vira um token de uso único
// gerado direto na API do gateway pelo navegador, e só o token vai pra edge
// function cobrar. Não precisa de <script> externo — é um POST simples.
const PUBLIC_KEY = import.meta.env.VITE_PAGARME_PUBLIC_KEY as string | undefined

export type DadosCartao = {
  numero: string        // só dígitos
  nome: string
  validade: string      // MM/AA
  cvv: string
  cpf: string           // só dígitos (vai na cobrança, não no token)
}

/** Tokeniza o cartão no gateway e devolve o token de uso único. */
export async function tokenizarCartao(dados: DadosCartao): Promise<{ token: string }> {
  if (!PUBLIC_KEY) {
    throw new Error('O pagamento com cartão ainda está sendo ativado. Use PIX por enquanto. 💚')
  }
  const [mes, ano] = dados.validade.split('/')
  if (!mes || !ano) throw new Error('Validade inválida. Use o formato MM/AA.')

  const resp = await fetch(`https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(PUBLIC_KEY)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'card',
      card: {
        number: dados.numero.replace(/\D/g, ''),
        holder_name: dados.nome.trim(),
        exp_month: Number(mes),
        exp_year: Number(ano.length === 2 ? `20${ano}` : ano),
        cvv: dados.cvv,
      },
    }),
  }).catch(() => null)

  const json = resp ? await resp.json().catch(() => null) : null
  if (!resp || !resp.ok || !json?.id) {
    const msg = json?.errors?.[0]?.message || json?.message || 'Confira os dados do cartão e tente de novo.'
    throw new Error(msg)
  }
  return { token: json.id as string }
}
