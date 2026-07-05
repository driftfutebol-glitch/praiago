import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Vendedor, VendedorTipo } from '../lib/catalogo'

type ProdutoRow = {
  id: string
  vendedor_id: string | null
  vendedor_nome: string | null
  vendedor_categoria: string | null
  vendedor_emoji: string | null
  nome: string
  descricao: string | null
  preco: number
  emoji: string | null
  categoria: string | null
  ativo: boolean | null
}

type PromocaoRow = {
  id: string
  titulo: string
  descricao: string | null
  produto_id: string
  vendedor_id: string
  desconto_tipo: 'preco_promocional' | 'percentual' | 'valor_fixo'
  desconto_valor: number | null
  preco_promocional: number | null
  selo: string | null
  prioridade: number | null
  data_fim: string | null
}

type ProfileRow = {
  id: string
  nome: string | null
  categoria: string | null
  emoji: string | null
  role: string | null
  avaliacao_media: number | null
  total_avaliacoes: number | null
  online: boolean | null
  lat: number | null
  lng: number | null
  zona: string | null
}

function hero(emoji: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='#0ea5e9'/><stop offset='1' stop-color='#22c55e'/>` +
    `</linearGradient></defs><rect width='400' height='260' fill='url(#g)'/>` +
    `<text x='200' y='168' font-size='120' text-anchor='middle'>${emoji}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function precoComPromocao(preco: number, promo?: PromocaoRow): number {
  if (!promo) return preco
  if (promo.desconto_tipo === 'preco_promocional') {
    const promocional = Number(promo.preco_promocional)
    return promocional > 0 && promocional < preco ? promocional : preco
  }
  if (promo.desconto_tipo === 'percentual') {
    const percentual = Math.min(Math.max(Number(promo.desconto_valor) || 0, 0), 95)
    return Math.max(0, preco * (1 - percentual / 100))
  }
  const valor = Math.max(Number(promo.desconto_valor) || 0, 0)
  return Math.max(0, preco - valor)
}

type State = {
  vendedores: Vendedor[]
  loading: boolean
  carregar: () => Promise<void>
  getVendedor: (id?: string | null) => Vendedor | undefined
}

export const useCatalogo = create<State>((set, get) => ({
  vendedores: [],
  loading: true,

  carregar: async () => {
    const { data: prods } = await supabase.from('produtos').select('*').eq('ativo', true)
    const rows = (prods ?? []) as ProdutoRow[]

    const agora = new Date().toISOString()
    const { data: promos } = await supabase
      .from('promocoes')
      .select('*')
      .eq('ativo', true)
      .eq('publico', true)
      .lte('data_inicio', agora)
      .or(`data_fim.is.null,data_fim.gte.${agora}`)
      .order('prioridade', { ascending: false })
      .order('created_at', { ascending: false })

    const promoPorProduto = new Map<string, PromocaoRow>()
    for (const promo of (promos ?? []) as PromocaoRow[]) {
      if (!promoPorProduto.has(promo.produto_id)) promoPorProduto.set(promo.produto_id, promo)
    }

    const ids = [...new Set(rows.map(r => r.vendedor_id).filter((v): v is string => !!v))]
    const profs: Record<string, ProfileRow> = {}
    if (ids.length) {
      const { data: p } = await supabase.from('profiles').select('*').in('id', ids)
      for (const pr of (p ?? []) as ProfileRow[]) profs[pr.id] = pr
    }

    const byVend = new Map<string, Vendedor>()
    for (const r of rows) {
      const vid = r.vendedor_id ?? 'sem-vendedor'
      if (!byVend.has(vid)) {
        const pf = profs[vid]
        const vendedorEmoji = r.vendedor_emoji || pf?.emoji || '🥥'
        byVend.set(vid, {
          id: vid,
          nome: r.vendedor_nome || pf?.nome || 'Vendedor PraiaGo',
          categoria: r.vendedor_categoria || pf?.categoria || 'Praia',
          avaliacao: Number(pf?.avaliacao_media ?? 0) || 0,
          avaliacoes: Number(pf?.total_avaliacoes ?? 0) || 0,
          tempo: '10-20 min',
          distancia: 'Perto de voce',
          emoji: vendedorEmoji,
          gradiente: 'linear-gradient(135deg,#0ea5e9,#22c55e)',
          aberto: pf?.online ?? true,
          image: hero(vendedorEmoji),
          pos: [pf?.lat ?? -24.0228, pf?.lng ?? -46.4305],
          zona: pf?.zona || 'Praia Grande',
          produtos: [],
          tipo: (pf?.role as VendedorTipo) || 'ambulante',
        })
      }

      const precoOriginal = Number(r.preco) || 0
      const promocao = promoPorProduto.get(r.id)
      const precoFinal = precoComPromocao(precoOriginal, promocao)
      const temPromocao = !!promocao && precoFinal < precoOriginal

      byVend.get(vid)!.produtos.push({
        id: r.id,
        nome: r.nome,
        desc: r.descricao || '',
        preco: precoFinal,
        precoOriginal: temPromocao ? precoOriginal : undefined,
        emoji: r.emoji || '🍽️',
        foto: (r as { foto?: string | null }).foto ?? null,
        categoria: r.categoria || 'geral',
        promocao: temPromocao ? {
          id: promocao.id,
          titulo: promocao.titulo,
          descricao: promocao.descricao,
          selo: promocao.selo || 'Oferta',
          descontoTipo: promocao.desconto_tipo,
          descontoValor: promocao.desconto_valor,
          dataFim: promocao.data_fim,
        } : undefined,
      })
    }

    set({ vendedores: [...byVend.values()], loading: false })
  },

  getVendedor: (id) => get().vendedores.find(v => v.id === id),
}))

let iniciado = false

export function iniciarCatalogo() {
  if (iniciado) return
  iniciado = true
  useCatalogo.getState().carregar()
  supabase
    .channel('catalogo_produtos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => {
      useCatalogo.getState().carregar()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
      useCatalogo.getState().carregar()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promocoes' }, () => {
      useCatalogo.getState().carregar()
    })
    .subscribe()
}
