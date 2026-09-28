import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import MobileNavigation from '../src/components/MobileNavigation'
import { restaurantNavigation } from '../src/lib/navigation'

function mount(path = '/', newOrders = 0, onLogout = vi.fn()) {
  render(<MemoryRouter initialEntries={[path]}><MobileNavigation restaurantName="Loja em teste" newOrders={newOrders} notices={[]} onLogout={onLogout} /></MemoryRouter>)
  return onLogout
}

describe('Navegação do restaurante no celular', () => {
  it('mantém quatro áreas principais e Mais, sem sete abas fora da tela', () => {
    mount()
    const nav = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
    expect(nav.getAllByRole('link').map(link => link.textContent)).toEqual(['Painel', 'Pedidos', 'Cardápio', 'Vendas'])
    expect(nav.getByRole('button', { name: 'Mais' })).toBeTruthy()
  })
  it('abre todas as oito áreas, incluindo Carteira, Perfil, Mapa e Entregadores', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'Mais' }))
    const menu = screen.getByRole('dialog')
    expect(menu.hasAttribute('open')).toBe(true)
    expect(within(menu).getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(restaurantNavigation.map(item => item.to))
  })
  it('destaca Pedidos sem marcar Painel como ativo', () => {
    mount('/pedidos', 4)
    const nav = within(screen.getByRole('navigation', { name: 'Navegação principal' }))
    expect(nav.getByRole('link', { name: /Pedidos/ }).getAttribute('aria-current')).toBe('page')
    expect(nav.getByRole('link', { name: 'Painel' }).getAttribute('aria-current')).toBe(null)
    expect(nav.getByRole('link', { name: /Pedidos/ }).textContent).toContain('4')
  })
  it('fecha o menu ao escolher outra área e atualiza o cabeçalho', async () => {
    mount()
    await userEvent.click(screen.getByRole('button', { name: 'Mais' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('link', { name: 'Perfil da loja' }))
    expect(screen.queryByRole('dialog')).toBe(null)
    expect(screen.getByRole('button', { name: 'Mais' }).className).toContain('is-active')
    expect(document.querySelector('.restaurant-mobile-heading strong')?.textContent).toBe('Perfil da loja')
  })
  it('fecha pelo controle acessível e permite sair da conta', async () => {
    const logout = mount()
    await userEvent.click(screen.getByRole('button', { name: 'Mais' }))
    await userEvent.click(screen.getByRole('button', { name: 'Fechar menu' }))
    expect(screen.queryByRole('dialog')).toBe(null)
    await userEvent.click(screen.getByRole('button', { name: 'Mais' }))
    await userEvent.click(screen.getByRole('button', { name: 'Sair da conta' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
