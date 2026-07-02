// ============================================================
//  PraiaGo GPS Zones Engine — Praia Grande, SP
//  Zonas da orla (bairros de praia) na ordem real da costa,
//  de Canto do Forte (norte) a Caiçara (sul), + cidade e acessos.
// ============================================================

export type ZoneTipo = 'praia' | 'cidade' | 'acesso'
export type ZoneNivel = 'frio' | 'morno' | 'quente' | 'explosivo'

export type Zone = {
  id: string
  nome: string
  tipo: ZoneTipo
  cor: string
  corMapa: string
  emoji: string
  poligono: [number, number][]  // [lat, lng][]
}

// Linha d'água REAL da praia (OSM coastline encadeada, Canto do Forte → Solemar)
// dividida nas fronteiras dos bairros reais (Nominatim). A praia é um ARCO, então
// cada faixa calcula a própria perpendicular (mar = lado esquerdo indo p/ sudoeste).
const ORLA: [number, number][] = [
  [-24.0176, -46.4011], // Canto do Forte (junto ao Forte)
  [-24.0153, -46.40976], // CF/Boqueirão
  [-24.0155, -46.42056], // Boqueirão/Guilhermina
  [-24.0181, -46.43488], // Guilhermina/Aviação
  [-24.02245, -46.45034], // Aviação/Tupi
  [-24.02771, -46.46593], // Tupi/Ocian
  [-24.03321, -46.48134], // Ocian/Mirim
  [-24.04379, -46.50667], // Mirim/Caiçara
  [-24.0604, -46.54381], // Caiçara (sul)
]
const M_LAT = 110900, M_LNG = 111320 * Math.cos(24.03 * Math.PI / 180)
function faixaPraia(i: number): [number, number][] {
  const n = ORLA[i], s = ORLA[i + 1]
  const dx = (s[1] - n[1]) * M_LNG, dy = (s[0] - n[0]) * M_LAT
  const len = Math.hypot(dx, dy) || 1
  const px = -dy / len, py = dx / len // perpendicular apontando pro mar
  const off = (metros: number): [number, number] => [metros * py / M_LAT, metros * px / M_LNG]
  const mar = off(60), terra = off(-430)
  return [
    [n[0] + terra[0], n[1] + terra[1]],
    [n[0] + mar[0],   n[1] + mar[1]],
    [s[0] + mar[0],   s[1] + mar[1]],
    [s[0] + terra[0], s[1] + terra[1]],
  ]
}

