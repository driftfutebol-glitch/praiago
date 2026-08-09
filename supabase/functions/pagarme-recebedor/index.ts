// Recebedor (subconta) do vendedor no gateway — base do split de pagamento.
//
// Por que isso existe: no split, a parte do vendedor vai DIRETO pro saldo dele
// no gateway. O dinheiro nunca passa pela conta da PraiaGo, entao a plataforma
// nao custodia dinheiro de terceiro (o que poderia enquadra-la como instituicao
// de pagamento perante o Banco Central).
//
// O saque automatico do gateway fica DESLIGADO de proposito: quem decide a hora
// de mandar pro banco do vendedor e a nossa regra (entrega confirmada + D+N),
// disparando a transferencia por API. O dinheiro fica parado no saldo do
// PROPRIO vendedor enquanto isso — nao no nosso.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { adminClient, env, gatewayConfigurado, pagarme, somenteDigitos } from '../_shared/pagarme.ts'

const PROVIDER = 'pagarme'
const PAPEIS_VENDEDOR = ['ambulante', 'restaurante']

type Corpo = {
  acao?: 'criar' | 'consultar' | 'diagnostico'
  banco?: string
  agencia?: string
  agencia_dv?: string
  conta?: string
  conta_dv?: string
  tipo_conta?: string
  titular_nome?: string
  titular_documento?: string
}

