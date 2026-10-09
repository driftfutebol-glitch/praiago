import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
vi.mock('../src/lib/supabase', () => import('./supabaseDouble'))
import { subscribeGeolocation } from '../src/lib/sharedGeolocation'
import { useGPS } from '../src/hooks/useGPS'
import { useStore } from '../src/store/useStore'

const geo = { getCurrentPosition: vi.fn(), watchPosition: vi.fn(() => 42), clearWatch: vi.fn() }
beforeEach(() => { Object.defineProperty(navigator, 'geolocation', { configurable: true, value: geo }); useStore.setState({ sessao: null }) })
describe('GPS compartilhado', () => {
  it('usa um único watch para dois consumidores e limpa ao desmontar', () => {
    const a = subscribeGeolocation(vi.fn(), vi.fn()), b = subscribeGeolocation(vi.fn(), vi.fn())
    expect(geo.watchPosition).toHaveBeenCalledTimes(1)
    a(); expect(geo.clearWatch).not.toHaveBeenCalled()
    b(); expect(geo.clearWatch).toHaveBeenCalledWith(42)
  })
  it('sincroniza região manual entre catálogo e mapa', () => {
    const a = renderHook(() => useGPS()), b = renderHook(() => useGPS())
    act(() => a.result.current.definirPosicaoManual(-24.008, -46.412))
    expect(b.result.current.fonte).toBe('manual')
    expect(b.result.current.pos).toEqual([-24.008, -46.412])
    act(() => b.result.current.limparPosicaoManual())
    expect(a.result.current.fonte).not.toBe('manual')
  })
  it('recusa coordenadas inválidas sem salvar nem mover o mapa', () => {
    const { result } = renderHook(() => useGPS())
    const initial = result.current.pos
    act(() => result.current.definirPosicaoManual(NaN, 200))
    expect(result.current.pos).toEqual(initial)
    expect(localStorage.getItem('praiago:cliente:posmanual')).toBeNull()
  })
  it('ignora dados de localização corrompidos do armazenamento', () => {
    localStorage.setItem('praiago:cliente:posmanual', JSON.stringify({ lat: 999, lng: 0 }))
    const { result } = renderHook(() => useGPS())
    expect(result.current.fonte).not.toBe('manual')
  })
  it('o pino manual não libera operação para GPS real fora da área', () => {
    const { result } = renderHook(() => useGPS())
    const position = geo.watchPosition.mock.calls.at(-1)![0] as unknown as PositionCallback
    act(() => position({ coords: { latitude: 40.7, longitude: -74, accuracy: 50, speed: null, heading: null }, timestamp: Date.now() } as GeolocationPosition))
    act(() => result.current.definirPosicaoManual(-24.008, -46.412))
    expect(result.current.fonte).toBe('manual')
    expect(result.current.foraDaArea).toBe(true)
  })
})
