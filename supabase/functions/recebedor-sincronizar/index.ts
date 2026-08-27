// Pergunta a Pagar.me o estado dos recebedores que ainda nao estao ativos e
// grava o que mudou. Quando um vira ativo, o vendedor recebe o aviso.
//
// Por que uma varredura e nao so o webhook: webhook se perde. Se um evento
// `recipient.updated` nao chegar, o vendedor fica esperando para sempre uma
// aprovacao que ja aconteceu — e nao existe nada no app que o tire dali. Esta
// funcao e o piso: roda sozinha de tempos em tempos e corrige a diferenca.
//
// So olha quem ainda nao esta ativo. Recebedor ativo nao precisa ser
// perguntado de novo a cada volta, e sao chamadas ao gateway a toa.
//
// Duas entradas:
//   - agendada (pg_cron), com o header do cron secret;
//   - manual, por um sysadmin, para forcar a conferencia na hora.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { adminClient, env, gatewayConfigurado, pagarme } from '../_shared/pagarme.ts'

type Recipient = {
  id?: string
  status?: string
  kyc_link?: string
  default_bank_account?: { status?: string }
}

/**
 * Traduz o status do gateway para os dois campos que guardamos.
 *
 * A Pagar.me usa `registered` / `affiliation` / `active` / `refused` /
 * `suspended` / `blocked` / `inactive`. O que importa para o app e binario:
 * da para receber dinheiro ou nao.
 */
function traduzir(status: string): { status: string; kyc: string } {
  const s = (status || '').toLowerCase()
  if (s === 'active') return { status: 'ativo', kyc: 'aprovado' }
  if (s === 'refused' || s === 'rejected') return { status: 'recusado', kyc: 'recusado' }
  if (s === 'suspended' || s === 'blocked' || s === 'inactive') {
    return { status: 'bloqueado', kyc: 'bloqueado' }
  }
  // registered, affiliation e qualquer novidade deles caem aqui: ainda nao
  // movimenta saldo, que e o unico bit que a tela precisa.
  return { status: 'pendente', kyc: 'em_analise' }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  try {
    if (!gatewayConfigurado()) return json({ error: 'Gateway nao configurado.' }, { status: 400 })

    const admin = adminClient()
    const segredoCron = env('CRON_SECRET')
    const veioDoCron = !!segredoCron && req.headers.get('x-cron-secret') === segredoCron

    // Chamada humana precisa ser sysadmin. Sem isso, qualquer usuario logado
    // dispararia uma varredura no gateway inteiro.
    if (!veioDoCron) {
      const auth = req.headers.get('Authorization') || ''
      const token = auth.replace('Bearer ', '')
      if (!token) return json({ error: 'Nao autenticado.' }, { status: 401 })

      const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
        global: { headers: { Authorization: auth } },
      })
      const { data: userData } = await anon.auth.getUser(token)
      const uid = userData?.user?.id
      if (!uid) return json({ error: 'Sessao invalida.' }, { status: 401 })

      const { data: perfil } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle()
      if ((perfil as { role?: string } | null)?.role !== 'sysadmin') {
        return json({ error: 'Apenas o sysadmin pode forcar a sincronizacao.' }, { status: 403 })
      }
    }

    const body = await readJson<{ vendedor_id?: string }>(req).catch(() => ({}))

    let consulta = admin
      .from('seller_recipients')
      .select('vendedor_id,recipient_id,status,kyc_status')
      .not('recipient_id', 'is', null)

    if (body.vendedor_id) {
      consulta = consulta.eq('vendedor_id', body.vendedor_id)
    } else {
      // A varredura periodica so olha quem ainda nao resolveu.
      consulta = consulta.neq('status', 'ativo')
    }

    const { data: linhas, error } = await consulta.limit(200)
    if (error) return json({ error: 'Nao foi possivel ler os recebedores.' }, { status: 500 })

    const alvos = (linhas ?? []) as Array<{ vendedor_id: string; recipient_id: string; status: string }>
    let mudados = 0
    let aprovados = 0
    const falhas: string[] = []

    for (const r of alvos) {
      try {
        const rec = await pagarme<Recipient>(`/recipients/${r.recipient_id}`, { method: 'GET' })
        const t = traduzir(String(rec?.status ?? ''))

        const { data: mudou } = await admin.rpc('registrar_status_recebedor', {
          p_vendedor: r.vendedor_id,
          p_status: t.status,
          p_kyc_status: t.kyc,
          p_motivo: null,
        })

        if (mudou === true) {
          mudados += 1
          if (t.status === 'ativo') aprovados += 1
        }
      } catch (e) {
        // Um recebedor com problema nao pode parar a varredura dos outros.
        const err = e as { message?: string }
        falhas.push(`${r.recipient_id}: ${err.message ?? 'erro'}`)
      }
    }

    return json({
      ok: true,
      conferidos: alvos.length,
      mudados,
      aprovados,
      falhas: falhas.length ? falhas : undefined,
    })
  } catch (e) {
    console.error('Erro na sincronizacao de recebedores', e instanceof Error ? e.message : e)
    return json({ error: 'Falha na sincronizacao.' }, { status: 500 })
  }
})
