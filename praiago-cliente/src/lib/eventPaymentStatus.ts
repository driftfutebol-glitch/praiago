import { supabase } from './supabase'

export type EventPaymentState = 'approved' | 'pending' | 'closed' | 'unavailable'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Read-only; the existing owner SELECT policy is still authoritative. Do
 * not use food's payment function for a ticket or expose payment credentials. */
export async function consultarPagamentoIngresso(orderId: string, buyerId: string): Promise<EventPaymentState> {
  if (!UUID.test(orderId) || !UUID.test(buyerId)) return 'unavailable'
  try {
    const { data, error } = await supabase.from('event_ticket_orders').select('id,status,payment_status,paid_at').eq('id', orderId).eq('cliente_id', buyerId).maybeSingle()
    if (error || !data) return 'unavailable'
    if (['pago', 'entrega_pendente', 'entregue'].includes(data.status) && data.payment_status === 'aprovado' && data.paid_at) return 'approved'
    if (['cancelado', 'reembolsado', 'chargeback'].includes(data.status) || ['rejeitado', 'cancelado', 'estornado', 'falhou'].includes(data.payment_status)) return 'closed'
    return 'pending'
  } catch { return 'unavailable' }
}
