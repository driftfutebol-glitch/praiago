import { describe, expect, it } from 'vitest'
import type { Produto } from '../src/lib/catalogo'
import { cartDetail, cartProducts, halfPizzaPrice, pizzaCartKey, resolveCartProduct, stockError } from '../src/lib/pizzaCart'
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
const pizza = (id: string, name: string, price: number, stock: number | null = null): Produto => ({ id, nome: name, preco: price, desc: 'Ingredientes reais', emoji: '', categoria: 'Pizza', estoque: stock, pizza_meio_a_meio: true, pizza_tamanho: 'Grande' })
const products = [pizza(a, 'Calabresa', 43), pizza(b, 'Da casa', 70)]
describe('Pizza meio a meio, sem produtos fictícios no catálogo público', () => {
  it('soma 50% de cada sabor, não o preço mais caro', () => expect(halfPizzaPrice(43, 70)).toBe(56.5))
  it('arredonda somente após somar as metades', () => expect(halfPizzaPrice(49.9, 52.9)).toBe(51.4))
  it('arredonda um meio centavo para cima', () => expect(halfPizzaPrice(43.01, 70)).toBe(56.51))
  it('gera a mesma combinação independentemente da ordem', () => expect(pizzaCartKey(a, b)).toBe(pizzaCartKey(b, a)))
  it('leva os dois sabores, o tamanho e o preço ao resumo', () => {
    const product = resolveCartProduct(products, pizzaCartKey(a, b))!
    expect(product.nome).toContain('½ Calabresa + ½ Da casa')
    expect(product.nome).toContain('Grande')
    expect(product.preco).toBe(56.5)
    expect(cartDetail(product, 2)).toEqual({ produto_id: a, segundo_sabor_id: b, qtd: 2 })
  })
  it('não mistura tamanhos', () => expect(resolveCartProduct([products[0], { ...products[1], pizza_tamanho: 'Broto' }], pizzaCartKey(a, b))).toBeNull())
  it('não combina o mesmo sabor duas vezes', () => expect(resolveCartProduct(products, pizzaCartKey(a, a))).toBeNull())
  it('não aceita sabor que saiu do catálogo', () => expect(resolveCartProduct([products[0]], pizzaCartKey(a, b))).toBeNull())
  it('não combina bebida com pizza', () => expect(resolveCartProduct([products[0], { ...products[1], categoria: 'Bebidas' }], pizzaCartKey(a, b))).toBeNull())
  it('respeita o opt-in do vendedor', () => expect(resolveCartProduct([products[0], { ...products[1], pizza_meio_a_meio: false }], pizzaCartKey(a, b))).toBeNull())
  it('preserva produtos inteiros e seus IDs antigos', () => expect(cartProducts(products, { [a]: 2 })[0].id).toBe(a))
  it('soma o estoque de inteiras e metades do mesmo sabor', () => expect(stockError([pizza(a, 'Calabresa', 43, 1), products[1]], { [a]: 1, [pizzaCartKey(a, b)]: 1 })).toMatch(/Restam/))
  it('duas metades reservam uma unidade inteira por sabor', () => expect(stockError([pizza(a, 'Calabresa', 43, 1), pizza(b, 'Da casa', 70, 1)], { [pizzaCartKey(a, b)]: 2 })).toBeNull())
  it('bloqueia sabor esgotado', () => expect(stockError([pizza(a, 'Calabresa', 43, 0), products[1]], { [pizzaCartKey(a, b)]: 1 })).toMatch(/esgotou/))
  it('estoque nulo permanece ilimitado', () => expect(stockError(products, { [pizzaCartKey(a, b)]: 100 })).toBeNull())
})
