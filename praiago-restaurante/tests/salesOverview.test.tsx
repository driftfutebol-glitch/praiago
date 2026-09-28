import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SalesOverview from '../src/components/SalesOverview'
import { buildSales, type Sale } from '../src/lib/salesReport'

const sale = (): Sale[] => buildSales([{ id: 'TEST', total: 107.2, status: 'entregando', payment_status: 'aprovado', created_at: new Date().toISOString(), paid_at: new Date().toISOString() }], [
  { id: 'net', pedido_id: 'TEST', tipo: 'repasse_vendedor', valor: 96.48, status: 'pendente' }, { id: 'fee', pedido_id: 'TEST', tipo: 'taxa_plataforma', valor: 10.72, status: 'pendente' },
])
const data = (report: Sale[] | null = sale()) => ({ report, loading: false, error: null as string | null, updatedAt: new Date(), refresh: vi.fn(async () => {}) })
describe('Cartões móveis de vendas', () => {
  it('exibe as quatro métricas, inclui a venda em entrega e separa líquido de saque', () => {
    render(<MemoryRouter><SalesOverview data={data()} /></MemoryRouter>)
    expect(screen.getByRole('combobox', { name: 'Período das vendas' })).toHaveProperty('value', 'all')
    const cards = screen.getAllByRole('article')
    expect(within(cards[0]).getByText('1')).toBeTruthy()
    expect(within(cards[1]).getByText('R$ 107,20')).toBeTruthy()
    expect(within(cards[2]).getByText('R$ 10,72')).toBeTruthy()
    expect(within(cards[3]).getByText('R$ 96,48')).toBeTruthy()
    expect(screen.getByText('Não é o saldo disponível para saque')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Ver carteira/ }).getAttribute('href')).toBe('/carteira')
  })
  it('troca os períodos e não apaga vendas antigas do histórico', async () => {
    const historic = sale().map(s => ({ ...s, day: '2020-01-01', date: '2020-01-01T12:00:00Z' }))
    render(<MemoryRouter><SalesOverview data={data(historic)} /></MemoryRouter>)
    const select = screen.getByRole('combobox', { name: 'Período das vendas' })
    await userEvent.selectOptions(select, 'today')
    expect(screen.getByText(/Nenhuma venda válida neste período/)).toBeTruthy()
    await userEvent.selectOptions(select, 'all')
    expect(screen.queryByText(/Nenhuma venda válida neste período/)).toBe(null)
    expect(within(screen.getAllByRole('article')[0]).getByText('1')).toBeTruthy()
  })
  it('erro inicial ou carregamento não exibem R$ 0,00 nem inventam vendas', () => {
    const initial = { ...data(null), error: 'Falha na consulta', updatedAt: null }
    render(<MemoryRouter><SalesOverview data={initial} /></MemoryRouter>)
    expect(screen.getAllByText('—')).toHaveLength(4)
    expect(screen.queryByText('R$ 0,00')).toBe(null)
    expect(screen.getByRole('alert').textContent).toBe('Falha na consulta')
    expect(screen.getByText(/isso não significa que suas vendas sejam zero/)).toBeTruthy()
  })
  it('preserva os últimos valores com aviso de desatualização e permite tentar novamente', async () => {
    const stale = { ...data(), error: 'Falha na consulta' }
    render(<MemoryRouter><SalesOverview data={stale} /></MemoryRouter>)
    expect(screen.getByText(/podem estar desatualizados/)).toBeTruthy()
    expect(screen.getByText('R$ 96,48')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar vendas' }))
    expect(stale.refresh).toHaveBeenCalledOnce()
  })
})
