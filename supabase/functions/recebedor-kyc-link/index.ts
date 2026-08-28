// Verificacao da conta do recebedor (a "Prova de Vida" da Pagar.me).
//
// O que estava travando tudo: o recebedor nasce em status de AFILIACAO. Nesse
// estado a conta bancaria ja aparece ativa, o dinheiro das vendas ja e dele —
// mas o saldo nao MOVIMENTA. Nao transfere, nao saca. E de onde vinha o 412
// do saque, que a tela traduzia como "Edge Function returned a non-2xx status
// code" e ninguem entendia.
//
// A CORRECAO DE 27/08/2026 -----------------------------------------------
//
// A primeira versao disparava `POST /recipients/{id}/kyc_link` assim que o
// vendedor tocava no botao. Dava erro sempre, e a mensagem que chegava na
// tela era "Pagamento indisponivel no momento" — que nao tem nada a ver.
//
// A documentacao da Pagar.me e explicita: esse endpoint so vale "quando o
// recebedor atingir o status de affiliation E seu kyc_details for
// partially_denied". Ou seja, o link existe para o caso em que a analise
// automatica emperrou e um humano precisa fazer a biometria. No caminho
// normal nao ha link nenhum: a Pagar.me analisa sozinha e o vendedor so
// espera.
//
// Entao agora a funcao PERGUNTA antes de pedir. Le o recebedor, decide, e
// devolve uma de tres coisas:
//
//   - `link`     : ha o que o vendedor fazer, e este e o endereco.
//   - `aguardar` : esta em analise, nao ha nada para ele fazer agora.
//   - `resolvido`: a conta ja esta liberada, ou foi recusada de vez.
//
// Isso importa porque a tela usa a resposta para decidir se mostra botao. Um
// botao que nao pode funcionar e pior do que nenhum botao: o vendedor aperta,
// leva erro, e conclui que o app esta quebrado.
//
// O link, quando existe, expira em 20 minutos. Por isso e gerado SOB DEMANDA,
// no momento em que o vendedor toca — guardar um link desses em banco seria
// guardar algo que ja nasce vencendo.
//
// Quem pode pedir: o proprio vendedor, para a sub-conta dele; ou o sysadmin,
// passando `vendedor_id`, para conseguir o link e mandar para alguem.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'
import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { adminClient, env, gatewayConfigurado, pagarme } from '../_shared/pagarme.ts'

const CONTEXTO = 'a verificacao da conta'

type KycLink = {
  url?: string
  base64_qrcode?: string
  base64?: string
  expiration_date?: string
  expires_at?: string
}

type Recipient = {
  id?: string
  status?: string
  kyc_link?: string
  kyc_details?: { status?: string } | string
  default_bank_account?: { status?: string }
}

