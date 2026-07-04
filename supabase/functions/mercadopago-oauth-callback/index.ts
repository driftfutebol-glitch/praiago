import { corsHeaders } from '../_shared/cors.ts'
import { verifyOAuthState } from '../_shared/state.ts'
import { env, exchangeAuthorizationCode, upsertMercadoPagoAccount } from '../_shared/mercadopago.ts'

function html(message: string, status = 200) {
  return new Response(`<!doctype html><html><body style="font-family:system-ui;padding:32px"><h1>${message}</h1></body></html>`, {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) return html(`Mercado Pago recusou a autorizacao: ${error}`, 400)
  if (!code || !state) return html('Retorno Mercado Pago sem code/state.', 400)

  try {
    const parsed = await verifyOAuthState(env('MERCADOPAGO_OAUTH_STATE_SECRET'), state)
    const token = await exchangeAuthorizationCode(code, env('MERCADOPAGO_REDIRECT_URI'))
    await upsertMercadoPagoAccount(parsed.vendedorId, token)

    const returnTo = new URL(parsed.returnTo)
    returnTo.searchParams.set('mp', 'connected')
    return Response.redirect(returnTo.toString(), 302)
  } catch (err) {
    return html(err instanceof Error ? err.message : 'Erro ao concluir OAuth Mercado Pago.', 500)
  }
})
