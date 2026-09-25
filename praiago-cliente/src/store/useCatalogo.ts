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
  /** NULO = vendedor nao controla estoque. 0 = esgotado. */
  estoque: number | null
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
  /** Só vem preenchido para restaurante — ver o gatilho sync_vendedor_publico. */
  endereco: string | null
  /** Grade por dia da semana (jsonb). Null = loja ainda no formato antigo. */
  horarios: unknown
  verificado: boolean | null
  status: string | null
  horario_abre: string | null
  horario_fecha: string | null
  foto_perfil_path: string | null
  foto_capa_path: string | null
}

import { estaAbertoAgora, lerHorarios } from '../lib/horario'

function hero(emoji: string): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='260'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>` +
    `<stop offset='0' stop-color='#0ea5e9'/><stop offset='1' stop-color='#22c55e'/>` +
    `</linearGradient></defs><rect width='400' height='260' fill='url(#g)'/>` +
    `<text x='200' y='168' font-size='120' text-anchor='middle'>${emoji}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function sellerPhoto(path?: string | null) {
  if (!path) return null
  return supabase.storage.from('perfis-vendedores').getPublicUrl(path).data.publicUrl
}

function coordenadasValidas(lat: number | null | undefined, lng: number | null | undefined) {
  return typeof lat === 'number'
    && Number.isFinite(lat)
    && lat >= -90
    && lat <= 90
    && typeof lng === 'number'
    && Number.isFinite(lng)
    && lng >= -180
    && lng <= 180
}

const CENTRO_PRAIA_GRANDE: [number, number] = [-24.008, -46.412]

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
  refreshing: boolean
  error: string | null
  carregar: () => Promise<void>
  getVendedor: (id?: string | null) => Vendedor | undefined
}

const PRODUTO_COLUNAS = 'id,vendedor_id,vendedor_nome,vendedor_categoria,vendedor_emoji,nome,descricao,preco,emoji,categoria,ativo,estoque,foto'
const PROMO_COLUNAS = 'id,titulo,descricao,produto_id,vendedor_id,desconto_tipo,desconto_valor,preco_promocional,selo,prioridade,data_fim'
const VENDEDOR_COLUNAS = 'id,nome,categoria,emoji,role,avaliacao_media,total_avaliacoes,online,lat,lng,zona,endereco,horarios,verificado,status,horario_abre,horario_fecha,foto_perfil_path,foto_capa_path'
let inFlight: Promise<void> | null = null

async function todasPaginas<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await page(from, from + 499)
    if (error) throw error
    rows.push(...(data || []) as T[])
    if (!data || data.length < 500) return rows
  }
}

