export type ProductCategory = {
  id: string
  label: string
  color: string
  sprite: readonly [number, number]
  image?: string
  ageRestricted?: boolean
  aliases: readonly string[]
}

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  { id: 'bebidas', label: 'Bebidas', color: '#0891b2', sprite: [0, 0], aliases: ['bebida', 'bebidas', 'agua', 'aguas', 'suco', 'sucos', 'refrigerante', 'refrigerantes'] },
  { id: 'bebidas_alcoolicas', label: 'Bebidas alcoólicas', color: '#b45309', sprite: [0, 0], image: '/images/bebidas-alcoolicas-v1.webp', ageRestricted: true, aliases: ['bebida alcoolica', 'bebidas alcoolicas', 'cerveja', 'cervejas', 'chopp', 'chope', 'vinho', 'vinhos', 'drink', 'drinks', 'caipirinha', 'destilado', 'destilados', 'vodka', 'gin', 'whisky'] },
  { id: 'espetos', label: 'Espetos', color: '#ea580c', sprite: [1, 0], aliases: ['espeto', 'espetos', 'espetinho', 'espetinhos', 'churrasco'] },
  { id: 'salgados', label: 'Salgados', color: '#d97706', sprite: [2, 0], aliases: ['salgado', 'salgados', 'coxinha', 'coxinhas'] },
  { id: 'porcoes', label: 'Porções', color: '#16a34a', sprite: [3, 0], aliases: ['porcao', 'porcoes', 'petisco', 'petiscos', 'aperitivo', 'aperitivos'] },
  { id: 'almoco', label: 'Almoço', color: '#dc2626', sprite: [4, 0], aliases: ['almoco', 'prato', 'pratos', 'prato executivo', 'pratos executivos', 'executivo', 'executivos', 'refeicao', 'refeicoes'] },
  { id: 'doces_bolos', label: 'Doces e bolos', color: '#c026d3', sprite: [0, 1], aliases: ['doces e bolos', 'bolo', 'bolos', 'doce', 'doces', 'sobremesa', 'sobremesas'] },
  { id: 'arabe', label: 'Árabe', color: '#b45309', sprite: [1, 1], aliases: ['arabe', 'arabes', 'comida arabe'] },
  { id: 'acai', label: 'Açaí', color: '#7c3aed', sprite: [2, 1], aliases: ['acai', 'acais'] },
  { id: 'brasileira', label: 'Brasileira', color: '#15803d', sprite: [3, 1], aliases: ['brasileira', 'comida brasileira', 'culinaria brasileira'] },
  { id: 'pastel', label: 'Pastel', color: '#ca8a04', sprite: [4, 1], aliases: ['pastel', 'pasteis'] },
  { id: 'padarias', label: 'Padarias', color: '#a16207', sprite: [0, 2], aliases: ['padaria', 'padarias', 'pao', 'paes', 'panificacao'] },
  { id: 'pizza', label: 'Pizza', color: '#e11d48', sprite: [1, 2], aliases: ['pizza', 'pizzas', 'pizzaria'] },
  { id: 'italiana', label: 'Italiana', color: '#dc2626', sprite: [2, 2], aliases: ['italiana', 'comida italiana', 'massa', 'massas', 'macarrao'] },
  { id: 'saudavel', label: 'Saudável', color: '#16a34a', sprite: [3, 2], aliases: ['saudavel', 'salada', 'saladas', 'fitness', 'fit'] },
  { id: 'carnes', label: 'Carnes', color: '#b91c1c', sprite: [4, 2], aliases: ['carne', 'carnes', 'churrascaria'] },
  { id: 'sorvetes', label: 'Sorvetes', color: '#db2777', sprite: [0, 3], aliases: ['sorvete', 'sorvetes', 'gelato'] },
  { id: 'lanches', label: 'Lanches', color: '#e11d48', sprite: [1, 3], aliases: ['lanche', 'lanches', 'hamburguer', 'hamburgueres', 'sanduiche', 'sanduiches'] },
  { id: 'marmita', label: 'Marmita', color: '#d97706', sprite: [2, 3], aliases: ['marmita', 'marmitas', 'quentinha', 'quentinhas'] },
  { id: 'japonesa', label: 'Japonesa', color: '#be123c', sprite: [3, 3], aliases: ['japonesa', 'comida japonesa', 'sushi', 'sushis'] },
  { id: 'vegetariana', label: 'Vegetariana', color: '#15803d', sprite: [4, 3], aliases: ['vegetariana', 'vegetariano', 'vegan', 'vegana', 'vegano'] },
  { id: 'tapiocas', label: 'Tapiocas', color: '#ca8a04', sprite: [0, 4], aliases: ['tapioca', 'tapiocas'] },
  { id: 'frutos_mar', label: 'Frutos do mar', color: '#0369a1', sprite: [1, 4], aliases: ['fruto do mar', 'frutos do mar', 'marisco', 'mariscos'] },
  { id: 'francesa', label: 'Francesa', color: '#9333ea', sprite: [2, 4], aliases: ['francesa', 'comida francesa', 'crepe', 'crepes'] },
  { id: 'cafeteria', label: 'Cafeteria', color: '#92400e', sprite: [3, 4], aliases: ['cafeteria', 'cafe', 'cafes', 'cafe da manha'] },
  { id: 'sopas_caldos', label: 'Sopas e caldos', color: '#ea580c', sprite: [4, 4], aliases: ['sopa', 'sopas', 'caldo', 'caldos', 'sopas e caldos'] },
  { id: 'peixes', label: 'Peixes', color: '#0284c7', sprite: [0, 5], aliases: ['peixe', 'peixes', 'pescado', 'pescados'] },
  { id: 'outros', label: 'Outros', color: '#475569', sprite: [4, 5], aliases: ['outro', 'outros', 'ambulante', 'diversos', 'geral'] },
]

const FEATURED_CATEGORY_IDS = new Set(['bebidas', 'bebidas_alcoolicas', 'espetos', 'salgados', 'porcoes', 'almoco', 'doces_bolos', 'acai'])

export const FEATURED_PRODUCT_CATEGORIES = PRODUCT_CATEGORIES.filter(category => FEATURED_CATEGORY_IDS.has(category.id))

export function normalizeCategory(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function getProductCategory(value?: string | null): ProductCategory {
  const normalized = normalizeCategory(value || '')
  return PRODUCT_CATEGORIES.find(category => (
    normalizeCategory(category.label) === normalized || category.aliases.includes(normalized)
  )) || PRODUCT_CATEGORIES[PRODUCT_CATEGORIES.length - 1]
}
