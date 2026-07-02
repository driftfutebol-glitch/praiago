// ── Verificação de sentido da rota (contramão) ───────────────────────────
// A rota calculada pelo OSRM (perfil `driving`) JÁ respeita a mão das vias —
// ou seja, o trajeto proposto nunca é contramão. Este módulo verifica se o
// MOVIMENTO REAL (GPS) está seguindo a rota no sentido certo:
//  • acha o segmento da rota mais próximo da posição atual;
//  • compara o rumo (bearing) do movimento com o rumo do segmento;
//  • diferença > 120° por 2 leituras seguidas ⇒ CONTRAMÃO.

export type SentidoStatus = 'ok' | 'contramao' | 'fora_da_rota' | 'indefinido'

const M_LAT = 110900
const mLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180)

function distM(a: [number, number], b: [number, number]): number {
  const dx = (b[1] - a[1]) * mLng((a[0] + b[0]) / 2)
  const dy = (b[0] - a[0]) * M_LAT
  return Math.hypot(dx, dy)
}

/** Rumo em graus (0..360, norte = 0) do ponto a → b */
export function bearing(a: [number, number], b: [number, number]): number {
  const dx = (b[1] - a[1]) * mLng((a[0] + b[0]) / 2)
  const dy = (b[0] - a[0]) * M_LAT
  return (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360
}

function distPontoSegM(p: [number, number], a: [number, number], b: [number, number]): number {
  const ml = mLng(p[0])
  const px = p[1] * ml, py = p[0] * M_LAT
  const ax = a[1] * ml, ay = a[0] * M_LAT
  const bx = b[1] * ml, by = b[0] * M_LAT
  const dx = bx - ax, dy = by - ay
  const L2 = dx * dx + dy * dy
  if (L2 === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / L2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Verifica o sentido do movimento em relação à rota planejada.
 * @param rota      polilinha da rota (lat,lng) — ex.: route.coords do useRoute
 * @param anterior  posição anterior do veículo/entregador
 * @param atual     posição atual
 */
export function verificarSentido(
  rota: [number, number][] | null | undefined,
  anterior: [number, number] | null,
  atual: [number, number],
): SentidoStatus {
  if (!rota || rota.length < 2 || !anterior) return 'indefinido'
  const mov = distM(anterior, atual)
  if (mov < 3) return 'indefinido' // parado / ruído de GPS

  // segmento da rota mais próximo da posição atual
  let best = -1, bestD = Infinity
  for (let i = 0; i < rota.length - 1; i++) {
    const d = distPontoSegM(atual, rota[i], rota[i + 1])
    if (d < bestD) { bestD = d; best = i }
  }
  if (best < 0) return 'indefinido'
  if (bestD > 45) return 'fora_da_rota' // longe demais de qualquer trecho

  const rumoRota = bearing(rota[best], rota[best + 1])
  const rumoMov = bearing(anterior, atual)
  let diff = Math.abs(rumoRota - rumoMov)
  if (diff > 180) diff = 360 - diff
  return diff > 120 ? 'contramao' : 'ok'
}

/** Monitor com histerese: só alarma após N detecções seguidas (evita falso positivo de GPS). */
export function criarMonitorSentido(minSeguidas = 2) {
  let anterior: [number, number] | null = null
  let seguidas = 0
  return {
    atualizar(rota: [number, number][] | null | undefined, atual: [number, number]): SentidoStatus {
      const s = verificarSentido(rota, anterior, atual)
      anterior = atual
      if (s === 'contramao') {
        seguidas++
        return seguidas >= minSeguidas ? 'contramao' : 'indefinido'
      }
      if (s === 'ok') seguidas = 0
      return s
    },
    reset() { anterior = null; seguidas = 0 },
  }
}
