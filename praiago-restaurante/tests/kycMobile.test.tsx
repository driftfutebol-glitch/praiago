import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
const state = vi.hoisted(() => ({ recarregar: vi.fn() }))
vi.mock('../src/hooks/useChamadoKyc', () => ({ useChamadoKyc: () => ({ chamado: { id: 'TEST' }, mensagens: [], aberto: true, resolvido: false, linkVerificacao: null, linkVencido: false, restaMs: 0, pedirOutroLink: vi.fn(), recarregar: state.recarregar }) }))
import ChamadoKycPanel from '../src/components/ChamadoKycPanel'
describe('Aviso de verificação sem cobrir métricas', () => {
  it('no celular fica no cabeçalho e conserva o status acessível e o chamado', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() } as any))
    const { container } = render(<><div id="restaurant-mobile-verification" /><ChamadoKycPanel /></>)
    const host = container.querySelector('#restaurant-mobile-verification')!
    const toggle = within(host as HTMLElement).getByRole('button', { name: 'Abrir o chamado de verificação' })
    expect(toggle.style.position).toBe('relative')
    expect(toggle.getAttribute('title')).toBe('Verificação pendente')
    expect(toggle.getAttribute('aria-describedby')).toBe('restaurant-kyc-status')
    await userEvent.click(toggle)
    expect(screen.getByText('Importante · saque bloqueado')).toBeTruthy()
    expect(state.recarregar).toHaveBeenCalledOnce()
    await userEvent.click(screen.getByRole('button', { name: 'Minimizar' }))
    expect(within(host as HTMLElement).getByRole('button', { name: 'Abrir o chamado de verificação' })).toBeTruthy()
  })
  it('desktop conserva o aviso completo e o acesso à verificação', () => {
    render(<ChamadoKycPanel />)
    expect(screen.getByRole('button', { name: 'Abrir o chamado de verificação' }).style.position).toBe('fixed')
    expect(screen.getByText('Verificação pendente')).toBeTruthy()
  })
})