/** O texto de `kyc_details` vem ora como objeto, ora como string. */
function detalheKyc(rec: Recipient): string {
  const d = rec?.kyc_details
  if (!d) return ''
  return String(typeof d === 'string' ? d : d.status ?? '').toLowerCase()
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
    let ehSysadmin = false
    if (body.vendedor_id && body.vendedor_id !== uid) {
      const { data: perfil } = await admin.from('profiles').select('role').eq('id', uid).maybeSingle()
      ehSysadmin = (perfil as { role?: string } | null)?.role === 'sysadmin'
      if (!ehSysadmin) {
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

    // 1. Estado real, direto no gateway. Nossa tabela pode estar velha: quem
    //    a atualiza e a varredura de 15 em 15 minutos.
    let rec: Recipient
    try {
      rec = await pagarme<Recipient>(`/recipients/${recipientId}`, { method: 'GET', contexto: CONTEXTO })
    } catch (e) {
      const err = e as { status?: number; message?: string }
      return json({
        error: err.message || 'Nao foi possivel consultar a sua conta agora.',
        code: 'gateway_indisponivel',
        status_gateway: err.status ?? null,
      }, { status: 502 })
    }

    const status = String(rec?.status ?? '').toLowerCase()
    const detalhe = detalheKyc(rec)

    // 2. Casos em que nao ha link porque nao ha o que o vendedor fazer.
    if (status === 'active') {
      return json({
        ok: true,
        situacao: 'resolvido',
        titulo: 'Conta já verificada',
        mensagem: 'Sua conta está liberada. Você já pode vender e sacar o seu dinheiro.',
        status_gateway: status,
      })
    }

    if (status === 'refused' || status === 'rejected') {
      return json({
        ok: true,
        situacao: 'resolvido',
        titulo: 'Verificação não aprovada',
        mensagem: 'A verificação da sua conta não foi aprovada pelo provedor de pagamento. '
          + 'Fale com a gente pelo chat do app para entender o que fazer.',
        status_gateway: status,
      })
    }

    if (status === 'suspended' || status === 'blocked' || status === 'inactive') {
      return json({
        ok: true,
        situacao: 'resolvido',
        titulo: 'Conta bloqueada',
        mensagem: 'A conta de recebimento está bloqueada no provedor de pagamento. '
          + 'Fale com a gente pelo chat do app.',
        status_gateway: status,
      })
    }

    // 3. Ha link? O proprio recebedor as vezes ja carrega um.
    let link: KycLink | null = rec?.kyc_link ? { url: rec.kyc_link } : null

    // 4. Senao, pede um — mas so quando a Pagar.me diz que existe um para
    //    pedir. Fora dessa janela o endpoint recusa, e era esse o erro.
    const podePedir = status === 'affiliation' && detalhe.includes('partially_denied')
    let recusa: { status: number | null; mensagem: string } | null = null
    if (!link) {
      try {
        link = await pagarme<KycLink>(`/recipients/${recipientId}/kyc_link`, { method: 'POST', contexto: CONTEXTO })
      } catch (e) {
        const err = e as { status?: number; message?: string }
        console.log('kyc_link recusado', { status: err.status, recipiente: status, detalhe })
        link = null
        recusa = { status: err.status ?? null, mensagem: err.message ?? '' }
      }
    }

    if (link?.url) {
      return json({
        ok: true,
        situacao: 'link',
        url: link.url,
        qrcode: link.base64_qrcode ?? link.base64 ?? null,
        expira_em: link.expiration_date ?? link.expires_at ?? null,
        recipient_id: recipientId,
        status_gateway: status,
      })
    }

    // 5. Nao veio link. Duas leituras bem diferentes, e a tela precisa saber
    //    qual das duas e:
    //
    //    a) o recebedor NAO esta na janela em que existe link (o caminho
    //       normal): a Pagar.me esta conferindo sozinha e nao ha o que fazer;
    //
    //    b) o recebedor ESTA na janela documentada (affiliation +
    //       partially_denied) e mesmo assim o gateway recusou: isso e um
    //       problema de verdade, do lado da conta, e esconder atras de
    //       "aguarde" faria o vendedor esperar para sempre.
    if (podePedir && recusa) {
      return json({
        ok: true,
        situacao: 'travado',
        titulo: 'A verificação não pôde ser aberta',
        mensagem: 'O seu cadastro está no ponto em que falta a verificação por biometria, '
          + 'mas o provedor de pagamento não liberou o link. Isso é com a gente: já registramos aqui '
          + 'e vamos resolver com o provedor. Você não precisa fazer nada.',
        status_gateway: status,
        detalhe_kyc: detalhe || null,
        // Para o suporte e para o log: e a unica coisa que diz onde doeu.
        recusa_gateway: recusa,
      })
    }

    return json({
      ok: true,
      situacao: 'aguardar',
      titulo: 'Verificação em andamento',
      mensagem: 'O provedor de pagamento está conferindo os seus dados. '
        + 'Não há nada para você fazer agora — assim que for aprovado, você recebe um aviso aqui no app '
        + 'e o saque fica liberado. Se precisarem de algo seu, o botão de verificação aparece nesta tela.',
      status_gateway: status,
      detalhe_kyc: detalhe || null,
      recusa_gateway: recusa,
    })
  } catch (e) {
    console.error('Erro ao gerar link de KYC', e instanceof Error ? e.message : e)
    return json({ error: 'Nao foi possivel consultar a verificacao agora.' }, { status: 500 })
  }
})
