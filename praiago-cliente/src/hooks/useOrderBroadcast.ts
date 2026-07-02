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
  // O pedido JÁ foi inserido na tabela `pedidos` por criarPedido() — fonte única.
  // (Antes este insert duplicava o pedido com o mesmo id e colunas inexistentes,
  //  falhando silenciosamente.) Aqui apenas emitimos um broadcast em tempo real
  // para o ambulante/restaurante serem notificados na hora.
  try {
    const ch = supabase.channel('novos_pedidos')
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => { if (status === 'SUBSCRIBED') resolve() })
      setTimeout(resolve, 1500) // não trava o fluxo se o realtime demorar
    })
    await ch.send({ type: 'broadcast', event: 'novo_pedido', payload: order })
    await supabase.removeChannel(ch)
  } catch (e) {
    console.warn('Broadcast do pedido falhou (não crítico):', e)
  }
  return order
}
