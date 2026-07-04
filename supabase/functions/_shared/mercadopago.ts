import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.108.2'

const MP_API = 'https://api.mercadopago.com'

export type MercadoPagoTokenResponse = {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
  user_id?: number | string
  refresh_token?: string
  public_key?: string
  live_mode?: boolean
}

export type MercadoPagoPayment = {
  id: number
  status?: string
  status_detail?: string
  external_reference?: string
  transaction_amount?: number
  marketplace_fee?: number
  collector_id?: number
  date_approved?: string
  metadata?: Record<string, unknown>
}

export function env(name: string, fallback = '') {
  return Deno.env.get(name) || fallback
}

export function serviceClient() {
  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Supabase service credentials are missing.')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function mpRequest<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${MP_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Mercado Pago HTTP ${response.status}`
    throw new Error(String(message))
  }
  return payload as T
}

export async function exchangeAuthorizationCode(code: string, redirectUri: string): Promise<MercadoPagoTokenResponse> {
  const response = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('MERCADOPAGO_CLIENT_ID'),
      client_secret: env('MERCADOPAGO_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || payload?.error || 'Falha ao trocar codigo OAuth.')
  return payload as MercadoPagoTokenResponse
}

export async function refreshAccessToken(refreshToken: string): Promise<MercadoPagoTokenResponse> {
  const response = await fetch(`${MP_API}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env('MERCADOPAGO_CLIENT_ID'),
      client_secret: env('MERCADOPAGO_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.message || payload?.error || 'Falha ao renovar token Mercado Pago.')
  return payload as MercadoPagoTokenResponse
}

export function tokenExpiresAt(expiresIn?: number) {
  const seconds = Number(expiresIn ?? 0)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(Date.now() + seconds * 1000).toISOString()
}

export async function upsertMercadoPagoAccount(vendedorId: string, token: MercadoPagoTokenResponse) {
  const supabase = serviceClient()
  const expiresAt = tokenExpiresAt(token.expires_in)
  const mpUserId = token.user_id ? String(token.user_id) : null

  const { error: privateError } = await supabase
    .from('mercadopago_vendor_accounts')
    .upsert({
      vendedor_id: vendedorId,
      mp_user_id: mpUserId,
      public_key: token.public_key ?? null,
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? null,
      token_type: token.token_type ?? null,
      scope: token.scope ?? null,
      live_mode: token.live_mode ?? null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
      linked_at: new Date().toISOString(),
    }, { onConflict: 'vendedor_id' })

  if (privateError) throw privateError

  const { error: publicError } = await supabase
    .from('vendor_payment_accounts')
    .upsert({
      vendedor_id: vendedorId,
      provider: 'mercadopago',
      provider_account_id: mpUserId,
      mercadopago_user_id: mpUserId,
      mercadopago_linked_at: new Date().toISOString(),
      status: 'verificado',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vendedor_id' })

  if (publicError) throw publicError
}

export async function getSellerAccessToken(vendedorId: string) {
  const supabase = serviceClient()
  const { data, error } = await supabase
    .from('mercadopago_vendor_accounts')
    .select('access_token,refresh_token,expires_at')
    .eq('vendedor_id', vendedorId)
    .maybeSingle()

  if (error) throw error
  if (!data?.access_token) return null

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  const shouldRefresh = data.refresh_token && expiresAt > 0 && expiresAt - Date.now() < 24 * 60 * 60 * 1000
  if (!shouldRefresh) return data.access_token as string

  const refreshed = await refreshAccessToken(data.refresh_token as string)
  await upsertMercadoPagoAccount(vendedorId, refreshed)
  return refreshed.access_token
}

export async function getAccessTokenByMpUserId(mpUserId: string) {
  const supabase = serviceClient()
  const { data, error } = await supabase
    .from('mercadopago_vendor_accounts')
    .select('vendedor_id,access_token')
    .eq('mp_user_id', mpUserId)
    .maybeSingle()

  if (error) throw error
  return data?.access_token as string | undefined
}