export const useCatalogo = create<State>((set, get) => ({
  vendedores: [],
  loading: true,
  refreshing: false,
  error: null,

  carregar: () => {
    if (inFlight) return inFlight
    set({ refreshing: true })
    inFlight = (async () => {
    try {
    const agora = new Date().toISOString()
    const [rows, promos] = await Promise.all([
      todasPaginas<ProdutoRow>((from, to) => supabase.from('produtos').select(PRODUTO_COLUNAS).eq('ativo', true).order('id').range(from, to)),
      todasPaginas<PromocaoRow>((from, to) => supabase.from('promocoes').select(PROMO_COLUNAS)
        .eq('ativo', true).eq('publico', true).lte('data_inicio', agora)
        .or(`data_fim.is.null,data_fim.gte.${agora}`)
        .order('prioridade', { ascending: false }).order('created_at', { ascending: false }).order('id').range(from, to)),
    ])

    const promoPorProduto = new Map<string, PromocaoRow>()
    for (const promo of (promos ?? []) as PromocaoRow[]) {
      if (!promoPorProduto.has(promo.produto_id)) promoPorProduto.set(promo.produto_id, promo)
    }

    const ids = [...new Set(rows.map(r => r.vendedor_id).filter((v): v is string => !!v))]
    const profs: Record<string, ProfileRow> = {}
    for (let offset = 0; offset < ids.length; offset += 100) {
      // Tabela publica cacheada (so colunas seguras): profiles nao e legivel por outros.
      const { data: p, error } = await supabase.from('vendedores_publicos').select(VENDEDOR_COLUNAS).in('id', ids.slice(offset, offset + 100))
      if (error) throw error
      for (const pr of (p ?? []) as ProfileRow[]) profs[pr.id] = pr
    }

    const byVend = new Map<string, Vendedor>()
    for (const r of rows) {
      const vid = r.vendedor_id ?? 'sem-vendedor'
      // Vendedor só aparece pro cliente se estiver verificado (CNPJ/CPF aprovado)
      if (profs[vid]?.verificado !== true) continue
      if (profs[vid]?.status === 'banido' || (profs[vid]?.status && profs[vid]?.status !== 'ativo')) continue
      if (!byVend.has(vid)) {
        const pf = profs[vid]
        const vendedorEmoji = r.vendedor_emoji || pf?.emoji || '🥥'
        const tipo = (pf?.role as VendedorTipo) || 'ambulante'
        const localizacaoConfirmada = coordenadasValidas(pf?.lat, pf?.lng)
        // Ambulantes dependem do GPS ao vivo para aparecer no radar. Restaurantes
        // mantem o cardapio visivel durante a correcao, sem liberar pedido ou rota.
        if (tipo === 'ambulante' && !localizacaoConfirmada) continue
        // Aberto de verdade: horário do vendedor manda; ambulante também precisa
        // estar online (radar ligado). Sem horário definido → cai no online.
        // Usa a grade por dia da semana quando a loja já tiver definido;
        // sem ela, cai no par único abre/fecha do formato antigo.
        const noHorario = estaAbertoAgora(pf?.horarios, pf?.horario_abre, pf?.horario_fecha)
        const disponivelAgora = tipo === 'ambulante'
          ? (pf?.online ?? false) && (noHorario ?? true)
          : (noHorario ?? (pf?.online ?? true))
        const aberto = localizacaoConfirmada && disponivelAgora
        byVend.set(vid, {
          id: vid,
          nome: r.vendedor_nome || pf?.nome || 'Vendedor PraiaGo',
          categoria: r.vendedor_categoria || pf?.categoria || 'Praia',
          avaliacao: Number(pf?.avaliacao_media ?? 0) || 0,
          avaliacoes: Number(pf?.total_avaliacoes ?? 0) || 0,
          tempo: '10-20 min',
          distancia: localizacaoConfirmada ? 'Perto de você' : 'Localização em ajuste',
          emoji: vendedorEmoji,
          gradiente: 'linear-gradient(135deg,#0ea5e9,#22c55e)',
          aberto,
          localizacaoConfirmada,
          image: sellerPhoto(pf?.foto_capa_path) || hero(vendedorEmoji),
          avatar: sellerPhoto(pf?.foto_perfil_path),
          pos: localizacaoConfirmada
            ? [pf.lat as number, pf.lng as number]
            : CENTRO_PRAIA_GRANDE,
          zona: pf?.zona || 'Praia Grande',
          endereco: pf?.endereco?.trim() || null,
          horarios: lerHorarios(pf?.horarios),
          produtos: [],
          tipo,
          horarioAbre: pf?.horario_abre ?? null,
          horarioFecha: pf?.horario_fecha ?? null,
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
        // Numero de verdade ou null. `?? null` de proposito: 0 e esgotado e
        // NAO pode virar null (que aqui significa "sem controle de estoque").
        estoque: typeof r.estoque === 'number' ? r.estoque : null,
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

    set({ vendedores: [...byVend.values()], error: null })
    } catch {
      set({ error: 'Não foi possível atualizar o catálogo.' })
    } finally {
      set({ loading: false, refreshing: false })
      inFlight = null
    }
    })()
    return inFlight
  },

  getVendedor: (id) => get().vendedores.find(v => v.id === id),
}))

let subscribers = 0
let stopCatalog: (() => void) | null = null

export function iniciarCatalogo() {
  subscribers += 1
  if (subscribers === 1) {
  void useCatalogo.getState().carregar()
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  const recarregar = () => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      if (inFlight) await inFlight
      if (!disposed) void useCatalogo.getState().carregar()
    }, 450)
  }
  const channel = supabase
    .channel('catalogo_produtos')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => {
      recarregar()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vendedores_publicos' }, () => {
      recarregar()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'promocoes' }, () => {
      recarregar()
    })
    .subscribe()
  window.addEventListener('online', recarregar)
  stopCatalog = () => {
    disposed = true
    clearTimeout(timer)
    window.removeEventListener('online', recarregar)
    void supabase.removeChannel(channel)
  }
  }
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    subscribers -= 1
    if (!subscribers) { stopCatalog?.(); stopCatalog = null }
  }
}
