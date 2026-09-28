import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const state = vi.hoisted(() => ({ pedidos: [] as any[], markSeen: vi.fn(), avancar: vi.fn(), recusar: vi.fn() }))
vi.mock('../src/store/useOrders', () => ({ useOrders: (selector: (store: typeof state) => unknown) => selector(state) }))
vi.mock('../src/lib/auth', () => ({ getSessao: () => null }))
vi.mock('../src/lib/supabase', () => ({ supabase: {} }))
vi.mock('../src/components/LocalizacaoClienteModal', () => ({ default: () => null }))
vi.mock('../src/components/ChatPedidoModal', () => ({ default: () => null }))
import PedidosPage from '../src/pages/PedidosPage'
import DashboardPage from '../src/pages/DashboardPage'

// Somente memória de testes; nenhuma inserção no banco nem pedido público.
beforeEach(() => {
  state.pedidos = [
    { id: 'TESTE-1', cliente: 'Cliente de teste A', zona: 'Ocian', itens: ['Pizza', 'Talheres: não'], total: 43, status: 'preparando', hora: '12:30', pagamento: 'pix' },
    { id: 'TESTE-2', cliente: 'Cliente de teste B', zona: 'Forte', itens: ['Bebida'], total: 10, status: 'novo', hora: '12:31', pagamento: 'pix' },
  ]
})

describe('Pedidos acessíveis em tela pequena', () => {
  it('renderiza os pedidos e a busca com os contêineres responsivos', () => {
    render(<PedidosPage />)
    expect(screen.getByText('Cliente de teste A')).toBeTruthy()
    expect(screen.getByText('Cliente de teste B')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Buscar pedidos por cliente ou zona' })).toBeTruthy()
    expect(document.querySelector('.restaurant-page .restaurant-orders-grid')).toBeTruthy()
    expect(document.querySelectorAll('.restaurant-order-card').length).toBe(2)
  })
  it('filtra cozinha e novos sem perder os controles do pedido', async () => {
    render(<PedidosPage />)
    await userEvent.click(screen.getByRole('button', { name: /Cozinha/ }))
    await waitFor(() => expect(screen.queryByText('Cliente de teste B')).toBe(null))
    expect(screen.getByRole('button', { name: /Localização/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Conversar/ })).toBeTruthy()
  })
  it('busca por zona e mostra vazio quando não houver resultado', async () => {
    render(<PedidosPage />)
    const search = screen.getByRole('textbox', { name: 'Buscar pedidos por cliente ou zona' })
    await userEvent.type(search, 'Forte')
    await waitFor(() => expect(screen.queryByText('Cliente de teste A')).toBe(null))
    await userEvent.clear(search)
    await userEvent.type(search, 'sem resultado')
    expect(screen.getByText('Nenhum pedido encontrado nesta categoria')).toBeTruthy()
  })
  it('o painel inicial mostra pedidos existentes, sem depender de um broadcast novo', () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>)
    expect(screen.getByText('Cliente de teste A')).toBeTruthy()
    expect(screen.getByText('Cliente de teste B')).toBeTruthy()
    expect(screen.getByText('2 em andamento na sua loja')).toBeTruthy()
  })
})
