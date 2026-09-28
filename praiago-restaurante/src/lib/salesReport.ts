// Painel, Vendas e Perfil compartilham as regras. Valores vêm do ledger da Carteira.
export type SalesPeriod = 'all' | 'today' | '7d' | '30d' | 'month'
export const salesPeriods: { value: SalesPeriod; label: string }[] = [
  { value: 'all', label: 'Todo o histórico' }, { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' }, { value: '30d', label: 'Últimos 30 dias' }, { value: 'month', label: 'Este mês' },
]
export type SalesOrder = { id: string; total: number | string; status: string; payment_status: string | null; created_at: string; paid_at: string | null }
export type SalesLedger = { id: string; pedido_id: string | null; tipo: string; valor: number | string; status: string }
export type Sale = {
  id: string; status: string; payment: string; date: string; day: string
  gross: number; commission: number | null; providerFee: number | null; net: number | null
}
export type SalesSummary = {
  sales: Sale[]; count: number; delivered: number; inProgress: number; gross: number
  commission: number | null; providerFee: number | null; net: number | null
  average: number; unreconciled: number; cashOrders: number
}
const saleStatuses = new Set(['novo', 'preparando', 'pronto', 'entregando', 'entregue'])
const paidStatuses = new Set(['aprovado', 'pago', 'presencial'])
const moneyTypes = new Set(['repasse_vendedor', 'taxa_plataforma', 'taxa_provedor'])
const brazilDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
export const formatBRL = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export function brazilDay(date: string | Date): string {
  const parts = brazilDate.formatToParts(new Date(date))
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}
function cents(value: number | string): number {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) throw new Error('Valor financeiro inválido')
  return Math.round(amount * 100)
}
export function shiftDay(day: string, difference: number): string {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + difference)
  return date.toISOString().slice(0, 10)
}
export function buildSales(orders: SalesOrder[], ledger: SalesLedger[]): Sale[] {
  const byOrder = new Map<string, SalesLedger[]>()
  for (const row of new Map(ledger.map(row => [row.id, row])).values()) {
    if (!row.pedido_id || row.status === 'cancelado' || !moneyTypes.has(row.tipo)) continue
    const rows = byOrder.get(row.pedido_id) ?? []
    rows.push(row)
    byOrder.set(row.pedido_id, rows)
  }
  const sales: Sale[] = []
  for (const order of new Map(orders.map(row => [row.id, row])).values()) {
    if (!saleStatuses.has(order.status)) continue
    const rows = byOrder.get(order.id) ?? []
    const hasNet = rows.some(row => row.tipo === 'repasse_vendedor')
    const complete = hasNet && rows.some(row => row.tipo === 'taxa_plataforma')
    // Legado sem payment_status só entra com comprovação financeira.
    if (!paidStatuses.has(order.payment_status ?? '') && !(order.payment_status == null && hasNet)) continue
    const date = order.paid_at || order.created_at
    if (!Number.isFinite(Date.parse(date))) throw new Error('Data de venda inválida')
    const sum = (type: string) => rows.filter(row => row.tipo === type).reduce((total, row) => total + cents(row.valor), 0)
    const net = complete ? sum('repasse_vendedor') : null
    const commission = complete ? sum('taxa_plataforma') : null
    const providerFee = complete ? sum('taxa_provedor') : null
    sales.push({ id: order.id, status: order.status, payment: order.payment_status ?? 'registrado', date,
      day: brazilDay(date), gross: complete ? net! + commission! + providerFee! : cents(order.total), commission, providerFee, net })
  }
  return sales.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
}
export function summarizeSales(sales: Sale[], period: SalesPeriod, now = new Date()): SalesSummary {
  const today = brazilDay(now)
  const start = period === 'today' ? today : period === '7d' ? shiftDay(today, -6)
    : period === '30d' ? shiftDay(today, -29) : period === 'month' ? `${today.slice(0, 7)}-01` : ''
  const selected = sales.filter(sale => sale.day >= start && sale.day <= today)
  const gross = selected.reduce((total, sale) => total + sale.gross, 0)
  const unreconciled = selected.filter(sale => sale.net == null).length
  return {
    sales: selected, count: selected.length, gross, unreconciled,
    delivered: selected.filter(sale => sale.status === 'entregue').length,
    inProgress: selected.filter(sale => sale.status !== 'entregue').length,
    cashOrders: selected.filter(sale => sale.payment === 'presencial').length,
    commission: unreconciled ? null : selected.reduce((total, sale) => total + sale.commission!, 0),
    providerFee: unreconciled ? null : selected.reduce((total, sale) => total + sale.providerFee!, 0),
    net: unreconciled ? null : selected.reduce((total, sale) => total + sale.net!, 0),
    average: selected.length ? Math.round(gross / selected.length) : 0,
  }
}
export function salesChart(sales: Sale[], now = new Date()) {
  const today = brazilDay(now)
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(today, index - 6)
    const daily = sales.filter(sale => sale.day === day)
    return { day, label: `${day.slice(8)}/${day.slice(5, 7)}`, count: daily.length, gross: daily.reduce((total, sale) => total + sale.gross, 0) }
  })
}
