// ============================================================
//  PraiaGo GPS Zones Engine — Praia Grande, SP
//  Coordenadas reais das zonas da cidade e da praia
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

// ── Zonas reais de Praia Grande, SP ──────────────────────────
export const PRAIAGO_ZONES: Zone[] = [

  // ── PRAIA ────────────────────────────────────────────────
  {
    id: 'praia_canto_forte',
    nome: 'Canto do Forte',
    tipo: 'praia',
    cor: '#0ea5e9',
    corMapa: 'rgba(14,165,233,0.25)',
    emoji: '🏖️',
    poligono: [
      [-24.0580, -46.4180],
      [-24.0580, -46.4080],
      [-24.0500, -46.4080],
      [-24.0500, -46.4180],
    ],
  },
  {
    id: 'praia_tupi',
    nome: 'Tupi',
    tipo: 'praia',
    cor: '#06b6d4',
    corMapa: 'rgba(6,182,212,0.25)',
    emoji: '🌊',
    poligono: [
      [-24.0500, -46.4180],
      [-24.0500, -46.4080],
      [-24.0400, -46.4080],
      [-24.0400, -46.4180],
    ],
  },
  {
    id: 'praia_boqueirao',
    nome: 'Boqueirão',
    tipo: 'praia',
    cor: '#22c55e',
    corMapa: 'rgba(34,197,94,0.25)',
    emoji: '🥥',
    poligono: [
      [-24.0200, -46.4180],
      [-24.0200, -46.4060],
      [-24.0080, -46.4060],
      [-24.0080, -46.4180],
    ],
  },
  {
    id: 'praia_ocian',
    nome: 'Ocian',
    tipo: 'praia',
    cor: '#10b981',
    corMapa: 'rgba(16,185,129,0.25)',
    emoji: '🌴',
    poligono: [
      [-24.0080, -46.4180],
      [-24.0080, -46.4060],
      [-23.9960, -46.4060],
      [-23.9960, -46.4180],
    ],
  },

  // ── CIDADE ───────────────────────────────────────────────
  {
    id: 'cidade_centro',
    nome: 'Centro',
    tipo: 'cidade',
    cor: '#f97316',
    corMapa: 'rgba(249,115,22,0.20)',
    emoji: '🏙️',
    poligono: [
      [-24.0280, -46.4550],
      [-24.0280, -46.4380],
      [-24.0160, -46.4380],
      [-24.0160, -46.4550],
    ],
  },
  {
    id: 'cidade_aviacao',
    nome: 'Aviação',
    tipo: 'cidade',
    cor: '#f59e0b',
    corMapa: 'rgba(245,158,11,0.20)',
    emoji: '✈️',
    poligono: [
      [-24.0380, -46.4550],
      [-24.0380, -46.4380],
      [-24.0280, -46.4380],
      [-24.0280, -46.4550],
    ],
  },
  {
    id: 'cidade_guilhermina',
    nome: 'Guilhermina',
    tipo: 'cidade',
    cor: '#fb923c',
    corMapa: 'rgba(251,146,60,0.20)',
    emoji: '🍽️',
    poligono: [
      [-24.0160, -46.4550],
      [-24.0160, -46.4380],
      [-24.0060, -46.4380],
      [-24.0060, -46.4550],
    ],
  },

  // ── ACESSO (corredores) ───────────────────────────────────
  {
    id: 'acesso_sul',
    nome: 'Corredor Sul',
    tipo: 'acesso',
    cor: '#8b5cf6',
    corMapa: 'rgba(139,92,246,0.15)',
    emoji: '🛣️',
    poligono: [
      [-24.0580, -46.4380],
      [-24.0580, -46.4180],
      [-24.0400, -46.4180],
      [-24.0400, -46.4380],
    ],
  },
  {
    id: 'acesso_norte',
    nome: 'Corredor Norte',
    tipo: 'acesso',
    cor: '#a78bfa',
    corMapa: 'rgba(167,139,250,0.15)',
    emoji: '🛣️',
    poligono: [
      [-24.0200, -46.4380],
      [-24.0200, -46.4180],
      [-23.9960, -46.4180],
      [-23.9960, -46.4380],
    ],
  },
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

/** Retorna apenas zonas de praia */
export const BEACH_ZONES = PRAIAGO_ZONES.filter(z => z.tipo === 'praia')

/** Retorna apenas zonas de cidade */
export const CITY_ZONES = PRAIAGO_ZONES.filter(z => z.tipo === 'cidade')

/** Centro geográfico de Praia Grande (para centralizar o mapa) */
export const PRAIA_GRANDE_CENTER: [number, number] = [-24.0200, -46.4200]

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

/** Mock de dados de calor — remover quando Supabase estiver integrado */
export function getMockHeatData(): ZoneHeat[] {
  return [
    { zoneId: 'praia_boqueirao',   nivel: 'explosivo', pedidosHora: 47, ambulantesAtivos: 3, score: 0.92 },
    { zoneId: 'praia_canto_forte', nivel: 'quente',    pedidosHora: 31, ambulantesAtivos: 2, score: 0.67 },
    { zoneId: 'praia_ocian',       nivel: 'morno',     pedidosHora: 14, ambulantesAtivos: 1, score: 0.38 },
    { zoneId: 'praia_tupi',        nivel: 'frio',      pedidosHora: 3,  ambulantesAtivos: 0, score: 0.10 },
    { zoneId: 'cidade_centro',     nivel: 'quente',    pedidosHora: 22, ambulantesAtivos: 0, score: 0.60 },
    { zoneId: 'cidade_aviacao',    nivel: 'morno',     pedidosHora: 11, ambulantesAtivos: 0, score: 0.30 },
    { zoneId: 'cidade_guilhermina',nivel: 'frio',      pedidosHora: 5,  ambulantesAtivos: 0, score: 0.12 },
  ]
}
