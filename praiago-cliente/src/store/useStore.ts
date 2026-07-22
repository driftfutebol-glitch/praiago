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
export type Entrega = {
  reta: string
  barraca: string
  modo: 'fixa' | 'tempo_real'
  pagamento: 'pix' | 'cartao' | 'credito_online' | 'debito_online' | 'mercadopago' | 'dinheiro' | 'cartao_fisico' | 'debito_fisico' | 'credito_fisico'
  lat?: number
  lng?: number
  cpfNota?: string // CPF na nota (opcional, só dígitos)
}
export type Pedido = {
  id: string
  vendedorId: string
  vendedorNome: string
  itens: PedidoItem[]
  total: number
  subtotal?: number
  desconto?: number
  cupom?: string | null
  data: number
  status: 'aguardando_pagamento' | 'enviado' | 'preparando' | 'a_caminho' | 'entregue' | 'cancelado'
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
  criarPedido: (entrega?: Entrega, options?: { limparCarrinho?: boolean; desconto?: { codigo: string; valor: number; motivo?: string } }) => Promise<Pedido | null>
  sincronizarPedidos: () => Promise<void>
  cancelarPedido: (pedidoId: string) => Promise<boolean>
  removerPedido: (pedidoId: string) => void
  solicitarAjudaPedido: (pedidoId: string, tipo: 'ajuda' | 'reembolso') => Promise<boolean>

  // notificações
  addNotif: (n: Omit<Notificacao, 'id' | 'ts' | 'lida'>) => void
  limparNotificacoesTeste: () => void
  marcarTodasLidas: () => void
  naoLidas: () => number
}

const TEST_NOTIF_TITLES = ['TESTE-NOTIF-FABLE']

function isTestNotification(n: Pick<Notificacao, 'titulo' | 'texto'>) {
  const haystack = `${n.titulo} ${n.texto}`.toUpperCase()
  return TEST_NOTIF_TITLES.some(t => haystack.includes(t))
}

function publicoDoVendedor(vendedorId: string) {
  const tipo = getVendedor(vendedorId)?.tipo
  if (tipo === 'restaurante') return 'restaurantes'
  if (tipo === 'ambulante') return 'ambulantes'
  return null
}

async function avisarVendedorSePossivel(pedido: Pedido, titulo: string, mensagem: string) {
  const publico = publicoDoVendedor(pedido.vendedorId)
  if (!publico) return
  await supabase.from('avisos').insert({
    titulo,
    mensagem,
    tipo: 'aviso',
    publico,
  })
}

async function getPaymentSettings() {
  const { data } = await supabase
    .from('payment_settings')
    .select('platform_fee_percent,platform_fee_fixed,presencial_fee_mode')
    .eq('id', true)
    .maybeSingle()

  return {
    platformFeePercent: Number(data?.platform_fee_percent ?? 10),
    platformFeeFixed: Number(data?.platform_fee_fixed ?? 0),
    presencialFeeMode: String(data?.presencial_fee_mode ?? 'cobrar_vendedor'),
  }
}

function isPresencialPayment(method?: string) {
  return method === 'dinheiro' || method === 'cartao_fisico' || method === 'debito_fisico' || method === 'credito_fisico'
}

