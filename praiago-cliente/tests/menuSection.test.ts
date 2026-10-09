import { describe, expect, it } from 'vitest'
import { productMenuSection, visibleProductDescription } from '../src/lib/menuSection'

describe('seções do cardápio', () => {
  it('agrupa pizzas sem mudar a categoria ampla do app público', () => {
    const description = 'Chocolate ao leite.\n\nSeção do cardápio: Pizzas doces'
    expect(productMenuSection('Pizza', description)).toBe('Pizzas doces')
    expect(visibleProductDescription(description)).toBe('Chocolate ao leite.')
  })

  it('preserva produtos de outras categorias e pizzas antigas', () => {
    expect(productMenuSection('Bebidas', 'Refrigerante 350 ml')).toBe('Bebidas')
    expect(productMenuSection('Pizza', 'Molho e mussarela')).toBe('Pizza')
  })
})
