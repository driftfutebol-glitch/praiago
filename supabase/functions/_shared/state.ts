function base64UrlEncode(value: string) {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  return atob(padded)
}

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function hmac(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

function signable(vendedorId: string, returnTo: string, exp: number, nonce: string) {
  return `${vendedorId}.${returnTo}.${exp}.${nonce}`
}

export async function createOAuthState(secret: string, vendedorId: string, returnTo: string) {
  const exp = Date.now() + 10 * 60 * 1000
  const nonce = crypto.randomUUID()
  const sig = await hmac(secret, signable(vendedorId, returnTo, exp, nonce))
  return base64UrlEncode(JSON.stringify({ vendedor_id: vendedorId, return_to: returnTo, exp, nonce, sig }))
}

export async function verifyOAuthState(secret: string, state: string) {
  const payload = JSON.parse(base64UrlDecode(state)) as {
    vendedor_id?: string
    return_to?: string
    exp?: number
    nonce?: string
    sig?: string
  }
  if (!payload.vendedor_id || !payload.return_to || !payload.exp || !payload.nonce || !payload.sig) {
    throw new Error('State OAuth invalido.')
  }
  if (payload.exp < Date.now()) throw new Error('State OAuth expirado.')

  const expected = await hmac(secret, signable(payload.vendedor_id, payload.return_to, payload.exp, payload.nonce))
  if (expected !== payload.sig) throw new Error('Assinatura OAuth invalida.')

  return {
    vendedorId: payload.vendedor_id,
    returnTo: payload.return_to,
  }
}