function mapDbStatusToPedidoStatus(status?: string): Pedido['status'] {
  if (status === 'aguardando_pagamento') return 'aguardando_pagamento'
  if (status === 'novo') return 'enviado'
  if (status === 'preparando' || status === 'pronto') return 'preparando'
  if (status === 'saiu_entrega' || status === 'entregando') return 'a_caminho'
  if (status === 'entregue') return 'entregue'
  if (status === 'cancelado') return 'cancelado'
  return 'enviado'
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

      // Ao logar: se for OUTRA conta (ou não havia sessão), zera TUDO que é por
      // usuário — senão a conta nova herdaria pedidos/carrinho/notificações da
      // conta anterior no mesmo aparelho (vazamento). Mesma conta (restart) preserva.
      login: (id, email, nome = '', telefone = '') => set(s => {
        const outraConta = !s.sessao || s.sessao.id !== id
        return {
          sessao: { id, email, nome, telefone },
          ...(outraConta ? { pedidos: [], carrinho: {}, carrinhoVendedor: null, notificacoes: [], favoritos: [] } : {}),
        }
      }),
      // Ao sair: limpa TUDO que é por usuário (não deixa rastro pra próxima conta).
      logout: () => set({ sessao: null, pedidos: [], carrinho: {}, carrinhoVendedor: null, notificacoes: [], favoritos: [] }),

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

      criarPedido: async (entrega, options = {}) => {
        const { carrinho, carrinhoVendedor, sessao } = get()
        if (!sessao?.id) return null
        if (!carrinhoVendedor) return null
        const vend = getVendedor(carrinhoVendedor)
        if (!vend) return null
        // Ignora itens que sumiram do catálogo (produto desativado / loja recarregada)
        // — antes usava non-null assertion e quebrava com TypeError no checkout.
        const itensBrutos = Object.entries(carrinho)
          .map(([pid, qtd]) => { const p = getProduto(carrinhoVendedor, pid); return p ? { id: pid, nome: p.nome, qtd, preco: p.preco } : null })
          .filter((x): x is { id: string; nome: string; qtd: number; preco: number } => x !== null)
        if (itensBrutos.length === 0) return null
        const itens: PedidoItem[] = itensBrutos.map(({ nome, qtd, preco }) => ({ nome, qtd, preco }))
        const subtotal = itens.reduce((a, i) => a + i.preco * i.qtd, 0)
        const discountAmount = Math.max(0, Math.min(subtotal, Math.round(Number(options.desconto?.valor ?? 0) * 100) / 100))
        const total = Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100)
        const paymentSettings = await getPaymentSettings()
        const platformFeeAmount = Math.round((total * paymentSettings.platformFeePercent / 100 + paymentSettings.platformFeeFixed) * 100) / 100
        const vendorAmount = Math.max(0, Math.round((total - platformFeeAmount) * 100) / 100)
        const method = entrega?.pagamento || 'pix'
        const presencial = isPresencialPayment(method)
        
        // Insere no banco
        const { data: inserted, error } = await supabase.from('pedidos').insert({
          cliente_nome: sessao?.nome || 'Anônimo',
          cliente_id: sessao.id,
          vendedor_id: vend.id,
          vendedor_nome: vend.nome,
          zona: entrega?.reta ? `Reta ${entrega.reta} - Barraca ${entrega.barraca || 'Sem Barraca'}` : (vend.zona || 'Desconhecida'),
          reta: entrega?.reta ?? null,
          barraca: entrega?.barraca ?? null,
          lat: entrega?.lat ?? null,
          lng: entrega?.lng ?? null,
          cpf_nota: entrega?.cpfNota || null,
          itens: itens.map(i => `${i.qtd}x ${i.nome}`),
          // itens com ID do produto — o SERVIDOR recalcula o preço real por aqui
          // (o total/subtotal abaixo são só palpite; o trigger sobrescreve).
          itens_detalhe: itensBrutos.map(i => ({ produto_id: i.id, qtd: i.qtd })),
          total: total,
          subtotal_amount: subtotal,
          discount_amount: discountAmount,
          discount_code: options.desconto?.codigo ?? null,
          discount_reason: options.desconto?.motivo ?? null,
          // Pagamento online: o pedido NASCE travado e só vira 'novo' (visível
          // pro vendedor) quando o webhook do Mercado Pago confirmar o pagamento.
          status: presencial ? 'novo' : 'aguardando_pagamento',
          pagamento: method,
          payment_provider: presencial ? 'manual' : 'mercadopago',
          payment_status: presencial ? 'presencial' : 'pendente',
          gross_amount: total,
          platform_fee_amount: platformFeeAmount,
          vendor_amount: vendorAmount,
          settlement_status: presencial
            ? (paymentSettings.presencialFeeMode === 'isento' ? 'isento' : 'cobrar_vendedor')
            : 'pendente'
        }).select().single()

        if (error || !inserted) {
          console.error("Erro ao criar pedido", error)
          return null
        }

        const pedido: Pedido = {
          id: inserted.id, vendedorId: vend.id, vendedorNome: vend.nome,
          itens, total, subtotal, desconto: discountAmount, cupom: options.desconto?.codigo ?? null, data: new Date(inserted.created_at).getTime(), status: presencial ? 'enviado' : 'aguardando_pagamento', entrega,
        }
        set(s => ({
          pedidos: [pedido, ...s.pedidos],
          ...(options.limparCarrinho === false ? {} : { carrinho: {}, carrinhoVendedor: null }),
        }))
        return pedido
      },

      sincronizarPedidos: async () => {
        const ids = get().pedidos.map(p => p.id).filter(Boolean)
        if (ids.length === 0) return

        const { data, error } = await supabase
          .from('pedidos')
          .select('id,status')
          .in('id', ids)

        if (error || !data) {
          if (error) console.error('Erro ao sincronizar pedidos', error)
          return
        }

        const statusById = new Map(data.map(row => [String(row.id), mapDbStatusToPedidoStatus(String(row.status ?? 'novo'))]))
        set(s => ({
          pedidos: s.pedidos.map(p => {
            const status = statusById.get(p.id)
            return status ? { ...p, status } : p
          }),
        }))
      },

      cancelarPedido: async (pedidoId) => {
        const pedido = get().pedidos.find(p => p.id === pedidoId)
        if (!pedido) return false

        const { error } = await supabase
          .from('pedidos')
          .update({ status: 'cancelado' })
          .eq('id', pedidoId)

        if (error) {
          console.error('Erro ao cancelar pedido', error)
          return false
        }

        await supabase.from('tickets').insert({
          plataforma: 'cliente',
          usuario_id: get().sessao?.id ?? null,
          usuario_nome: get().sessao?.nome || 'Cliente PraiaGo',
          usuario_email: get().sessao?.email || 'N/A',
          assunto: `Cancelamento do pedido ${pedidoId}`,
          mensagem: `Cliente cancelou o pedido ${pedidoId} de ${pedido.vendedorNome}. Itens: ${pedido.itens.map(i => `${i.qtd}x ${i.nome}`).join(', ')}. Total: R$ ${pedido.total.toFixed(2)}.`,
          status: 'aberto',
          prioridade: 'alta',
        })

        await avisarVendedorSePossivel(
          pedido,
          'Pedido cancelado',
          `O pedido ${pedidoId.slice(0, 8)} foi cancelado pelo cliente. Confira a aba de pedidos.`,
        )

        set(s => ({
          pedidos: s.pedidos.map(p => p.id === pedidoId ? { ...p, status: 'cancelado' } : p),
          notificacoes: [{
            id: `n${Date.now()}`,
            titulo: 'Pedido cancelado',
            texto: 'Abrimos um registro no atendimento para acompanhamento.',
            ts: Date.now(),
            lida: false,
          }, ...s.notificacoes],
        }))
        return true
      },

      removerPedido: (pedidoId) => set(s => ({
        pedidos: s.pedidos.filter(p => p.id !== pedidoId),
      })),

      solicitarAjudaPedido: async (pedidoId, tipo) => {
        const pedido = get().pedidos.find(p => p.id === pedidoId)
        if (!pedido) return false
        const assunto = tipo === 'reembolso' ? `Solicitacao de reembolso ${pedidoId}` : `Ajuda com pedido ${pedidoId}`
        const mensagem = tipo === 'reembolso'
          ? `Cliente solicitou analise de reembolso do pedido ${pedidoId} de ${pedido.vendedorNome}. Total: R$ ${pedido.total.toFixed(2)}. Status atual: ${pedido.status}.`
          : `Cliente pediu ajuda com o pedido ${pedidoId} de ${pedido.vendedorNome}. Status atual: ${pedido.status}.`

        const { error } = await supabase.from('tickets').insert({
          plataforma: 'cliente',
          usuario_id: get().sessao?.id ?? null,
          usuario_nome: get().sessao?.nome || 'Cliente PraiaGo',
          usuario_email: get().sessao?.email || 'N/A',
          assunto,
          mensagem,
          status: 'aberto',
          prioridade: tipo === 'reembolso' ? 'urgente' : 'alta',
        })

        if (error) {
          console.error('Erro ao abrir atendimento do pedido', error)
          return false
        }

        // marca o pedido como reembolso SOLICITADO (o admin aprova/nega no painel)
        if (tipo === 'reembolso') {
          await supabase.from('pedidos').update({
            reembolso_status: 'solicitado',
            reembolso_motivo: `Solicitado pelo cliente. Total R$ ${pedido.total.toFixed(2)}.`,
            reembolso_solicitado_em: new Date().toISOString(),
          }).eq('id', pedidoId)
        }

        await avisarVendedorSePossivel(
          pedido,
          tipo === 'reembolso' ? 'Pedido com solicitacao de reembolso' : 'Pedido precisa de atencao',
          `Pedido ${pedidoId.slice(0, 8)} abriu atendimento. Acompanhe o painel e aguarde orientacao do suporte.`,
        )

        set(s => ({
          notificacoes: [{
            id: `n${Date.now()}`,
            titulo: tipo === 'reembolso' ? 'Reembolso em analise' : 'Atendimento aberto',
            texto: 'Nossa equipe recebeu seu chamado e vai acompanhar o caso.',
            ts: Date.now(),
            lida: false,
          }, ...s.notificacoes],
        }))
        return true
      },

      addNotif: (n) => set(s => ({
        notificacoes: isTestNotification(n) ? s.notificacoes : [{ ...n, id: `n${Date.now()}`, ts: Date.now(), lida: false }, ...s.notificacoes],
      })),
      limparNotificacoesTeste: () => set(s => ({ notificacoes: s.notificacoes.filter(n => !isTestNotification(n)) })),
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
        notificacoes: s.notificacoes.filter(n => !isTestNotification(n)),
      }),
    },
  ),
)
