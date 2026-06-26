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
}

export const CATEGORIAS = [
  { id: 'bebidas',    emoji: '🥥', nome: 'Bebidas',    cor: '#10b981' },
  { id: 'espetinhos', emoji: '🍢', nome: 'Espetinhos', cor: '#ea580c' },
  { id: 'acai',       emoji: '🍦', nome: 'Açaí',       cor: '#7c3aed' },
  { id: 'peixes',     emoji: '🐟', nome: 'Peixes',     cor: '#0ea5e9' },
  { id: 'lanches',    emoji: '🍔', nome: 'Lanches',    cor: '#f43f5e' },
  { id: 'cerveja',    emoji: '🍺', nome: 'Cerveja',    cor: '#fbbf24' },
] as const

export const VENDEDORES: Vendedor[] = [
  {
    id: 'coco-do-joao',
    nome: 'Coco do João',
    categoria: 'Bebidas naturais',
    avaliacao: 4.8, avaliacoes: 127,
    tempo: '5–10 min', distancia: '120m',
    emoji: '🥥', gradiente: 'linear-gradient(135deg, #0f766e, #2dd4bf)',
    aberto: true, tag: '🔥 Mais pedido',
    image: 'https://images.unsplash.com/photo-1550853024-fae8cd4be477?w=400&h=250&fit=crop',
    pos: [-24.0060, -46.4140], zona: 'Boqueirão',
    produtos: [
      { id: 'agua-coco',  nome: 'Água de Coco Natural', desc: 'Gelada na hora, 500ml de pura energia.', preco: 8,  emoji: '🥥', categoria: 'bebidas' },
      { id: 'mate-limao', nome: 'Mate com Limão',       desc: 'O clássico das areias paulistas.',        preco: 7,  emoji: '🧉', categoria: 'bebidas' },
      { id: 'biscoito',   nome: 'Biscoito de Polvilho', desc: 'Crocante e fresquinho.',                  preco: 6,  emoji: '🍪', categoria: 'lanches' },
      { id: 'cerveja-lt', nome: 'Cerveja Long Neck',    desc: 'Estupidamente gelada.',                   preco: 10, emoji: '🍺', categoria: 'cerveja' },
    ],
  },
  {
    id: 'churrasco-da-mari',
    nome: 'Churrasco da Mari',
    categoria: 'Grelhados · Frutos do Mar',
    avaliacao: 4.6, avaliacoes: 89,
    tempo: '10–15 min', distancia: '280m',
    emoji: '🍢', gradiente: 'linear-gradient(135deg, #9a3412, #f97316)',
    aberto: true, tag: 'Gourmet',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=250&fit=crop',
    pos: [-24.0035, -46.4115], zona: 'Boqueirão',
    produtos: [
      { id: 'espetinho-carne',  nome: 'Espetinho de Carne', desc: 'Maminha na brasa com farofa.',     preco: 12, emoji: '🍢', categoria: 'espetinhos' },
      { id: 'espetinho-frango', nome: 'Espetinho de Frango',desc: 'Suculento, no ponto.',             preco: 11, emoji: '🍗', categoria: 'espetinhos' },
      { id: 'camarao',          nome: 'Espeto de Camarão',  desc: 'Frutos do mar fresquinhos.',        preco: 22, emoji: '🦐', categoria: 'peixes' },
      { id: 'pao-de-alho',      nome: 'Pão de Alho',        desc: 'Acompanhamento perfeito.',          preco: 8,  emoji: '🧄', categoria: 'lanches' },
    ],
  },
  {
    id: 'praia-sol',
    nome: 'Sorveteria Praia Sol',
    categoria: 'Sorvetes · Açaí',
    avaliacao: 4.9, avaliacoes: 214,
    tempo: '5 min', distancia: '350m',
    emoji: '🍦', gradiente: 'linear-gradient(135deg, #581c87, #a855f7)',
    aberto: true, tag: '⭐ Top',
    image: 'https://images.unsplash.com/photo-1501443762994-82bd5dace89a?w=400&h=250&fit=crop',
    pos: [-24.0080, -46.4090], zona: 'Aviação',
    produtos: [
      { id: 'acai-g',     nome: 'Açaí 500ml',     desc: 'Com granola, banana e leite condensado.', preco: 18, emoji: '🫐', categoria: 'acai' },
      { id: 'acai-p',     nome: 'Açaí 300ml',     desc: 'A medida certa pro calor.',               preco: 13, emoji: '🍨', categoria: 'acai' },
      { id: 'sorvete',    nome: 'Picolé Gourmet', desc: 'Sabores artesanais.',                     preco: 9,  emoji: '🍦', categoria: 'acai' },
      { id: 'milho',      nome: 'Milho Verde',    desc: 'Quentinho, com manteiga e sal.',          preco: 7,  emoji: '🌽', categoria: 'lanches' },
    ],
  },
]

export function getVendedor(id: string | null | undefined): Vendedor | undefined {
  return VENDEDORES.find(v => v.id === id)
}

export function getProduto(vendedorId: string, produtoId: string): Produto | undefined {
  return getVendedor(vendedorId)?.produtos.find(p => p.id === produtoId)
}
