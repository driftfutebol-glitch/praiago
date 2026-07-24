// Catálogo — tipos e categorias do app Cliente.
// Os vendedores/produtos REAIS vêm do Supabase (store useCatalogo).

export type Produto = {
  id: string
  nome: string
  desc: string
  preco: number
  precoOriginal?: number
  emoji: string
  foto?: string | null
  categoria: string
  promocao?: {
    id: string
    titulo: string
    descricao?: string | null
    selo: string
    descontoTipo: 'preco_promocional' | 'percentual' | 'valor_fixo'
    descontoValor?: number | null
    dataFim?: string | null
  }
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
  // Horário de funcionamento (HH:MM) definido pelo próprio vendedor
  horarioAbre?: string | null
  horarioFecha?: string | null
}

export const CATEGORIAS = [
  { id: 'bebidas',    emoji: '🥥', nome: 'Bebidas',    cor: '#10b981' },
  { id: 'espetinhos', emoji: '🍢', nome: 'Espetinhos', cor: '#ea580c' },
  { id: 'acai',       emoji: '🍧', nome: 'Açaí',       cor: '#7c3aed' },
  { id: 'peixes',     emoji: '🐟', nome: 'Peixes',     cor: '#0ea5e9' },
  { id: 'lanches',    emoji: '🍔', nome: 'Lanches',    cor: '#f43f5e' },
  { id: 'cerveja',    emoji: '🍺', nome: 'Cerveja',    cor: '#fbbf24' },
] as const

// Sem dados fictícios. Os vendedores/produtos reais vêm do Supabase
// (cadastro do ambulante/restaurante → aprovação no admin → publicação do cardápio).
// Enquanto não houver vendedor real online, o app mostra estado vazio.
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


