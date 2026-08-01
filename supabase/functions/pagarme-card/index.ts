// Cartao transparente: o app tokeniza o cartao direto no gateway e manda so o
// TOKEN. O numero do cartao nunca passa pelo nosso servidor.
//
// Regras de ouro (iguais as do PIX):
//  * o VALOR vem do pedido no banco, nunca do app;
//  * so o dono do pedido pode pagar;
//  * nao cobra de novo um pedido ja pago.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import {
  adminClient, centavos, env, gatewayConfigurado, lerCobranca,
  mapearStatus, pagarme, registrarResultado, somenteDigitos, telefonePagarme,
} from '../_shared/pagarme.ts'

type Body = {
  pedido_id?: string
  token?: string
  tipo?: 'credit' | 'debit'
  installments?: number
  cpf?: string
  email?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  const apikey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY')
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Nao autorizado.' }, { status: 401 })

  if (!gatewayConfigurado()) {
    return json({ error: 'Pagamento online ainda nao esta ativo. Escolha pagar na entrega.' }, { status: 503 })
  }

  const body = await readJson<Body>(req)
  const pedidoId = String(body.pedido_id || '')
  const token = String(body.token || '')
  const tipo = body.tipo === 'debit' ? 'debit' : 'credit'
  const parcelas = Math.max(1, Math.min(12, Number(body.installments) || 1))

  if (!pedidoId) return json({ error: 'Pedido nao informado.' }, { status: 400 })
  if (!token.startsWith('token_')) return json({ error: 'Cartao invalido. Confira os dados e tente de novo.' }, { status: 400 })

  const comoUsuario = createClient(env('SUPABASE_URL'), apikey, {
    global: { headers: { Authorization: authHeader, apikey } },
    auth: { persistSession: false },
  })

  const { data: pedido } = await comoUsuario
    .from('pedidos')
    .select('id,cliente_id,cliente_nome,total,status,payment_status,cpf_nota')
    .eq('id', pedidoId)
    .maybeSingle()

  if (!pedido) return json({ error: 'Pedido nao encontrado.' }, { status: 404 })
  if (pedido.payment_status === 'aprovado') return json({ error: 'Este pedido ja foi pago.' }, { status: 409 })
  if (pedido.status === 'cancelado') return json({ error: 'Este pedido foi cancelado.' }, { status: 409 })

  const valor = Number(pedido.total)
  if (!Number.isFinite(valor) || valor <= 0) return json({ error: 'Valor do pedido invalido.' }, { status: 422 })

  const admin = adminClient()
  const { data: { user } } = await comoUsuario.auth.getUser(authHeader.slice(7))
  const { data: perfil } = await admin
    .from('profiles')
    .select('nome,cpf,telefone')
    .eq('id', pedido.cliente_id)
    .maybeSingle()

  const documento = somenteDigitos(perfil?.cpf || body.cpf || pedido.cpf_nota)
  if (documento.length !== 11) {
    return json({ error: 'Valide seu CPF no perfil antes de pagar com cartao.', code: 'cpf_obrigatorio' }, { status: 422 })
  }

  const telefone = telefonePagarme(perfil?.telefone)
  if (!telefone) {
    return json({ error: 'Informe seu telefone com DDD para pagar com cartao.', code: 'telefone_obrigatorio' }, { status: 422 })
  }

  const { data: pagamento, error: erroInsert } = await admin
    .from('pagamentos')
    .insert({
      pedido_id: pedidoId,
      provider: 'pagarme',
      metodo: tipo === 'debit' ? 'debito' : 'credito',
      valor,
      status: 'pendente',
    })
    .select('id')
    .single()

  if (erroInsert || !pagamento) {
    console.error('Falha ao registrar pagamento', erroInsert?.message)
    return json({ error: 'Nao foi possivel iniciar o pagamento.' }, { status: 500 })
  }

  try {
    const meio = tipo === 'debit' ? 'debit_card' : 'credit_card'
    const dadosCartao: Record<string, unknown> = {
      card_token: token,
      statement_descriptor: 'PRAIAGO', // max 13 caracteres na fatura
    }
    if (tipo === 'credit') dadosCartao.installments = parcelas

    const resposta = await pagarme<Record<string, unknown>>('/orders', {
      method: 'POST',
      idempotencyKey: `card_${pagamento.id}`,
      body: JSON.stringify({
        code: pedidoId.slice(0, 52),
        items: [{
          amount: centavos(valor),
          description: `Pedido PraiaGo ${pedidoId.slice(0, 8)}`,
          quantity: 1,
        }],
        customer: {
          name: (perfil?.nome || pedido.cliente_nome || 'Cliente PraiaGo').slice(0, 64),
          email: user?.email || body.email || 'cliente@praiago.com.br',
          type: 'individual',
          document: documento,
          phones: telefone,
        },
        payments: [{ payment_method: meio, [meio]: dadosCartao }],
      }),
    })

    const cobranca = lerCobranca(resposta)
    const status = await registrarResultado(admin, pagamento.id, cobranca)

    // Traduz pro vocabulario que o app ja entende.
    const statusApp = status === 'pago' ? 'paid' : status === 'pendente' ? 'pending' : 'refused'
    return json({
      ok: status === 'pago',
      payment_id: pagamento.id,
      status: statusApp,
      status_detail: cobranca.statusDetalhe || mapearStatus(cobranca.status),
    })
  } catch (erro) {
    await admin.from('pagamentos').update({
      status: 'falhou',
      status_detalhe: erro instanceof Error ? erro.message.slice(0, 300) : 'erro desconhecido',
      updated_at: new Date().toISOString(),
    }).eq('id', pagamento.id)

    return json({ error: erro instanceof Error ? erro.message : 'Nao foi possivel processar o cartao.' }, { status: 502 })
  }
})
