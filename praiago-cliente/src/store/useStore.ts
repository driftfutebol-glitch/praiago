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
  contaDemo: boolean
} | null

export type PedidoItem = { nome: string; qtd: number; preco: number }
// Onde entregar na praia: o cliente informa rua/reta + barraca e se compartilha
// localização fixa (pela reta) ou em tempo real (GPS).
export type Entrega = {
  reta: string
  barraca: string
  modo: 'fixa' | 'tempo_real'
  pagamento: 'pix' | 'credito_online' | 'debito_online' | 'dinheiro' | 'cartao_fisico' | 'debito_fisico' | 'credito_fisico'
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
  login: (id: string, email: string, nome?: string, telefone?: string, contaDemo?: boolean) => void
  setContaDemo: (contaDemo: boolean) => void
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

async function getPaymentSettings() {
  const { data } = await supabase
    .from('payment_settings')
    .select('platform_fee_percent,platform_fee_fixed,presencial_fee_mode,taxa_credito_cliente_percent')
    .eq('id', true)
    .maybeSingle()

  return {
    platformFeePercent: Number(data?.platform_fee_percent ?? 10),
    platformFeeFixed: Number(data?.platform_fee_fixed ?? 0),
    presencialFeeMode: String(data?.presencial_fee_mode ?? 'cobrar_vendedor'),
    // Acrescimo do credito: quem manda e o servidor (o trigger recalcula o
    // total). Isto aqui e so pra tela poder MOSTRAR antes de o cliente pagar.
    taxaCreditoPercent: Number(data?.taxa_credito_cliente_percent ?? 0),
  }
}

/** Percentual de acrescimo do credito, pra tela avisar antes de cobrar. */
export async function obterTaxaCredito(): Promise<number> {
  const cfg = await getPaymentSettings()
  return cfg.taxaCreditoPercent
}

function isPresencialPayment(method?: string) {
  return method === 'dinheiro' || method === 'cartao_fisico' || method === 'debito_fisico' || method === 'credito_fisico'
}

type ItemDetalhe = { produto_id: string; qtd: number }

function normalizarItensDetalhe(value: unknown): ItemDetalhe[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const produtoId = String(row.produto_id || '')
      const qtd = Number(row.qtd || 0)
      return produtoId && Number.isInteger(qtd) && qtd > 0 ? { produto_id: produtoId, qtd } : null
    })
    .filter((item): item is ItemDetalhe => item !== null)
    .sort((a, b) => a.produto_id.localeCompare(b.produto_id))
}

function mesmosItens(a: unknown, b: ItemDetalhe[]) {
  const normalizado = normalizarItensDetalhe(a)
  const esperado = normalizarItensDetalhe(b)
  return normalizado.length === esperado.length
    && normalizado.every((item, index) => (
      item.produto_id === esperado[index].produto_id
      && item.qtd === esperado[index].qtd
    ))
}

