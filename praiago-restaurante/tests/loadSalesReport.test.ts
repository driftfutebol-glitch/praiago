import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ pages: {} as Record<string, any[]>, queries: [] as any[], fail: '' }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: (table: string) => ({ select: (columns: string) => ({ eq: (field: string, seller: string) => ({ order: () => ({ range: async (start: number, end: number) => {
  mock.queries.push({ table, columns, field, seller, start, end })
  return table === mock.fail ? { data: null, error: { message: 'teste' } } : { data: (mock.pages[table] ?? []).slice(start, end + 1), error: null }
} }) }) }) }) } }))
import { loadSalesReport } from '../src/lib/loadSalesReport'
beforeEach(() => { mock.pages = {}; mock.queries = []; mock.fail = '' })
describe('Histórico paginado e restrito à loja', () => {
  it('consulta as duas fontes sem dados pessoais e não corta em 500 ou 1000 linhas', async () => {
    mock.pages.pedidos = Array.from({ length: 1001 }, (_, id) => ({ id: String(id), total: 1, status: 'entregue', payment_status: 'aprovado', created_at: '2026-09-26T12:00:00Z', paid_at: null }))
    expect(await loadSalesReport('loja-teste')).toHaveLength(1001)
    expect(mock.queries.filter(q => q.table === 'pedidos').map(q => q.start)).toEqual([0, 500, 1000])
    expect(mock.queries.every(q => q.field === 'vendedor_id' && q.seller === 'loja-teste')).toBe(true)
    expect(mock.queries.every(q => !q.columns.includes('cliente'))).toBe(true)
  })
  it.each(['pedidos', 'financial_ledger'])('falha em %s não vira zero vendas', async table => {
    mock.fail = table
    await expect(loadSalesReport('loja-teste')).rejects.toThrow()
  })
})
