// PIX transparente: gera o QR + copia-e-cola DENTRO do app.
//
// Regras de ouro:
//  * o VALOR vem do pedido no banco, nunca do app (o cliente pode mentir);
//  * so o dono do pedido pode pagar (RLS, usando o token dele);
//  * repetir a chamada NAO gera cobranca nova enquanto o PIX estiver valido.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import {
  adminClient, centavos, env, gatewayConfigurado, lerCobranca,
  pagarme, registrarResultado, somenteDigitos,
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

  const { data: pedido } = await comoUsuario
    .from('pedidos')
    .select('id,cliente_id,cliente_nome,total,status,payment_status,pagamento,cpf_nota')
    .eq('id', pedidoId)
    .maybeSingle()

  if (!pedido) return json({ error: 'Pedido nao encontrado.' }, { status: 404 })
  if (pedido.payment_status === 'aprovado') return json({ error: 'Este pedido ja foi pago.' }, { status: 409 })
  if (pedido.status === 'cancelado') return json({ error: 'Este pedido foi cancelado.' }, { status: 409 })

  const valor = Number(pedido.total)
  if (!Number.isFinite(valor) || valor <= 0) return json({ error: 'Valor do pedido invalido.' }, { status: 422 })

  const admin = adminClient()

  // Idempotencia: se ja existe um PIX pendente e valido, devolve o mesmo.
  const { data: existente } = await admin
    .from('pagamentos')
    .select('id,status,pix_qr_code,pix_qr_code_base64,pix_expira_em,provider_charge_id')
    .eq('pedido_id', pedidoId)
    .eq('metodo', 'pix')
    .eq('status', 'pendente')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existente?.pix_qr_code) {
    const aindaVale = !existente.pix_expira_em || new Date(existente.pix_expira_em).getTime() > Date.now()
    if (aindaVale) {
      return json({
        ok: true,
        payment_id: existente.id,
        status: 'pendente',
        qr_code: existente.pix_qr_code,
        qr_code_base64: existente.pix_qr_code_base64 ?? null,
        qr_code_url: null,
        expires_at: existente.pix_expira_em,
      })
    }
  }

  // Dados do pagador (o gateway exige documento no PIX).
  const { data: { user } } = await comoUsuario.auth.getUser(authHeader.slice(7))
  const { data: perfil } = await admin
    .from('profiles')
    .select('nome,cpf,telefone')
    .eq('id', pedido.cliente_id)
    .maybeSingle()

  const documento = somenteDigitos(perfil?.cpf || pedido.cpf_nota)
  if (documento.length !== 11) {
    return json({ error: 'Valide seu CPF no perfil antes de pagar com PIX.', code: 'cpf_obrigatorio' }, { status: 422 })
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
    console.error('Falha ao registrar pagamento', erroInsert?.message)
    return json({ error: 'Nao foi possivel iniciar o pagamento.' }, { status: 500 })
  }

  try {
    const resposta = await pagarme<Record<string, unknown>>('/orders', {
      method: 'POST',
      idempotencyKey: `pix_${pagamento.id}`,
      body: JSON.stringify({
        code: pedidoId.slice(0, 52),
        items: [{
          amount: centavos(valor),
          description: `Pedido PraiaGo ${pedidoId.slice(0, 8)}`,
          quantity: 1,
        }],
        customer: {
          name: (perfil?.nome || pedido.cliente_nome || 'Cliente PraiaGo').slice(0, 64),
          email: user?.email || 'cliente@praiago.com.br',
          type: 'individual',
          document: documento,
        },
        payments: [{
          payment_method: 'pix',
          pix: { expires_in: EXPIRA_SEGUNDOS },
        }],
      }),
    })

    const cobranca = lerCobranca(resposta)
    if (!cobranca.pixQrCode) throw new Error('O PIX nao foi gerado. Tente de novo.')

    const expiraEm = cobranca.pixExpiraEm || new Date(Date.now() + EXPIRA_SEGUNDOS * 1000).toISOString()
    await admin.from('pagamentos').update({
      provider_order_id: cobranca.orderId,
      provider_charge_id: cobranca.chargeId,
      status_detalhe: cobranca.statusDetalhe || null,
      pix_qr_code: cobranca.pixQrCode,
      pix_expira_em: expiraEm,
      raw: cobranca.raw as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    }).eq('id', pagamento.id)

    // Pix ja nascer pago e raro, mas se vier, o registro trata na hora.
    if (cobranca.status && cobranca.status !== 'pending') {
      await registrarResultado(admin, pagamento.id, cobranca)
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
