import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import EventTicketCheckout from '../src/components/EventTicketCheckout'
import { cardValid, installmentSummary } from '../src/lib/eventTicketUi'

const mocks = vi.hoisted(() => ({ options: vi.fn(), quote: vi.fn(), pix: vi.fn(), card: vi.fn(), tokenize: vi.fn(), status: vi.fn() }))
vi.mock('../src/lib/eventTickets', () => ({ parcelasIngresso: mocks.options, cotarIngresso: mocks.quote, comprarIngressoPix: mocks.pix, comprarIngressoCartao: mocks.card }))
vi.mock('../src/lib/pagamentosdk', () => ({ tokenizarCartao: mocks.tokenize }))
vi.mock('../src/lib/eventPaymentStatus', () => ({ consultarPagamentoIngresso: mocks.status }))
vi.mock('../src/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { cpf: '52998224725', telefone: '13999990000' } }) }) }) }) } }))
const evento = { id: 'fixture-event', titulo: 'Evento QA', local_nome: 'Local QA', event_ticket_lots: [{ id: 'fixture-lot', nome: 'Primeiro lote', status: 'disponivel', preco_venda: 120, estoque_disponivel: 3 }] }
const sessao = { id: 'fixture-buyer', nome: 'Cliente QA', email: 'qa@example.test', telefone: '13999990000', contaDemo: false }
const quote = { quote_id: '11111111-1111-4111-8111-111111111111', installments: 2, total: 132, base: 100, platform: 20, interest: 12, expires_at: '2099-01-01T00:00:00Z', installment_floor: 66, remainder_cents: 0 }
beforeEach(() => {
  mocks.options.mockResolvedValue([{ installments: 1, total: 120, interest: 0 }, { installments: 2, total: 132, interest: 12 }])
  mocks.quote.mockResolvedValue(quote)
  mocks.pix.mockResolvedValue({ total: 120, qr_code: 'QA-not-a-real-payment', expires_at: '2099-01-01T00:00:00Z', qr_code_url: null })
  mocks.card.mockResolvedValue({ status: 'pending' })
  mocks.tokenize.mockResolvedValue({ token: 'token_fixture_qa' })
  mocks.status.mockResolvedValue('pending')
})
function ui(account: typeof sessao | null = sessao) { return <MemoryRouter><EventTicketCheckout evento={evento} sessao={account} onClose={vi.fn()} onWallet={vi.fn()} /></MemoryRouter> }
function renderReady() {
  render(ui())
  for (const [label, value] of Object.entries({ CEP: '11700-000', UF: 'SP', 'Rua ou avenida': 'Rua QA', Número: '10', Bairro: 'Centro', Cidade: 'Praia Grande' })) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
}
async function fillCard() {
  fireEvent.click(screen.getByRole('button', { name: 'Crédito' }))
  fireEvent.change(screen.getByLabelText('Nome no cartão'), { target: { value: 'Cliente QA' } })
  fireEvent.change(screen.getByLabelText('Número do cartão'), { target: { value: '4111111111111111' } })
  fireEvent.change(screen.getByLabelText('Validade (MM/AA)'), { target: { value: '1239' } })
  fireEvent.change(screen.getByLabelText('CVV'), { target: { value: '123' } })
  await screen.findByRole('button', { name: /Pagar R\$\s*120/ })
}
it('sem sessão não consulta preços, documentos nem pagamento', () => {
  render(ui(null))
  expect(screen.getByRole('link', { name: 'Acessar minha conta' })).toBeTruthy()
  expect(mocks.options).not.toHaveBeenCalled()
  expect(mocks.pix).not.toHaveBeenCalled()
})
it('bloqueia cobrança sem endereço PSP completo', async () => {
  render(ui())
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*120/ }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Preencha CEP, rua, número, bairro, cidade e UF do endereço de cobrança.')
  expect(mocks.pix).not.toHaveBeenCalled()
})
it('gera PIX sem criar cotação persistida ou prometer ingresso antes do pagamento', async () => {
  renderReady()
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*120/ }))
  await screen.findByText(/PIX gerado/)
  expect(mocks.quote).not.toHaveBeenCalled()
  expect(mocks.pix).toHaveBeenCalledWith(expect.objectContaining({ cpf: '52998224725', cliente_telefone: '13999990000' }))
  expect(mocks.pix.mock.calls[0][0].billing_address).toEqual(expect.objectContaining({ zip_code: '11700000', state: 'SP' }))
  expect(mocks.pix.mock.calls[0][0].quote_id).toBeUndefined()
  expect(screen.getByText(/QR de entrada é diferente/)).toBeTruthy()
})
it('cartão é tokenizado diretamente e somente token segue para cobrança', async () => {
  renderReady()
  await screen.findByRole('button', { name: /Pagar R\$\s*120/ })
  await fillCard()
  fireEvent.click(screen.getByRole('button', { name: /Pagar R\$\s*120/ }))
  await screen.findByText('Pagamento em análise')
  expect(mocks.card).toHaveBeenCalledWith(expect.objectContaining({ token: 'token_fixture_qa', metodo: 'credito', installments: 1 }))
  const payload = JSON.stringify(mocks.card.mock.calls[0][0])
  expect(payload).not.toContain('4111111111111111')
  expect(mocks.card.mock.calls[0][0].cvv).toBeUndefined()
  expect(mocks.quote).not.toHaveBeenCalled()
})
it('mostra juros e total exatos de parcela configurada e envia seu quote_id', async () => {
  renderReady()
  await screen.findByRole('button', { name: /Pagar R\$\s*120/ })
  await fillCard()
  fireEvent.change(screen.getByLabelText('Parcelas'), { target: { value: '2' } })
  expect(await screen.findByText(/2 parcelas de R\$\s*66,00/)).toBeTruthy()
  expect(mocks.quote).toHaveBeenCalledWith('fixture-lot', 1, 2)
  fireEvent.click(screen.getByRole('button', { name: /Pagar R\$\s*132/ }))
  await screen.findByText('Pagamento em análise')
  expect(mocks.card).toHaveBeenCalledWith(expect.objectContaining({ installments: 2, quote_id: quote.quote_id }))
})
it('não cobra se cotação parcelada expirou', async () => {
  mocks.quote.mockResolvedValue({ ...quote, expires_at: '2020-01-01T00:00:00Z' })
  renderReady()
  await screen.findByRole('button', { name: /Pagar R\$\s*120/ }); await fillCard()
  fireEvent.change(screen.getByLabelText('Parcelas'), { target: { value: '2' } })
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*132/ }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'A cotação expirou. Confira o preço novamente antes de pagar.')
  expect(mocks.card).not.toHaveBeenCalled()
  expect(mocks.tokenize).not.toHaveBeenCalled()
})
it('valida CPF e bloqueia clique duplicado durante tokenização', async () => {
  renderReady()
  await screen.findByRole('button', { name: /Pagar R\$\s*120/ }); await fillCard()
  fireEvent.change(screen.getByLabelText('CPF do comprador'), { target: { value: '11111111111' } })
  fireEvent.click(screen.getByRole('button', { name: /Pagar R\$\s*120/ }))
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Confira seu CPF para continuar com segurança.')
  expect(mocks.tokenize).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('CPF do comprador'), { target: { value: '52998224725' } })
  mocks.tokenize.mockImplementation(() => new Promise(() => {}))
  const pay = screen.getByRole('button', { name: /Pagar R\$\s*120/ })
  fireEvent.click(pay); fireEvent.click(pay)
  await waitFor(() => expect(mocks.tokenize).toHaveBeenCalledOnce())
  expect((screen.getByRole('button', { name: 'Processando com segurança…' }) as HTMLButtonElement).disabled).toBe(true)
})
it('débitos e parcelas não configuradas não são apresentados como disponíveis', async () => {
  mocks.options.mockResolvedValue([{ installments: 1, total: 120, interest: 0 }])
  renderReady(); await screen.findByRole('button', { name: /Pagar R\$\s*120/ }); await fillCard()
  expect((screen.getByRole('button', { name: 'Débito' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.queryByRole('option', { name: /2 parcelas/ })).toBeNull()
})
it('rejeita cartão vencido e calcula ajuste de centavos sem esconder juros', () => {
  expect(cardValid('4111111111111111', '01/20', '123', 'Cliente QA')).toMatch(/vencido/)
  expect(cardValid('4111111111111112', '12/39', '123', 'Cliente QA')).toMatch(/número/)
  expect(installmentSummary({ ...quote, installments: 3, total: 100, installment_floor: 33.33, remainder_cents: 1 }).replace(/\u00a0/g, ' ')).toContain('1 parcela(s) de R$ 33,34 e 2 de R$ 33,33')
})
it('resultado PIX incerto não libera nova cobrança nem monta QR de entrada falso', async () => {
  mocks.pix.mockResolvedValue({ status: 'pending', order_id: 'fixture-order', total: 120, qr_code: null })
  renderReady()
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*120/ }))
  expect(await screen.findByText('Pagamento em análise')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Pagar/ })).toBeNull()
  expect(screen.queryByRole('img')).toBeNull()
  expect(mocks.pix.mock.calls[0][0].client_request_id).toMatch(/^[0-9a-f-]{36}$/)
})
it('erro de rede e tentativa novamente preservam o identificador contra duplicidade', async () => {
  mocks.pix.mockRejectedValueOnce(new Error('Rede indisponível')).mockResolvedValueOnce({ status: 'pending', order_id: 'fixture-order', total: 120, qr_code: null })
  renderReady()
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*120/ }))
  await screen.findByRole('alert')
  const first = mocks.pix.mock.calls[0][0].client_request_id
  expect((screen.getByLabelText('Tipo de ingresso') as HTMLSelectElement).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Conferir preço novamente' }))
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*120/ }))
  await screen.findByText('Pagamento em análise')
  expect(mocks.pix.mock.calls[1][0].client_request_id).toBe(first)
})
it('acompanha PIX e só indica confirmação após leitura do pedido autenticado', async () => {
  const orderId = '33333333-3333-4333-8333-333333333333'
  mocks.pix.mockResolvedValue({ status: 'pending', order_id: orderId, total: 120, qr_code: 'QA-only-payment-code', expires_at: '2099-01-01T00:00:00Z' })
  mocks.status.mockResolvedValue('approved')
  renderReady()
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*120/ }))
  expect(await screen.findByText('Pagamento aprovado')).toBeTruthy()
  expect(mocks.status).toHaveBeenCalledWith(orderId, sessao.id)
  expect(screen.queryByText('Código PIX copia e cola')).toBeNull()
  expect(screen.getByRole('button', { name: 'Abrir Meus ingressos' })).toBeTruthy()
})
it('409 de outra tentativa pendente não oferece pagamento duplicado e acompanha a mesma reserva', async () => {
  const orderId = '33333333-3333-4333-8333-333333333333'
  mocks.pix.mockRejectedValue(Object.assign(new Error('Compra pendente'), { code: 'existing_pending_purchase', orderId }))
  renderReady()
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*120/ }))
  expect(await screen.findByText('Pagamento em análise')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toContain('Nenhuma nova cobrança foi criada')
  expect(mocks.status).toHaveBeenCalledWith(orderId, sessao.id)
  expect(screen.queryByRole('button', { name: /Pagar/ })).toBeNull()
})
it('retry de PIX já pago sem novo QR é tratado como aprovado', async () => {
  mocks.pix.mockResolvedValue({ status: 'paid', order_id: 'fixture-order', total: 120, qr_code: null, expires_at: null })
  renderReady()
  fireEvent.click(await screen.findByRole('button', { name: /Pagar R\$\s*120/ }))
  expect(await screen.findByText('Pagamento aprovado')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
