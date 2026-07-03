// Catálogo REAL vindo do Supabase (substitui o catalogo.ts estático).
// Lê a tabela `produtos` (dos ambulantes/restaurantes), agrupa por vendedor e
// junta o `profiles` do vendedor (nome, nota, zona…). Atualiza em tempo real.
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

// Imagem-herói (gradiente + emoji) — sempre renderiza, sem depender de rede.
function hero(emoji: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='#0ea5e9'/><stop offset='1' stop-color='#22c55e'/>` +
    `</linearGradient></defs><rect width='400' height='260' fill='url(#g)'/>` +
    `<text x='200' y='168' font-size='120' text-anchor='middle'>${emoji}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
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
        const emoji = r.vendedor_emoji || pf?.emoji || '🥥'
        byVend.set(vid, {
          id: vid,
          nome: r.vendedor_nome || pf?.nome || 'Vendedor PraiaGo',
          categoria: r.vendedor_categoria || pf?.categoria || 'Praia',
          avaliacao: Number(pf?.avaliacao_media ?? 0) || 0,
          avaliacoes: Number(pf?.total_avaliacoes ?? 0) || 0,
          tempo: '10-20 min',
          distancia: 'Perto de você',
          emoji,
          gradiente: 'linear-gradient(135deg,#0ea5e9,#22c55e)',
          aberto: pf?.online ?? true,
          image: hero(emoji),
          pos: [pf?.lat ?? -24.0228, pf?.lng ?? -46.4305],
          zona: pf?.zona || 'Praia Grande',
          produtos: [],
          tipo: (pf?.role as VendedorTipo) || 'ambulante',
        })
      }
      byVend.get(vid)!.produtos.push({
        id: r.id,
        nome: r.nome,
        desc: r.descricao || '',
        preco: Number(r.preco) || 0,
        emoji: r.emoji || '🍽️',
        categoria: r.categoria || 'geral',
      })
    }
    set({ vendedores: [...byVend.values()], loading: false })
  },

  getVendedor: (id) => get().vendedores.find(v => v.id === id),
}))

// Carrega uma vez e assina realtime (chamar no App).
let _iniciado = false
export function iniciarCatalogo() {
  if (_iniciado) return
  _iniciado = true
  useCatalogo.getState().carregar()
  supabase
    .channel('catalogo_produtos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => {
      useCatalogo.getState().carregar()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
      useCatalogo.getState().carregar()
    })
    .subscribe()
}
