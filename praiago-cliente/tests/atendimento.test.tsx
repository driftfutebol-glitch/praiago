import { expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
vi.mock('../src/lib/supabase', () => import('./supabaseDouble'))
import AiChatbot from '../src/components/AiChatbot'

it('preserva conversa e rascunho ao fechar e reabrir sem balão flutuante', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const onClose = vi.fn()
  const { rerender } = render(<AiChatbot open onClose={onClose}/>)
  await userEvent.type(screen.getByRole('textbox', { name: 'Mensagem para o atendimento' }), 'Como funciona o aplicativo?')
  await userEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }))
  await screen.findByText('Como funciona o aplicativo?')
  await waitFor(() => expect((screen.getByRole('textbox', { name: 'Mensagem para o atendimento' }) as HTMLInputElement).disabled).toBe(false))
  await userEvent.type(screen.getByRole('textbox', { name: 'Mensagem para o atendimento' }), 'Minha próxima dúvida')
  rerender(<AiChatbot open={false} onClose={onClose}/>)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(screen.queryByRole('button', { name: 'Abrir atendimento PraiaGo' })).toBeNull()
  rerender(<AiChatbot open onClose={onClose}/>)
  expect(screen.getByText('Como funciona o aplicativo?')).toBeTruthy()
  expect((screen.getByRole('textbox', { name: 'Mensagem para o atendimento' }) as HTMLInputElement).value).toBe('Minha próxima dúvida')
  await userEvent.keyboard('{Escape}')
  expect(onClose).toHaveBeenCalledTimes(1)
})
