import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import ProductMenuOptions from '../src/components/ProductMenuOptions'
import { productMenuSection } from '../src/lib/menuSection'
it('seção personalizada prevalece sem apagar ingredientes ou tags legadas', () => {
  expect(productMenuSection('Pizza','Molho\n\nSeção do cardápio: Pizzas doces','Especiais da casa')).toBe('Especiais da casa')
  expect(productMenuSection('Pizza','Molho\n\nSeção do cardápio: Pizzas doces')).toBe('Pizzas doces')
})
it('permite seção própria e habilitação explícita por sabor', () => {
  const change=vi.fn()
  render(<ProductMenuOptions value={{menu_secao:'',pizza_meio_a_meio:false,pizza_tamanho:''}} onChange={change} pizza sections={['Bebidas']} />)
  fireEvent.change(screen.getByRole('combobox', {name:'Nome da seção do cardápio'}),{target:{value:'Combos da casa'}})
  expect(change).toHaveBeenLastCalledWith({menu_secao:'Combos da casa',pizza_meio_a_meio:false,pizza_tamanho:''})
  fireEvent.click(screen.getByRole('checkbox'))
  expect(change.mock.calls.at(-1)?.[0].pizza_meio_a_meio).toBe(true)
})
it('bebidas não recebem configuração de pizza', () => {
  render(<ProductMenuOptions value={{menu_secao:'Bebidas',pizza_meio_a_meio:false,pizza_tamanho:''}} onChange={() => {}} pizza={false} sections={[]} />)
  expect(screen.queryByRole('checkbox')).toBeNull()
})
