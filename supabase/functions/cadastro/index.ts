// Cadastro seguro:
//  - GUARD de IP (rate-limit + auto-bloqueio contra ataque/cadastro em massa)
//  - KYC: CPF e CNPJ únicos (checa ANTES de criar a conta — sem usuário órfão)
//  - 1 conta por IP (celular/CGNAT isento) — via signup_rules/authorized_ips
//  - cria a conta e envia o e-mail de verificação
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'

type Body = { email?: string; senha?: string; metadata?: Record<string, unknown>; emailRedirectTo?: string }

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  return xff.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'desconhecido'
}

async function ipEhMovel(ip: string): Promise<boolean> {
  if (!ip || ip === 'desconhecido') return false
  try {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,mobile,isp,org`, { signal: AbortSignal.timeout(3500) })
    const d = await r.json().catch(() => null)
    if (d?.status === 'success' && d?.mobile === true) return true
    const texto = `${d?.isp || ''} ${d?.org || ''}`.toUpperCase()
    return /\b(M[OÓ]VEL|MOBILE|CELULAR|NEXTEL|4G|5G|LTE)\b/.test(texto)
  } catch { return false }
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

    // 1) GUARD: rate-limit + auto-bloqueio (defesa contra ataque/cadastro em massa)
    const { data: guard } = await admin.rpc('guard_ip', { p_ip: ip, p_limite: 25, p_janela_seg: 60 })
    if (guard && (guard as { allowed?: boolean }).allowed === false) {
      const reason = (guard as { reason?: string }).reason
      return json({ error: reason === 'blocked' ? 'Acesso temporariamente bloqueado por segurança.' : 'Muitas tentativas. Tente novamente em alguns minutos.', code: reason }, { status: 429 })
    }

    // 2) KYC: CPF e CNPJ únicos em QUALQUER conta (cliente/ambulante/restaurante)
    const cpf = String(metadata.cpf || '').replace(/\D/g, '')
    if (cpf.length === 11) {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('cpf', cpf)
      if ((count || 0) > 0) return json({ error: 'Este CPF já está cadastrado em uma conta. Cada CPF só pode ter uma conta.', code: 'cpf_dup' }, { status: 409 })
    }
    const cnpj = String(metadata.cnpj || '').replace(/\D/g, '')
    if (cnpj.length === 14) {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('cnpj', cnpj)
      if ((count || 0) > 0) return json({ error: 'Este CNPJ já está cadastrado em uma conta.', code: 'cnpj_dup' }, { status: 409 })
    }

    // 3) 1 conta por IP (celular isento) — regra configurável
    const { data: rules } = await admin.from('signup_rules').select('um_por_ip,exigir_em_movel').eq('id', true).maybeSingle()
    const limiteLigado = rules?.um_por_ip !== false
    const exigirEmMovel = rules?.exigir_em_movel === true
    const isMobile = await ipEhMovel(ip)
    if (limiteLigado && ip !== 'desconhecido') {
      const { data: autorizado } = await admin.from('authorized_ips').select('ip').eq('ip', ip).maybeSingle()
      const isentoPorMovel = isMobile && !exigirEmMovel
      if (!autorizado && !isentoPorMovel) {
        const { count } = await admin.from('signup_ips').select('*', { count: 'exact', head: true }).eq('ip', ip)
        if ((count || 0) >= 1) return json({ error: 'Já existe uma conta cadastrada nesta rede/dispositivo. Se precisar de outra, fale com o suporte.', code: 'ip_limit' }, { status: 429 })
      }
    }

    // 4) cria a conta (envia e-mail de verificação)
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } })
    const { data: signUpData, error } = await anon.auth.signUp({ email, password: senha, options: { data: metadata, emailRedirectTo: body.emailRedirectTo } })
    if (error) {
      const status = (error as { status?: number }).status === 429 ? 429 : 400
      return json({ error: error.message, code: 'signup_error' }, { status })
    }

    const userId = signUpData.user?.id ?? null
    await admin.from('signup_ips').insert({ ip, user_id: userId, email, role: String(metadata.role || ''), is_mobile: isMobile })

    return json({ ok: true, needsConfirmation: !signUpData.session, user_id: userId, ip_movel: isMobile })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro no cadastro.' }, { status: 500 })
  }
})
