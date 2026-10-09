import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AtualizacoesPage from '../../praiago-admin/src/pages/AtualizacoesPage'
const state = vi.hoisted(() => ({ rows: [] as unknown[], rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('../../praiago-admin/src/lib/supabase', () => ({ supabase: {
  rpc: state.rpc, functions: { invoke: state.invoke },
  from: (name: string) => ({ select: () => ({ order: () => ({ limit: async () => ({ data: name === 'app_update_notices' ? state.rows : [], error: null }) }) }) }),
} }))
const base = { id: '11111111-1111-1111-1111-111111111111', app: 'cliente', platform: 'android', version: '1.1', message: 'Nova versão', verified_at: null, verification_method: null, created_at: '2026-09-28' }
beforeEach(() => { state.rows = []; state.rpc.mockReset().mockResolvedValue({ error: null }); state.invoke.mockReset().mockResolvedValue({ data: { ok: true }, error: null }) })
it('cadastra pendente sem invocar envio/verificação', async () => {
  render(<AtualizacoesPage />)
  fireEvent.change(screen.getByLabelText('Versão publicada'), { target: { value: '1.1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar aviso pendente' }))
  await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('admin_app_update_action', expect.objectContaining({ p_action: 'create', p_app: 'cliente', p_platform: 'android', p_version: '1.1' })))
  expect(state.invoke).not.toHaveBeenCalled()
})
it('não deixa aprovar um aviso pendente', async () => {
  state.rows = [{ ...base, status: 'pending' }]; render(<AtualizacoesPage />)
  await screen.findByText('Aguardando conferência')
  expect(screen.queryByRole('button', { name: 'Aprovar aviso' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Negar' })).toBeDefined()
})
it('exige referência e confirmação explícita na Play Store', async () => {
  state.rows = [{ ...base, status: 'pending' }]; render(<AtualizacoesPage />)
  fireEvent.click(await screen.findByRole('button', { name: 'Conferir loja' }))
  const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Referência da release no Play Console'), { target: { value: 'Produção versão 1.1 código 20 publicada hoje' } })
  fireEvent.click(screen.getByRole('checkbox'))
  expect(confirm.disabled).toBe(false); fireEvent.click(confirm)
  await waitFor(() => expect(state.invoke).toHaveBeenCalledWith('admin-app-updates', expect.objectContaining({ body: expect.objectContaining({ id: base.id, confirmed: true }) })))
  expect(state.rpc).not.toHaveBeenCalled()
})
it('pausa aviso apenas após motivo e preserva mensagem de erro da RPC', async () => {
  state.rows = [{ ...base, status: 'approved' }]; state.rpc.mockResolvedValue({ error: { message: 'Sem permissão' } })
  render(<AtualizacoesPage />); fireEvent.click(await screen.findByRole('button', { name: 'Pausar aviso' }))
  const confirm = screen.getByRole('button', { name: 'Confirmar' }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Versão retirada da loja' } }); fireEvent.click(confirm)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent','Sem permissão')
})
