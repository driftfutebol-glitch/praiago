/** Admission codes are personal bearer credentials. Never cache them in the
 * persisted store, put them in URLs, analytics, or notification payloads. */
export type OwnedTicket = {
  id: string
  code: string | null
  ordinal: number
  status: 'valido' | 'utilizado' | 'revogado'
  used_at: string | null
  created_at: string
  order_id: string
  event: { id: string; titulo: string; data: string | null; hora: string | null; local_nome: string | null; endereco: string | null; imagem_url: string | null }
  lot: { nome: string; grupo: string | null; ordem?: number | null }
  order: { status: string; payment_status: string; quantidade: number; total: number; cliente_nome: string | null; cliente_cpf?: string | null; paid_at: string | null }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CONFIRMED = new Set(['pago', 'entrega_pendente', 'entregue'])

function record(value: unknown): Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
function string(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.slice(0, max) : ''
}
function nullable(value: unknown, max = 500): string | null { return string(value, max) || null }
export function ticketCpf(value: string | null | undefined): string | null {
  const digits = (value || '').replace(/[^0-9]/g, '')
  return /^\d{11}$/.test(digits) ? digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : null
}
function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** Restrict the UI to the authenticated RPC contract. A malformed row is
 * discarded, not converted into an admission or a synthetic QR code. */
export function parseOwnedTickets(payload: unknown): OwnedTicket[] {
  const source = record(payload).tickets
  if (!Array.isArray(source)) throw new Error('A carteira não respondeu corretamente. Tente atualizar.')
  const seen = new Set<string>()
  return source.slice(0, 200).flatMap(value => {
    const row = record(value), event = record(row.event), lot = record(row.lot), order = record(row.order)
    const id = string(row.id), eventId = string(event.id), orderId = string(row.order_id)
    if (!UUID.test(id) || !UUID.test(eventId) || !UUID.test(orderId) || seen.has(id)) return []
    if (!['valido', 'utilizado', 'revogado'].includes(string(row.status)) || !string(event.titulo)) return []
    seen.add(id)
    const code = string(row.code)
    const result: OwnedTicket = {
      id, order_id: orderId, status: row.status as OwnedTicket['status'],
      ordinal: Math.max(1, Math.min(20, Math.trunc(number(row.ordinal)) || 1)),
      code: UUID.test(code) ? code.toLowerCase() : null,
      used_at: nullable(row.used_at, 40), created_at: string(row.created_at, 40),
      event: { id: eventId, titulo: string(event.titulo, 140), data: nullable(event.data, 10), hora: nullable(event.hora, 8), local_nome: nullable(event.local_nome, 160), endereco: nullable(event.endereco, 300), imagem_url: nullable(event.imagem_url, 2000) },
      lot: { nome: string(lot.nome, 100) || 'Ingresso', grupo: nullable(lot.grupo, 100), ordem: Number.isInteger(number(lot.ordem)) && number(lot.ordem) >= 1 && number(lot.ordem) <= 99 ? number(lot.ordem) : null },
      order: { status: string(order.status, 40), payment_status: string(order.payment_status, 40), quantidade: number(order.quantidade), total: number(order.total), cliente_nome: nullable(order.cliente_nome, 140), cliente_cpf: ticketCpf(nullable(order.cliente_cpf, 20)), paid_at: nullable(order.paid_at, 40) },
    }
    // Even a stale response must not expose the entry code after revocation.
    if (!canPresentTicket(result)) result.code = null
    return [result]
  })
}

export function canPresentTicket(ticket: OwnedTicket): boolean {
  return ticket.status === 'valido' && UUID.test(ticket.code || '')
    && CONFIRMED.has(ticket.order.status) && ticket.order.payment_status === 'aprovado'
    && Boolean(ticket.order.paid_at)
}

export function ticketQrPayload(ticket: OwnedTicket): string {
  if (!canPresentTicket(ticket)) throw new Error('Este ingresso não está disponível para entrada.')
  return `praiago:ticket:${ticket.code}`
}

export function ticketDate(ticket: OwnedTicket): string {
  const date = ticket.event.data
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Data a confirmar'
  const value = new Date(`${date}T12:00:00`)
  if (!Number.isFinite(value.getTime())) return 'Data a confirmar'
  return `${value.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}${ticket.event.hora ? ` às ${ticket.event.hora.slice(0, 5)}` : ''}`
}

export function ticketStatus(ticket: OwnedTicket): { label: string; detail: string; active: boolean } {
  if (ticket.status === 'utilizado') return { label: 'Entrada realizada', detail: 'Este ingresso já foi utilizado na portaria.', active: false }
  if (ticket.status === 'revogado') return { label: 'Ingresso indisponível', detail: 'Entrada bloqueada por cancelamento, reembolso ou revisão do pagamento.', active: false }
  if (!canPresentTicket(ticket)) return { label: 'Em confirmação', detail: 'Atualize a carteira. O QR será liberado somente com o pagamento confirmado.', active: false }
  return { label: 'Pronto para entrar', detail: 'Apresente o QR na portaria. Ele permite uma única entrada.', active: true }
}
