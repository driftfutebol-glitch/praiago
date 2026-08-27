// A VERDADE sobre o saldo do vendedor: o que a Pagar.me diz, nao o que a
// nossa tabela acha.
//
// Por que isto existe: a carteira mostrava o nosso `financial_ledger`, e
// tratava "disponivel" como "da pra sacar". Nem sempre e. O nosso relogio de
// liquidacao (settlement_config) e uma COPIA do prazo da Pagar.me, nao o
// relogio deles. Quando os dois discordam, o saque bate no gateway e leva 412
// — e o vendedor lia "Edge Function returned a non-2xx status code" sem
// entender nada.
//
// Aqui devolvemos tres coisas, todas lidas do gateway:
//
//   saldo.disponivel      da pra sacar AGORA
//   saldo.a_liberar       ja e do vendedor, mas ainda esta preso no prazo
//   antecipacao           quanto dessa espera da pra antecipar, se a conta
//                         tiver antecipacao habilitada
//
// A antecipacao NAO e automatica na Pagar.me: precisa estar liberada para o
// estabelecimento. Se nao estiver, `antecipacao.disponivel` volta false com o
// motivo — que e exatamente a pergunta que a gente precisa responder antes de
// prometer o recurso na tela.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, env, gatewayConfigurado, pagarme } from '../_shared/pagarme.ts'

type Balance = {
  available_amount?: number
  waiting_funds_amount?: number
  transferred_amount?: number
  currency?: string
}

type LimiteAntecipacao = {
  amount?: number
  anticipation_fee?: number
  fee?: number
}

type LimitesResposta = {
  maximum?: LimiteAntecipacao
  minimum?: LimiteAntecipacao
}

/** Centavos -> reais, sempre com 2 casas. */
const reais = (c: unknown) => Math.round(Number(c || 0)) / 100

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  try {
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace('Bearer ', '')
    if (!token) return json({ error: 'Nao autenticado.' }, { status: 401 })

    const url = env('SUPABASE_URL')
    const anon = createClient(url, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
    const { data: userData } = await anon.auth.getUser(token)
    const vendedorId = userData?.user?.id
    if (!vendedorId) return json({ error: 'Sessao invalida.' }, { status: 401 })

    if (!gatewayConfigurado()) {
      return json({ ok: true, gateway: false, motivo: 'gateway_nao_configurado' })
    }

    const admin = adminClient()
    const { data: recebedor } = await admin
      .from('seller_recipients')
      .select('recipient_id')
      .eq('vendedor_id', vendedorId)
      .maybeSingle()

    const recipientId = (recebedor as { recipient_id?: string } | null)?.recipient_id
    if (!recipientId) {
      // Sem sub-conta o dinheiro nem chega a ser dele no gateway: cai inteiro
      // na plataforma e o repasse e manual.
      return json({ ok: true, gateway: true, recebedor: false, motivo: 'sem_recebedor' })
    }

    const saldo = await pagarme<Balance>(`/recipients/${recipientId}/balance`, { method: 'GET' })

    // Limites de antecipacao. `timeframe=start` = antecipar o quanto antes.
    // Este endpoint e a resposta para "a antecipacao esta habilitada?": se a
    // conta nao tiver o recurso, ele nega, e a gente nao promete nada na tela.
    let antecipacao: Record<string, unknown> = { disponivel: false, motivo: 'nao_consultado' }
    try {
      const hoje = new Date().toISOString().slice(0, 10)
      const limites = await pagarme<LimitesResposta>(
        `/recipients/${recipientId}/anticipation_limits?timeframe=start&payment_date=${hoje}`,
        { method: 'GET' },
      )
      const maximo = reais(limites?.maximum?.amount)
      antecipacao = {
        disponivel: maximo > 0,
        maximo,
        minimo: reais(limites?.minimum?.amount),
        taxa_gateway: reais(limites?.maximum?.anticipation_fee ?? limites?.maximum?.fee),
        motivo: maximo > 0 ? null : 'sem_saldo_antecipavel',
      }
    } catch (erroLimite) {
      const e = erroLimite as { status?: number }
      antecipacao = {
        disponivel: false,
        // 401/403 aqui quase sempre significa recurso nao contratado, nao
        // credencial errada — a mesma chave acabou de ler o saldo.
        motivo: e.status === 401 || e.status === 403 ? 'nao_habilitado' : 'indisponivel',
      }
    }

    return json({
      ok: true,
      gateway: true,
      recebedor: true,
      saldo: {
        disponivel: reais(saldo?.available_amount),
        a_liberar: reais(saldo?.waiting_funds_amount),
        transferido: reais(saldo?.transferred_amount),
      },
      antecipacao,
    })
  } catch (e) {
    console.error('Erro ao ler saldo do gateway', e instanceof Error ? e.message : e)
    return json({ error: 'Nao foi possivel consultar o saldo agora.' }, { status: 500 })
  }
})
