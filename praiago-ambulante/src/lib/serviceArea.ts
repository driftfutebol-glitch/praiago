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
