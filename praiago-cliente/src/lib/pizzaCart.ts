import type { Produto } from './catalogo'

export type CartProduct = Produto & { segundoSaborId?: string; produtoId: string }
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const COMBO = new RegExp(`^pizza:(${UUID}):(${UUID})$`, 'i')
export function pizzaCartKey(first: string, second: string) {
  return `pizza:${[first, second].sort().join(':')}`
}
export function halfPizzaPrice(first: number, second: number) {
  return Math.round((Math.round(first * 100) + Math.round(second * 100)) / 2) / 100
}
export function compatiblePizza(first: Produto, second: Produto) {
  return first.id !== second.id && first.pizza_meio_a_meio === true && second.pizza_meio_a_meio === true
    && !!first.pizza_tamanho && first.pizza_tamanho === second.pizza_tamanho
    && first.categoria === 'Pizza' && second.categoria === 'Pizza'
}
export function resolveCartProduct(products: Produto[], key: string): CartProduct | null {
  const match = key.match(COMBO)
  if (!match) {
    const product = products.find(item => item.id === key)
    return product ? { ...product, produtoId: product.id } : null
  }
  const first = products.find(item => item.id === match[1]), second = products.find(item => item.id === match[2])
  if (!first || !second || !compatiblePizza(first, second)) return null
  return { ...first, id: key, produtoId: first.id, segundoSaborId: second.id,
    nome: `Pizza meio a meio (${first.pizza_tamanho}): ½ ${first.nome} + ½ ${second.nome}`,
    desc: `½ ${first.nome}: ${first.desc}\n½ ${second.nome}: ${second.desc}`,
    preco: halfPizzaPrice(first.preco, second.preco), precoOriginal: undefined, promocao: undefined, estoque: null }
}
export function cartProducts(products: Produto[], cart: Record<string, number>) {
  return Object.entries(cart).flatMap(([key, quantity]) => {
    const product = resolveCartProduct(products, key)
    return product && quantity > 0 ? [product] : []
  })
}
export function cartDetail(product: CartProduct, quantity: number) {
  return { produto_id: product.produtoId, qtd: quantity, ...(product.segundoSaborId ? { segundo_sabor_id: product.segundoSaborId } : {}) }
}
// Integer inventory counts full units. Reserve ceil(total halves) per flavor.
export function stockError(products: Produto[], cart: Record<string, number>): string | null {
  const usage = new Map<string, number>()
  for (const [key, quantity] of Object.entries(cart)) {
    const product = resolveCartProduct(products, key)
    if (!product) return 'Um item ficou indisponível. Remova-o do carrinho.'
    for (const id of [product.produtoId, ...(product.segundoSaborId ? [product.segundoSaborId] : [])])
      usage.set(id, (usage.get(id) || 0) + quantity * (product.segundoSaborId ? 0.5 : 1))
  }
  for (const product of products) {
    if (product.estoque != null && Math.ceil(usage.get(product.id) || 0) > product.estoque)
      return product.estoque === 0 ? `${product.nome} esgotou. Remova ou troque o sabor.` : `Restam só ${product.estoque} de ${product.nome}. Ajuste a quantidade.`
  }
  return null
}
