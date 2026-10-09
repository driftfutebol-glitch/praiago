import { describe, expect, it } from 'vitest'
import { buildSales, summarizeSales, salesChart, brazilDay, type SalesOrder, type SalesLedger } from '../src/lib/salesReport'

const now = new Date('2026-09-28T15:00:00Z')
const order = (id: string, patch: Partial<SalesOrder> = {}): SalesOrder => ({ id, total: '107.20', status: 'entregando', payment_status: 'aprovado', created_at: '2026-09-26T14:00:00Z', paid_at: '2026-09-26T14:01:00Z', ...patch })
const ledger = (id: string): SalesLedger[] => [
  { id: `${id}-net`, pedido_id: id, tipo: 'repasse_vendedor', valor: '96.48', status: 'pendente' },
  { id: `${id}-fee`, pedido_id: id, tipo: 'taxa_plataforma', valor: '10.72', status: 'pendente' },
]
describe('Uma regra de vendas para Painel, Vendas e Perfil', () => {
  it('conta venda paga em entrega e usa a comissão/líquido reais, sem taxa fixa', () => {
    const summary = summarizeSales(buildSales([order('sale')], ledger('sale')), 'all', now)
    expect(summary).toMatchObject({ count: 1, delivered: 0, inProgress: 1, gross: 10720, commission: 1072, net: 9648, providerFee: 0 })
  })
  it.each(['novo', 'preparando', 'pronto', 'entregando', 'entregue'])('inclui pagamento aprovado em %s', status => {
    expect(buildSales([order('sale', { status })], ledger('sale'))).toHaveLength(1)
  })
  it.each(['pendente', 'recusado', 'rejeitado', 'cancelado', 'estornado', 'chargeback', 'estorno_pendente'])('não conta pagamento %s, mesmo com ledger antigo', payment_status => {
    expect(buildSales([order('sale', { payment_status })], ledger('sale'))).toEqual([])
  })
  it.each(['cancelado', 'aguardando_pagamento', 'pagamento_recusado', 'expirado', 'desconhecido'])('não conta pedido %s', status => {
    expect(buildSales([order('sale', { status })], ledger('sale'))).toEqual([])
  })
  it('presencial fica identificado, e legado sem pagamento exige ledger ativo', () => {
    const summary = summarizeSales(buildSales([order('cash', { payment_status: 'presencial' }), order('legacy', { payment_status: null }), order('unknown', { payment_status: null })], [...ledger('cash'), ...ledger('legacy')]), 'all', now)
    expect(summary.count).toBe(2)
    expect(summary.cashOrders).toBe(1)
  })
  it('não estima comissão ou líquido se falta lançamento financeiro', () => {
    const summary = summarizeSales(buildSales([order('sale')], []), 'all', now)
    expect(summary).toMatchObject({ count: 1, gross: 10720, unreconciled: 1, net: null, commission: null })
    expect(summarizeSales(buildSales([order('sale')], ledger('sale').slice(0, 1)), 'all', now)).toMatchObject({ gross: 10720, commission: null, net: null })
  })
  it('ignora cancelados, saques e antecipação; não duplica IDs e inclui taxa real do provedor', () => {
    const rows = ledger('sale')
    rows.push({ id: 'provider', pedido_id: 'sale', tipo: 'taxa_provedor', valor: 1.33, status: 'disponivel' }, { id: 'cancel', pedido_id: 'sale', tipo: 'taxa_plataforma', valor: 999, status: 'cancelado' }, { id: 'payout', pedido_id: 'sale', tipo: 'saque', valor: 100, status: 'pago' })
    const summary = summarizeSales(buildSales([order('sale'), order('sale')], [...rows, ...rows]), 'all', now)
    expect(summary).toMatchObject({ count: 1, gross: 10853, net: 9648, commission: 1072, providerFee: 133 })
  })
  it('separa hoje do histórico e considera o dia do pagamento em Brasília', () => {
    const sales = buildSales([order('old'), order('night', { created_at: '2026-09-25T12:00:00Z', paid_at: '2026-09-28T02:59:00Z' }), order('today', { paid_at: '2026-09-28T03:00:00Z' })], [])
    expect(brazilDay('2026-09-28T02:59:00Z')).toBe('2026-09-27')
    expect(summarizeSales(sales, 'today', now).count).toBe(1)
    expect(summarizeSales(sales, 'all', now).count).toBe(3)
    expect(salesChart(sales, now).at(-2)?.count).toBe(1)
    expect(salesChart(sales, now).at(-1)?.count).toBe(1)
  })
  it('os filtros incluem exatamente 7 e 30 dias e o mês atual', () => {
    const sales = buildSales(['2026-08-01', '2026-08-29', '2026-08-30', '2026-09-01', '2026-09-21', '2026-09-22', '2026-09-28'].map(day => order(day, { paid_at: `${day}T15:00:00Z` })), [])
    expect(summarizeSales(sales, '7d', now).count).toBe(2)
    expect(summarizeSales(sales, '30d', now).count).toBe(5)
    expect(summarizeSales(sales, 'month', now).count).toBe(4)
    expect(summarizeSales(sales, 'all', now).count).toBe(7)
  })
  it('mantém aritmética em centavos e rejeita valores inválidos', () => {
    const sales = buildSales([order('a', { total: 0.1 }), order('b', { total: 0.2 })], [])
    expect(summarizeSales(sales, 'all', now).gross).toBe(30)
    expect(() => buildSales([order('invalid', { total: 'inválido' })], [])).toThrow()
  })
})
