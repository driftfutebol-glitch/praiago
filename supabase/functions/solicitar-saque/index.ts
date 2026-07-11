// Solicitar saque (payout) — o vendedor pede, registramos atômico via RPC, e
// SÓ chamamos o provedor de verdade se a key existir (senão fica 'solicitado'
// pra liberar quando o Asaas estiver configurado + validado em sandbox).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace('Bearer ', '')
    if (!token) return json({ error: 'Não autenticado.' }, { status: 401 })

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const { data: userData } = await anon.auth.getUser(token)
    const vendedorId = userData?.user?.id
    if (!vendedorId) return json({ error: 'Sessão inválida.' }, { status: 401 })

    const body = await readJson<{ valor?: number }>(req)
    const valor = Number(body.valor || 0)
    if (!valor || valor <= 0) return json({ error: 'Valor inválido.' }, { status: 400 })

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    // Registro atômico (valida saldo, cria payout + ledger)
    const { data: payout, error } = await admin.rpc('solicitar_saque', { p_vendedor: vendedorId, p_valor: valor })
    if (error) return json({ error: error.message }, { status: 400 })

    // Provedor real: só se configurado. Senão fica 'solicitado' (admin/cron processa).
    const temProvedor = !!Deno.env.get('ASAAS_API_KEY')
    if (temProvedor) {
      try {
        const { AsaasProvider } = await import('../_shared/asaas.ts')
        const { data: rec } = await admin.from('seller_recipients').select('recipient_id,status').eq('vendedor_id', vendedorId).maybeSingle()
        const { data: pay } = await admin.from('payouts').select('chave_pix').eq('id', (payout as { id: string }).id).maybeSingle()
        if (rec?.status === 'ativo') {
          const chave = (pay as { chave_pix?: string } | null)?.chave_pix || ''
          const res = await AsaasProvider.transferir(chave, Math.round(valor * 100), (payout as { id: string }).id)
          await admin.from('payouts').update({ status: res.status === 'paga' ? 'pago' : 'processando', mp_transfer_id: res.transferId, updated_at: new Date().toISOString() }).eq('id', (payout as { id: string }).id)
        }
      } catch (e) {
        await admin.from('payouts').update({ status: 'solicitado', erro: e instanceof Error ? e.message : 'provedor indisponivel' }).eq('id', (payout as { id: string }).id)
      }
    }

    return json({ ok: true, payout })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro ao solicitar saque.' }, { status: 500 })
  }
})
