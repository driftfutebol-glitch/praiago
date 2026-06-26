// Validação/sanitização de dados que CHEGAM DE FORA (realtime, formulários).
// Regra de ouro: nunca confiar no cliente. O React já escapa o que renderiza,
// isto é defesa extra (remove controle/<>, limita tamanho, valida faixas).

// Range de caracteres de controle (0x00-0x1F e 0x7F) construído por código
// para não embutir bytes de controle no fonte.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]', 'g')

export function sanitizeText(v: unknown, max = 120): string {
  if (typeof v !== 'string') return ''
  return v
    .replace(CONTROL_CHARS, ' ')  // remove caracteres de controle
    .replace(/[<>]/g, '')         // tira sinais de tag (anti-injeção)
    .trim()
    .slice(0, max)
}

export function clampNumber(v: unknown, min: number, max: number, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

export function isLatLng(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number' &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

export type CleanOrder = { id: string; cliente: string; zona: string; itens: string[]; total: number; ts: number }

// Normaliza um pedido recebido via realtime. Retorna null se for inválido/forjado.
export function parseIncomingOrder(raw: unknown): CleanOrder | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const id = sanitizeText(o.id, 16)
  if (!id) return null
  return {
    id,
    cliente: sanitizeText(o.clienteNome, 60) || 'Cliente',
    zona: sanitizeText(o.zona, 40),
    itens: Array.isArray(o.itens) ? o.itens.slice(0, 30).map(i => sanitizeText(i, 80)).filter(Boolean) : [],
    total: clampNumber(o.total, 0, 100_000, 0),
    ts: clampNumber(o.ts, 0, Number.MAX_SAFE_INTEGER, Date.now()),
  }
}
