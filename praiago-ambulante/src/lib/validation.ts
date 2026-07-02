// Validação/sanitização de dados que CHEGAM DE FORA (realtime).
// Nunca confiar no payload bruto: tipos, faixas e tamanho são checados aqui.

const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g')

export function sanitizeText(v: unknown, max = 120): string {
  if (typeof v !== 'string') return ''
  return v.replace(CONTROL_CHARS, ' ').replace(/[<>]/g, '').trim().slice(0, max)
}

export function clampNumber(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export type CleanIncomingOrder = {
  id: string
  clienteNome: string
  clienteTel: string
  itens: string[]
  total: number
  clienteLat: number
  clienteLng: number
  zona: string
  reta: string
  barraca: string
  ts: number
  pagamento: string
}

// Centro de Praia Grande como fallback caso as coordenadas venham inválidas
const FALLBACK: [number, number] = [-24.0, -46.41]

export function parseIncomingOrder(raw: unknown): CleanIncomingOrder | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = sanitizeText(o.id, 16)
  if (!id) return null
  const lat = clampNumber(o.clienteLat, -90, 90, FALLBACK[0])
  const lng = clampNumber(o.clienteLng, -180, 180, FALLBACK[1])
  return {
    id,
    clienteNome: sanitizeText(o.clienteNome, 60) || 'Cliente',
    clienteTel: sanitizeText(o.clienteTel, 24),
    itens: Array.isArray(o.itens) ? o.itens.slice(0, 30).map(i => sanitizeText(i, 80)).filter(Boolean) : [],
    total: clampNumber(o.total, 0, 100_000, 0),
    clienteLat: lat,
    clienteLng: lng,
    zona: sanitizeText(o.zona, 40),
    reta: sanitizeText(o.reta, 24),
    barraca: sanitizeText(o.barraca, 24),
    ts: clampNumber(o.ts, 0, Number.MAX_SAFE_INTEGER, Date.now()),
    pagamento: sanitizeText(o.pagamento, 20) || 'pix',
  }
}
