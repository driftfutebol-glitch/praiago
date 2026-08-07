// Saque do vendedor: manda o dinheiro do saldo DELE no gateway pra conta
// bancaria dele.
//
// Com o split, o dinheiro ja e do vendedor desde o pagamento — fica parado no
// saldo dele no gateway porque o saque automatico esta desligado de proposito.
// Aqui e onde a nossa regra (entrega confirmada + D+N) vira transferencia real.
//
// Ordem importa: registra a intencao no banco PRIMEIRO (solicitar_saque valida
// saldo e cria payout + ledger de forma atomica), so depois chama o gateway.
// Se invertesse, uma falha nossa depois da transferencia deixaria dinheiro
// saindo sem registro nenhum.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { centavos, env, gatewayConfigurado, pagarme } from '../_shared/pagarme.ts'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace('Bearer ', '')
    if (!token) return json({ error: 'Nao autenticado.' }, { status: 401 })

    const url = env('SUPABASE_URL')
    const anon = createClient(url, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
    const { data: userData } = await anon.auth.getUser(token)
    const vendedorId = userData?.user?.id
    if (!vendedorId) return json({ error: 'Sessao invalida.' }, { status: 401 })

    const body = await readJson<{ valor?: number }>(req)
    const valor = Number(body.valor || 0)
    if (!valor || valor <= 0) return json({ error: 'Valor invalido.' }, { status: 400 })

    const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

    // Registro atomico: valida saldo disponivel, cria payout + lancamento.
    const { data: payout, error } = await admin.rpc('solicitar_saque', { p_vendedor: vendedorId, p_valor: valor })
    if (error) {
      // A RPC ja devolve mensagem pronta pro vendedor ("saldo insuficiente",
      // "cadastre uma chave"), entao repassa em vez de mascarar.
      return json({ error: error.message }, { status: 400 })
    }

    const payoutId = (payout as { id?: string } | null)?.id
    if (!payoutId) return json({ ok: true, payout })

    const { data: recebedor } = await admin
      .from('seller_recipients')
      .select('recipient_id')
      .eq('vendedor_id', vendedorId)
      .maybeSingle()

    // Sem recebedor no gateway o dinheiro nao esta no saldo dele — o saque
    // fica 'solicitado' e o admin resolve no painel Financeiro.
    if (!recebedor?.recipient_id || !gatewayConfigurado()) {
      return json({
        ok: true,
        payout,
        transferencia: 'manual',
        aviso: 'Seu saque foi registrado e sera processado pela nossa equipe.',
      })
    }

    try {
      const transferencia = await pagarme<{ id?: string; status?: string }>(
        `/recipients/${recebedor.recipient_id}/withdrawals`,
        {
          method: 'POST',
          // Idempotencia pelo id do payout: retry de rede nao saca duas vezes.
          idempotencyKey: `withdrawal_${payoutId}`,
          body: JSON.stringify({ amount: centavos(valor) }),
        },
      )

      await admin
        .from('payouts')
        .update({
          status: transferencia?.status === 'paid' ? 'pago' : 'processando',
          provider: 'pagarme',
          provider_transfer_id: transferencia?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', payoutId)

      return json({ ok: true, payout, transferencia: 'enviada' })
    } catch (erroGateway) {
      const e = erroGateway as { message?: string }
      // A transferencia falhou, mas o payout ja existe. Marca como falho e
      // devolve o saldo pro vendedor cancelando o lancamento do saque — senao
      // o dinheiro sumiria da carteira sem nunca ter saido.
      console.error('Falha na transferencia do saque', { payoutId })
      await admin.from('payouts')
        .update({ status: 'falhou', erro: e.message ?? 'falha na transferencia', updated_at: new Date().toISOString() })
        .eq('id', payoutId)
      await admin.from('financial_ledger')
        .update({ status: 'cancelado', descricao: 'Saque nao concluido — saldo devolvido' })
        .eq('vendedor_id', vendedorId).eq('tipo', 'saque').eq('status', 'solicitado')
      await admin.rpc('reconciliar_carteira', { p_vendedor: vendedorId })

      return json({
        error: 'Nao foi possivel concluir a transferencia agora. Seu saldo continua disponivel — tente de novo em instantes.',
      }, { status: 502 })
    }
  } catch (e) {
    console.error('Erro no saque', e instanceof Error ? e.message : e)
    return json({ error: 'Nao foi possivel solicitar o saque agora.' }, { status: 500 })
  }
})
