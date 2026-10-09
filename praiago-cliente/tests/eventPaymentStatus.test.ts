import { beforeEach, expect, it, vi } from 'vitest'
import { consultarPagamentoIngresso } from '../src/lib/eventPaymentStatus'
const fixture = vi.hoisted(() => ({ data: null as Record<string, unknown> | null, error: null as unknown, calls: [] as unknown[][] }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: (table: string) => {
  fixture.calls.push(['from', table])
  const query = { select: (fields: string) => { fixture.calls.push(['select', fields]); return query }, eq: (field: string, value: string) => { fixture.calls.push(['eq', field, value]); return query }, maybeSingle: async () => ({ data: fixture.data, error: fixture.error }) }
  return query
} } }))
const order = '33333333-3333-4333-8333-333333333333', buyer = '11111111-1111-4111-8111-111111111111'
beforeEach(() => { fixture.calls = []; fixture.error = null; fixture.data = { id: order, status: 'pago', payment_status: 'aprovado', paid_at: '2026-10-06T12:00:00Z' } })
it('seleciona apenas status do pedido e filtra o dono além da RLS', async () => {
  expect(await consultarPagamentoIngresso(order, buyer)).toBe('approved')
  expect(fixture.calls).toEqual([['from', 'event_ticket_orders'], ['select', 'id,status,payment_status,paid_at'], ['eq', 'id', order], ['eq', 'cliente_id', buyer]])
})
it('nunca interpreta pedido sem paid_at como confirmação', async () => {
  fixture.data!.paid_at = null
  expect(await consultarPagamentoIngresso(order, buyer)).toBe('pending')
})
it.each(['reembolsado', 'chargeback', 'cancelado'])('pedido %s encerra acompanhamento', async status => {
  fixture.data!.status = status
  expect(await consultarPagamentoIngresso(order, buyer)).toBe('closed')
})
it('sem permissão ou conexão não afirma que o pagamento falhou', async () => {
  fixture.error = { message: 'Forbidden' }
  expect(await consultarPagamentoIngresso(order, buyer)).toBe('unavailable')
})
it('IDs inválidos não viram consulta ampla', async () => {
  expect(await consultarPagamentoIngresso('invalid', buyer)).toBe('unavailable')
  expect(fixture.calls).toEqual([])
})
