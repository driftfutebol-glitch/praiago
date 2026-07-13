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

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') || ''
  const first = xff.split(',')[0]?.trim()
  return first || req.headers.get('x-real-ip') || 'desconhecido'
}

// Verifica se o IP é de operadora MÓVEL (celular). Celular usa CGNAT — milhares
// de pessoas dividem o mesmo IP — então esses NÃO devem ser limitados a 1 conta.
async function ipEhMovel(ip: string): Promise<boolean> {
  if (!ip || ip === 'desconhecido') return false
  try {
    const r = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,mobile,isp,org`, { signal: AbortSignal.timeout(3500) })
    const d = await r.json().catch(() => null)
    if (d?.status === 'success' && d?.mobile === true) return true
    // fallback SÓ com termos explicitamente móveis (evita falso positivo:
    // "Claro/Vivo/Tim" sozinho também é banda larga FIXA — não vale).
    const texto = `${d?.isp || ''} ${d?.org || ''}`.toUpperCase()
    return /\b(M[OÓ]VEL|MOBILE|CELULAR|NEXTEL|4G|5G|LTE)\b/.test(texto)
  } catch {
    return false // se a checagem falhar, trata como fixo (aplica a regra normal)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await readJson<Body>(req)
    const email = String(body.email || '').trim().toLowerCase()
    const senha = String(body.senha || '')
    const metadata = body.metadata || {}
    const cpf = digits(metadata.cpf)
    const cnpj = digits(metadata.cnpj)
    const ip = clientIp(req)

    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'E-mail inválido.' }, { status: 400 })
    if (senha.length < 6) return json({ error: 'A senha precisa de ao menos 6 caracteres.' }, { status: 400 })

    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

    // Regra ligada? IP autorizado? Já existe conta nesse IP?
    const { data: rules } = await admin.from('signup_rules').select('um_por_ip,exigir_em_movel').eq('id', true).maybeSingle()
    const limiteLigado = rules?.um_por_ip !== false
    const exigirEmMovel = rules?.exigir_em_movel === true

    // Detecta IP de celular (CGNAT). Se for móvel e o admin não exigir limite em
    // móvel, o cadastro é liberado (não bloqueia gente legítima da operadora).
    const isMobile = await ipEhMovel(ip)

    if (limiteLigado && ip !== 'desconhecido') {
      const { data: autorizado } = await admin.from('authorized_ips').select('ip').eq('ip', ip).maybeSingle()
      const isentoPorMovel = isMobile && !exigirEmMovel
      if (!autorizado && !isentoPorMovel) {
        const { count } = await admin.from('signup_ips').select('*', { count: 'exact', head: true }).eq('ip', ip)
        if ((count || 0) >= 1) {
          return json({ error: 'Já existe uma conta cadastrada nesta rede/dispositivo. Se precisar de outra, fale com o suporte.', code: 'ip_limit' }, { status: 429 })
        }
      }
    }

    const { data: emailExistente } = await admin
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    if (emailExistente?.id) {
      return json({ error: 'Este e-mail ja esta cadastrado. Use login ou outro e-mail.', code: 'email_exists' }, { status: 409 })
    }

    if (cpf) {
      const { data: cpfExistente } = await admin
        .from('profiles')
        .select('id')
        .eq('cpf', cpf)
        .maybeSingle()
      if (cpfExistente?.id) {
        return json({ error: 'Este CPF ja esta cadastrado no PraiaGo.', code: 'cpf_exists' }, { status: 409 })
      }
    }

    if (cnpj) {
      const { data: cnpjExistente } = await admin
        .from('profiles')
        .select('id')
        .eq('cnpj', cnpj)
        .maybeSingle()
      if (cnpjExistente?.id) {
        return json({ error: 'Este CNPJ ja esta cadastrado no PraiaGo.', code: 'cnpj_exists' }, { status: 409 })
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
    await admin.from('signup_ips').insert({ ip, user_id: userId, email, role: String(metadata.role || ''), is_mobile: isMobile })

    return json({ ok: true, needsConfirmation: !signUpData.session, user_id: userId, ip_movel: isMobile })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro no cadastro.' }, { status: 500 })
  }
})
