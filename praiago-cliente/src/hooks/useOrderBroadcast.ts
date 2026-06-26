// Transmite o pedido em tempo real para ambulante/restaurante.
// Usa a camada `realtime` (Supabase quando configurado, BroadcastChannel senão).
import { channel, TOPICS } from '../lib/realtime'

export type OrderPayload = {
  id: string
  vendedorId: string
  clienteNome: string
  clienteTel: string
  itens: string[]
  total: number
  clienteLat: number
  clienteLng: number
  zona: string
  reta: string
  barraca: string
  localizacao: 'fixa' | 'tempo_real'
  ts: number
}

export function broadcastOrder(order: OrderPayload): OrderPayload {
  const ch = channel<OrderPayload>(TOPICS.orders)
  ch.publish(order)
  setTimeout(() => ch.close(), 500)
  return order
}