// ── Zonas de Praia Grande, SP (orla na ordem norte → sul) ────
export const PRAIAGO_ZONES: Zone[] = [
  { id: 'praia_canto_forte', nome: 'Canto do Forte', tipo: 'praia', cor: '#0ea5e9', corMapa: 'rgba(14,165,233,0.25)',  emoji: '🏖️', poligono: faixaPraia(0) },
  { id: 'praia_boqueirao',   nome: 'Boqueirão',      tipo: 'praia', cor: '#22c55e', corMapa: 'rgba(34,197,94,0.25)',   emoji: '🥥', poligono: faixaPraia(1) },
  { id: 'praia_guilhermina', nome: 'Guilhermina',    tipo: 'praia', cor: '#14b8a6', corMapa: 'rgba(20,184,166,0.25)',  emoji: '🌊', poligono: faixaPraia(2) },
  { id: 'praia_aviacao',     nome: 'Aviação',        tipo: 'praia', cor: '#06b6d4', corMapa: 'rgba(6,182,212,0.25)',   emoji: '✈️', poligono: faixaPraia(3) },
  { id: 'praia_tupi',        nome: 'Tupi',           tipo: 'praia', cor: '#0ea5e9', corMapa: 'rgba(14,165,233,0.25)',  emoji: '🐚', poligono: faixaPraia(4) },
  { id: 'praia_ocian',       nome: 'Ocian',          tipo: 'praia', cor: '#10b981', corMapa: 'rgba(16,185,129,0.25)',  emoji: '🌴', poligono: faixaPraia(5) },
  { id: 'praia_mirim',       nome: 'Vila Mirim',     tipo: 'praia', cor: '#34d399', corMapa: 'rgba(52,211,153,0.25)',  emoji: '⛱️', poligono: faixaPraia(6) },
  { id: 'praia_caicara',     nome: 'Caiçara',        tipo: 'praia', cor: '#2dd4bf', corMapa: 'rgba(45,212,191,0.25)',  emoji: '🏐', poligono: faixaPraia(7) },

  // ── CIDADE (interior) ────────────────────────────────────
  { id: 'cidade_centro',   nome: 'Centro',     tipo: 'cidade', cor: '#f97316', corMapa: 'rgba(249,115,22,0.18)', emoji: '🏙️', poligono: [[-24.0105,-46.4209],[-24.0105,-46.4111],[-24.0015,-46.4111],[-24.0015,-46.4209]] },
  { id: 'cidade_quietude', nome: 'Quietude',   tipo: 'cidade', cor: '#fb923c', corMapa: 'rgba(251,146,60,0.18)', emoji: '🏘️', poligono: [[-24.0211,-46.4844],[-24.0211,-46.4736],[-24.0111,-46.4736],[-24.0111,-46.4844]] },

  // ── ACESSO (corredores entre cidade e praia) ─────────────
  { id: 'acesso_norte', nome: 'Corredor Norte', tipo: 'acesso', cor: '#a78bfa', corMapa: 'rgba(167,139,250,0.15)', emoji: '🛣️', poligono: [[-24.0121,-46.4065],[-24.011,-46.4107],[-24.0009,-46.4075],[-24.002,-46.4033]] },
  { id: 'acesso_sul',   nome: 'Corredor Sul',   tipo: 'acesso', cor: '#8b5cf6', corMapa: 'rgba(139,92,246,0.15)',  emoji: '🛣️', poligono: [[-24.0289,-46.4811],[-24.0305,-46.485],[-24.0208,-46.4897],[-24.0192,-46.4858]] },
]

// ── Utilitários ──────────────────────────────────────────────

/** Ray-casting: retorna true se ponto está dentro do polígono */
export function pointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    const intersect =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

/** Retorna qual zona o ponto pertence (ou null) */
export function getZone(lat: number, lng: number): Zone | null {
  return PRAIAGO_ZONES.find(z => pointInPolygon(lat, lng, z.poligono)) ?? null
}

/** Apenas zonas de praia (orla) */
export const BEACH_ZONES = PRAIAGO_ZONES.filter(z => z.tipo === 'praia')

/** Apenas zonas de cidade */
export const CITY_ZONES = PRAIAGO_ZONES.filter(z => z.tipo === 'cidade')

/** Centro geográfico aproximado da orla (para centralizar o mapa) */
export const PRAIA_GRANDE_CENTER: [number, number] = [-24.0226, -46.4628]

// ── Demanda por zona
export type ZoneHeat = {
  zoneId: string
  nivel: ZoneNivel
  pedidosHora: number
  ambulantesAtivos: number
  score: number         // 0.0 – 1.0
}

/** Cor e label por nível de demanda */
export const NIVEL_CONFIG: Record<ZoneNivel, { cor: string; corFill: string; label: string; emoji: string }> = {
  frio:      { cor: '#475569', corFill: 'rgba(71,85,105,0.15)',    label: 'Sem movimento',  emoji: '🧊' },
  morno:     { cor: '#f59e0b', corFill: 'rgba(245,158,11,0.30)',   label: 'Moderado',       emoji: '🌤️' },
  quente:    { cor: '#ef4444', corFill: 'rgba(239,68,68,0.40)',    label: 'Agitado',        emoji: '🔥' },
  explosivo: { cor: '#a855f7', corFill: 'rgba(168,85,247,0.50)',   label: 'Explosivo!',     emoji: '⚡' },
}

export function scoreToNivel(score: number): ZoneNivel {
  if (score >= 0.85) return 'explosivo'
  if (score >= 0.55) return 'quente'
  if (score >= 0.25) return 'morno'
  return 'frio'
}

// Sem movimento real ainda — não geramos NENHUM dado térmico fictício.
// Quando houver pedidos de verdade, a demanda por zona virá do Supabase.
export function getMockHeatData(): ZoneHeat[] {
  return []
}

