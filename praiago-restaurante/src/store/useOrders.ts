// Store de pedidos do restaurante (Zustand + persist).
// Antes os pedidos eram estado local com MOCK e o badge da sidebar era fixo "3".
// Agora: fonte única, recebe pedidos reais do cliente via realtime e o badge
// reflete os pedidos novos de verdade.
import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export type Status = 'novo' | 'preparando' | 'pronto' | 'entregando' | 'entregue'

export type Pedido = {
  id: string
  cliente: string
  zona: string
  itens: string[]
  total: number
  status: Status
  hora: string
  entregador?: string
  pagamento: string
  ts: number
}

const NEXT: Record<Status, Status | null> = {
  novo: 'preparando', preparando: 'pronto', pronto: 'entregando', entregando: 'entregue', entregue: null,
}

type State = {
  pedidos: Pedido[]
  lastSeen: number
  fetchOrders: () => Promise<void>
  avancar: (id: string) => Promise<void>
  recusar: (id: string) => Promise<void>
  markSeen: () => void
  novos: () => number
}

export const useOrders = create<State>((set, get) => ({
  pedidos: [],
  lastSeen: Date.now(),

  fetchOrders: async () => {
    const { data, error } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false })
    if (error || !data) return
    const formatados: Pedido[] = data.map(row => ({
      id: row.id,
      cliente: row.cliente_nome,
      zona: row.zona || 'Desconhecida',
      itens: row.itens,
      total: Number(row.total),
      status: row.status as Status,
      hora: 'agora',
      pagamento: row.pagamento,
      ts: new Date(row.created_at).getTime()
    }))
    set({ pedidos: formatados })
  },

  avancar: async (id) => {
    const p = get().pedidos.find(p => p.id === id)
    if (!p) return
    const next = NEXT[p.status]
    if (!next) return
    // Otimista
    set(s => ({ pedidos: s.pedidos.map(x => x.id === id ? { ...x, status: next } : x) }))
    await supabase.from('pedidos').update({ status: next }).eq('id', id)
  },

  recusar: async (id) => {
    set(s => ({ pedidos: s.pedidos.filter(p => p.id !== id) }))
    await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', id)
  },

  markSeen: () => set({ lastSeen: Date.now() }),
  novos: () => get().pedidos.filter(p => p.status === 'novo').length,
}))

let connected = false
export function connectRealtime() {
  if (connected) return
  connected = true
  useOrders.getState().fetchOrders()

  supabase.channel('pedidos_restaurante')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
      // Quando tem insert, update, delete.. apenas refetch
      useOrders.getState().fetchOrders()
    })
    .subscribe()
}
