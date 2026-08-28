// Confere no gateway se o pagamento do pedido ja caiu.
// Usado pelo app enquanto o PIX esta aberto (rede de seguranca caso o webhook
// atrase). A VERDADE vem sempre da API do gateway, nunca do app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import {
  adminClient, env, gatewayConfigurado, lerCobranca, pagarme, registrarResultado,
} from '../_shared/pagarme.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  const authHeader = req.headers.get('Authorization') || ''
  const apikey = req.headers.get('apikey') || env('SUPABASE_ANON_KEY')
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Nao autorizado.' }, { status: 401 })

  const body = await readJson<{ pedido_id?: string }>(req)
  const pedidoId = String(body.pedido_id || '')
  if (!pedidoId) return json({ error: 'Pedido nao informado.' }, { status: 400 })

  // RLS: so o dono (ou o vendedor do pedido) enxerga.
  const comoUsuario = createClient(env('SUPABASE_URL'), apikey, {
    global: { headers: { Authorization: authHeader, apikey } },
    auth: { persistSession: false },
  })
  const { data: pedido } = await comoUsuario
    .from('pedidos')
    .select('id,status,payment_status')
    .eq('id', pedidoId)
    .maybeSingle()

  if (!pedido) return json({ error: 'Pedido nao encontrado.' }, { status: 404 })

  // Ja resolvido: responde do banco, sem bater no gateway a toa.
  if (pedido.payment_status !== 'pendente') {
    return json({ ok: true, payment_status: pedido.payment_status, pedido_status: pedido.status })
  }

  if (!gatewayConfigurado()) {
    return json({ ok: true, payment_status: pedido.payment_status, pedido_status: pedido.status })
  }

  const admin = adminClient()
  const { data: pagamento } = await admin
    .from('pagamentos')
    .select('id,provider_order_id,status')
    .eq('pedido_id', pedidoId)
    .in('status', ['pendente'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!pagamento?.provider_order_id) {
    return json({ ok: true, payment_status: pedido.payment_status, pedido_status: pedido.status })
  }

  try {
    const resposta = await pagarme<Record<string, unknown>>(`/orders/${pagamento.provider_order_id}`, { method: 'GET' })
    const cobranca = lerCobranca(resposta)
    const status = await registrarResultado(admin, pagamento.id, cobranca)

    const { data: atualizado } = await admin
      .from('pedidos')
      .select('status,payment_status')
      .eq('id', pedidoId)
      .maybeSingle()

    return json({
      ok: true,
      payment_status: atualizado?.payment_status ?? (status === 'pago' ? 'aprovado' : 'pendente'),
      pedido_status: atualizado?.status ?? pedido.status,
    })
  } catch (erro) {
    console.error('Falha ao consultar pagamento', erro instanceof Error ? erro.message : erro)
    // Nao derruba o app: devolve o que o banco sabe.
    return json({ ok: true, payment_status: pedido.payment_status, pedido_status: pedido.status })
  }
})
