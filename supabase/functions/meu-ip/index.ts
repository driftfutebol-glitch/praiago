// Devolve o IP de quem chamou. Existe por causa do CSP.
//
// O painel de IPs autorizados precisa mostrar "seu IP atual" pra o admin se
// autorizar com um clique. Antes ele chamava api.ipify.org direto — e o CSP do
// admin nao tem esse host, entao a chamada morria. Pior: o `.catch(() => {})`
// engolia o erro, e o campo ficava vazio sem nenhuma pista do motivo.
//
// A saida obvia seria por o ipify no CSP. Nao fiz: e um painel de seguranca, e
// cada host a mais no connect-src e uma porta a mais. `*.supabase.co` ja esta
// liberado, entao o IP vem por aqui e o CSP nao muda.
//
// Exige admin de proposito. Sem isso, isto seria um eco de IP publico e de
// graca, hospedado no projeto — coisa que costuma ser usada por robo.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  const authHeader = req.headers.get('Authorization') || ''

  if (!supabaseUrl || !serviceKey) return json({ error: 'Funcao sem service role configurado.' }, 500)

  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!bearer) return json({ error: 'Nao autorizado.' }, 401)

  const authClient = createClient(supabaseUrl, anonKey || serviceKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: userData } = await authClient.auth.getUser(bearer)
  const uid = userData?.user?.id
  if (!uid) return json({ error: 'Sessao invalida.' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: perfil } = await admin
    .from('profiles').select('role,status').eq('id', uid).maybeSingle()
  if (!perfil || !['admin', 'sysadmin'].includes(String(perfil.role)) || perfil.status === 'banido') {
    return json({ error: 'Apenas a equipe pode consultar.' }, 403)
  }

  // x-forwarded-for vem como "cliente, proxy1, proxy2": o primeiro e quem
  // chamou de verdade. Os outros sao a infraestrutura no meio do caminho.
  const encaminhado = req.headers.get('x-forwarded-for') || ''
  const ip = encaminhado.split(',')[0].trim()
    || req.headers.get('cf-connecting-ip')
    || ''

  if (!ip) return json({ error: 'Nao consegui identificar o IP desta conexao.' }, 502)
  return json({ ip })
})
