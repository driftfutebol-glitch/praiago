// Catálogo — FONTE ÚNICA de vendedores e produtos do app Cliente.
// Antes existiam 3 listas divergentes (HomePage, PedirPage, PerfilPage).
// O ambulante "publica" o cardápio dele aqui (no futuro via Supabase);
// por ora é o seed compartilhado.

export type Produto = {
  id: string
  nome: string
  desc: string
  preco: number
  emoji: string
  categoria: string
}

export type VendedorTipo = 'restaurante' | 'ambulante'

export type Vendedor = {
  id: string
  nome: string
  categoria: string
  avaliacao: number
  avaliacoes: number
  tempo: string
  distancia: string
  emoji: string
  gradiente: string
  aberto: boolean
  tag?: string
  image: string
  pos: [number, number]
  zona: string
  produtos: Produto[]
  tipo: VendedorTipo
}

export const CATEGORIAS = [
  { id: 'bebidas',    emoji: '🥥', nome: 'Bebidas',    cor: '#10b981' },
  { id: 'espetinhos', emoji: '🍢', nome: 'Espetinhos', cor: '#ea580c' },
  { id: 'acai',       emoji: '🍦', nome: 'Açaí',       cor: '#7c3aed' },
  { id: 'peixes',     emoji: '🐟', nome: 'Peixes',     cor: '#0ea5e9' },
  { id: 'lanches',    emoji: '🍔', nome: 'Lanches',    cor: '#f43f5e' },
  { id: 'cerveja',    emoji: '🍺', nome: 'Cerveja',    cor: '#fbbf24' },
] as const

export const VENDEDORES: Vendedor[] = []

export function getVendedor(id: string | null | undefined): Vendedor | undefined {
  return VENDEDORES.find(v => v.id === id)
}

export function getProduto(vendedorId: string, produtoId: string): Produto | undefined {
  return getVendedor(vendedorId)?.produtos.find(p => p.id === produtoId)
}

/** Retorna apenas ambulantes */
export function getAmbulantes(): Vendedor[] {
  return VENDEDORES.filter(v => v.tipo === 'ambulante')
}

/** Retorna apenas restaurantes */
export function getRestaurantes(): Vendedor[] {
  return VENDEDORES.filter(v => v.tipo === 'restaurante')
}

