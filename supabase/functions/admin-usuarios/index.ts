import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const SECOES_VALIDAS = [
  'dashboard', 'pedidos', 'financeiro', 'usuarios', 'verificacoes',
  'eventos', 'cupons', 'promocoes', 'atendimento', 'erros', 'admins',
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authHeader = req.headers.get('Authorization') || ''

  if (!supabaseUrl || !serviceKey) return json({ error: 'Funcao sem service role configurado.' }, 500)

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return json({ error: 'Nao autorizado.' }, 401)

  const authClient = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData } = await authClient.auth.getUser(token)
  const uid = userData?.user?.id
  if (!uid) return json({ error: 'Sessao invalida.' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await admin.from('profiles').select('role,status').eq('id', uid).maybeSingle()
  if (perfil?.role !== 'sysadmin' || perfil?.status === 'banido') {
    return json({ error: 'Apenas o sysadmin pode gerenciar administradores.' }, 403)
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(body.action || '')

  if (action === 'criar') {
    const nome = String(body.nome || '').trim()
    const email = String(body.email || '').trim().toLowerCase()
    const senha = String(body.senha || '')
    const role = body.role === 'sysadmin' ? 'sysadmin' : 'admin'
    let permissions: string[] | null = null
    if (Array.isArray(body.permissions)) {
      permissions = body.permissions.map(String).filter((s) => SECOES_VALIDAS.includes(s))
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'E-mail invalido.' }, 400)
    if (senha.length < 6) return json({ error: 'A senha precisa ter ao menos 6 caracteres.' }, 400)

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { nome },
    })
    if (createErr || !created?.user) {
      return json({ error: createErr?.message || 'Nao foi possivel criar o usuario (e-mail ja existe?).' }, 400)
    }

    const { error: updErr } = await admin.from('profiles')
      .update({ role, nome: nome || email.split('@')[0], permissions, status: 'ativo', email_verificado: true })
      .eq('id', created.user.id)
    if (updErr) {
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: 'Falha ao definir permissoes: ' + updErr.message }, 400)
    }
    return json({ ok: true, id: created.user.id, email })
  }

  if (action === 'excluir') {
    const id = String(body.id || '')
    if (!id) return json({ error: 'ID do admin faltando.' }, 400)
    if (id === uid) return json({ error: 'Voce nao pode excluir a si mesmo.' }, 400)

    const { error: delErr } = await admin.auth.admin.deleteUser(id)
    if (delErr) return json({ error: delErr.message }, 400)
    await admin.from('profiles').delete().eq('id', id)
    return json({ ok: true, id })
  }

  return json({ error: 'Acao desconhecida.' }, 400)
})
