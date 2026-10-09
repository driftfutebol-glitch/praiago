import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import OwnedTicketsWallet from '../src/components/OwnedTicketsWallet'
import type { OwnedTicket } from '../src/lib/ownedTickets'

const rpc = vi.hoisted(() => vi.fn())
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('qrcode', () => ({ toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fixture') }))
const ticket: OwnedTicket = {
  id: '11111111-1111-4111-8111-111111111111', code: '22222222-2222-4222-8222-222222222222', order_id: '33333333-3333-4333-8333-333333333333', ordinal: 1, status: 'valido', used_at: null, created_at: '2026-10-06T12:00:00Z',
  event: { id: '44444444-4444-4444-8444-444444444444', titulo: 'Evento isolado QA', data: '2026-10-20', hora: '20:00:00', local_nome: 'Local QA', endereco: 'Praia Grande', imagem_url: null },
  lot: { nome: 'Primeiro lote', grupo: 'Pista' }, order: { status: 'pago', payment_status: 'aprovado', quantidade: 1, total: 120, cliente_nome: null, paid_at: '2026-10-06T12:00:00Z' },
}
beforeEach(() => { rpc.mockResolvedValue({ data: { tickets: [ticket] }, error: null }) })
const wallet = (id: string | null = 'fixture-buyer', onClose = vi.fn()) => <MemoryRouter><OwnedTicketsWallet userId={id} onClose={onClose} /></MemoryRouter>

it('sem sessão não consulta códigos nem oferece cadastro de organizador', () => {
  render(wallet(null))
  expect(screen.getByRole('link', { name: 'Acessar minha conta' }).getAttribute('href')).toBe('/perfil')
  expect(rpc).not.toHaveBeenCalled()
  expect(screen.queryByRole('img')).toBeNull()
})
it('consulta apenas RPC da própria conta e apresenta ingresso real confirmado', async () => {
  render(wallet())
  fireEvent.click(await screen.findByRole('button', { name: /Evento isolado QA/ }))
  expect(await screen.findByRole('img', { name: /QR de entrada/ })).toBeTruthy()
  expect(rpc).toHaveBeenCalledWith('event_my_tickets')
  expect(screen.getByRole('button', { name: 'Exportar ingresso em PDF' })).toBeTruthy()
  expect(localStorage.length).toBe(0)
})
it('reembolso atualizado elimina QR e exportação e mantém histórico', async () => {
  render(wallet())
  fireEvent.click(await screen.findByRole('button', { name: /Evento isolado QA/ }))
  await screen.findByRole('img', { name: /QR de entrada/ })
  rpc.mockResolvedValue({ data: { tickets: [{ ...ticket, status: 'revogado' }] }, error: null })
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  await screen.findByText('Ingresso indisponível')
  expect(screen.queryByRole('img', { name: /QR de entrada/ })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Exportar ingresso em PDF' })).toBeNull()
})
it('não conserva QR potencialmente revogado quando atualização falha', async () => {
  render(wallet())
  fireEvent.click(await screen.findByRole('button', { name: /Evento isolado QA/ }))
  await screen.findByRole('img', { name: /QR de entrada/ })
  rpc.mockResolvedValue({ data: null, error: { code: 'NETWORK' } })
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
  await screen.findByRole('alert')
  expect(screen.queryByRole('img', { name: /QR de entrada/ })).toBeNull()
  expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy()
})
it('troca de conta nunca exibe ingressos da sessão anterior', async () => {
  const result = render(wallet())
  await screen.findByRole('button', { name: /Evento isolado QA/ })
  rpc.mockImplementation(() => new Promise(() => {}))
  result.rerender(wallet('different-buyer'))
  expect(screen.queryByText('Evento isolado QA')).toBeNull()
  expect(screen.queryByRole('img', { name: /QR de entrada/ })).toBeNull()
})
it('trava rolagem, mantém foco no diálogo e fecha com Escape', async () => {
  const close = vi.fn(), before = document.body.style.overflow
  const result = render(wallet('fixture-buyer', close))
  const dialog = screen.getByRole('dialog')
  expect(document.activeElement).toBe(dialog)
  expect(document.body.style.overflow).toBe('hidden')
  await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
  result.unmount()
  expect(document.body.style.overflow).toBe(before)
})
