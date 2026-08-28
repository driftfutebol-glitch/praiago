// Abre o chamado de verificacao da conta e chama alguem para atender.
//
// POR QUE EXISTE
//
// A geracao automatica do link de KYC esta pronta e bloqueada: a Pagar.me
// responde 401 no endpoint publico para esta conta, de qualquer IP. A mesma
// operacao funciona no painel deles. Ate liberarem, um humano precisa gerar o
// link e entregar — e este chamado e o trilho desse humano.
//
// O trabalho de banco (abrir sem duplicar, validar, escrever a primeira
// mensagem) mora na funcao `public.abrir_chamado_kyc()`. Aqui fica so o que
// o banco nao pode fazer: mandar e-mail.
//
// O e-mail e o ponto do exercicio. Sem ele, o chamado fica esperando alguem
// lembrar de abrir o painel — que e a mesma espera que este fluxo existe para
// acabar. Por isso ele so vai quando o chamado NASCE: reabrir a tela dez
// vezes nao pode virar dez e-mails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { sendTransactionalEmail, emailEnv } from '../_shared/email.ts'

const env = (n: string, padrao = '') => Deno.env.get(n) || padrao

/** Para onde vai o "atende agora". Configuravel para nao ficar preso a uma pessoa. */
const DESTINO = () => emailEnv('KYC_ALERTA_EMAIL', 'ferrazpedro96@gmail.com')

function corpoDoEmail(dados: {
  vendedor: string
  email: string
  plataforma: string
  recipientId: string
  ticketId: string
  painel: string
}) {
  const { vendedor, email, plataforma, recipientId, ticketId, painel } = dados
  return `
<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,.10)">
    <div style="background:linear-gradient(120deg,#b42335,#e0523f);color:#fff;padding:22px 24px">
      <div style="font-size:11px;font-weight:800;letter-spacing:2px;opacity:.9">PRAIAGO &middot; CHAMADO</div>
      <div style="font-size:21px;font-weight:800;margin-top:6px">Chamado criado &mdash; atenda agora!</div>
    </div>
    <div style="padding:22px 24px;color:#334155;font-size:15px;line-height:1.6">
      <p style="margin:0 0 14px">Um vendedor pediu a <strong>verificacao da conta de recebimento</strong>. Ele esta com a tela aberta esperando o link.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
        <tr><td style="padding:8px 0;color:#64748b;width:120px">Vendedor</td><td style="padding:8px 0;font-weight:700;color:#0f172a">${vendedor}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">E-mail</td><td style="padding:8px 0;color:#0f172a">${email}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">App</td><td style="padding:8px 0;color:#0f172a">${plataforma}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b">Recebedor</td><td style="padding:8px 0;font-family:monospace;color:#0f172a">${recipientId}</td></tr>
      </table>
      <div style="background:#fff4e5;border:1px solid #f4d39f;border-radius:12px;padding:14px 16px;margin:16px 0">
        <div style="font-weight:800;color:#b54708;font-size:14px;margin-bottom:6px">O que fazer</div>
        <div style="color:#b54708;font-size:13.5px;line-height:1.55">
          1. Abra o recebedor no painel da Pagar.me e clique em <strong>Criar link</strong>.<br>
          2. Cole o link na resposta do chamado, no painel do PraiaGo.<br>
          3. O vendedor recebe o aviso na hora. O link vale poucos minutos &mdash; avise antes.
        </div>
      </div>
      <a href="${painel}" style="display:inline-block;background:#2a22de;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 22px;border-radius:12px">Abrir o chamado</a>
      <p style="margin:18px 0 0;font-size:12px;color:#94a3b8">Chamado ${ticketId}</p>
    </div>
  </div>
</div>`.trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Metodo nao permitido.' }, { status: 405 })

  try {
    const auth = req.headers.get('Authorization') || ''
    const token = auth.replace('Bearer ', '')
    if (!token) return json({ error: 'Nao autenticado.' }, { status: 401 })

    const url = env('SUPABASE_URL')
    const anon = env('SUPABASE_ANON_KEY')

    // Como o vendedor: a funcao do banco usa auth.uid() para saber de quem e
    // o chamado, e a RLS continua valendo. Nada aqui roda como admin.
    const comoVendedor = createClient(url, anon, { global: { headers: { Authorization: auth } } })
    const { data: userData } = await comoVendedor.auth.getUser(token)
    const uid = userData?.user?.id
    if (!uid) return json({ error: 'Sessao invalida.' }, { status: 401 })

    await readJson(req)

    const { data, error } = await comoVendedor.rpc('abrir_chamado_kyc')
    if (error) {
      // A funcao usa `raise exception` com mensagem pronta para o usuario
      // (sem conta bancaria, conta ja ativa). Repassar e melhor do que
      // esconder atras de um erro generico.
      return json({ error: error.message || 'Nao foi possivel abrir o chamado.' }, { status: 400 })
    }

    const linha = (Array.isArray(data) ? data[0] : data) as
      { ticket_id: string; criado_agora: boolean } | undefined
    if (!linha?.ticket_id) return json({ error: 'Nao foi possivel abrir o chamado.' }, { status: 500 })

    let email: { enviado: boolean; motivo?: string } = { enviado: false }

    if (linha.criado_agora) {
      // Precisa do service role so aqui: para montar o e-mail sao necessarios
      // dados do perfil e do recebedor que o proprio vendedor nao le todos.
      const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false },
      })
      const { data: perfil } = await admin
        .from('profiles').select('nome,email,role').eq('id', uid).maybeSingle()
      const { data: rec } = await admin
        .from('seller_recipients').select('recipient_id').eq('vendedor_id', uid).maybeSingle()

      try {
        const r = await sendTransactionalEmail({
          to: DESTINO(),
          subject: `[PraiaGo] Chamado criado — atenda agora! (${(perfil as { nome?: string } | null)?.nome ?? 'vendedor'})`,
          html: corpoDoEmail({
            vendedor: (perfil as { nome?: string } | null)?.nome ?? 'Vendedor',
            email: (perfil as { email?: string } | null)?.email ?? '(sem e-mail)',
            plataforma: (perfil as { role?: string } | null)?.role ?? '-',
            recipientId: (rec as { recipient_id?: string } | null)?.recipient_id ?? '(sem recebedor)',
            ticketId: linha.ticket_id,
            painel: `${env('ADMIN_SITE_URL', 'https://admin.praiago.com.br')}/atendimento/todas`,
          }),
        })
        email = r.provider === 'not_configured'
          ? { enviado: false, motivo: 'provedor de e-mail nao configurado' }
          : { enviado: true }
      } catch (e) {
        // E-mail que falha NAO pode derrubar o chamado: o chamado ja existe e
        // e ele que segura o vendedor. O aviso e o extra.
        console.error('Falha ao avisar por e-mail', e instanceof Error ? e.message : e)
        email = { enviado: false, motivo: 'falha ao enviar' }
      }
    }

    return json({
      ok: true,
      ticket_id: linha.ticket_id,
      criado_agora: linha.criado_agora,
      email,
    })
  } catch (e) {
    console.error('Erro ao abrir chamado de KYC', e instanceof Error ? e.message : e)
    return json({ error: 'Nao foi possivel abrir o chamado agora.' }, { status: 500 })
  }
})
