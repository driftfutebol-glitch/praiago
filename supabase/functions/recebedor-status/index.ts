// Diagnostico das sub-contas (recebedores) direto na Pagar.me.
//
// Por que existe: a tabela `seller_recipients` guarda o que sabiamos no dia em
// que criamos o recebedor. Ela nao acompanha sozinha o que a Pagar.me decidiu
// depois — um KYC pode ter sido aprovado ou recusado semanas atras e a nossa
// linha continuar dizendo 'em_analise'. Quando o saque falha, e essa diferenca
// que precisa ser olhada primeiro, e ate agora nao havia por onde.
//
// So sysadmin chama. Devolve, por vendedor: o que nos temos gravado, o que a
// Pagar.me responde agora, e as tres configuracoes que decidem se o dinheiro
// anda — transferencia, antecipacao automatica e o status do KYC.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, env, gatewayConfigurado, pagarme } from '../_shared/pagarme.ts'

type Recipient = {
  id?: string
  status?: string
  transfer_settings?: Record<string, unknown>
  automatic_anticipation_settings?: Record<string, unknown>
  default_bank_account?: { bank?: string; type?: string; status?: string }
  kyc_link?: string
  register_information?: { document?: string; type?: string }
}

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
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Sessao invalida.' }, { status: 401 })

    const admin = adminClient()
    const { data: perfil } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle()
    if ((perfil as { role?: string } | null)?.role !== 'sysadmin') {
      return json({ error: 'Apenas o sysadmin pode ver isto.' }, { status: 403 })
    }

    if (!gatewayConfigurado()) return json({ error: 'Gateway nao configurado.' }, { status: 400 })

    const { data: linhas } = await admin
      .from('seller_recipients')
      .select('vendedor_id,provider,recipient_id,status,kyc_status,kyc_motivo,created_at')

    const recebedores = (linhas ?? []) as Array<{
      vendedor_id: string; recipient_id: string | null
      status: string; kyc_status: string; kyc_motivo: string | null; created_at: string
    }>

    const saida = []
    for (const r of recebedores) {
      const { data: dono } = await admin
        .from('profiles').select('nome,email,role').eq('id', r.vendedor_id).maybeSingle()

      const item: Record<string, unknown> = {
        vendedor: { id: r.vendedor_id, ...(dono ?? {}) },
        nosso_registro: {
          recipient_id: r.recipient_id,
          status: r.status,
          kyc_status: r.kyc_status,
          kyc_motivo: r.kyc_motivo,
          criado_em: r.created_at,
        },
      }

      if (!r.recipient_id) {
        item.gateway = { erro: 'sem recipient_id gravado' }
        saida.push(item)
        continue
      }

      try {
        const rec = await pagarme<Recipient>(`/recipients/${r.recipient_id}`, { method: 'GET' })
        item.gateway = {
          status: rec?.status,
          // Estes tres campos sao os que decidem se o dinheiro anda.
          transferencia: rec?.transfer_settings ?? null,
          antecipacao_automatica: rec?.automatic_anticipation_settings ?? null,
          conta_bancaria: rec?.default_bank_account
            ? { banco: rec.default_bank_account.bank, tipo: rec.default_bank_account.type, status: rec.default_bank_account.status }
            : null,
          kyc_link: rec?.kyc_link ?? null,
          // A divergencia e o ponto: se aqui e diferente do nosso registro, a
          // nossa tabela envelheceu e alguem decidiu la sem a gente saber.
          divergente: String(rec?.status ?? '') !== String(r.status ?? ''),
        }
      } catch (e) {
        const err = e as { status?: number; message?: string }
        item.gateway = { erro: err.message, status_http: err.status }
      }

      saida.push(item)
    }

    return json({ ok: true, total: saida.length, recebedores: saida })
  } catch (e) {
    console.error('Erro no diagnostico de recebedores', e instanceof Error ? e.message : e)
    return json({ error: 'Nao foi possivel consultar os recebedores.' }, { status: 500 })
  }
})
