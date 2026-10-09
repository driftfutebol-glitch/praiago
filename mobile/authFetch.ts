// Supabase Auth treats thrown fetch failures as retryable. Its installed
// version does not classify 408/429 as retryable when a refresh token expires.
// Protect only our refresh endpoint; keep true credential rejection unchanged.
export function persistentAuthFetch(supabaseUrl: string, fetcher: typeof fetch = (...args) => globalThis.fetch(...args)): typeof fetch {
  let origin: string | null = null
  try { origin = new URL(supabaseUrl).origin } catch { /* unconfigured client */ }
  return async (input, init) => {
    const response = await fetcher(input, init)
    if (origin && (response.status === 408 || response.status === 429 || response.status >= 500)) {
      let url: URL | null = null
      try { url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url) } catch { /* not an absolute URL */ }
      if (url?.origin === origin && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        throw new TypeError('Authentication temporarily unavailable; session retained for retry.')
      }
    }
    return response
  }
}
