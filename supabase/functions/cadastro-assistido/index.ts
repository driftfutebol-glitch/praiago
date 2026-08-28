// Cadastro assistido — o "Sistema de Cadastramento" usado pela equipe no evento.
//
// POR QUE NÃO USA A FUNÇÃO `cadastro` NORMAL:
// a `cadastro` pública tem duas defesas anti-fraude que batem de frente com o
// que a equipe vai fazer no evento:
//   * 1 conta por IP — no Wi-Fi do local, o primeiro cadastro passa e todos os
//     seguintes são recusados;
//   * `guard_ip` com auto-bloqueio a 25 cadastros por minuto, feito
//     literalmente contra "cadastro em massa".
// Cadastro assistido é presencial e conferido por gente da equipe, então não
// precisa dessas defesas — elas existem pra bloquear robô. Aqui a conta é criada
// com a chave de serviço, por um admin autenticado, e cada cadastro fica
// registrado em quem cadastrou.
//
// A senha é gerada aqui e devolvida UMA VEZ pra equipe entregar. O perfil nasce
// com `senha_provisoria = true`, e o fluxo do QR (/ativar) troca a senha e baixa
// essa marca.
//
// ⚠️ ATENÇÃO — a marca hoje é só INFORMATIVA: nenhum dos apps recusa o login de
// quem está com `senha_provisoria = true`. Quem NÃO ler o QR continua com a
// senha que a equipe gerou e leu em voz alta, sem prazo pra trocar. Enquanto
// isso não for verificado no login dos 3 apps, o QR não é opcional: é a única
// coisa que tira a senha da mão da equipe.

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

const PAPEIS_PERMITIDOS = ['cliente', 'ambulante', 'restaurante'] as const
type Papel = typeof PAPEIS_PERMITIDOS[number]

// Sem I/l/O/0/1: a senha vai ser LIDA em voz alta ou digitada de um papel no
// meio de um evento. Caractere ambíguo aqui vira suporte depois.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function gerarSenha(tamanho = 10) {
  const bytes = new Uint8Array(tamanho)
  crypto.getRandomValues(bytes)
  // % pelo tamanho do alfabeto enviesa levemente, mas com 55 símbolos e 10
  // posições isso é irrelevante pra uma senha que vive minutos até ser trocada.
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('')
}

function soDigitos(v: unknown) {
  return String(v ?? '').replace(/\D/g, '')
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

  // Quem cadastra tem que ser da equipe. Admin comum serve — no evento quem vai
  // estar na mesa é a equipe, não só o dono.
  const { data: operador } = await admin
    .from('profiles').select('role,status,nome').eq('id', uid).maybeSingle()
  if (!operador || !['admin', 'sysadmin'].includes(String(operador.role)) || operador.status === 'banido') {
    return json({ error: 'Apenas a equipe pode fazer cadastro assistido.' }, 403)
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const papel = String(body.role || '') as Papel
  if (!PAPEIS_PERMITIDOS.includes(papel)) {
    return json({ error: 'Tipo de cadastro invalido. Use cliente, ambulante ou restaurante.' }, 400)
  }

  const nome = String(body.nome || '').trim()
  const email = String(body.email || '').trim().toLowerCase()
  const telefone = soDigitos(body.telefone)
  const cpf = soDigitos(body.cpf)
  const cnpj = soDigitos(body.cnpj)
  const endereco = String(body.endereco || '').trim() || null
  const categoria = String(body.categoria || '').trim() || null
  // Licença de ambulante é OPCIONAL: boa parte de quem vende na praia não tem,
  // e exigir isso no evento seria recusar justamente o público do app.
  const licenca = String(body.licenca || '').trim() || null
  // Restaurante com CNPJ tem razão social; com CPF, vale o nome da loja.
  const razaoSocial = String(body.razao_social || '').trim() || null

  if (nome.length < 2) return json({ error: 'Informe o nome.' }, 400)
  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'E-mail invalido.' }, 400)
  if (papel !== 'cliente' && !cpf && !cnpj) {
    return json({ error: 'Vendedor precisa de CPF ou CNPJ — é o que sustenta o KYC.' }, 400)
  }

  // E-mail repetido é o erro mais provável numa mesa de evento (a pessoa já se
  // cadastrou sozinha antes). Responde claro em vez de estourar erro genérico.
  const { data: jaExiste } = await admin
    .from('profiles').select('id,role').eq('email', email).maybeSingle()
  if (jaExiste) {
    return json({ error: 'Já existe conta com esse e-mail. Use "esqueci a senha" no app.', jaExiste: true }, 409)
  }

  const senha = gerarSenha()

  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email,
    password: senha,
    // Confirmado na hora: a equipe está olhando a pessoa e o documento. Sem
    // isso ela não consegue entrar até achar um e-mail que talvez nem tenha
    // acesso no meio do evento.
    email_confirm: true,
    user_metadata: { nome, role: papel, cadastro_origem: 'evento' },
  })
  if (erroCriar || !criado?.user) {
    return json({ error: erroCriar?.message || 'Nao foi possivel criar a conta.' }, 400)
  }

  const novoId = criado.user.id

  // O gatilho de cadastro já cria a linha em profiles a partir do metadata;
  // aqui completamos com o que só a equipe tem na mão (documento conferido,
  // KYC aprovado, origem).
  const { error: erroPerfil } = await admin.from('profiles').update({
    nome,
    role: papel,
    telefone: telefone || null,
    cpf: cpf || null,
    cnpj: cnpj || null,
    endereco,
    categoria,
    licenca_ambulante: papel === 'ambulante' ? licenca : null,
    razao_social: papel === 'restaurante' ? (razaoSocial || nome) : null,
    email_verificado: true,
    // KYC aprovado presencialmente — a equipe viu documento e tirou foto.
    verificado: true,
    senha_provisoria: true,
    cadastro_origem: 'evento',
    cadastrado_por: uid,
    cadastrado_em: new Date().toISOString(),
  }).eq('id', novoId)

  if (erroPerfil) {
    // Não deixa conta órfã: se o perfil não fechou, a conta de auth volta atrás.
    await admin.auth.admin.deleteUser(novoId).catch(() => {})
    return json({ error: 'Conta criada mas o perfil falhou; nada foi salvo. ' + erroPerfil.message }, 500)
  }

  // Token de uso único que vai DENTRO do QR code, no lugar da senha.
  // Se a senha fosse pro QR, quem fotografasse a tela entrava na conta.
  // ⚠️ Nome diferente de `token`: aquele já é o Bearer de quem chamou, lá em
  // cima. Declarar os dois com o mesmo nome derrubava a função no boot.
  const tokenAtivacao = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  const { error: erroToken } = await admin.from('ativacao_tokens').insert({
    token: tokenAtivacao, user_id: novoId, role: papel, criado_por: uid,
  })
  if (erroToken) {
    await admin.auth.admin.deleteUser(novoId).catch(() => {})
    return json({ error: 'Nao foi possivel gerar o codigo de ativacao. ' + erroToken.message }, 500)
  }

  const base = Deno.env.get('PRAIAGO_SITE_URL') || 'https://www.praiago.com.br'

  return json({
    ok: true,
    id: novoId,
    email,
    // A senha sai daqui UMA vez, só pra equipe conseguir ajudar caso a pessoa
    // não consiga ler o QR. Não é gravada em lugar nenhum.
    senha,
    role: papel,
    operador: operador.nome ?? null,
    // É ISTO que vira o QR code.
    ativacao_url: `${base}/ativar?t=${tokenAtivacao}`,
  })
})
