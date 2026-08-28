// PIX transparente: gera o QR + copia-e-cola DENTRO do app.
//
// Regras de ouro:
//  * o VALOR vem do pedido no banco, nunca do app (o cliente pode mentir);
//  * so o dono do pedido pode pagar (RLS, usando o token dele);
//  * repetir a chamada NAO gera cobranca nova enquanto o PIX estiver valido.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import {
  adminClient, centavos, env, gatewayConfigurado, lerCobranca, montarSplit,
  pagarme, registrarResultado, somenteDigitos, telefonePagarme,
} from '../_shared/pagarme.ts'

const EXPIRA_SEGUNDOS = 3600 // 1 hora

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  const apikey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY')
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Nao autorizado.' }, { status: 401 })

  if (!gatewayConfigurado()) {
    return json({ error: 'Pagamento online ainda nao esta ativo. Escolha pagar na entrega.' }, { status: 503 })
  }

  const body = await readJson<{ pedido_id?: string }>(req)
  const pedidoId = String(body.pedido_id || '')
  if (!pedidoId) return json({ error: 'Pedido nao informado.' }, { status: 400 })

  // Le o pedido com o TOKEN DO USUARIO: a RLS garante que so o dono enxerga.
  const comoUsuario = createClient(env('SUPABASE_URL'), apikey, {
    global: { headers: { Authorization: authHeader, apikey } },
    auth: { persistSession: false },
  })

  const { data: { user } } = await comoUsuario.auth.getUser(authHeader.slice(7))
  if (!user) return json({ error: 'Sessao expirada. Entre de novo.' }, { status: 401 })

  const contaPodeGravar = async () => {
    const { data, error } = await comoUsuario.rpc('account_can_write', { p_subject: user.id })
    if (error) console.error('Falha ao validar estado da conta no PIX', { code: error.code })
    return !error && data === true
  }

  const pedidoContinuaAguardando = async () => {
    const { data, error } = await comoUsuario
      .from('pedidos')
      .select('id')
      .eq('id', pedidoId)
      .eq('cliente_id', user.id)
      .eq('status', 'aguardando_pagamento')
      .maybeSingle()
    if (error) console.error('Falha ao revalidar pedido antes do PIX', { code: error.code })
    return !error && Boolean(data)
  }

  const { data: pedido } = await comoUsuario
    .from('pedidos')
    .select('id,cliente_id,cliente_nome,total,status,payment_status,pagamento,cpf_nota,vendedor_id,platform_fee_amount')
    .eq('id', pedidoId)
    .eq('cliente_id', user.id)
    .maybeSingle()

  if (!pedido || pedido.cliente_id !== user.id) return json({ error: 'Pedido nao encontrado.' }, { status: 404 })
  if (pedido.payment_status === 'aprovado') return json({ error: 'Este pedido ja foi pago.' }, { status: 409 })
  if (pedido.payment_status === 'estornado') return json({ error: 'Este pedido ja foi estornado.' }, { status: 409 })
  if (pedido.status === 'cancelado') return json({ error: 'Este pedido foi cancelado.' }, { status: 409 })
  if (pedido.status !== 'aguardando_pagamento') {
    return json({ error: 'Este pedido nao esta aguardando pagamento.' }, { status: 409 })
  }
  if (!(await contaPodeGravar())) {
    return json({ error: 'Esta conta nao pode iniciar um novo pagamento.' }, { status: 409 })
  }

  const valor = Number(pedido.total)
  if (!Number.isFinite(valor) || valor <= 0) return json({ error: 'Valor do pedido invalido.' }, { status: 422 })

  const admin = adminClient()

  // Uma tentativa recusada pode ser refeita no mesmo pedido. O webhook so
  // aprova pedidos pendentes, entao reabre o estado antes de gerar o novo PIX.
  if (['recusado', 'rejeitado'].includes(String(pedido.payment_status))) {
    const { data: pedidoReaberto, error: erroReabrir } = await admin
      .from('pedidos')
      .update({ payment_status: 'pendente' })
      .eq('id', pedidoId)
      .eq('cliente_id', user.id)
      .eq('status', 'aguardando_pagamento')
      .select('id')
      .maybeSingle()
    if (erroReabrir || !pedidoReaberto) {
      return json({ error: 'Nao foi possivel reabrir o pagamento.' }, { status: 409 })
    }
  }

  // Idempotencia: se ja existe um PIX pendente e valido, devolve o mesmo.
  const { data: existente } = await admin
    .from('pagamentos')
    .select('id,status,pix_qr_code,pix_qr_code_base64,pix_qr_code_url,pix_expira_em,provider_charge_id')
    .eq('pedido_id', pedidoId)
    .eq('metodo', 'pix')
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existente?.pix_qr_code) {
    const aindaVale = !existente.pix_expira_em || new Date(existente.pix_expira_em).getTime() > Date.now()
    if (aindaVale) {
      // Nao devolve material PIX lido antes de uma exclusao/cancelamento que
      // possa ter vencido a corrida enquanto a consulta administrativa rodava.
      if (!(await pedidoContinuaAguardando())) {
        return json({ error: 'Este pedido nao esta mais aguardando pagamento.' }, { status: 409 })
      }
      if (!(await contaPodeGravar())) {
        return json({ error: 'Esta conta nao pode iniciar um novo pagamento.' }, { status: 409 })
      }
      return json({
        ok: true,
        payment_id: existente.id,
        status: 'pendente',
        qr_code: existente.pix_qr_code,
        qr_code_base64: existente.pix_qr_code_base64 ?? null,
        qr_code_url: existente.pix_qr_code_url ?? null,
        expires_at: existente.pix_expira_em,
      })
    }
  }

  // Dados do pagador (o gateway exige documento no PIX).
  const { data: perfil } = await admin
    .from('profiles')
    .select('nome,cpf,telefone')
    .eq('id', pedido.cliente_id)
    .maybeSingle()

  const documento = somenteDigitos(perfil?.cpf || pedido.cpf_nota)
  if (documento.length !== 11) {
    return json({ error: 'Valide seu CPF no perfil antes de pagar com PIX.', code: 'cpf_obrigatorio' }, { status: 422 })
  }

  // O gateway recusa a cobranca sem telefone do pagador.
  const telefone = telefonePagarme(perfil?.telefone)
  if (!telefone) {
    return json({ error: 'Informe seu telefone com DDD para pagar com PIX.', code: 'telefone_obrigatorio' }, { status: 422 })
  }

  // O pedido pode ter sido cancelado e a exclusao da conta pode ter comecado
  // durante as validacoes acima. account_can_write fica por ultimo para que a
  // checagem seja imediatamente anterior ao INSERT privilegiado.
  if (!(await pedidoContinuaAguardando())) {
    return json({ error: 'Este pedido nao esta mais aguardando pagamento.' }, { status: 409 })
  }
  if (!(await contaPodeGravar())) {
    return json({ error: 'Esta conta nao pode iniciar um novo pagamento.' }, { status: 409 })
  }

  // Cria o registro ANTES de cobrar: se a resposta se perder, o rastro fica.
  const { data: pagamento, error: erroInsert } = await admin
    .from('pagamentos')
    .insert({
      pedido_id: pedidoId,
      provider: 'pagarme',
      metodo: 'pix',
      valor,
      status: 'pendente',
    })
    .select('id')
    .single()

  if (erroInsert || !pagamento) {
    if (!(await contaPodeGravar())) {
      return json({ error: 'Esta conta nao pode iniciar um novo pagamento.' }, { status: 409 })
    }
    console.error('Falha ao registrar pagamento', erroInsert?.message)
    return json({ error: 'Nao foi possivel iniciar o pagamento.' }, { status: 500 })
  }

  // Divide o dinheiro na origem: a parte do vendedor cai direto no saldo dele
  // no gateway, nunca na conta da PraiaGo. Null = ainda sem recebedor; cobra
  // sem dividir (cobrar importa mais que dividir).
  const split = await montarSplit(admin, pedido)

  const payloadGateway = JSON.stringify({
    code: pedidoId.slice(0, 52),
    items: [{
      amount: centavos(valor),
      description: `Pedido PraiaGo ${pedidoId.slice(0, 8)}`,
      quantity: 1,
    }],
    customer: {
      name: (perfil?.nome || pedido.cliente_nome || 'Cliente PraiaGo').slice(0, 64),
      email: user.email || 'cliente@praiago.com.br',
      type: 'individual',
      document: documento,
      phones: telefone,
    },
    payments: [{
      payment_method: 'pix',
      pix: { expires_in: EXPIRA_SEGUNDOS },
      ...(split ? { split } : {}),
    }],
  })

  // Se o pedido mudou ou a conta perdeu permissao depois do INSERT local,
  // encerra somente as linhas ainda pendentes. Nunca regride pedido avancado.
  const pedidoAindaAguarda = await pedidoContinuaAguardando()
  const contaAindaPodeGravar = await contaPodeGravar()
  if (!pedidoAindaAguarda || !contaAindaPodeGravar) {
    const agora = new Date().toISOString()
    const [{ error: erroCancelarPagamento }, { error: erroCancelarPedido }] = await Promise.all([
      admin.from('pagamentos').update({
        status: 'cancelado',
        status_detalhe: 'Pagamento cancelado antes do envio ao gateway.',
        updated_at: agora,
      }).eq('id', pagamento.id).eq('status', 'pendente'),
      admin.from('pedidos').update({ status: 'cancelado', payment_status: 'cancelado' })
        .eq('id', pedidoId)
        .eq('cliente_id', user.id)
        .eq('status', 'aguardando_pagamento')
        .eq('payment_status', 'pendente'),
    ])
    if (erroCancelarPagamento || erroCancelarPedido) {
      console.error('Falha ao cancelar PIX local antes do gateway', {
        pagamento: erroCancelarPagamento?.code,
        pedido: erroCancelarPedido?.code,
      })
    }
    return json({
      error: contaAindaPodeGravar
        ? 'Este pedido nao esta mais aguardando pagamento.'
        : 'Esta conta nao pode iniciar um novo pagamento.',
    }, { status: 409 })
  }

  try {
    const resposta = await pagarme<Record<string, unknown>>('/orders', {
      method: 'POST',
      idempotencyKey: `pix_${pagamento.id}`,
      body: payloadGateway,
    })

    const cobranca = lerCobranca(resposta)

    if (!cobranca.pixQrCode) {
      // Guarda a resposta crua: sem isso, "PIX nao gerado" vira um mistério.
      // Costuma ser conta sem PIX habilitado ou cobranca recusada na origem.
      await admin.from('pagamentos').update({
        provider_order_id: cobranca.orderId || null,
        provider_charge_id: cobranca.chargeId || null,
        raw: cobranca.raw as Record<string, unknown>,
        status_detalhe: `sem qr_code | order=${cobranca.status} charge=${cobranca.statusDetalhe}`.slice(0, 300),
        updated_at: new Date().toISOString(),
      }).eq('id', pagamento.id)
      // O payload completo contem CPF, e-mail e telefone do pagador.
      console.error('PIX sem qr_code', {
        orderStatus: cobranca.status,
        transactionStatus: cobranca.statusDetalhe || 'sem detalhe',
      })
      throw new Error('O PIX nao foi gerado. Tente de novo.')
    }

    const expiraEm = cobranca.pixExpiraEm || new Date(Date.now() + EXPIRA_SEGUNDOS * 1000).toISOString()
    const { error: erroSalvarPix } = await admin.from('pagamentos').update({
      provider_order_id: cobranca.orderId,
      provider_charge_id: cobranca.chargeId,
      status_detalhe: cobranca.statusDetalhe || null,
      pix_qr_code: cobranca.pixQrCode,
      pix_qr_code_url: cobranca.pixQrCodeUrl || null,
      pix_expira_em: expiraEm,
      raw: cobranca.raw as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    }).eq('id', pagamento.id)
    if (erroSalvarPix) {
      // O QR continua valido. O webhook localiza o pagamento pelo code do
      // pedido e reconcilia assim que o gateway enviar o evento.
      console.error('PIX criado; persistencia local pendente', { code: erroSalvarPix.code })
    }

    // Pix ja nascer pago e raro, mas se vier, o registro trata na hora.
    if (cobranca.status && cobranca.status !== 'pending') {
      try {
        await registrarResultado(admin, pagamento.id, cobranca)
      } catch {
        console.error('PIX criado; confirmacao local pendente')
      }
    }

    return json({
      ok: true,
      payment_id: pagamento.id,
      status: 'pendente',
      qr_code: cobranca.pixQrCode,
      qr_code_base64: null,
      qr_code_url: cobranca.pixQrCodeUrl ?? null,
      expires_at: expiraEm,
    })
  } catch (erro) {
    await admin.from('pagamentos').update({
      status: 'falhou',
      status_detalhe: erro instanceof Error ? erro.message.slice(0, 300) : 'erro desconhecido',
      updated_at: new Date().toISOString(),
    }).eq('id', pagamento.id)

    return json({ error: erro instanceof Error ? erro.message : 'Nao foi possivel gerar o PIX.' }, { status: 502 })
  }
})
