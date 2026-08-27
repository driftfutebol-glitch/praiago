// Link de liberacao do saldo do recebedor (o "Criar link" do painel Pagar.me).
//
// O que estava travando tudo: o recebedor nasce em status de AFILIACAO. Nesse
// estado a conta bancaria ja aparece ativa, o dinheiro das vendas ja e dele —
// mas o saldo nao MOVIMENTA. Nao transfere, nao saca. E de onde vinha o 412
// do saque, que a tela traduzia como "Edge Function returned a non-2xx status
// code" e ninguem entendia.
//
// Quem destrava e o proprio titular, abrindo um link que a Pagar.me gera e
// completando a verificacao dela. O painel tem um botao para isso; esta e a
// mesma coisa pela API, para o vendedor receber o link dentro do app em vez
// de alguem ter que abrir o dashboard e mandar por fora.
//
// O link expira rapido (a Pagar.me avisa 20 minutos no painel). Por isso ele
// e gerado SOB DEMANDA, no momento em que o vendedor toca no botao — guardar
// um link desses em banco seria guardar algo que ja nasce vencendo.
//
// Quem pode pedir: o proprio vendedor, para a sub-conta dele; ou o sysadmin,
// passando `vendedor_id`, para conseguir o link e mandar para alguem.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { adminClient, env, gatewayConfigurado, pagarme } from '../_shared/pagarme.ts'

type KycLink = {
  url?: string
  base64_qrcode?: string
  expiration_date?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  try {
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace('Bearer ', '')
    if (!token) return json({ error: 'Nao autenticado.' }, { status: 401 })

    const url = env('SUPABASE_URL')
    const anon = createClient(url, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
    const { data: userData } = await anon.auth.getUser(token)
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Sessao invalida.' }, { status: 401 })

    if (!gatewayConfigurado()) return json({ error: 'Gateway nao configurado.' }, { status: 400 })

    const admin = adminClient()
    const body = await readJson<{ vendedor_id?: string }>(req)

    // Por padrao, a propria conta. Outro vendedor so com sysadmin — sem isso,
    // qualquer vendedor pediria o link de liberacao de saldo de qualquer
    // outro, que e material de golpe.
    let alvo = uid
    if (body.vendedor_id && body.vendedor_id !== uid) {
      const { data: perfil } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle()
      if ((perfil as { role?: string } | null)?.role !== 'sysadmin') {
        return json({ error: 'Sem permissao para gerar link de outro vendedor.' }, { status: 403 })
      }
      alvo = body.vendedor_id
    }

    const { data: linha } = await admin
      .from('seller_recipients')
      .select('recipient_id,status,kyc_status')
      .eq('vendedor_id', alvo)
      .maybeSingle()

    const recipientId = (linha as { recipient_id?: string } | null)?.recipient_id
    if (!recipientId) {
      return json({
        error: 'Você ainda não tem conta de recebimento. Cadastre sua conta bancária na Carteira primeiro.',
        code: 'sem_recebedor',
      }, { status: 400 })
    }

    let link: KycLink
    try {
      link = await pagarme<KycLink>(`/recipients/${recipientId}/kyc_link`, { method: 'POST' })
    } catch (e) {
      const err = e as { status?: number; message?: string }
      // Devolve o motivo do gateway em vez de mascarar: se a conta ja estiver
      // liberada, ou se o recurso nao estiver disponivel, quem le precisa
      // saber qual dos dois e.
      return json({
        error: err.message || 'Nao foi possivel gerar o link agora.',
        code: 'gateway_recusou',
        status_gateway: err.status ?? null,
      }, { status: 409 })
    }

    if (!link?.url) {
      return json({ error: 'O provedor nao devolveu o link.', code: 'sem_link' }, { status: 502 })
    }

    return json({
      ok: true,
      url: link.url,
      qrcode: link.base64_qrcode ?? null,
      expira_em: link.expiration_date ?? null,
      recipient_id: recipientId,
      // Repetido aqui de proposito: quem chama monta a tela com isto e nao
      // precisa de uma segunda consulta so para saber se ainda falta liberar.
      nosso_status: {
        status: (linha as { status?: string }).status,
        kyc_status: (linha as { kyc_status?: string }).kyc_status,
      },
    })
  } catch (e) {
    console.error('Erro ao gerar link de KYC', e instanceof Error ? e.message : e)
    return json({ error: 'Nao foi possivel gerar o link agora.' }, { status: 500 })
  }
})
