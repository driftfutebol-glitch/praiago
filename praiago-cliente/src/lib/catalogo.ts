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
  { id: 'bebidas',       nome: 'Bebidas',        cor: '#0891b2', sprite: [0, 0], aliases: ['bebida', 'bebidas', 'agua', 'aguas', 'suco', 'sucos', 'refrigerante', 'refrigerantes', 'cerveja', 'cervejas', 'chopp', 'chope'] },
  { id: 'espetos',       nome: 'Espetos',        cor: '#ea580c', sprite: [1, 0], aliases: ['espeto', 'espetos', 'espetinho', 'espetinhos', 'churrasco'] },
  { id: 'salgados',      nome: 'Salgados',       cor: '#d97706', sprite: [2, 0], aliases: ['salgado', 'salgados', 'coxinha', 'coxinhas'] },
  { id: 'porcoes',       nome: 'Porções',        cor: '#16a34a', sprite: [3, 0], aliases: ['porcao', 'porcoes', 'petisco', 'petiscos', 'aperitivo', 'aperitivos'] },
  { id: 'almoco',        nome: 'Almoço',         cor: '#dc2626', sprite: [4, 0], aliases: ['almoco', 'prato', 'pratos', 'prato executivo', 'pratos executivos', 'executivo', 'executivos', 'refeicao', 'refeicoes'] },
  { id: 'doces_bolos',   nome: 'Doces e bolos',  cor: '#c026d3', sprite: [0, 1], aliases: ['doces e bolos', 'bolo', 'bolos', 'doce', 'doces', 'sobremesa', 'sobremesas'] },
  { id: 'arabe',         nome: 'Árabe',          cor: '#b45309', sprite: [1, 1], aliases: ['arabe', 'arabes', 'comida arabe'] },
  { id: 'acai',          nome: 'Açaí',           cor: '#7c3aed', sprite: [2, 1], aliases: ['acai', 'acais'] },
  { id: 'brasileira',    nome: 'Brasileira',     cor: '#15803d', sprite: [3, 1], aliases: ['brasileira', 'comida brasileira', 'culinaria brasileira'] },
  { id: 'pastel',        nome: 'Pastel',         cor: '#ca8a04', sprite: [4, 1], aliases: ['pastel', 'pasteis'] },
  { id: 'padarias',      nome: 'Padarias',       cor: '#a16207', sprite: [0, 2], aliases: ['padaria', 'padarias', 'pao', 'paes', 'panificacao'] },
  { id: 'pizza',         nome: 'Pizza',           cor: '#e11d48', sprite: [1, 2], aliases: ['pizza', 'pizzas', 'pizzaria'] },
  { id: 'italiana',      nome: 'Italiana',       cor: '#dc2626', sprite: [2, 2], aliases: ['italiana', 'comida italiana', 'massa', 'massas', 'macarrao'] },
  { id: 'saudavel',      nome: 'Saudável',       cor: '#16a34a', sprite: [3, 2], aliases: ['saudavel', 'salada', 'saladas', 'fitness', 'fit'] },
  { id: 'carnes',        nome: 'Carnes',         cor: '#b91c1c', sprite: [4, 2], aliases: ['carne', 'carnes', 'churrascaria'] },
  { id: 'sorvetes',      nome: 'Sorvetes',       cor: '#db2777', sprite: [0, 3], aliases: ['sorvete', 'sorvetes', 'gelato'] },
  { id: 'lanches',       nome: 'Lanches',        cor: '#e11d48', sprite: [1, 3], aliases: ['lanche', 'lanches', 'hamburguer', 'hamburgueres', 'sanduiche', 'sanduiches'] },
  { id: 'marmita',       nome: 'Marmita',        cor: '#d97706', sprite: [2, 3], aliases: ['marmita', 'marmitas', 'quentinha', 'quentinhas'] },
  { id: 'japonesa',      nome: 'Japonesa',       cor: '#be123c', sprite: [3, 3], aliases: ['japonesa', 'comida japonesa', 'sushi', 'sushis'] },
  { id: 'vegetariana',   nome: 'Vegetariana',    cor: '#15803d', sprite: [4, 3], aliases: ['vegetariana', 'vegetariano', 'vegan', 'vegana', 'vegano'] },
  { id: 'tapiocas',      nome: 'Tapiocas',       cor: '#ca8a04', sprite: [0, 4], aliases: ['tapioca', 'tapiocas'] },
  { id: 'frutos_mar',    nome: 'Frutos do mar',  cor: '#0369a1', sprite: [1, 4], aliases: ['fruto do mar', 'frutos do mar', 'marisco', 'mariscos'] },
  { id: 'francesa',      nome: 'Francesa',       cor: '#9333ea', sprite: [2, 4], aliases: ['francesa', 'comida francesa', 'crepe', 'crepes'] },
  { id: 'cafeteria',     nome: 'Cafeteria',      cor: '#92400e', sprite: [3, 4], aliases: ['cafeteria', 'cafe', 'cafes', 'cafe da manha'] },
  { id: 'sopas_caldos',  nome: 'Sopas e caldos', cor: '#ea580c', sprite: [4, 4], aliases: ['sopa', 'sopas', 'caldo', 'caldos', 'sopas e caldos'] },
  { id: 'peixes',        nome: 'Peixes',         cor: '#0284c7', sprite: [0, 5], aliases: ['peixe', 'peixes', 'pescado', 'pescados'] },
  { id: 'outros',        nome: 'Outros',         cor: '#475569', sprite: [4, 5], aliases: ['outro', 'outros', 'ambulante', 'diversos'] },
] as const

export type CategoriaId = typeof CATEGORIAS[number]['id']

function normalizarCategoria(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function pertenceACategoria(valor: string, categoriaId: CategoriaId): boolean {
  const categoria = CATEGORIAS.find(item => item.id === categoriaId)
  if (!categoria) return false
  return (categoria.aliases as readonly string[]).includes(normalizarCategoria(valor))
}

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


