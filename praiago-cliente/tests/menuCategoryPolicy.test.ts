import { describe, expect, it } from 'vitest'
import { hasOffensiveCategoryName, menuCategoryKey, mergeMenuCategories, validateMenuCategory } from '../../mobile/menuCategoryPolicy'
import { productMenuSection } from '../src/lib/menuSection'

describe('categorias próprias e moderação', () => {
  it.each(['Bebidas geladas', 'Água de coco', 'Milho assado', 'Cuscuz', 'Picanha', 'Pizzas doces', '99 Food', 'Combos do dia', 'Açaí e sorvetes'])('aceita um nome legítimo: %s', name => {
    expect(validateMenuCategory(name).error).toBeNull()
  })
  it.each(['porra', 'P0RR4', 'p.o.r.r.a', 'p o r r a', 'Pórrá', 'Pooorrrra', 'fdp', 'F.D.P.', 'vai se foder', 'filho da puta', 'M3RD4', 'arrombados', 'b.u.c.e.t.a', 'c u'])('bloqueia palavrão ou disfarce: %s', name => {
    expect(hasOffensiveCategoryName(name)).toBe(true)
    expect(validateMenuCategory(name).error).toContain('respeitoso')
  })
  it.each(['', 'A', '1234', 'Todos', 'tÓdos', 'Pizzas meio a meio', 'Bebidas\nGeladas', 'Be\u200bbidas', 'A'.repeat(61)])('recusa nome inválido ou reservado: %s', name => {
    expect(validateMenuCategory(name).error).not.toBeNull()
  })
  it('normaliza espaços sem alterar a identidade da categoria', () => {
    expect(validateMenuCategory('  Água   de Coco  ').name).toBe('Água de Coco')
    expect(menuCategoryKey('ÁGUA de coco')).toBe('agua de coco')
    expect(mergeMenuCategories(['Água de coco'], ['AGUA DE COCO', 'Pizzas doces', 'porra'])).toEqual(['Água de coco', 'Pizzas doces'])
  })
  it('exibe no Cliente o nome próprio, mantendo a categoria ampla', () => {
    expect(productMenuSection('Bebidas', 'Coco fresco', 'Água de coco gelada')).toBe('Água de coco gelada')
    expect(productMenuSection('Pizza', 'Chocolate', 'Pizzas da casa')).toBe('Pizzas da casa')
    expect(productMenuSection('Bebidas', 'Descrição', 'p.o.r.r.a')).toBe('Bebidas')
    expect(productMenuSection('porra', 'Descrição')).toBe('Outros')
  })
})
