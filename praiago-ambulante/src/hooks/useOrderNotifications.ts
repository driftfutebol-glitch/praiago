import { useState, useEffect, useRef, useCallback } from 'react'
import { parseIncomingOrder } from '../lib/validation'

export type IncomingOrder = {
  id: string
  clienteNome: string
  clienteTel: string
  itens: string[]
  total: number
  clienteLat: number
  clienteLng: number
  zona: string
  reta?: string
  barraca?: string
  ts: number
}

const CHANNEL = 'praiago:orders'

// AudioContext compartilhado. Navegadores criam o contexto "suspended" até um
// gesto do usuário (política de autoplay) — por isso o beep antes não tocava.
// Destravamos no primeiro toque/clique/tecla.
let sharedCtx: AudioContext | null = null
function getCtx(): AudioContext | null {
  try {
    if (!sharedCtx) sharedCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {})
    return sharedCtx
  } catch { return null }
}
if (typeof window !== 'undefined') {
  const unlock = () => { getCtx() }
  window.addEventListener('pointerdown', unlock, { once: false })
  window.addEventListener('keydown', unlock, { once: false })
}

// Gera beep duplo estilo notificação usando Web Audio API pura
function playNotificationBeep() {
  try {
    const ctx = getCtx()
    if (!ctx) return
    const ac: AudioContext = ctx

    function beep(startTime: number, freq: number, duration: number, volume = 0.4) {
      const osc = ac.createOscillator()
      const gain = ac.createGain()
      osc.connect(gain)
      gain.connect(ac.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, startTime)
      gain.gain.setValueAtTime(0, startTime)
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)
      osc.start(startTime)
      osc.stop(startTime + duration)
    }

    const now = ac.currentTime
    // Beep duplo sobe-desce (como WhatsApp)
    beep(now,        880, 0.15, 0.45)
    beep(now + 0.18, 1046, 0.15, 0.45)
    beep(now + 0.40, 880, 0.12, 0.35)
    beep(now + 0.55, 1046, 0.20, 0.45)
    // Não fechamos: o contexto é compartilhado e reutilizado nos próximos beeps.
  } catch {
    // silently fail se não suportado
  }
}

export function useOrderNotifications() {
  const [orders, setOrders] = useState<IncomingOrder[]>([])
  const [latestOrder, setLatestOrder] = useState<IncomingOrder | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    channelRef.current = new BroadcastChannel(CHANNEL)

    channelRef.current.onmessage = (e: MessageEvent) => {
      const order = parseIncomingOrder(e.data)   // valida/sanitiza; ignora se forjado
      if (!order) return
      playNotificationBeep()
      setLatestOrder(order)
      setOrders(prev => [order, ...prev])
    }

    return () => {
      channelRef.current?.close()
    }
  }, [])

  const dismissLatest = useCallback(() => setLatestOrder(null), [])

  return { orders, latestOrder, dismissLatest }
}