/** Mostra a conta sem expor o numero inteiro. */
function mascararConta(conta: string) {
  const d = somenteDigitos(conta)
  if (d.length <= 3) return d
  return `${'•'.repeat(Math.max(2, d.length - 3))}${d.slice(-3)}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  const apikey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY')
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Nao autorizado.' }, { status: 401 })

  if (!gatewayConfigurado()) {
    return json({ error: 'O recebimento ainda nao esta ativo. Fale com o suporte.' }, { status: 503 })
  }

  const comoUsuario = createClient(env('SUPABASE_URL'), apikey, {
    global: { headers: { Authorization: authHeader, apikey } },
    auth: { persistSession: false },
  })

  const { data: auth } = await comoUsuario.auth.getUser()
  const usuarioId = auth?.user?.id
  if (!usuarioId) return json({ error: 'Sessao invalida. Entre de novo.' }, { status: 401 })

  const admin = adminClient()
  const { data: perfil } = await admin
    .from('profiles')
    .select('id,role,nome,email,documento,documento_tipo,verificado')
    .eq('id', usuarioId)
    .maybeSingle()

  if (!perfil) return json({ error: 'Perfil nao encontrado.' }, { status: 404 })

  const corpo = await readJson<Corpo>(req)
  const acao = corpo.acao || 'consultar'

  // ─── Diagnostico: a conta do gateway tem marketplace/split liberado? ──────
  // So o sysadmin roda. E leitura pura: nao cria nem altera nada la.
  if (acao === 'diagnostico') {
    if (perfil.role !== 'sysadmin') return json({ error: 'Nao autorizado.' }, { status: 403 })

    let recebedores: Array<Record<string, unknown>> = []
    try {
      const lista = await pagarme<{ data?: Array<Record<string, unknown>> }>('/recipients?size=30', { method: 'GET' })
      recebedores = Array.isArray(lista?.data) ? lista.data : []
    } catch { /* listar falhando ja e sinal de conta sem marketplace */ }

    // LISTAR recebedores nao prova nada: toda conta lista (nem que seja so o
    // recebedor principal dela). O que importa e se a conta pode CRIAR
    // recebedor — permissao separada, que o Pagar.me libera sob pedido.
    // Sonda com documento invalido de proposito: nao cria nada, mas a mensagem
    // de erro diz se o bloqueio e de permissao ou so dos dados.
    let podeCriar = false
    let motivo = ''
    try {
      await pagarme('/recipients', {
        method: 'POST',
        body: JSON.stringify({
          name: 'SONDAGEM PRAIAGO',
          email: 'sondagem@praiago.com.br',
          document: '00000000000',
          type: 'individual',
          default_bank_account: {
            holder_name: 'SONDAGEM', holder_type: 'individual', holder_document: '00000000000',
            bank: '260', branch_number: '0001', account_number: '1', account_check_digit: '1',
            type: 'checking',
          },
          transfer_settings: { transfer_enabled: false, transfer_interval: 'Monthly', transfer_day: 1 },
        }),
      })
      // Nao deveria passar com CPF invalido; se passou, a conta cria recebedor.
      podeCriar = true
      motivo = 'ATENCAO: a sondagem criou um recebedor de teste — apague no painel do gateway.'
    } catch (erro) {
      const msg = (erro as { message?: string }).message || ''
      // Erro de PERMISSAO = conta sem marketplace. Erro de DADOS = tudo certo.
      podeCriar = !/split settings/i.test(msg)
      motivo = msg
    }

    return json({
      ok: true,
      pode_criar_recebedor: podeCriar,
      recebedores_existentes: recebedores.length,
      recebedores: recebedores.map(r => ({
        id: r.id, nome: r.name, status: r.status,
        documento_final: String(r.document ?? '').slice(-4),
      })),
      detalhe: motivo,
    })
  }

  if (!PAPEIS_VENDEDOR.includes(String(perfil.role))) {
    return json({ error: 'Somente vendedores tem conta de recebimento.' }, { status: 403 })
  }

  const { data: recebedor } = await admin
    .from('seller_recipients')
    .select('vendedor_id,provider,recipient_id,status,kyc_status,updated_at')
    .eq('vendedor_id', usuarioId)
    .maybeSingle()

  if (acao === 'consultar') {
    return json({
      ok: true,
      cadastrado: !!recebedor?.recipient_id,
      status: recebedor?.status ?? 'pendente',
      kyc_status: recebedor?.kyc_status ?? 'pendente',
    })
  }

  // ─── Criar / trocar o recebedor ───────────────────────────────────────────
  // Trocar a conta que recebe o dinheiro e o golpe classico de marketplace:
  // conta do vendedor invadida + troca livre = dinheiro desviado. Por isso o
  // PRIMEIRO cadastro e livre, mas TROCAR exige aprovacao do admin.
  if (recebedor?.recipient_id) {
    const { data: liberado } = await admin.rpc('pode_trocar_conta', { p_vendedor: usuarioId })
    if (!liberado) {
      return json({
        error: 'Para trocar a conta que recebe seu dinheiro, peca a liberacao no app. Nossa equipe confere os dados antes de autorizar.',
        precisa_aprovacao: true,
      }, { status: 409 })
    }
  }
  if (!perfil.verificado) {
    return json({ error: 'Sua conta precisa estar verificada antes de cadastrar os dados de recebimento.' }, { status: 403 })
  }

  const banco = somenteDigitos(corpo.banco)
  const agencia = somenteDigitos(corpo.agencia)
  const conta = somenteDigitos(corpo.conta)
  const contaDv = somenteDigitos(corpo.conta_dv)
  const titularNome = String(corpo.titular_nome || '').trim()
  const documento = somenteDigitos(corpo.titular_documento || perfil.documento)
  const tipoConta = corpo.tipo_conta === 'poupanca' ? 'savings' : 'checking'

  if (banco.length !== 3) return json({ error: 'Informe o codigo do banco (3 digitos).' }, { status: 422 })
  if (!agencia) return json({ error: 'Informe a agencia.' }, { status: 422 })
  if (!conta) return json({ error: 'Informe o numero da conta.' }, { status: 422 })
  if (!contaDv) return json({ error: 'Informe o digito da conta.' }, { status: 422 })
  if (titularNome.length < 3) return json({ error: 'Informe o nome do titular da conta.' }, { status: 422 })
  // Limite do gateway ("holder name must be lower than 30 character"). Barra
  // aqui tambem: a tela pode ser antiga (app nao atualizado) e o erro cru do
  // gateway em ingles nao ajudaria o vendedor a resolver.
  if (titularNome.length > 29) {
    return json({
      error: 'O nome do titular precisa ter ate 29 letras. Abrevie os nomes do meio (ex: "Pedro H. F. Oliveira").',
    }, { status: 422 })
  }
  if (documento.length !== 11 && documento.length !== 14) {
    return json({ error: 'Informe o CPF ou CNPJ do titular.' }, { status: 422 })
  }

  const ehEmpresa = documento.length === 14

  try {
    const criado = await pagarme<{ id?: string; status?: string }>('/recipients', {
      method: 'POST',
      // Idempotencia: dois cliques no botao nao criam dois recebedores.
      idempotencyKey: `recipient_${usuarioId}`,
      body: JSON.stringify({
        name: titularNome,
        email: perfil.email,
        description: `Vendedor PraiaGo - ${perfil.nome ?? ''}`.trim(),
        document: documento,
        type: ehEmpresa ? 'company' : 'individual',
        default_bank_account: {
          holder_name: titularNome,
          holder_type: ehEmpresa ? 'company' : 'individual',
          holder_document: documento,
          bank: banco,
          branch_number: agencia,
          branch_check_digit: somenteDigitos(corpo.agencia_dv) || undefined,
          account_number: conta,
          account_check_digit: contaDv,
          type: tipoConta,
        },
        transfer_settings: {
          // DESLIGADO de proposito: quem libera o dinheiro e a nossa regra de
          // entrega confirmada + D+N, nao o calendario do gateway.
          transfer_enabled: false,
          // O gateway EXIGE intervalo e dia mesmo com o saque desligado
          // ("The transfer_interval value is required" / 422). Sao inertes
          // enquanto transfer_enabled for false — mas precisam existir.
          transfer_interval: 'Monthly',
          transfer_day: 1,
        },
      }),
    })

    if (!criado?.id) {
      console.error('Recebedor sem id na resposta do gateway')
      return json({ error: 'Nao foi possivel criar sua conta de recebimento agora.' }, { status: 502 })
    }

    const agora = new Date().toISOString()
    const { error: erroGravar } = await admin
      .from('seller_recipients')
      .upsert({
        vendedor_id: usuarioId,
        provider: PROVIDER,
        recipient_id: criado.id,
        // O gateway ainda analisa os dados; o webhook/consulta atualiza depois.
        status: criado.status === 'active' ? 'ativo' : 'pendente',
        kyc_status: criado.status === 'active' ? 'aprovado' : 'em_analise',
        kyc_enviado_em: agora,
        updated_at: agora,
      }, { onConflict: 'vendedor_id' })

    if (erroGravar) {
      // O recebedor existe no gateway mas nao ficou gravado aqui. Logar o id e
      // essencial: sem ele o vendedor ficaria com uma subconta orfa.
      console.error('Recebedor criado no gateway mas nao gravado', {
        recipient_id: criado.id, code: erroGravar.code,
      })
      return json({ error: 'Sua conta foi criada mas nao conseguimos concluir. Fale com o suporte.' }, { status: 500 })
    }

    return json({
      ok: true,
      cadastrado: true,
      status: criado.status === 'active' ? 'ativo' : 'pendente',
      conta_mascarada: `${banco} / ${agencia} / ${mascararConta(conta)}-${contaDv}`,
    })
  } catch (erro) {
    const e = erro as { status?: number; message?: string }
    console.error('Falha ao criar recebedor', { status: e.status })

    // Conta do gateway sem marketplace liberado: e problema NOSSO, nao dos
    // dados que o vendedor digitou. Nao adianta ele conferir a conta e tentar
    // de novo — a mensagem tem que dizer isso, senao ele fica em loop.
    if (/split settings/i.test(e.message || '')) {
      return json({
        error: 'O recebimento automatico ainda esta sendo liberado pela nossa operadora. Seus dados nao foram perdidos — nossa equipe avisa assim que estiver pronto.',
        code: 'split_nao_habilitado',
      }, { status: 503 })
    }

    return json({ error: e.message || 'Nao foi possivel criar sua conta de recebimento agora.' }, {
      status: e.status && e.status < 500 ? 422 : 502,
    })
  }
})
