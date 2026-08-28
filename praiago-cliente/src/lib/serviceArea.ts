export const CIDADES_ATENDIDAS = ['Santos', 'São Vicente', 'Praia Grande'] as const

export type CidadeAtendida = (typeof CIDADES_ATENDIDAS)[number]

type AreaCidade = {
  nome: CidadeAtendida
  centro: [number, number]
  norte: number
  sul: number
  leste: number
  oeste: number
}

// Corredor operacional da fase atual. Os limites têm uma pequena margem para
// não desligar o serviço por oscilação normal do GPS perto das divisas.
const AREAS: AreaCidade[] = [
  { nome: 'Santos', centro: [-23.9608, -46.3336], norte: -23.925, sul: -24.04, leste: -46.295, oeste: -46.44 },
  { nome: 'São Vicente', centro: [-23.9631, -46.3919], norte: -23.925, sul: -24.055, leste: -46.34, oeste: -46.55 },
  { nome: 'Praia Grande', centro: [-24.0226, -46.4628], norte: -23.965, sul: -24.085, leste: -46.35, oeste: -46.62 },
]

// Centro de cada cidade, para o seletor de regiao da Home.
export const CENTROS_CIDADES: Record<CidadeAtendida, [number, number]> = {
  Santos: [-23.9608, -46.3336],
  'São Vicente': [-23.9631, -46.3919],
  'Praia Grande': [-24.0226, -46.4628],
}

export const LOCAL_REVISAO: [number, number] = [-24.0020, -46.4085]

function distanciaQuadrada(lat: number, lng: number, centro: [number, number]) {
  const escalaLongitude = Math.cos(lat * Math.PI / 180)
  return (lat - centro[0]) ** 2 + ((lng - centro[1]) * escalaLongitude) ** 2
}

export function encontrarCidadeAtendida(lat: number, lng: number): CidadeAtendida | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const candidatas = AREAS.filter(area => (
    lat <= area.norte
    && lat >= area.sul
    && lng <= area.leste
    && lng >= area.oeste
  ))

  if (!candidatas.length) return null
  // A entrada leste de Praia Grande se sobrepõe aos retângulos de segurança
  // de São Vicente. Ao sul deste corredor, a operação deve ser classificada
  // como Praia Grande (inclui o ponto de revisão no Boqueirão).
  if (lat <= -23.985 && candidatas.some(area => area.nome === 'Praia Grande')) return 'Praia Grande'
  candidatas.sort((a, b) => distanciaQuadrada(lat, lng, a.centro) - distanciaQuadrada(lat, lng, b.centro))
  return candidatas[0].nome
}

export function estaNaAreaAtendida(lat: number, lng: number) {
  return encontrarCidadeAtendida(lat, lng) !== null
}

export const TEXTO_AREA_ATENDIDA = CIDADES_ATENDIDAS.join(', ').replace(', Praia Grande', ' e Praia Grande')

// ---------------------------------------------------------------------------
// Raio de pedido
//
// Ver o catálogo é livre: qualquer pessoa, em qualquer lugar do mundo, enxerga
// todos os ambulantes e restaurantes. O que exige proximidade é FAZER o pedido.
//
// 15 km cobre a orla inteira de uma cidade — Praia Grande tem 22 km de praia,
// então quem está numa ponta pede de um vendedor na outra. Já Santos–Praia
// Grande passa de 20 km, uma entrega que ninguém faz a pé na areia.
export const RAIO_PEDIDO_KM = 15

export function distanciaKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

export type ChecagemPedido = {
  permitido: boolean
  distanciaKm: number | null
  motivo: 'ok' | 'sem-posicao' | 'vendedor-sem-posicao' | 'longe'
}

// Regra única de "pode pedir". Fica aqui, e não espalhada nas telas, para não
// haver uma tela que esqueça de checar.
export function checarPedido(
  clienteLat: number | null | undefined,
  clienteLng: number | null | undefined,
  vendedorLat: number | null | undefined,
  vendedorLng: number | null | undefined,
): ChecagemPedido {
  if (!Number.isFinite(clienteLat as number) || !Number.isFinite(clienteLng as number)) {
    return { permitido: false, distanciaKm: null, motivo: 'sem-posicao' }
  }
  if (!Number.isFinite(vendedorLat as number) || !Number.isFinite(vendedorLng as number)) {
    return { permitido: false, distanciaKm: null, motivo: 'vendedor-sem-posicao' }
  }
  const d = distanciaKm(clienteLat as number, clienteLng as number, vendedorLat as number, vendedorLng as number)
  return { permitido: d <= RAIO_PEDIDO_KM, distanciaKm: d, motivo: d <= RAIO_PEDIDO_KM ? 'ok' : 'longe' }
}
