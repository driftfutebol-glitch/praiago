// Transmite o pedido em tempo real para ambulante/restaurante.
// Usa a camada `realtime` (Supabase quando configurado, BroadcastChannel senão).
import { supabase } from '../lib/supabase'

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
  pagamento: string
  ts: number
}

export async function broadcastOrder(order: OrderPayload): Promise<OrderPayload> {
  const { error } = await supabase.from('pedidos').insert({
    id: order.id,
    vendedor_id: order.vendedorId !== 'amb-1' && order.vendedorId !== 'amb-2' && order.vendedorId !== 'rest-1' ? null : null, // Por enquanto mockado no bd até termos o Auth real
    cliente_nome: order.clienteNome,
    cliente_tel: order.clienteTel,
    itens: order.itens,
    total: order.total,
    pagamento: order.pagamento,
    zona: order.zona,
    reta: order.reta,
    barraca: order.barraca,
    lat: order.clienteLat,
    lng: order.clienteLng,
    status: 'novo'
  })

  if (error) {
    console.error('Erro ao enviar pedido para o Supabase:', error)
  }

  return order
}
