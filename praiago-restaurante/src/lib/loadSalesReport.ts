import { supabase } from './supabase'
import { buildSales, type SalesOrder, type SalesLedger } from './salesReport'

const PAGE_SIZE = 500
// Não deixar o limite padrão do Supabase cortar silenciosamente o histórico.
async function readAll<T>(table: 'pedidos' | 'financial_ledger', columns: string, sellerId: string): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.from(table).select(columns)
      .eq('vendedor_id', sellerId).order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1)
    if (error) throw new Error(`Não foi possível consultar ${table}`)
    if (!data) throw new Error('A consulta de vendas não retornou dados')
    rows.push(...data as unknown as T[])
    if (data.length < PAGE_SIZE) return rows
  }
}
export async function loadSalesReport(sellerId: string) {
  const [orders, ledger] = await Promise.all([
    readAll<SalesOrder>('pedidos', 'id,total,status,payment_status,created_at,paid_at', sellerId),
    readAll<SalesLedger>('financial_ledger', 'id,pedido_id,tipo,valor,status', sellerId),
  ])
  return buildSales(orders, ledger)
}
