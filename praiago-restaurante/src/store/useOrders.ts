// Store de pedidos do restaurante (Zustand + persist).
// Antes os pedidos eram estado local com MOCK e o badge da sidebar era fixo "3".
// Agora: fonte única, recebe pedidos reais do cliente via realtime e o badge
// reflete os pedidos novos de verdade.
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

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
  codigoEntrega?: string | null
  ts: number
}

const NEXT: Record<Status, Status | null> = {
  novo: 'preparando', preparando: 'pronto', pronto: 'entregando', entregando: 'entregue', entregue: null,
}

type State = {
  pedidos: Pedido[]
  lastSeen: number
  fetchOrders: () => Promise<void>
  avancar: (id: string, codigoEntrega?: string) => Promise<boolean>
  recusar: (id: string) => Promise<boolean>
  markSeen: () => void
  novos: () => number
}

export const useOrders = create<State>((set, get) => ({
  pedidos: [],
  lastSeen: Date.now(),

  fetchOrders: async () => {
    const sessao = getSessao()
    if (!sessao?.id) return
    const { data, error } = await supabase
      .from('pedidos')
      .select('*')
      // só pedidos DESTE restaurante — e pedido online não pago fica invisível
      .eq('vendedor_id', sessao.id)
      .not('status', 'in', '(aguardando_pagamento,cancelado)')
      .order('created_at', { ascending: false })
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
      codigoEntrega: row.codigo_entrega ?? null,
      ts: new Date(row.created_at).getTime()
    }))
    set({ pedidos: formatados })
  },

  avancar: async (id, codigoEntrega) => {
    const p = get().pedidos.find(p => p.id === id)
    if (!p) return false
    const next = NEXT[p.status]
    if (!next) return false

    if (next === 'entregue') {
      const { error } = await supabase.rpc('confirmar_entrega_pedido', { p_pedido_id: id, p_codigo: codigoEntrega ?? '' })
      if (error) {
        console.error('Falha ao confirmar entrega', error)
        return false
      }
      set(s => ({ pedidos: s.pedidos.map(x => x.id === id ? { ...x, status: next } : x) }))
      await get().fetchOrders()
      return true
    }

    set(s => ({ pedidos: s.pedidos.map(x => x.id === id ? { ...x, status: next } : x) }))
    const { error } = await supabase.from('pedidos').update({ status: next }).eq('id', id)
    if (error) {
      console.error('Falha ao atualizar pedido', error)
      await get().fetchOrders()
      return false
    }
    await get().fetchOrders()
    return true
  },

  recusar: async (id) => {
    set(s => ({ pedidos: s.pedidos.filter(p => p.id !== id) }))
    const { error } = await supabase.from('pedidos').update({ status: 'cancelado' }).eq('id', id)
    if (error) { await get().fetchOrders(); return false }  // reverte se falhou (senão sumia da tela mas ficava ativo)
    await get().fetchOrders()
    return true
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
