import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Sale } from '../src/lib/salesReport'
const mock = vi.hoisted(() => ({ seller: 'loja-a' as string | undefined, orders: [] as any[], load: vi.fn(), ledgerUpdate: undefined as (() => void) | undefined, remove: vi.fn() }))
vi.mock('../src/lib/auth', () => ({ getSessao: () => mock.seller ? { id: mock.seller } : null }))
vi.mock('../src/store/useOrders', () => ({ useOrders: (selector: (state: any) => unknown) => selector({ pedidos: mock.orders }) }))
vi.mock('../src/lib/loadSalesReport', () => ({ loadSalesReport: mock.load }))
vi.mock('../src/lib/supabase', () => ({ supabase: {
  channel: () => ({ on: (_event: string, _options: unknown, callback: () => void) => { mock.ledgerUpdate = callback; return { subscribe: () => ({ id: 'teste' }) } } }), removeChannel: mock.remove,
} }))
import { useSalesReport } from '../src/hooks/useSalesReport'
const sale: Sale = { id: 'teste', status: 'entregando', payment: 'aprovado', date: '2026-09-26T12:00:00Z', day: '2026-09-26', gross: 10720, net: 9648, commission: 1072, providerFee: 0 }
beforeEach(() => { mock.seller = 'loja-a'; mock.orders = []; mock.load.mockReset(); mock.load.mockResolvedValue([sale]) })
describe('Consulta viva com falhas explícitas', () => {
  it('carrega a loja e atualiza após mudança dos pedidos', async () => {
    const { result, rerender } = renderHook(useSalesReport)
    expect(result.current.report).toBe(null)
    await waitFor(() => expect(result.current.report).toEqual([sale]))
    expect(mock.load).toHaveBeenCalledWith('loja-a')
    mock.orders = [{}]
    rerender()
    await waitFor(() => expect(mock.load).toHaveBeenCalledTimes(2))
  })
  it('não transforma erro em lista vazia e permite tentar novamente', async () => {
    mock.load.mockRejectedValueOnce(new Error('sem conexão'))
    const { result } = renderHook(useSalesReport)
    await waitFor(() => expect(result.current.error).not.toBe(null))
    expect(result.current.report).toBe(null)
    expect(result.current.loading).toBe(false)
    await act(async () => { await result.current.refresh() })
    expect(result.current.report).toEqual([sale])
    expect(result.current.error).toBe(null)
  })
  it('preserva a última consulta se a atualização falhar', async () => {
    const { result } = renderHook(useSalesReport)
    await waitFor(() => expect(result.current.report).toEqual([sale]))
    mock.load.mockRejectedValueOnce(new Error('offline'))
    await act(async () => { await result.current.refresh() })
    expect(result.current.report).toEqual([sale])
    expect(result.current.updatedAt).not.toBe(null)
    expect(result.current.error).not.toBe(null)
  })
  it('responde a lançamentos financeiros e reconexão; limpa assinatura ao sair', async () => {
    const { result, unmount } = renderHook(useSalesReport)
    await waitFor(() => expect(result.current.report).toEqual([sale]))
    act(() => { mock.ledgerUpdate?.() })
    await waitFor(() => expect(mock.load).toHaveBeenCalledTimes(2))
    act(() => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(mock.load).toHaveBeenCalledTimes(3))
    unmount()
    expect(mock.remove).toHaveBeenCalled()
  })
  it('uma resposta atrasada não sobrescreve uma consulta nova', async () => {
    let resolveOld!: (sales: Sale[]) => void
    mock.load.mockReturnValueOnce(new Promise< Sale[] >(resolve => { resolveOld = resolve }))
    const { result } = renderHook(useSalesReport)
    await act(async () => { await result.current.refresh() })
    expect(result.current.report).toEqual([sale])
    await act(async () => { resolveOld([]) })
    expect(result.current.report).toEqual([sale])
  })
  it('não consulta sem sessão', () => {
    mock.seller = undefined
    const { result } = renderHook(useSalesReport)
    expect(mock.load).not.toHaveBeenCalled()
    expect(result.current.report).toBe(null)
  })
})
