// Validação/sanitização de dados que CHEGAM DE FORA (realtime).
// Nunca confiar no payload bruto: tipos, faixas e tamanho são checados aqui.

export function sanitizeText(v: unknown, max = 120): string {
  if (typeof v !== 'string') return ''
  return v.replace(/\p{Cc}/gu, ' ').replace(/[<>]/g, '').trim().slice(0, max)
}

export function clampNumber(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function sanitizePhone(v: unknown): string {
  const digits = String(v ?? '').replace(/\D/g, '').slice(0, 13)
  return digits.length >= 10 ? digits : ''
}

export type CleanIncomingOrder = {
  id: string
  clienteNome: string
  clienteTel: string
  itens: string[]
  total: number
  clienteLat: number | null
  clienteLng: number | null
  zona: string
  reta: string
  barraca: string
  ts: number
  pagamento: string
}

export function parseCoordinate(value: unknown, min: number, max: number): number | null {
  const coordinate = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null
}

export function parseIncomingOrder(raw: unknown): CleanIncomingOrder | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = sanitizeText(o.id, 64)
  if (!id) return null
  const lat = parseCoordinate(o.clienteLat, -90, 90)
  const lng = parseCoordinate(o.clienteLng, -180, 180)
  return {
    id,
    clienteNome: sanitizeText(o.clienteNome, 60) || 'Cliente',
    clienteTel: sanitizePhone(o.clienteTel),
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
