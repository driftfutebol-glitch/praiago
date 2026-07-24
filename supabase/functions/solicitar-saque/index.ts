// Solicitar saque (payout): registra a solicitacao via RPC.
// O Pix real segue manual ate o gateway Pagar.me ser configurado e validado.
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

    // Enquanto Pagar.me nao estiver ligado, o saque fica "solicitado".
    // O admin confirma o Pix manualmente no painel Financeiro.

    return json({ ok: true, payout })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro ao solicitar saque.' }, { status: 500 })
  }
})
