// Cadastro com regra de 1 conta por IP (cliente/ambulante/restaurante).
// IPs na allowlist (authorized_ips) podem criar quantas contas quiserem.
// Admins são criados por outra função (admin-usuarios) e não passam por aqui.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'

type Body = {
  email?: string
  senha?: string
  metadata?: Record<string, unknown>   // { nome, role, cpf, ... } — montado por cada app
  emailRedirectTo?: string
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'desconhecido'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await readJson<Body>(req)
    const email = String(body.email || '').trim().toLowerCase()
    const senha = String(body.senha || '')
    const metadata = body.metadata || {}
    const ip = clientIp(req)

    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'E-mail inválido.' }, { status: 400 })
    if (senha.length < 6) return json({ error: 'A senha precisa de ao menos 6 caracteres.' }, { status: 400 })

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    // Regra ligada? IP autorizado? Já existe conta nesse IP?
    const { data: rules } = await admin.from('signup_rules').select('um_por_ip').eq('id', true).maybeSingle()
    const limiteLigado = rules?.um_por_ip !== false

    if (limiteLigado && ip !== 'desconhecido') {
      const { data: autorizado } = await admin.from('authorized_ips').select('ip').eq('ip', ip).maybeSingle()
      if (!autorizado) {
        const { count } = await admin.from('signup_ips').select('*', { count: 'exact', head: true }).eq('ip', ip)
        if ((count || 0) >= 1) {
          return json({ error: 'Já existe uma conta cadastrada nesta rede/dispositivo. Se precisar de outra, fale com o suporte.', code: 'ip_limit' }, { status: 429 })
        }
      }
    }

    // Cria a conta (envia o e-mail de verificação como sempre)
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
    const { data: signUpData, error } = await anon.auth.signUp({
      email, password: senha,
      options: { data: metadata, emailRedirectTo: body.emailRedirectTo },
    })
    if (error) {
      const status = (error as { status?: number }).status === 429 ? 429 : 400
      return json({ error: error.message, code: 'signup_error' }, { status })
    }

    // Registra o IP desse cadastro (fonte de verdade do limite)
    const userId = signUpData.user?.id ?? null
    await admin.from('signup_ips').insert({ ip, user_id: userId, email, role: String(metadata.role || '') })

    return json({ ok: true, needsConfirmation: !signUpData.session, user_id: userId })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro no cadastro.' }, { status: 500 })
  }
})
