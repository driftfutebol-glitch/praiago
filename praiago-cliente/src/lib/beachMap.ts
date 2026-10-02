import { BEACH_ZONES, getZone, type Zone } from './praiagoZones'

type Point = [number, number]
export const BEACH_MAP_BOUNDS: [Point, Point] = [[-24.069, -46.553], [-24.007, -46.395]]

export function between(a: Point, b: Point, fraction: number): Point {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]
}

/** Geometria ilustrativa da orla cadastrada; não altera zonas/regras de pedidos. */
export function beachGeometry(zone: Zone) {
  const [landN, seaN, seaS, landS] = zone.poligono
  const coastN = between(seaN, landN, 60 / 490)
  const coastS = between(seaS, landS, 60 / 490)
  const edgeN = between(seaN, landN, 205 / 490)
  const edgeS = between(seaS, landS, 205 / 490)
  return {
    sand: [edgeN, coastN, coastS, edgeS],
    coast: [coastN, coastS],
    promenade: [edgeN, edgeS],
    center: between(between(coastN, edgeN, .5), between(coastS, edgeS, .5), .5),
    label: between(between(seaN, landN, -.13), between(seaS, landS, -.13), .5),
  }
}

export const BEACH_SHAPES = BEACH_ZONES.map(zone => ({ zone, ...beachGeometry(zone) }))
const coast = [...BEACH_SHAPES.map(shape => shape.coast[0]), BEACH_SHAPES.at(-1)!.coast[1]]
// Só usado dentro do enquadramento regional acima: cidade esquemática ao norte.
export const BEACH_LAND: Point[] = [...coast, [-23.8, coast.at(-1)![1] - .2], [-23.8, coast[0][1] + .2]]

/** Posição dentro de uma zona, nunca "praia mais próxima = você está aqui". */
export function beachAtPoint(point: Point): Zone | null {
  const zone = getZone(point[0], point[1])
  return zone?.tipo === 'praia' ? zone : null
}

export function initialBeach(point: Point): Zone {
  return beachAtPoint(point) ?? BEACH_ZONES.find(zone => zone.id === 'praia_boqueirao')!
}

/** Usado somente no rótulo "Explorando", após mover a câmera do guia. */
export function beachNearCamera(point: Point): Zone {
  const latScale = Math.cos(point[0] * Math.PI / 180)
  let best = BEACH_ZONES[0], bestDistance = Infinity
  for (const shape of BEACH_SHAPES) {
    const a = shape.coast[0], b = shape.coast[1]
    const dx = (b[1] - a[1]) * latScale, dy = b[0] - a[0]
    const px = (point[1] - a[1]) * latScale, py = point[0] - a[0]
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)))
    const distance = Math.hypot(px - t * dx, py - t * dy)
    if (distance < bestDistance) { best = shape.zone; bestDistance = distance }
  }
  return best
}
