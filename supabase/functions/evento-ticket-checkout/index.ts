// Compra de ingresso de evento, no Pagar.me (checkout transparente).
//
// Substitui a versao antiga em Mercado Pago, que estava morta: o projeto nao
// tem mais MERCADOPAGO_ACCESS_TOKEN e toda compra falhava com 409.
//
// Regras de ouro (as mesmas do pedido de comida):
//  * o VALOR vem do banco, nunca do app (o gatilho calcula a partir do lote);
//  * so cliente logado compra, e a compra fica no nome dele;
//  * o markup depende do metodo: credito paga mais que pix/debito, porque a
//    taxa do gateway e maior. O cliente ve so o preco final.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import {
  adminClient, centavos, env, gatewayConfigurado, lerCobranca,
  mapearStatus, pagarme, registrarResultado, somenteDigitos, telefonePagarme,
} from '../_shared/pagarme.ts'

const PIX_EXPIRA_SEGUNDOS = 3600

type Body = {
  ticket_lot_id?: string
  quantidade?: number
  metodo?: 'pix' | 'credito' | 'debito'
  token?: string
  installments?: number
  cpf?: string
  cliente_nome?: string
  cliente_telefone?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  const apikey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY')
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Entre na sua conta para comprar ingresso.' }, { status: 401 })

  if (!gatewayConfigurado()) {
    return json({ error: 'A venda de ingressos esta temporariamente indisponivel.' }, { status: 503 })
  }

  const body = await readJson<Body>(req)
  const loteId = String(body.ticket_lot_id || '')
  const metodo = body.metodo === 'credito' ? 'credito' : body.metodo === 'debito' ? 'debito' : 'pix'
  const quantidade = Math.max(1, Math.min(20, Math.floor(Number(body.quantidade) || 1)))
  const parcelas = Math.max(1, Math.min(12, Number(body.installments) || 1))
  const token = String(body.token || '')

  if (!loteId) return json({ error: 'Ingresso nao informado.' }, { status: 400 })
  if (metodo !== 'pix' && !token.startsWith('token_')) {
    return json({ error: 'Cartao invalido. Confira os dados e tente de novo.' }, { status: 400 })
  }

  const comoUsuario = createClient(env('SUPABASE_URL'), apikey, {
    global: { headers: { Authorization: authHeader, apikey } },
    auth: { persistSession: false },
  })

  const { data: { user } } = await comoUsuario.auth.getUser(authHeader.slice(7))
  if (!user) return json({ error: 'Sessao expirada. Entre de novo.' }, { status: 401 })

  const admin = adminClient()

  // O lote e lido com service role, mas as MESMAS regras que a RLS aplica ao
  // cliente sao checadas na mao aqui: so lote liberado de evento ativo vende.
  const { data: lote } = await admin
    .from('event_ticket_lots')
    .select('id,evento_id,nome,status,estoque_disponivel,preco_venda,preco_venda_credito,eventos!inner(id,titulo,data,local_nome,status)')
    .eq('id', loteId)
    .maybeSingle()

  if (!lote) return json({ error: 'Ingresso nao encontrado.' }, { status: 404 })
  if (lote.status !== 'disponivel') return json({ error: 'Este lote nao esta a venda.' }, { status: 409 })

  const evento = Array.isArray(lote.eventos) ? lote.eventos[0] : lote.eventos
  if (!evento || evento.status !== 'ativo') return json({ error: 'Evento indisponivel para venda.' }, { status: 409 })
  if (lote.estoque_disponivel !== null && Number(lote.estoque_disponivel) < quantidade) {
    return json({ error: 'Nao ha ingressos suficientes neste lote.' }, { status: 409 })
  }

  const { data: perfil } = await admin
    .from('profiles')
    .select('nome,cpf,telefone')
    .eq('id', user.id)
    .maybeSingle()

  const documento = somenteDigitos(perfil?.cpf || body.cpf)
  if (documento.length !== 11) {
    return json({ error: 'Valide seu CPF no perfil antes de comprar ingresso.', code: 'cpf_obrigatorio' }, { status: 422 })
  }

  const telefone = telefonePagarme(perfil?.telefone || body.cliente_telefone)
  if (!telefone) {
    return json({ error: 'Informe seu telefone com DDD para comprar ingresso.', code: 'telefone_obrigatorio' }, { status: 422 })
  }

  // Cria a compra ANTES de cobrar. O gatilho calcula o total pelo lote e pelo
  // metodo, e ja reserva o estoque — se faltar ingresso, falha aqui e nao cobra.
  const { data: compra, error: erroCompra } = await admin
    .from('event_ticket_orders')
    .insert({
      ticket_lot_id: lote.id,
      evento_id: lote.evento_id,
      cliente_id: user.id,
      cliente_nome: (perfil?.nome || body.cliente_nome || 'Cliente PraiaGo').slice(0, 120),
      cliente_email: user.email || null,
      cliente_telefone: perfil?.telefone || body.cliente_telefone || null,
      quantidade,
      metodo_pagamento: metodo,
      status: 'aguardando_pagamento',
      payment_provider: 'pagarme',
      payment_status: 'pendente',
    })
    .select('id,total,preco_unit,markup_total,subtotal_origem')
    .single()

  if (erroCompra || !compra) {
    const semEstoque = /indisponivel|estoque/i.test(erroCompra?.message || '')
    console.error('Falha ao registrar compra de ingresso', { code: erroCompra?.code })
    return json(
      { error: semEstoque ? 'Ingresso esgotado enquanto voce finalizava.' : 'Nao foi possivel iniciar a compra.' },
      { status: semEstoque ? 409 : 500 },
    )
  }

  const valor = Number(compra.total)
  if (!Number.isFinite(valor) || valor <= 0) {
    await admin.from('event_ticket_orders').update({ status: 'cancelado', canceled_at: new Date().toISOString() }).eq('id', compra.id)
    return json({ error: 'Valor do ingresso invalido.' }, { status: 422 })
  }

  const { data: pagamento, error: erroPagamento } = await admin
    .from('pagamentos')
    .insert({
      ticket_order_id: compra.id,
      provider: 'pagarme',
      metodo,
      valor,
      status: 'pendente',
    })
    .select('id')
    .single()

  if (erroPagamento || !pagamento) {
    await admin.from('event_ticket_orders').update({ status: 'cancelado', canceled_at: new Date().toISOString() }).eq('id', compra.id)
    console.error('Falha ao registrar pagamento do ingresso', { code: erroPagamento?.code })
    return json({ error: 'Nao foi possivel iniciar o pagamento.' }, { status: 500 })
  }

  const descricao = `${quantidade}x ${lote.nome} - ${evento.titulo}`.slice(0, 250)
  const cliente = {
    name: (perfil?.nome || body.cliente_nome || 'Cliente PraiaGo').slice(0, 64),
    email: user.email || 'cliente@praiago.com.br',
    type: 'individual',
    document: documento,
    phones: telefone,
  }

  let gatewayRespondeu = false
  try {
    let payment: Record<string, unknown>
    if (metodo === 'pix') {
      payment = { payment_method: 'pix', pix: { expires_in: PIX_EXPIRA_SEGUNDOS } }
    } else {
      const meio = metodo === 'debito' ? 'debit_card' : 'credit_card'
      const dadosCartao: Record<string, unknown> = { card_token: token, statement_descriptor: 'PRAIAGO' }
      if (metodo === 'credito') dadosCartao.installments = parcelas
      payment = { payment_method: meio, [meio]: dadosCartao }
    }

    const resposta = await pagarme<Record<string, unknown>>('/orders', {
      method: 'POST',
      idempotencyKey: `ticket_${pagamento.id}`,
      body: JSON.stringify({
        // O webhook confere este code contra a compra antes de aprovar.
        code: compra.id.slice(0, 52),
        items: [{ amount: centavos(valor), description: descricao, quantity: 1 }],
        customer: cliente,
        payments: [payment],
      }),
    })
    gatewayRespondeu = true

    const cobranca = lerCobranca(resposta)

    if (metodo === 'pix') {
      if (!cobranca.pixQrCode) {
        await admin.from('pagamentos').update({
          provider_order_id: cobranca.orderId || null,
          provider_charge_id: cobranca.chargeId || null,
          raw: cobranca.raw as Record<string, unknown>,
          status_detalhe: `sem qr_code | order=${cobranca.status} charge=${cobranca.statusDetalhe}`.slice(0, 300),
          updated_at: new Date().toISOString(),
        }).eq('id', pagamento.id)
        console.error('PIX de ingresso sem qr_code', { orderStatus: cobranca.status })
        throw new Error('O PIX nao foi gerado. Tente de novo.')
      }

      const expiraEm = cobranca.pixExpiraEm || new Date(Date.now() + PIX_EXPIRA_SEGUNDOS * 1000).toISOString()
      await admin.from('pagamentos').update({
        provider_order_id: cobranca.orderId,
        provider_charge_id: cobranca.chargeId,
        status_detalhe: cobranca.statusDetalhe || null,
        pix_qr_code: cobranca.pixQrCode,
        pix_qr_code_url: cobranca.pixQrCodeUrl || null,
        pix_expira_em: expiraEm,
        raw: cobranca.raw as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      }).eq('id', pagamento.id)

      return json({
        ok: true,
        order_id: compra.id,
        payment_id: pagamento.id,
        metodo,
        total: valor,
        status: 'pendente',
        qr_code: cobranca.pixQrCode,
        qr_code_url: cobranca.pixQrCodeUrl ?? null,
        expires_at: expiraEm,
      })
    }

    const status = await registrarResultado(admin, pagamento.id, cobranca)
    return json({
      ok: status === 'pago',
      order_id: compra.id,
      payment_id: pagamento.id,
      metodo,
      total: valor,
      status: status === 'pago' ? 'paid' : status === 'pendente' ? 'pending' : 'refused',
      status_detail: cobranca.statusDetalhe || mapearStatus(cobranca.status),
    })
  } catch (erro) {
    // Se o gateway ja avaliou a cobranca, nao marca como falha por causa de um
    // erro posterior no banco — o webhook reconcilia.
    if (gatewayRespondeu) {
      console.error('Cobranca de ingresso criada; confirmacao local pendente')
      return json({
        ok: false,
        order_id: compra.id,
        payment_id: pagamento.id,
        status: 'pending',
        status_detail: 'Confirmacao em processamento.',
      }, { status: 202 })
    }

    const agora = new Date().toISOString()
    await admin.from('pagamentos').update({
      status: 'falhou',
      status_detalhe: erro instanceof Error ? erro.message.slice(0, 300) : 'erro desconhecido',
      updated_at: agora,
    }).eq('id', pagamento.id)
    // Devolve o estoque reservado (o gatilho reage a mudanca de status).
    await admin.from('event_ticket_orders')
      .update({ status: 'cancelado', payment_status: 'cancelado', canceled_at: agora })
      .eq('id', compra.id)
      .eq('status', 'aguardando_pagamento')

    return json({ error: erro instanceof Error ? erro.message : 'Nao foi possivel processar o pagamento.' }, { status: 502 })
  }
})
