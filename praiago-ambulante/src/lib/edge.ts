import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

// Chamada de edge function que devolve o motivo REAL do erro.
//
// Este arquivo e copiado identico no ambulante e no restaurante.
//
// O problema que ele resolve: quando a funcao responde 4xx/5xx, o supabase-js
// coloca `null` em `data` e um FunctionsHttpError generico em `error`. Quem
// escreve
//
//     const erro = data?.error || error?.message
//
// nunca ve a mensagem da funcao — ve "Edge Function returned a non-2xx status
// code". Foi o que o vendedor leu ao tentar sacar: a funcao explicava direito
// que o saldo ainda nao tinha sido liquidado pelo processador e que a equipe
// ja fora avisada, e a tela mostrou aquela frase em ingles sobre codigo HTTP.
//
// O corpo do erro so aparece abrindo `error.context`, que e a Response.

export type RespostaEdge<T> = {
  ok: boolean
  /** Corpo da resposta quando deu certo. */
  data: T | null
  /** Mensagem pronta pro usuario. Vazia quando deu certo. */
  erro: string
  /** Codigo que a funcao mandou junto (ex.: 'saldo_nao_liquidado'). */
  codigo: string | null
  /** Status HTTP, quando houve resposta. */
  status: number | null
}

export async function chamarEdge<T = Record<string, unknown>>(
  nome: string,
  body: Record<string, unknown>,
  msgPadrao: string,
): Promise<RespostaEdge<T>> {
  const { data, error } = await supabase.functions.invoke<T>(nome, { body })

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null) as
        { error?: string; code?: string; aviso?: string } | null
      return {
        ok: false,
        data: null,
        erro: payload?.error || payload?.aviso || msgPadrao,
        codigo: payload?.code ?? null,
        status: error.context?.status ?? null,
      }
    }
    // Rede fora, DNS, timeout: aqui nao ha corpo nenhum para ler.
    return { ok: false, data: null, erro: msgPadrao, codigo: null, status: null }
  }

  // Algumas funcoes respondem 200 com `{ error: ... }` no corpo. Vale como erro.
  const corpo = data as (T & { error?: string; code?: string }) | null
  if (corpo?.error) {
    return { ok: false, data: null, erro: corpo.error, codigo: corpo.code ?? null, status: 200 }
  }

  return { ok: true, data: corpo ?? null, erro: '', codigo: null, status: 200 }
}
