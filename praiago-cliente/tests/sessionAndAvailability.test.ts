import { describe, it, expect, vi } from 'vitest'
import { probeSession, revokedSession } from '../../mobile/sessionGuard'
import { restaurantOpen, sellerOpen } from '../../mobile/sellerAvailability'
import { mensagemErroPedido } from '../src/lib/checkoutError'
import { persistentAuthFetch } from '../../mobile/authFetch'
const user = { id: 'test-user' }
const validUser = { data: { user }, error: null }
const session = { data: { session: { user } }, error: null }
const failing = (error: unknown) => ({ data: { user: null }, error })
const auth = () => ({ getUser: vi.fn().mockResolvedValue(validUser), getSession: vi.fn().mockResolvedValue(session), refreshSession: vi.fn().mockResolvedValue(session) })
describe('persistent session security', () => {
  it.each([408, 429, 500, 503, undefined])('preserves temporary failure %s', async status => {
    const a = auth(); a.getUser.mockResolvedValue(failing({ status }))
    expect(await probeSession(a)).toEqual({ state: 'temporary' })
    expect(a.refreshSession).not.toHaveBeenCalled()
  })
  it.each(['user_not_found', 'user_banned', 'session_not_found', 'refresh_token_not_found'])('rejects explicit revocation %s', async code => {
    const a = auth(); a.getUser.mockResolvedValue(failing({ code, status: 401 }))
    expect(await probeSession(a)).toEqual({ state: 'invalid' })
  })
  it('renews an expired token and validates remotely', async () => {
    const a = auth(); a.getUser.mockResolvedValueOnce(failing({ code: 'bad_jwt', status: 401 }))
    expect(await probeSession(a)).toEqual({ state: 'valid', userId: user.id })
    expect(a.getUser).toHaveBeenCalledTimes(2)
    expect(a.refreshSession).toHaveBeenCalledOnce()
  })
  it('preserves the session when refresh fails temporarily', async () => {
    const a = auth(); a.getUser.mockResolvedValue(failing({ status: 401 }))
    a.refreshSession.mockResolvedValue({ data: { session: null }, error: { status: 503 } })
    expect(await probeSession(a)).toEqual({ state: 'temporary' })
  })
  it('rejects missing credentials but preserves unknown errors', async () => {
    const a = auth(); a.getUser.mockResolvedValue(failing({ name: 'AuthSessionMissingError', status: 400 }))
    a.getSession.mockResolvedValue({ data: { session: null }, error: null })
    expect(await probeSession(a)).toEqual({ state: 'invalid' })
    expect(revokedSession({ status: 403 })).toBe(false)
    expect(revokedSession({ status: 429, code: 'user_not_found' })).toBe(false)
  })
  it('handles thrown network failures', async () => {
    const a = auth(); a.getUser.mockRejectedValue(new Error('network'))
    expect(await probeSession(a)).toEqual({ state: 'temporary' })
  })
})
describe('seller availability rules', () => {
  const schedule = { horarios: [{ dia: 1, aberto: true, abre: '22:00', fecha: '04:00' }, { dia: 2, aberto: false }] }
  it('Ambulante ignores old opening hours', () => {
    expect(sellerOpen('ambulante', true, schedule, new Date('2026-09-29T15:00:00Z'))).toBe(true)
    expect(sellerOpen('ambulante', false, { horario_abre: '00:00', horario_fecha: '00:00' })).toBe(false)
  })
  it('restaurant handles yesterday overnight and closing boundary', () => {
    expect(restaurantOpen(schedule, new Date('2026-09-29T02:30:00Z'))).toBe(true)
    expect(restaurantOpen(schedule, new Date('2026-09-29T04:30:00Z'))).toBe(true)
    expect(restaurantOpen(schedule, new Date('2026-09-29T07:00:00Z'))).toBe(false)
  })
  it('never opens an unknown schedule through online fallback', () => {
    expect(restaurantOpen({})).toBeNull()
    expect(sellerOpen('restaurante', true, {})).toBe(false)
    expect(sellerOpen('cliente', true, {})).toBe(false)
  })
  it('handles legacy seconds, 24h, invalid clocks and boundary', () => {
    const date = new Date('2026-09-29T15:00:00Z')
    expect(restaurantOpen({ horario_abre: '12:00:00', horario_fecha: '22:00:00' }, date)).toBe(true)
    expect(restaurantOpen({ horario_abre: '09:00', horario_fecha: '12:00' }, date)).toBe(false)
    expect(restaurantOpen({ horario_abre: '00:00', horario_fecha: '00:00' }, date)).toBe(true)
    expect(restaurantOpen({ horario_abre: '99:00', horario_fecha: '22:00' }, date)).toBeNull()
    expect(sellerOpen('restaurante', false, { horarios: [{ dia: 2, aberto: true, vinte_quatro_horas: true }] }, date)).toBe(true)
  })
})
describe('safe checkout failures', () => {
  it('does not label every duplicate key a coupon', () => {
    expect(mensagemErroPedido({ code: '23505', message: 'duplicate key pedidos_pkey' })).not.toContain('cupom')
  })
  it('explains permissions and invalid flavors', () => {
    expect(mensagemErroPedido({ code: '42501' })).toContain('42501')
    expect(mensagemErroPedido({ code: 'PGRST301' })).toContain('sessão')
    expect(mensagemErroPedido({ code: '23514', message: 'Sabores invalidos para pizza meio a meio' })).toContain('sabor')
  })
  it('preserves known stock guidance without internal SQL', () => {
    expect(mensagemErroPedido({ code: '23514', message: 'Restam so 2 de Pizza. Ajuste a quantidade.' })).toContain('Restam so 2')
    expect(mensagemErroPedido({ code: 'XX000', message: 'secret internal SQL cupom relation' })).not.toContain('secret')
  })
  it('warns about ambiguous network failures', () => {
    expect(mensagemErroPedido({ message: 'Failed to fetch' })).toContain('duplicidade')
  })
})
describe('SDK refresh transport protection', () => {
  const base = 'https://example.supabase.co'
  it.each([408, 429, 500, 505, 503])('preserves transient refresh %s', async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status }))
    await expect(persistentAuthFetch(base, fetcher)(base+'/auth/v1/token?grant_type=refresh_token')).rejects.toThrow('temporarily')
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it.each([400, 401, 403, 200])('keeps definitive rejection and success %s', async status => {
    const response = new Response('{}', { status })
    const fetcher = vi.fn().mockResolvedValue(response)
    expect(await persistentAuthFetch(base, fetcher)(base+'/auth/v1/token?grant_type=refresh_token')).toBe(response)
  })
  it('does not change other endpoints or origins', async () => {
    const response = new Response('{}', { status: 429 })
    const fetcher = vi.fn().mockResolvedValue(response)
    const wrapped = persistentAuthFetch(base, fetcher)
    for (const path of [
      base+'/rest/v1/pedidos',
      base+'/auth/v1/token?grant_type=password',
      'https://other.supabase.co/auth/v1/token?grant_type=refresh_token',
    ]) expect(await wrapped(path)).toBe(response)
  })
})
