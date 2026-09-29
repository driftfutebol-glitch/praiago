import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import CategoryTabs from '../src/components/CategoryTabs'
import PizzaBuilder from '../src/components/PizzaBuilder'
it('seleciona categorias pela aba, teclado e lista completa', () => {
  const change = vi.fn()
  render(<CategoryTabs categories={['Todos','Pizzas salgadas','Bebidas']} value="Todos" onChange={change} />)
  fireEvent.click(screen.getByRole('button', { name: 'Bebidas' }))
  expect(change).toHaveBeenLastCalledWith('Bebidas')
  fireEvent.keyDown(screen.getByRole('button', { name: 'Todos' }), { key: 'ArrowRight' })
  expect(change).toHaveBeenLastCalledWith('Pizzas salgadas')
  fireEvent.click(screen.getByRole('button', { name: 'Ver todas as categorias' }))
  expect(screen.getByRole('button', { name: 'Fechar categorias' }).getAttribute('aria-expanded')).toBe('true')
})
it('monta dois sabores e mostra o cálculo antes de adicionar', async () => {
  const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222'
  const base = { desc:'Molho e mussarela', emoji:'', categoria:'Pizza', estoque:null, pizza_meio_a_meio:true, pizza_tamanho:'Grande' }
  const add=vi.fn().mockResolvedValue(true), close=vi.fn()
  render(<PizzaBuilder products={[{...base,id:a,nome:'Calabresa',preco:43},{...base,id:b,nome:'Da casa',preco:70}]} onAdd={add} onClose={close} />)
  expect((screen.getByRole('button', { name:'Adicionar pizza ao carrinho' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByRole('combobox', { name:'Primeiro sabor' }), { target:{ value:a } })
  fireEvent.change(screen.getByRole('combobox', { name:'Segundo sabor' }), { target:{ value:b } })
  expect(screen.getByText(/Total:/).textContent).toContain('56,50')
  fireEvent.click(screen.getByRole('button', { name:'Adicionar pizza ao carrinho' }))
  await vi.waitFor(() => expect(add).toHaveBeenCalledWith(`pizza:${a}:${b}`))
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
})
