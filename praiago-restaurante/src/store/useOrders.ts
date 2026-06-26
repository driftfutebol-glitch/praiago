// Store de pedidos do restaurante (Zustand + persist).
// Antes os pedidos eram estado local com MOCK e o badge da sidebar era fixo "3".
// Agora: fonte única, recebe pedidos reais do cliente via realtime e o badge
// reflete os pedidos novos de verdade.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { channel, TOPICS } from '../lib/realtime'
import { parseIncomingOrder, type CleanOrder } from '../lib/validation'

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
  ts: number
}

const NEXT: Record<Status, Status | null> = {
  novo: 'preparando', preparando: 'pronto', pronto: 'entregando', entregando: 'entregue', entregue: null,
}

const SEED: Pedido[] = [
  { id: '#104', cliente: 'Ana Silva',     zona: 'Zona Boqueirão', itens: ['2x Frango grelhado', '1x Suco de laranja'],   total: 58.00, status: 'novo',       hora: 'agora',  ts: Date.now() - 30_000 },
  { id: '#103', cliente: 'Pedro Ferraz',  zona: 'Canto do Forte', itens: ['1x Moqueca de camarão', '2x Refrigerante'],   total: 62.50, status: 'preparando', hora: '6 min',  ts: Date.now() - 360_000, entregador: 'Carlos M.' },
  { id: '#102', cliente: 'Mariana Lima',  zona: 'Zona Ocian',     itens: ['3x Pastel de camarão'],                       total: 35.00, status: 'pronto',     hora: '14 min', ts: Date.now() - 840_000, entregador: 'Lucas S.' },
  { id: '#101', cliente: 'Carlos Souza',  zona: 'Zona Tupi',      itens: ['1x Caldeirada de frutos do mar'],             total: 67.00, status: 'entregando', hora: '21 min', ts: Date.now() - 1_260_000, entregador: 'Carlos M.' },
  { id: '#100', cliente: 'Julia Moraes',  zona: 'Zona Boqueirão', itens: ['2x Água de coco', '1x Biscoito de polvilho'], total: 22.00, status: 'entregue',   hora: '38 min', ts: Date.now() - 2_280_000 },
  { id: '#099', cliente: 'Rafael Santos', zona: 'Zona Ocian',     itens: ['1x Porção frutos do mar'],                    total: 55.00, status: 'entregue',   hora: '52 min', ts: Date.now() - 3_120_000 },
]

type State = {
  pedidos: Pedido[]
  lastSeen: number
  avancar: (id: string) => void
  recusar: (id: string) => void
  addPedido: (o: CleanOrder) => void
  markSeen: () => void
  novos: () => number
}

export const useOrders = create<State>()(
  persist(
    (set, get) => ({
      pedidos: SEED,
      lastSeen: Date.now(),

      avancar: (id) => set(s => ({
        pedidos: s.pedidos.map(p => {
          if (p.id !== id) return p
          const next = NEXT[p.status]
          return next ? { ...p, status: next } : p
        }),
      })),

      recusar: (id) => set(s => ({ pedidos: s.pedidos.filter(p => p.id !== id) })),

      addPedido: (o) => set(s => {
        if (s.pedidos.some(p => p.id === o.id)) return s // evita duplicar
        // `o` já vem sanitizado por parseIncomingOrder (não confiar no payload bruto)
        const pedido: Pedido = {
          id: o.id,
          cliente: o.cliente,
          zona: o.zona ? (o.zona.startsWith('Zona') ? o.zona : `Zona ${o.zona}`) : 'Praia Grande',
          itens: o.itens,
          total: o.total,
          status: 'novo',
          hora: 'agora',
          ts: o.ts,
        }
        return { pedidos: [pedido, ...s.pedidos] }
      }),

      markSeen: () => set({ lastSeen: Date.now() }),
      novos: () => get().pedidos.filter(p => p.status === 'novo').length,
    }),
    { name: 'praiago-restaurante-orders' },
  ),
)

// Liga a recepção de pedidos em tempo real uma única vez.
let connected = false
export function connectRealtime() {
  if (connected) return
  connected = true
  const ch = channel(TOPICS.orders)
  ch.subscribe((raw) => {
    const clean = parseIncomingOrder(raw)        // valida/sanitiza antes de aceitar
    if (clean) useOrders.getState().addPedido(clean)
  })
}
