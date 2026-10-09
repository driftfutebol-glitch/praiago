import { Blob as NodeBlob } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { canPresentTicket, parseOwnedTickets, ticketCpf, ticketDate, ticketQrPayload, ticketStatus, type OwnedTicket } from '../src/lib/ownedTickets'
import { createTicketPdf, exportTicketPdf } from '../src/lib/ticketPdf'

// Isolated test fixture. Never imported by the app or sent to production.
export function fixtureTicket(overrides: Partial<OwnedTicket> = {}): OwnedTicket {
  return {
    id: '11111111-1111-4111-8111-111111111111', code: '22222222-2222-4222-8222-222222222222', order_id: '33333333-3333-4333-8333-333333333333', ordinal: 1,
    status: 'valido', used_at: null, created_at: '2026-10-06T12:00:00Z',
    event: { id: '44444444-4444-4444-8444-444444444444', titulo: 'Evento isolado de QA', data: '2026-10-20', hora: '20:00:00', local_nome: 'Local QA', endereco: 'Praia Grande', imagem_url: null },
    lot: { nome: 'Primeiro lote', grupo: 'Pista' }, order: { status: 'pago', payment_status: 'aprovado', quantidade: 2, total: 240, cliente_nome: 'Cliente QA', paid_at: '2026-10-06T12:00:00Z' }, ...overrides,
  }
}

describe('carteira de ingressos próprios', () => {
  it('aceita somente o contrato autenticado, sem duplicar entradas', () => {
    const fixture = fixtureTicket()
    const result = parseOwnedTickets({ tickets: [fixture, fixture, { ...fixture, id: 'invalid' }] })
    expect(result).toHaveLength(1)
    expect(result[0].lot.nome).toBe('Primeiro lote')
    expect(ticketQrPayload(result[0])).toBe(`praiago:ticket:${fixture.code}`)
    expect(ticketDate(result[0])).toContain('20 de outubro de 2026 às 20:00')
  })
  it.each(['utilizado', 'revogado'] as const)('remove código de ingresso %s mesmo se a resposta estiver desatualizada', status => {
    const result = parseOwnedTickets({ tickets: [fixtureTicket({ status })] })
    expect(result[0].code).toBeNull()
    expect(canPresentTicket(result[0])).toBe(false)
    expect(() => ticketQrPayload(result[0])).toThrow()
    expect(ticketStatus(result[0]).active).toBe(false)
    expect(() => createTicketPdf(result[0])).toThrow()
  })
  it('preserva lote e CPF do próprio titular, sem incluir dados pessoais no QR', () => {
    const fixture = fixtureTicket()
    fixture.lot.ordem = 3
    fixture.order.cliente_cpf = '12345678909' // Synthetic, isolated QA only.
    const [ticket] = parseOwnedTickets({ tickets: [fixture] })
    expect(ticket.lot.ordem).toBe(3)
    expect(ticket.order.cliente_cpf).toBe('123.456.789-09')
    expect(ticketQrPayload(ticket)).not.toContain('12345678909')
    expect(ticketQrPayload(ticket)).not.toContain('Cliente QA')
    expect(ticketCpf('invalid')).toBeNull()
    fixture.lot.ordem = 100
    fixture.order.cliente_cpf = null
    const [invalid] = parseOwnedTickets({ tickets: [fixture] })
    expect(invalid.lot.ordem).toBeNull()
    expect(invalid.order.cliente_cpf).toBeNull()
  })
  it.each([
    { status: 'pendente', payment_status: 'aprovado', paid_at: '2026-10-06' },
    { status: 'pago', payment_status: 'pendente', paid_at: '2026-10-06' },
    { status: 'pago', payment_status: 'aprovado', paid_at: null },
  ])('não monta QR antes da confirmação completa do pagamento', partial => {
    const fixture = fixtureTicket(), ticket = { ...fixture, order: { ...fixture.order, ...partial } }
    expect(parseOwnedTickets({ tickets: [ticket] })[0].code).toBeNull()
    expect(ticketStatus(ticket).label).toBe('Em confirmação')
  })
  it('não usa URL arbitrária como conteúdo do QR nem gera código fictício', () => {
    const ticket = parseOwnedTickets({ tickets: [fixtureTicket({ code: 'https://example.test/malicious' })] })[0]
    expect(ticket.code).toBeNull()
    expect(() => ticketQrPayload(ticket)).toThrow()
    expect(() => parseOwnedTickets({})).toThrow(/carteira/)
  })
  it('gera PDF vetorial válido com xref correto e caracteres portugueses', async () => {
    vi.stubGlobal('Blob', NodeBlob)
    const fixture = fixtureTicket()
    fixture.event.titulo = 'São João - edição (QA)'
    const blob = createTicketPdf(fixture)
    const text = await blob.text()
    expect(blob.type).toBe('application/pdf')
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Count 1')
    expect(text).toContain('/WinAnsiEncoding')
    expect(text).toContain('S\\343o Jo\\343o')
    expect(text).toContain(fixture.code)
    const offset = Number(/startxref\n(\d+)/.exec(text)?.[1])
    expect(text.slice(offset, offset + 4)).toBe('xref')
    const offsets = [...text.matchAll(/(\d{10}) 00000 n/g)].map(match => Number(match[1]))
    offsets.forEach((index, position) => expect(text.slice(index).startsWith(`${position + 1} 0 obj`)).toBe(true))
    expect(text).toContain('Entrada \\372nica')
  })
  it('não finge exportação PDF no WebView sem compartilhamento de arquivos', async () => {
    vi.stubGlobal('Blob', NodeBlob)
    Object.defineProperty(window, 'Capacitor', { configurable: true, value: { isNativePlatform: () => true } })
    try { await expect(exportTicketPdf(fixtureTicket())).rejects.toThrow(/navegador/) }
    finally { delete (window as unknown as { Capacitor?: unknown }).Capacitor }
  })
})
