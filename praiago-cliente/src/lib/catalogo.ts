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

export const VENDEDORES: Vendedor[] = [
  // ── Restaurantes ─────────────────────────────────────────
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
    tipo: 'ambulante',
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
    tipo: 'restaurante',
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
    tipo: 'restaurante',
    produtos: [
      { id: 'acai-g',     nome: 'Açaí 500ml',     desc: 'Com granola, banana e leite condensado.', preco: 18, emoji: '🫐', categoria: 'acai' },
      { id: 'acai-p',     nome: 'Açaí 300ml',     desc: 'A medida certa pro calor.',               preco: 13, emoji: '🍨', categoria: 'acai' },
      { id: 'sorvete',    nome: 'Picolé Gourmet', desc: 'Sabores artesanais.',                     preco: 9,  emoji: '🍦', categoria: 'acai' },
      { id: 'milho',      nome: 'Milho Verde',    desc: 'Quentinho, com manteiga e sal.',          preco: 7,  emoji: '🌽', categoria: 'lanches' },
    ],
  },

  // ── Ambulantes (vendedores de praia com GPS ao vivo) ─────
  {
    id: 'mate-gelado-ze',
    nome: 'Mate Gelado do Zé',
    categoria: 'Bebidas',
    avaliacao: 4.5, avaliacoes: 68,
    tempo: '2–5 min', distancia: '—',
    emoji: '🧉', gradiente: 'linear-gradient(135deg, #15803d, #4ade80)',
    aberto: true, tag: '🏖️ Na areia',
    image: 'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=400&h=250&fit=crop',
    pos: [-24.0440, -46.4125], zona: 'Tupi',
    tipo: 'ambulante',
    produtos: [
      { id: 'mate-natural',  nome: 'Mate Natural',       desc: 'O mate tradicional, geladíssimo.',      preco: 6,  emoji: '🧉', categoria: 'bebidas' },
      { id: 'mate-pessego',  nome: 'Mate com Pêssego',   desc: 'Doce natural de fruta.',                preco: 7,  emoji: '🍑', categoria: 'bebidas' },
      { id: 'agua-mineral',  nome: 'Água Mineral 500ml', desc: 'Gelada, sem gás.',                      preco: 4,  emoji: '💧', categoria: 'bebidas' },
      { id: 'biscoito-glob', nome: 'Biscoito Globo',     desc: 'O queridinho da praia.',                preco: 5,  emoji: '🍪', categoria: 'lanches' },
    ],
  },
  {
    id: 'espetinho-carlos',
    nome: 'Espetinho do Carlos',
    categoria: 'Grelhados',
    avaliacao: 4.6, avaliacoes: 52,
    tempo: '5–8 min', distancia: '—',
    emoji: '🍢', gradiente: 'linear-gradient(135deg, #b91c1c, #f87171)',
    aberto: true,
    image: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=250&fit=crop',
    pos: [-24.0020, -46.4095], zona: 'Ocian',
    tipo: 'ambulante',
    produtos: [
      { id: 'espeto-queijo',   nome: 'Espetinho de Queijo', desc: 'Coalho na brasa, irresistível.',  preco: 8,  emoji: '🧀', categoria: 'espetinhos' },
      { id: 'espeto-carne2',   nome: 'Espetinho Misto',     desc: 'Carne, frango e linguiça.',       preco: 14, emoji: '🍖', categoria: 'espetinhos' },
      { id: 'espeto-camarao2', nome: 'Espeto de Camarão',   desc: 'Fresquinho do mar.',              preco: 18, emoji: '🦐', categoria: 'peixes' },
      { id: 'milho-manteiga',  nome: 'Milho com Manteiga',  desc: 'Quentinho, salgado na medida.',   preco: 6,  emoji: '🌽', categoria: 'lanches' },
    ],
  },
  {
    id: 'acai-bia',
    nome: 'Açaí da Bia',
    categoria: 'Sorvetes · Açaí',
    avaliacao: 4.9, avaliacoes: 143,
    tempo: '3–5 min', distancia: '—',
    emoji: '🍦', gradiente: 'linear-gradient(135deg, #5b21b6, #c084fc)',
    aberto: true, tag: '⭐ Favorito',
    image: 'https://images.unsplash.com/photo-1590080874088-eec64895b423?w=400&h=250&fit=crop',
    pos: [-24.0540, -46.4120], zona: 'Canto do Forte',
    tipo: 'ambulante',
    produtos: [
      { id: 'acai-bia-g',  nome: 'Açaí na Tigela G',    desc: 'Granola, banana, morango, leite condensado.', preco: 16, emoji: '🫐', categoria: 'acai' },
      { id: 'acai-bia-p',  nome: 'Açaí no Copo 300ml',  desc: 'Puro ou com cobertura.',                      preco: 11, emoji: '🍨', categoria: 'acai' },
      { id: 'picole-frutas', nome: 'Picolé de Frutas',   desc: 'Manga, maracujá ou limão.',                   preco: 7,  emoji: '🍦', categoria: 'acai' },
      { id: 'suco-laranja',  nome: 'Suco Natural',       desc: 'Laranja ou abacaxi feito na hora.',           preco: 9,  emoji: '🍊', categoria: 'bebidas' },
    ],
  },
  {
    id: 'cerveja-tico',
    nome: 'Cerveja do Tico',
    categoria: 'Bebidas',
    avaliacao: 4.3, avaliacoes: 37,
    tempo: '1–3 min', distancia: '—',
    emoji: '🍺', gradiente: 'linear-gradient(135deg, #92400e, #fbbf24)',
    aberto: false,
    image: 'https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=250&fit=crop',
    pos: [-24.0150, -46.4150], zona: 'Boqueirão',
    tipo: 'ambulante',
    produtos: [
      { id: 'cerveja-lata',  nome: 'Cerveja Lata',       desc: 'Estupidamente gelada.',               preco: 7,  emoji: '🍺', categoria: 'cerveja' },
      { id: 'cerveja-long',  nome: 'Long Neck Premium',  desc: 'Marcas selecionadas.',                preco: 12, emoji: '🍻', categoria: 'cerveja' },
      { id: 'agua-coco-tico',nome: 'Água de Coco',       desc: 'Natural, direto do coco.',            preco: 8,  emoji: '🥥', categoria: 'bebidas' },
      { id: 'refrigerante',  nome: 'Refrigerante Lata',  desc: 'Coca, Guaraná ou Sprite.',            preco: 6,  emoji: '🥤', categoria: 'bebidas' },
    ],
  },
]

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

