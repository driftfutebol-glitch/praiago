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

// Faixa da orla: lng -46.4060 (mar) → -46.4180 (interior).
// Cada bairro é uma banda de latitude ao longo da praia.
function faixaPraia(latN: number, latS: number): [number, number][] {
  return [
    [latN, -46.4180],
    [latN, -46.4060],
    [latS, -46.4060],
    [latS, -46.4180],
  ]
}

// ── Zonas de Praia Grande, SP (orla na ordem norte → sul) ────
export const PRAIAGO_ZONES: Zone[] = [
  { id: 'praia_canto_forte', nome: 'Canto do Forte', tipo: 'praia', cor: '#0ea5e9', corMapa: 'rgba(14,165,233,0.25)',  emoji: '🏖️', poligono: faixaPraia(-23.9960, -24.0040) },
  { id: 'praia_boqueirao',   nome: 'Boqueirão',      tipo: 'praia', cor: '#22c55e', corMapa: 'rgba(34,197,94,0.25)',   emoji: '🥥', poligono: faixaPraia(-24.0040, -24.0120) },
  { id: 'praia_guilhermina', nome: 'Guilhermina',    tipo: 'praia', cor: '#14b8a6', corMapa: 'rgba(20,184,166,0.25)',  emoji: '🌊', poligono: faixaPraia(-24.0120, -24.0200) },
  { id: 'praia_aviacao',     nome: 'Aviação',        tipo: 'praia', cor: '#06b6d4', corMapa: 'rgba(6,182,212,0.25)',   emoji: '✈️', poligono: faixaPraia(-24.0200, -24.0280) },
  { id: 'praia_tupi',        nome: 'Tupi',           tipo: 'praia', cor: '#0ea5e9', corMapa: 'rgba(14,165,233,0.25)',  emoji: '🐚', poligono: faixaPraia(-24.0280, -24.0360) },
  { id: 'praia_ocian',       nome: 'Ocian',          tipo: 'praia', cor: '#10b981', corMapa: 'rgba(16,185,129,0.25)',  emoji: '🌴', poligono: faixaPraia(-24.0360, -24.0440) },
  { id: 'praia_mirim',       nome: 'Vila Mirim',     tipo: 'praia', cor: '#34d399', corMapa: 'rgba(52,211,153,0.25)',  emoji: '⛱️', poligono: faixaPraia(-24.0440, -24.0520) },
  { id: 'praia_caicara',     nome: 'Caiçara',        tipo: 'praia', cor: '#2dd4bf', corMapa: 'rgba(45,212,191,0.25)',  emoji: '🏐', poligono: faixaPraia(-24.0520, -24.0600) },

  // ── CIDADE (interior) ────────────────────────────────────
  { id: 'cidade_centro',   nome: 'Centro',     tipo: 'cidade', cor: '#f97316', corMapa: 'rgba(249,115,22,0.18)', emoji: '🏙️', poligono: [[-24.0120,-46.4380],[-24.0120,-46.4250],[-24.0020,-46.4250],[-24.0020,-46.4380]] },
  { id: 'cidade_quietude', nome: 'Quietude',   tipo: 'cidade', cor: '#fb923c', corMapa: 'rgba(251,146,60,0.18)', emoji: '🏘️', poligono: [[-24.0320,-46.4420],[-24.0320,-46.4290],[-24.0220,-46.4290],[-24.0220,-46.4420]] },

  // ── ACESSO (corredores entre cidade e praia) ─────────────
  { id: 'acesso_norte', nome: 'Corredor Norte', tipo: 'acesso', cor: '#a78bfa', corMapa: 'rgba(167,139,250,0.15)', emoji: '🛣️', poligono: [[-24.0120,-46.4250],[-24.0120,-46.4180],[-23.9960,-46.4180],[-23.9960,-46.4250]] },
  { id: 'acesso_sul',   nome: 'Corredor Sul',   tipo: 'acesso', cor: '#8b5cf6', corMapa: 'rgba(139,92,246,0.15)',  emoji: '🛣️', poligono: [[-24.0440,-46.4290],[-24.0440,-46.4180],[-24.0280,-46.4180],[-24.0280,-46.4290]] },
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
export const PRAIA_GRANDE_CENTER: [number, number] = [-24.0280, -46.4120]

// ── Heatmap (mock — substitui com Supabase depois) ──────────
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
