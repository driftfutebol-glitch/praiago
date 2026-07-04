import { corsHeaders, json, readJson } from '../_shared/cors.ts'
import { createOAuthState } from '../_shared/state.ts'
import { env, serviceClient } from '../_shared/mercadopago.ts'

type Body = {
  vendedor_id?: string
  return_to?: string
}

async function getBearerUserId(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  const { data, error } = await serviceClient().auth.getUser(token)
  if (error || !data.user) return null
  return data.user.id
}

function safeReturnTo(value?: string) {
  const fallback = env('MERCADOPAGO_DEFAULT_RETURN_URL', 'http://localhost:5176/perfil')
  if (!value) return fallback
  try {
    const url = new URL(value)
    const allowed = env('MERCADOPAGO_ALLOWED_RETURN_ORIGINS')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
    if (allowed.length > 0 && !allowed.includes(url.origin)) return fallback
    return url.toString()
  } catch {
    return fallback
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const body = await readJson<Body>(req)
    const vendedorId = body.vendedor_id
    if (!vendedorId) return json({ error: 'Informe vendedor_id.' }, { status: 400 })

    const userId = await getBearerUserId(req)
    if (!userId) return json({ error: 'Sessao do vendedor obrigatoria.' }, { status: 401 })
    if (userId !== vendedorId) return json({ error: 'Voce so pode vincular a propria conta Mercado Pago.' }, { status: 403 })

    const clientId = env('MERCADOPAGO_CLIENT_ID')
    const redirectUri = env('MERCADOPAGO_REDIRECT_URI')
    const stateSecret = env('MERCADOPAGO_OAUTH_STATE_SECRET')
    if (!clientId || !redirectUri || !stateSecret) {
      return json({ error: 'Credenciais OAuth Mercado Pago nao configuradas.' }, { status: 500 })
    }

    const supabase = serviceClient()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id,role,status')
      .eq('id', vendedorId)
      .maybeSingle()

    if (error) throw error
    if (!profile || !['restaurante', 'ambulante'].includes(profile.role)) {
      return json({ error: 'Vendedor nao encontrado.' }, { status: 404 })
    }

    const returnTo = safeReturnTo(body.return_to)
    const state = await createOAuthState(stateSecret, vendedorId, returnTo)
    const url = new URL('https://auth.mercadopago.com/authorization')
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('platform_id', 'mp')
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)

    return json({ authorization_url: url.toString() })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Erro ao iniciar OAuth Mercado Pago.' }, { status: 500 })
  }
})
