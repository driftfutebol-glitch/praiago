// Store global do app Cliente (Zustand + persist).
// Substitui o useState espalhado: sessão, carrinho, favoritos, histórico e
// notificações ficam num só lugar e sobrevivem a reload.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getVendedor, getProduto } from '../lib/catalogo'

export type Sessao = { nome: string; email: string; tel: string } | null

export type PedidoItem = { nome: string; qtd: number; preco: number }
// Onde entregar na praia: o cliente informa rua/reta + barraca e se compartilha
// localização fixa (pela reta) ou em tempo real (GPS).
export type Entrega = { reta: string; barraca: string; modo: 'fixa' | 'tempo_real' }
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

let pedidoSeq = 100 + Math.floor((Date.now() / 1000) % 800)
const novoId = () => `#${++pedidoSeq}`

type State = {
  sessao: Sessao
  favoritos: string[]                 // ids de vendedores
  carrinhoVendedor: string | null     // carrinho é de UM vendedor por vez (estilo iFood)
  carrinho: Record<string, number>    // produtoId -> qtd
  pedidos: Pedido[]
  notificacoes: Notificacao[]

  // sessão
  login: (email: string, nome?: string) => void
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
  criarPedido: (entrega?: Entrega) => Pedido | null

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
      pedidos: [
        // histórico inicial de exemplo
        { id: '#042', vendedorId: 'coco-do-joao',     vendedorNome: 'Coco do João',     itens: [{ nome: 'Água de Coco Natural', qtd: 2, preco: 8 }],  total: 16, data: Date.now() - 3_600_000,  status: 'entregue' },
        { id: '#038', vendedorId: 'churrasco-da-mari', vendedorNome: 'Churrasco da Mari', itens: [{ nome: 'Espetinho de Carne', qtd: 1, preco: 12 }],     total: 12, data: Date.now() - 90_000_000, status: 'entregue' },
      ],
      notificacoes: [
        { id: 'n1', titulo: 'Bem-vindo ao PraiaGo 🏖️', texto: 'Peça comida e bebida direto no seu guarda-sol.', ts: Date.now() - 600_000, lida: false },
      ],

      login: (email, nome) => set({
        sessao: { nome: nome?.trim() || email.split('@')[0] || 'Cliente', email: email.trim(), tel: '(13) 99999-9999' },
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

      criarPedido: (entrega) => {
        const { carrinho, carrinhoVendedor } = get()
        if (!carrinhoVendedor) return null
        const vend = getVendedor(carrinhoVendedor)
        if (!vend) return null
        const itens: PedidoItem[] = Object.entries(carrinho).map(([pid, qtd]) => {
          const p = getProduto(carrinhoVendedor, pid)!
          return { nome: p.nome, qtd, preco: p.preco }
        })
        const total = itens.reduce((a, i) => a + i.preco * i.qtd, 0)
        const pedido: Pedido = {
          id: novoId(), vendedorId: vend.id, vendedorNome: vend.nome,
          itens, total, data: Date.now(), status: 'preparando', entrega,
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
