import { afterEach, describe, expect, it, vi } from 'vitest'
import { installStoreUpdateNotice, usableNotice } from '../../mobile/store-update-notice'
import { compareVersions, compatibleNative, storeUrl } from '../../supabase/functions/_shared/store-update'

const notice = { id: '11111111-1111-1111-1111-111111111111', app: 'cliente' as const, platform: 'android' as const, version: '1.1', message: 'Atualize na loja.', url: storeUrl('cliente', 'android') }
let stop: (() => void) | undefined
afterEach(() => { stop?.(); stop = undefined; vi.useRealTimers() })
async function settle() { await vi.waitFor(() => expect(document.getElementById('praiago-store-notice-host')?.shadowRoot?.querySelector('a')).not.toBeNull()) }
describe('versões e compatibilidade', () => {
  it.each([['1.0','1.0.0',0],['1.10','1.2',1],['1.0','1.0.1',-1],['builtin','1.1',null],['1.1-beta','1.0',null],['9999999','1.0',null]])('compara %s e %s', (a,b,result) => expect(compareVersions(a,b)).toBe(result))
  it('preserva OTA antiga sem faixa e bloqueia faixa desconhecida ou superior', () => {
    expect(compatibleNative(undefined,null,null)).toBe(true)
    expect(compatibleNative('1.0','1.0.0','1.0.0')).toBe(true)
    expect(compatibleNative('1.1','1.0','1.0')).toBe(false)
    expect(compatibleNative(undefined,'1.0',null)).toBe(false)
  })
  it('rejeita loja errada, versão antiga e URLs arbitrárias', () => {
    expect(usableNotice(notice,'cliente','android','1.0')).toBe(true)
    expect(usableNotice(notice,'ambulante','android','1.0')).toBe(false)
    expect(usableNotice(notice,'cliente','ios','1.0')).toBe(false)
    expect(usableNotice(notice,'cliente','android','1.1.0')).toBe(false)
    expect(usableNotice({...notice,url:'https://evil.example'},'cliente','android','1.0')).toBe(false)
  })
})
describe('aviso opcional', () => {
  it('não faz consulta no navegador web', () => {
    stop = installStoreUpdateNotice('cliente', { platform: () => 'web', nativeVersion: async () => '1.0' })
    expect(fetch).not.toHaveBeenCalled(); expect(document.getElementById('praiago-store-notice-host')).toBeNull()
  })
  it('exibe link correto, não duplica e permite dispensar por 24 horas', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({notice})))
    const bridge = { platform: () => 'android', nativeVersion: async () => '1.0' }
    stop = installStoreUpdateNotice('cliente', bridge); await settle()
    installStoreUpdateNotice('cliente', bridge)
    expect(fetch).toHaveBeenCalledTimes(1)
    const shadow = document.getElementById('praiago-store-notice-host')!.shadowRoot!
    expect(shadow.querySelector('a')!.href).toBe(notice.url)
    shadow.querySelector('button')!.click(); expect(shadow.querySelector('a')).toBeNull()
    expect(Number(localStorage.getItem(`praiago:update-dismiss:cliente:android:${notice.id}`))).toBeGreaterThan(Date.now())
  })
  it('não exibe aviso dispensado, nem consulta versão desconhecida', async () => {
    localStorage.setItem(`praiago:update-dismiss:cliente:android:${notice.id}`,String(Date.now()+60000))
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({notice})))
    stop = installStoreUpdateNotice('cliente', { platform: () => 'android', nativeVersion: async () => '1.0' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(document.getElementById('praiago-store-notice-host')!.shadowRoot!.querySelector('a')).toBeNull()
    stop(); stop=installStoreUpdateNotice('cliente', { platform: () => 'android', nativeVersion: async () => 'builtin' })
    await Promise.resolve(); expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('rede indisponível não lança erro e limpar cancela consultas', async () => {
    stop = installStoreUpdateNotice('ambulante', { platform: () => 'ios', nativeVersion: async () => '1.0' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(document.getElementById('praiago-store-notice-host')!.shadowRoot!.children).toHaveLength(0)
    stop(); expect(document.getElementById('praiago-store-notice-host')).toBeNull()
    document.dispatchEvent(new Event('visibilitychange')); expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('remove aviso quando Admin pausa e não perde foco nem reexibe a cada consulta', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({notice}))).mockResolvedValueOnce(new Response(JSON.stringify({notice:null})))
    stop = installStoreUpdateNotice('cliente', { platform: () => 'android', nativeVersion: async () => '1.0' })
    await vi.advanceTimersByTimeAsync(1)
    expect(document.getElementById('praiago-store-notice-host')!.shadowRoot!.querySelector('a')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(300001)
    expect(document.getElementById('praiago-store-notice-host')!.shadowRoot!.querySelector('a')).toBeNull()
  })
})
