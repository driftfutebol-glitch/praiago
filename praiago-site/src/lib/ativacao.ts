// Conversa com a edge function `ativar-conta`.
//
// Contexto: a equipe cadastra a pessoa no evento, o sistema imprime/mostra um
// QR e a pessoa cai em /ativar?t=<token> pra escolher a propria senha. Quem
// prova a identidade aqui e o TOKEN — nao existe sessao, nao existe login.
//
// Por que `fetch` cru e nao @supabase/supabase-js: a pagina faz duas chamadas
// na vida inteira. Carregar o SDK inteiro (e o realtime junto) num celular de
// 4G ruim, no meio da praia, so pra montar um POST nao se paga.

const URL_SUPABASE: string = import.meta.env.VITE_SUPABASE_URL ?? ''
const CHAVE_ANON: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/** Pra onde a pessoa vai depois de criar a senha (a function e quem decide). */
export type Destino = {
  url: string
  rotulo: string
  tipo: 'loja' | 'site' | 'pendente'
}

export type Ativacao = {
  nome: string | null
  role: string
  destino: Destino
}

/**
 * Resultado em uniao discriminada em vez de `throw`: o erro aqui quase sempre
 * e previsto (token usado, expirado, sinal caiu) e vira TELA, nao excecao.
 * `status` 0 = nem chegou na rede.
 */
export type Resultado =
  | { ok: true; dados: Ativacao }
  | { ok: false; mensagem: string; status: number; jaUsado: boolean }

type Pedido =
  | { token: string; acao: 'consultar' }
  | { token: string; senha: string }

/** Aborta sozinho se a rede travar: no evento, esperar pra sempre e pior que erro. */
function tempoLimite(ms: number): AbortSignal | undefined {
  try {
    return AbortSignal.timeout(ms)
  } catch {
    return undefined // navegador velho: sem timeout, mas funciona
  }
}

/**
 * Mesma regra da edge function, de proposito. Validar aqui evita ida na rede
 * pra ouvir um "nao" que a gente ja sabia — e num sinal ruim isso e 5s perdidos.
 * As mensagens sao identicas as do backend pra pessoa nunca ver duas redacoes
 * diferentes do mesmo problema.
 */
export function validarSenha(senha: string): string | null {
  if (senha.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (/^\d+$/.test(senha)) return 'Não use só números — misture letras.'
  return null
}

export async function chamarAtivacao(pedido: Pedido): Promise<Resultado> {
  if (!URL_SUPABASE || !CHAVE_ANON) {
    return {
      ok: false,
      status: 0,
      jaUsado: false,
      mensagem: 'O site está sem configuração de servidor. Avise a equipe PraiaGo.',
    }
  }

  let resposta: Response
  try {
    resposta = await fetch(`${URL_SUPABASE}/functions/v1/ativar-conta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // A function roda com verify_jwt = false, mas o gateway do Supabase
        // ainda exige a chave anon pra deixar o request passar.
        apikey: CHAVE_ANON,
        Authorization: `Bearer ${CHAVE_ANON}`,
      },
      body: JSON.stringify(pedido),
      signal: tempoLimite(20000),
    })
  } catch {
    return {
      ok: false,
      status: 0,
      jaUsado: false,
      mensagem: 'Sem conexão com o PraiaGo. Confira a internet e tente de novo.',
    }
  }

  const corpo = (await resposta.json().catch(() => null)) as
    | (Partial<Ativacao> & { ok?: boolean; error?: string; jaUsado?: boolean })
    | null

  if (!resposta.ok || !corpo?.ok) {
    return {
      ok: false,
      status: resposta.status,
      jaUsado: corpo?.jaUsado === true,
      mensagem: corpo?.error || 'Não deu pra completar agora. Tente de novo em instantes.',
    }
  }

  return {
    ok: true,
    dados: {
      nome: corpo.nome ?? null,
      role: corpo.role ?? '',
      destino: corpo.destino ?? { url: '/', rotulo: 'Voltar ao site', tipo: 'site' },
    },
  }
}
