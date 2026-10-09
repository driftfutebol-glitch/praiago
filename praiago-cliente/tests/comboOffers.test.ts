import { describe, expect, it } from 'vitest'
import { comboSummary, parseComboEntries } from '../../mobile/comboOffers'
import { stockError } from '../src/lib/pizzaCart'
import type { Produto } from '../src/lib/catalogo'

const products = [
  { id: 'lanche', nome: 'Lanche', preco: 10, estoque: 3, ativo: true, tipo_produto: 'simples', vendedor_id: 'loja' },
  { id: 'bebida', nome: 'Bebida', preco: 5, estoque: 2, ativo: true, tipo_produto: 'simples', vendedor_id: 'loja' },
]

describe('combos reais', () => {
  it('rejeita composição vazia, repetida e quantidades inválidas', () => {
    expect(parseComboEntries([{ produto_id: 'lanche', qtd: 1 }])).toEqual([])
    expect(parseComboEntries([{ produto_id: 'lanche', qtd: 1 }, { produto_id: 'lanche', qtd: 2 }])).toEqual([])
    expect(parseComboEntries([{ produto_id: 'lanche', qtd: 0 }, { produto_id: 'bebida', qtd: 1 }])).toEqual([])
  })

  it('calcula valor separado e menor estoque dos componentes', () => {
    const entries = parseComboEntries([{ produto_id: 'lanche', qtd: 1 }, { produto_id: 'bebida', qtd: 2 }])
    expect(comboSummary(entries, products, 'loja')).toMatchObject({ separatePrice: 20, availableStock: 1 })
    expect(comboSummary(entries, products, 'outra-loja')).toBeNull()
  })

  it('impede carrinho de exceder estoque ao somar combo e item avulso', () => {
    const combo: Produto = { id: 'combo', nome: 'Combo', desc: '', preco: 16, emoji: '🎁', categoria: 'Combos', estoque: 2,
      combo: { itens: [{ produto_id: 'lanche', qtd: 1, nome: 'Lanche' }, { produto_id: 'bebida', qtd: 1, nome: 'Bebida' }], precoSeparado: 15 } }
    const catalog = [combo, ...products.map(product => ({ ...product, desc: '', emoji: '🍽️', categoria: 'Outros' }))] as Produto[]
    expect(stockError(catalog, { combo: 1, bebida: 1 })).toBeNull()
    expect(stockError(catalog, { combo: 2, bebida: 1 })).toMatch(/Bebida/)
  })
})
