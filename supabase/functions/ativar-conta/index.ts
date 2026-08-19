// Ativação da conta criada no evento.
//
// A pessoa lê o QR code entregue pela equipe, cai na página /ativar do site,
// escolhe a própria senha e é mandada pro lugar certo (loja do app, ou painel
// do restaurante). É o passo que tira a senha provisória das mãos da equipe.
//
// Não exige login: quem prova quem é aqui é o TOKEN do QR, de uso único e com
// validade. Por isso o token some assim que é usado — se a pessoa refizer a
// leitura do mesmo QR depois, não abre mais nada.
//
// `verify_jwt = false` no deploy: a pessoa ainda não tem sessão nenhuma.

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

/** Pra onde a pessoa vai depois de escolher a senha. */
function destinoDe(role: string) {
  const site = Deno.env.get('PRAIAGO_SITE_URL') || 'https://www.praiago.com.br'
  if (role === 'restaurante') {
    return {
      url: Deno.env.get('PAINEL_RESTAURANTE_URL') || 'https://praiago-restaurante.vercel.app',
      rotulo: 'Entrar no painel do restaurante',
      tipo: 'site' as const,
    }
  }
  if (role === 'ambulante') {
    const loja = Deno.env.get('PLAY_AMBULANTE_URL') || ''
    // O app do ambulante ainda não está publicado. Sem link, mandar pra Play
    // Store daria "app não encontrado" na cara do vendedor no dia do evento —
    // melhor cair numa página do site explicando que o link chega depois.
    return loja
      ? { url: loja, rotulo: 'Baixar o app do ambulante', tipo: 'loja' as const }
      : { url: `${site}/#baixar`, rotulo: 'Ver como baixar o app', tipo: 'pendente' as const }
  }
  const loja = Deno.env.get('PLAY_CLIENTE_URL') || ''
  return loja
    ? { url: loja, rotulo: 'Baixar o app PraiaGo', tipo: 'loja' as const }
    : { url: `${site}/#baixar`, rotulo: 'Ver como baixar o app', tipo: 'pendente' as const }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceKey) return json({ error: 'Funcao sem service role configurado.' }, 500)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const token = String(body.token || '').trim()
  const acao = String(body.acao || 'definir')
  if (!token || token.length < 20) return json({ error: 'Código inválido.' }, 400)

  const { data: reg } = await admin
    .from('ativacao_tokens')
    .select('token,user_id,role,expira_em,usado_em')
    .eq('token', token)
    .maybeSingle()

  if (!reg) return json({ error: 'Código inválido ou já usado.' }, 404)
  if (reg.usado_em) return json({ error: 'Esse código já foi usado. Entre com seu e-mail e senha.', jaUsado: true }, 410)
  if (new Date(reg.expira_em) < new Date()) return json({ error: 'Código expirado. Fale com a equipe PraiaGo.' }, 410)

  const { data: perfil } = await admin
    .from('profiles').select('nome,role').eq('id', reg.user_id).maybeSingle()

  // Primeira etapa: a página só quer saber de quem é o código, pra dar um "oi,
  // Fulano" e mostrar o destino certo antes de pedir a senha.
  if (acao === 'consultar') {
    return json({
      ok: true,
      nome: perfil?.nome ?? null,
      role: reg.role,
      destino: destinoDe(reg.role),
    })
  }

  const senha = String(body.senha || '')
  if (senha.length < 8) return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400)
  // Só o mínimo: quem está cadastrando é vendedor de praia no meio de um
  // evento. Regra de complexidade agressiva aqui vira senha anotada no papel,
  // que é pior que uma senha simples que a pessoa lembra.
  if (/^\d+$/.test(senha)) return json({ error: 'Não use só números — misture letras.' }, 400)

  const { error: erroSenha } = await admin.auth.admin.updateUserById(reg.user_id, { password: senha })
  if (erroSenha) return json({ error: 'Não foi possível salvar a senha. ' + erroSenha.message }, 400)

  // Só agora a conta deixa de ser "provisória".
  await admin.from('profiles')
    .update({ senha_provisoria: false })
    .eq('id', reg.user_id)

  // Queima o token: o mesmo QR não abre mais nada.
  await admin.from('ativacao_tokens')
    .update({ usado_em: new Date().toISOString() })
    .eq('token', token)

  return json({
    ok: true,
    nome: perfil?.nome ?? null,
    role: reg.role,
    destino: destinoDe(reg.role),
  })
})
