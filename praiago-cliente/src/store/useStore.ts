// Store global do app Cliente (Zustand + persist).
// Substitui o useState espalhado: sessão, carrinho, favoritos, histórico e
// notificações ficam num só lugar e sobrevivem a reload.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { useCatalogo } from './useCatalogo'

// Lookups usam o catálogo REAL (banco) via useCatalogo, não mais o estático.
function getVendedor(id: string | null | undefined) {
  return id ? useCatalogo.getState().getVendedor(id) : undefined
}
function getProduto(vendedorId: string, produtoId: string) {
  return getVendedor(vendedorId)?.produtos.find(p => p.id === produtoId)
}

export type Sessao = {
  id: string
  email: string
  nome: string
  telefone?: string
} | null

export type PedidoItem = { nome: string; qtd: number; preco: number }
// Onde entregar na praia: o cliente informa rua/reta + barraca e se compartilha
// localização fixa (pela reta) ou em tempo real (GPS).
export type Entrega = { reta: string; barraca: string; modo: 'fixa' | 'tempo_real'; pagamento: 'pix' | 'cartao' | 'dinheiro' }
export type Pedido = {
  id: string
  vendedorId: string
  vendedorNome: string
  itens: PedidoItem[]
  total: number
  data: number
  status: 'preparando' | 'a_caminho' | 'entregue'
  entrega?: Entrega
}

export type Notificacao = {
  id: string
  titulo: string
  texto: string
  ts: number
  lida: boolean
}

type State = {
  sessao: Sessao
  favoritos: string[]                 // ids de vendedores
  carrinhoVendedor: string | null     // carrinho é de UM vendedor por vez (estilo iFood)
  carrinho: Record<string, number>    // produtoId -> qtd
  pedidos: Pedido[]
  notificacoes: Notificacao[]

  // sessão
  login: (id: string, email: string, nome?: string, telefone?: string) => void
  logout: () => void

  // favoritos
  toggleFavorito: (vendedorId: string) => void
  isFavorito: (vendedorId: string) => boolean

  // carrinho
  addItem: (vendedorId: string, produtoId: string, delta?: number) => void
  setQtd: (produtoId: string, qtd: number) => void
  limparCarrinho: () => void
  totalItens: () => number
  totalPreco: () => number

  // pedidos
  criarPedido: (entrega?: Entrega) => Promise<Pedido | null>

  // notificações
  addNotif: (n: Omit<Notificacao, 'id' | 'ts' | 'lida'>) => void
  marcarTodasLidas: () => void
  naoLidas: () => number
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      sessao: null,
      favoritos: [],
      carrinhoVendedor: null,
      carrinho: {},
      pedidos: [],
      notificacoes: [],

      login: (id, email, nome = '', telefone = '') => set({ 
        sessao: { id, email, nome, telefone } 
      }),
      logout: () => set({ sessao: null }),

      toggleFavorito: (vendedorId) => set(s => ({
        favoritos: s.favoritos.includes(vendedorId)
          ? s.favoritos.filter(id => id !== vendedorId)
          : [...s.favoritos, vendedorId],
      })),
      isFavorito: (vendedorId) => get().favoritos.includes(vendedorId),

      addItem: (vendedorId, produtoId, delta = 1) => set(s => {
        // troca de vendedor zera o carrinho
        const trocou = s.carrinhoVendedor && s.carrinhoVendedor !== vendedorId
        const base = trocou ? {} : { ...s.carrinho }
        const atual = base[produtoId] ?? 0
        const novo = Math.max(0, atual + delta)
        if (novo === 0) delete base[produtoId]
        else base[produtoId] = novo
        const vazio = Object.keys(base).length === 0
        return { carrinho: base, carrinhoVendedor: vazio ? null : vendedorId }
      }),

      setQtd: (produtoId, qtd) => set(s => {
        const base = { ...s.carrinho }
        if (qtd <= 0) delete base[produtoId]
        else base[produtoId] = qtd
        const vazio = Object.keys(base).length === 0
        return { carrinho: base, carrinhoVendedor: vazio ? null : s.carrinhoVendedor }
      }),

      limparCarrinho: () => set({ carrinho: {}, carrinhoVendedor: null }),

      totalItens: () => Object.values(get().carrinho).reduce((a, n) => a + n, 0),
      totalPreco: () => {
        const { carrinho, carrinhoVendedor } = get()
        if (!carrinhoVendedor) return 0
        return Object.entries(carrinho).reduce((acc, [pid, qtd]) => {
          const p = getProduto(carrinhoVendedor, pid)
          return acc + (p ? p.preco * qtd : 0)
        }, 0)
      },

      criarPedido: async (entrega) => {
        const { carrinho, carrinhoVendedor, sessao } = get()
        if (!carrinhoVendedor) return null
        const vend = getVendedor(carrinhoVendedor)
        if (!vend) return null
        const itens: PedidoItem[] = Object.entries(carrinho).map(([pid, qtd]) => {
          const p = getProduto(carrinhoVendedor, pid)!
          return { nome: p.nome, qtd, preco: p.preco }
        })
        const total = itens.reduce((a, i) => a + i.preco * i.qtd, 0)
        
        // Insere no banco
        const { data: inserted, error } = await supabase.from('pedidos').insert({
          cliente_nome: sessao?.nome || 'Anônimo',
          cliente_id: sessao?.id ?? null,
          vendedor_id: vend.id,
          vendedor_nome: vend.nome,
          zona: entrega?.reta ? `Reta ${entrega.reta} - Barraca ${entrega.barraca || 'Sem Barraca'}` : (vend.zona || 'Desconhecida'),
          reta: entrega?.reta ?? null,
          barraca: entrega?.barraca ?? null,
          itens: itens.map(i => `${i.qtd}x ${i.nome}`),
          total: total,
          status: 'novo',
          pagamento: entrega?.pagamento || 'pix'
        }).select().single()

        if (error || !inserted) {
          console.error("Erro ao criar pedido", error)
          return null
        }

        const pedido: Pedido = {
          id: inserted.id, vendedorId: vend.id, vendedorNome: vend.nome,
          itens, total, data: new Date(inserted.created_at).getTime(), status: 'preparando', entrega,
        }
        set(s => ({ pedidos: [pedido, ...s.pedidos], carrinho: {}, carrinhoVendedor: null }))
        return pedido
      },

      addNotif: (n) => set(s => ({
        notificacoes: [{ ...n, id: `n${Date.now()}`, ts: Date.now(), lida: false }, ...s.notificacoes],
      })),
      marcarTodasLidas: () => set(s => ({ notificacoes: s.notificacoes.map(n => ({ ...n, lida: true })) })),
      naoLidas: () => get().notificacoes.filter(n => !n.lida).length,
    }),
    {
      name: 'praiago-cliente',
      partialize: (s) => ({
        sessao: s.sessao,
        favoritos: s.favoritos,
        carrinhoVendedor: s.carrinhoVendedor,
        carrinho: s.carrinho,
        pedidos: s.pedidos,
        notificacoes: s.notificacoes,
      }),
    },
  ),
)
