// Radar de demanda — monitora pedidos por zona e atualiza os scores em tempo real.
import { PRAIAGO_ZONES, pointInPolygon } from './praiagoZones'

export type ZoneScore = {
  id: string
  nome: string
  pedidosHora: number
  ambulantesAtivos: number
  score: number
  tendencia: 'subindo' | 'estavel' | 'descendo'
}

type OrderEvent = { clienteLat: number; clienteLng: number; ts: number }

const ORDER_WINDOW_MS = 60 * 60 * 1000 // janela de 1h

class ZoneAgentClass {
  private orders: OrderEvent[] = []
  private listeners: ((scores: ZoneScore[]) => void)[] = []
  private intervalId: ReturnType<typeof setInterval> | null = null
  private previousScores: Record<string, number> = {}

  constructor() {
    this.start()
  }

  // Registra um pedido recebido
  registerOrder(lat: number, lng: number) {
    this.orders.push({ clienteLat: lat, clienteLng: lng, ts: Date.now() })
    this.prune()
    this.broadcast()
  }

  // Remove pedidos fora da janela de tempo
  private prune() {
    const cutoff = Date.now() - ORDER_WINDOW_MS
    this.orders = this.orders.filter(o => o.ts > cutoff)
  }

  // Calcula scores por zona somente com pedidos reais recebidos na janela de 1h.
  computeScores(): ZoneScore[] {
    this.prune()

    return PRAIAGO_ZONES.map(zone => {
      // Pedidos reais nesta zona na janela de 1h
      const realOrders = this.orders.filter(o =>
        pointInPolygon(o.clienteLat, o.clienteLng, zone.poligono)
      ).length

      const score = Math.min(realOrders / 8, 1)

      const prev = this.previousScores[zone.id] ?? score
      const tendencia: ZoneScore['tendencia'] =
        score > prev + 0.04 ? 'subindo' :
        score < prev - 0.04 ? 'descendo' : 'estavel'

      this.previousScores[zone.id] = score

      return {
        id: zone.id,
        nome: zone.nome,
        pedidosHora: realOrders,
        ambulantesAtivos: 0,
        score,
        tendencia,
      }
    })
  }

  private broadcast() {
    const scores = this.computeScores()
    this.listeners.forEach(fn => fn(scores))
  }

  // Atualiza periodicamente para expirar pedidos antigos da janela de 1h.
  start() {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.broadcast(), 10_000)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  subscribe(fn: (scores: ZoneScore[]) => void) {
    this.listeners.push(fn)
    // Emite imediatamente com dados atuais
    fn(this.computeScores())
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn)
    }
  }
}

// Singleton global
export const ZoneAgent = new ZoneAgentClass()
