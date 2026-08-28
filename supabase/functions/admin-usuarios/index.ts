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

// Conta de equipe: sem Storage de KYC, sem carteira e sem historico de repasse.
// E a unica que ainda sai por deleteUser direto nesta funcao.
const ADMIN_ROLES = ['admin', 'sysadmin']

// Repassa o pedido para a Edge Function do protocolo em vez de duplicar aqui a
// varredura de Storage, a anonimizacao e a maquina de estados. O header de
// Authorization do sysadmin vai junto: excluir-conta rederiva o ator do JWT
// verificado e revalida sysadmin ativo, entao nao ha ampliacao de privilegio.
async function encaminharParaProtocolo(
  supabaseUrl: string,
  apiKey: string,
  authHeader: string,
  subjectId: string,
) {
  let resposta: Response
  try {
    resposta = await fetch(`${supabaseUrl}/functions/v1/excluir-conta`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'admin-request', subjectId }),
    })
  } catch (erro) {
    console.error('admin-usuarios: falha ao chamar excluir-conta:', erro)
    return json({ error: 'Nao foi possivel abrir o protocolo de exclusao agora.' }, 502)
  }

  const payload = await resposta.json().catch(() => ({})) as Record<string, unknown>
  if (!resposta.ok) {
    return json({ error: String(payload.error || 'Falha ao abrir o protocolo de exclusao.') }, resposta.status)
  }
  return json({ ...payload, id: subjectId, protocolo: true }, resposta.status)
}

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
    const id = String(body.id || '').trim()
    if (!id) return json({ error: 'ID do usuario faltando.' }, 400)
    if (id === uid) return json({ error: 'Voce nao pode excluir a si mesmo.' }, 400)

    const { data: alvo, error: alvoErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', id)
      .maybeSingle()
    if (alvoErr) return json({ error: 'Falha ao consultar o perfil alvo: ' + alvoErr.message }, 400)

    // O ator sempre veio do JWT verificado, mas o alvo vinha do corpo sem
    // nenhuma restricao de papel. O painel de Usuarios usava esta rota contra
    // conta comum: deleteUser direto, sem varrer o Storage (perfis-vendedores,
    // kyc-documentos com RG/selfie/CNH, produtos), sem tombstone e sem abrir
    // protocolo -- entao account_deletion_forbids_subject continuava falso e
    // todo gatilho e politica da v1 ficava inerte para aquele UUID. Pior: com
    // payouts_vendedor_id_fkey em SET NULL, payouts.chave_pix (CPF, telefone ou
    // e-mail do vendedor) ficava orfa e permanente.
    //
    // Conta de usuario final agora so sai pelo protocolo de exclusao. Aqui fica
    // apenas o que esta rota sempre foi: gestao de conta de equipe.
    // A anon key vai como apikey do gateway; o ator continua sendo o JWT do
    // sysadmin no header Authorization. A service role nunca sai desta funcao.
    if (!ADMIN_ROLES.includes(String(alvo?.role || ''))) {
      return await encaminharParaProtocolo(supabaseUrl, anonKey, authHeader, id)
    }

    const { error: delErr } = await admin.auth.admin.deleteUser(id)
    if (delErr) return json({ error: delErr.message }, 400)
    await admin.from('profiles').delete().eq('id', id)
    return json({ ok: true, id, protocolo: false })
  }

  return json({ error: 'Acao desconhecida.' }, 400)
})