function mensagemErroPedido(message?: string) {
  const texto = String(message || '')
  if (/cupom ja usado|duplicate key|cupom_usos/i.test(texto)) {
    return 'Este cupom já está reservado em outro pedido pendente. Cancele esse pedido em Meus Pedidos ou conclua o pagamento.'
  }
  // Estoque: o trigger `validar_preco_pedido` ja devolve a frase pronta e util
  // ("X esgotou. Tire do carrinho pra fechar o pedido." / "Restam so N de X.").
  // Trocar isso por um erro generico esconde justamente o que a pessoa precisa
  // fazer pra conseguir fechar o pedido.
  if (/esgotou|restam s[oó]|estoque/i.test(texto)) return texto
  if (/produto invalido|pedido sem itens|pedido sem valor/i.test(texto)) {
    return 'Um item do carrinho mudou ou ficou indisponível. Atualize o carrinho e tente de novo.'
  }
  if (/cupom/i.test(texto)) return texto
  return 'Não foi possível criar o pedido agora. Tente novamente.'
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
      login: (id, email, nome = '', telefone = '', contaDemo = false) => set(s => {
        const outraConta = !s.sessao || s.sessao.id !== id
        return {
          sessao: { id, email, nome, telefone, contaDemo },
          ...(outraConta ? { pedidos: [], carrinho: {}, carrinhoVendedor: null, notificacoes: [], favoritos: [] } : {}),
        }
      }),
      setContaDemo: (contaDemo) => set(s => ({
        sessao: s.sessao ? { ...s.sessao, contaDemo } : null,
      })),
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
        const method = entrega?.pagamento || 'pix'
        const presencial = isPresencialPayment(method)
        const cupomCodigo = options.desconto?.codigo?.trim().toUpperCase() || null
        const itensDetalhe = itensBrutos.map(i => ({ produto_id: i.id, qtd: i.qtd }))

        // Se a rede caiu depois do INSERT ou a pre-validacao do PIX falhou, o
        // cupom ja ficou reservado. Reutiliza o mesmo checkout em vez de criar
        // outro pedido e bater na trava de uso unico.
        if (!presencial) {
          let pendentesQuery = supabase
            .from('pedidos')
            .select('id,created_at,total,subtotal_amount,discount_amount,discount_code,itens_detalhe,reta,barraca,payment_status')
            .eq('cliente_id', sessao.id)
            .eq('vendedor_id', vend.id)
            .eq('pagamento', method)
            .eq('status', 'aguardando_pagamento')
            .in('payment_status', ['pendente', 'recusado'])

          pendentesQuery = cupomCodigo
            ? pendentesQuery.eq('discount_code', cupomCodigo)
            : pendentesQuery.is('discount_code', null)

          const { data: pendentes } = await pendentesQuery
            .order('created_at', { ascending: false })
            .limit(10)

          const existente = pendentes?.find(row => (
            mesmosItens(row.itens_detalhe, itensDetalhe)
            && String(row.reta || '') === String(entrega?.reta || '')
            && String(row.barraca || '') === String(entrega?.barraca || '')
          ))

          if (existente) {
            const pedidoExistente: Pedido = {
              id: String(existente.id),
              vendedorId: vend.id,
              vendedorNome: vend.nome,
              itens,
              total: Number(existente.total || total),
              subtotal: Number(existente.subtotal_amount || subtotal),
              desconto: Number(existente.discount_amount || discountAmount),
              cupom: existente.discount_code || cupomCodigo,
              data: new Date(existente.created_at).getTime(),
              status: 'aguardando_pagamento',
              entrega,
            }
            set(s => ({
              pedidos: [pedidoExistente, ...s.pedidos.filter(p => p.id !== pedidoExistente.id)],
            }))
            return pedidoExistente
          }
        }

        const paymentSettings = await getPaymentSettings()
        const platformFeeAmount = Math.round((total * paymentSettings.platformFeePercent / 100 + paymentSettings.platformFeeFixed) * 100) / 100
        const vendorAmount = Math.max(0, Math.round((total - platformFeeAmount) * 100) / 100)
        
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
          itens_detalhe: itensDetalhe,
          total: total,
          subtotal_amount: subtotal,
          discount_amount: discountAmount,
          discount_code: cupomCodigo,
          discount_reason: options.desconto?.motivo ?? null,
          // Pagamento online: o pedido NASCE travado e só vira 'novo' (visível
          // pro vendedor) quando o webhook do gateway confirmar o pagamento.
          status: presencial ? 'novo' : 'aguardando_pagamento',
          pagamento: method,
          payment_provider: presencial ? 'manual' : 'pagarme',
          payment_status: presencial ? 'presencial' : 'pendente',
          gross_amount: total,
          platform_fee_amount: platformFeeAmount,
          vendor_amount: vendorAmount,
          settlement_status: presencial
            ? (paymentSettings.presencialFeeMode === 'isento' ? 'isento' : 'cobrar_vendedor')
            : 'pendente'
        }).select().single()

        if (error || !inserted) {
          console.error('Erro ao criar pedido', { code: error?.code || 'sem_retorno' })
          throw new Error(mensagemErroPedido(error?.message))
        }

        const pedido: Pedido = {
          id: inserted.id, vendedorId: vend.id, vendedorNome: vend.nome,
          itens, total: Number(inserted.total ?? total), subtotal: Number(inserted.subtotal_amount ?? subtotal), desconto: Number(inserted.discount_amount ?? discountAmount), cupom: inserted.discount_code ?? cupomCodigo, data: new Date(inserted.created_at).getTime(), status: presencial ? 'enviado' : 'aguardando_pagamento', entrega,
        }
        set(s => ({
          pedidos: [pedido, ...s.pedidos],
          ...(options.limparCarrinho === false ? {} : { carrinho: {}, carrinhoVendedor: null }),
        }))
        return pedido
      },

      // Busca os pedidos DO SERVIDOR, nao so atualiza o que ja estava na
      // memoria. Antes lia apenas os ids que ja existiam no store local — e
      // como sair da conta zera esse store, os pedidos sumiam da tela pra
      // sempre (continuavam no banco, o cliente e que nunca mais os via).
      sincronizarPedidos: async () => {
        const sessao = get().sessao
        if (!sessao?.id) return

        const { data, error } = await supabase
          .from('pedidos')
          .select('id,status,total,subtotal_amount,discount_amount,discount_code,vendedor_id,vendedor_nome,itens,reta,barraca,pagamento,created_at')
          .eq('cliente_id', sessao.id)
          .order('created_at', { ascending: false })
          .limit(40)

        if (error || !data) {
          if (error) console.error('Erro ao sincronizar pedidos', { code: error.code })
          return
        }

        const doServidor: Pedido[] = data.map(row => {
          // O historico do banco guarda os itens como texto ("2x Agua de coco").
          // Recompoe o suficiente pra listar; o local (quando existe) e mais rico.
          const itens: PedidoItem[] = Array.isArray(row.itens)
            ? (row.itens as unknown[]).map(linha => {
                const texto = String(linha ?? '')
                const m = texto.match(/^\s*(\d+)\s*x\s*(.+)$/i)
                return { nome: m ? m[2].trim() : texto, qtd: m ? Number(m[1]) : 1, preco: 0 }
              })
            : []
          return {
            id: String(row.id),
            vendedorId: String(row.vendedor_id ?? ''),
            vendedorNome: String(row.vendedor_nome ?? 'Vendedor'),
            itens,
            total: Number(row.total ?? 0),
            subtotal: Number(row.subtotal_amount ?? row.total ?? 0),
            desconto: Number(row.discount_amount ?? 0),
            cupom: row.discount_code ?? null,
            data: new Date(String(row.created_at)).getTime(),
            status: mapDbStatusToPedidoStatus(String(row.status ?? 'novo')),
            entrega: {
              reta: String(row.reta ?? ''),
              barraca: String(row.barraca ?? ''),
              modo: 'fixa',
              pagamento: String(row.pagamento ?? 'pix'),
            } as Entrega,
          }
        })

        set(s => {
          const locais = new Map(s.pedidos.map(p => [p.id, p]))
          const mesclados = doServidor.map(remoto => {
            const local = locais.get(remoto.id)
            // O local tem detalhe que o banco nao guarda (preco por item, GPS
            // da entrega). Mantem esse detalhe e confia no servidor pro status.
            return local
              ? { ...local, ...remoto, itens: local.itens.length ? local.itens : remoto.itens, entrega: local.entrega ?? remoto.entrega }
              : remoto
          })
          // Pedido que so existe localmente (acabou de ser criado e o servidor
          // ainda nao devolveu) nao pode desaparecer da tela.
          const idsRemotos = new Set(doServidor.map(p => p.id))
          const somenteLocais = s.pedidos.filter(p => !idsRemotos.has(p.id))
          return { pedidos: [...mesclados, ...somenteLocais].sort((a, b) => b.data - a.data) }
        })
      },

      cancelarPedido: async (pedidoId) => {
        const pedido = get().pedidos.find(p => p.id === pedidoId)
        if (!pedido) return false

        // So cancela enquanto o vendedor NAO comecou a preparar. O filtro vai
        // no proprio UPDATE (e nao num if antes) porque o vendedor pode aceitar
        // o pedido no exato instante do clique — assim quem decide e o banco,
        // com o estado real, e nao a tela com um estado que ja envelheceu.
        const { data: cancelados, error } = await supabase
          .from('pedidos')
          .update({ status: 'cancelado' })
          .eq('id', pedidoId)
          .eq('status', 'novo')
          .select('id')

        if (error) {
          console.error('Erro ao cancelar pedido', { code: error.code })
          return false
        }
        // Nenhuma linha alterada = o pedido ja saiu de 'novo'. Nao e erro
        // tecnico, e regra de negocio: a tela precisa dizer isso pro cliente.
        if (!cancelados || cancelados.length === 0) return false

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
