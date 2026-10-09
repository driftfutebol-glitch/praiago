// A temporary network/rate-limit failure is not proof of a revoked account.
type ProbeAuth = {
  getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }>
  getSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>
  refreshSession(): Promise<{ data: { session: { user: { id: string } } | null }; error: unknown }>
}
export type SessionProbe = { state: 'valid'; userId: string } | { state: 'invalid' } | { state: 'temporary' }

export function revokedSession(error: unknown): boolean {
  const e = error as { status?: number; code?: string } | null
  if (!e || e.status === 408 || e.status === 429 || (e.status ?? 0) >= 500) return false
  return ['user_not_found', 'user_banned', 'session_not_found', 'refresh_token_not_found'].includes(e.code || '')
}

export async function probeSession(auth: ProbeAuth): Promise<SessionProbe> {
  try {
    const first = await auth.getUser()
    if (!first.error && first.data.user) return { state: 'valid', userId: first.data.user.id }
    if (revokedSession(first.error)) return { state: 'invalid' }
    const e = first.error as { status?: number; code?: string; name?: string } | null
    const needsRefresh = !first.error || e?.status === 401 || e?.code === 'bad_jwt' || e?.name === 'AuthSessionMissingError'
    if (!needsRefresh) return { state: 'temporary' }
    const local = await auth.getSession()
    if (local.error) return { state: revokedSession(local.error) ? 'invalid' : 'temporary' }
    if (!local.data.session) return { state: 'invalid' }
    // Validate the refreshed token with the server, not just the cached metadata.
    const renewed = await auth.refreshSession()
    if (renewed.error) return { state: revokedSession(renewed.error) ? 'invalid' : 'temporary' }
    if (!renewed.data.session) return { state: 'invalid' }
    const verified = await auth.getUser()
    if (!verified.error && verified.data.user) return { state: 'valid', userId: verified.data.user.id }
    return { state: revokedSession(verified.error) ? 'invalid' : 'temporary' }
  } catch {
    return { state: 'temporary' }
  }
}
