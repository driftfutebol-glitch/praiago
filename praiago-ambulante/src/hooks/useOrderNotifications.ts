import { useCallback, useEffect, useRef, useState } from 'react'
import { getSessao } from '../lib/auth'
import { supabase } from '../lib/supabase'

export type IncomingOrder = {
  id: string
  clienteNome: string
  clienteTel: string
  itens: string[]
  total: number
  pagamento: string
  zona: string
  reta: string
  barraca: string
  clienteLat: number
  clienteLng: number
  ts: number
}

type OrderListener = (order: IncomingOrder) => void
type PedidoRow = Record<string, unknown>

const listeners = new Set<OrderListener>()
const notifiedRecently = new Set<string>()

let activeChannel: ReturnType<typeof supabase.channel> | null = null
let activeSellerId: string | null = null
let channelSeq = 0
let sharedCtx: AudioContext | null = null

function rowToOrder(row: PedidoRow): IncomingOrder {
  const createdAt = typeof row.created_at === 'string' ? row.created_at : undefined
  const itens = Array.isArray(row.itens) ? row.itens.map(item => String(item)) : []

  return {
    id: String(row.id ?? ''),
    clienteNome: String(row.cliente_nome ?? 'Cliente'),
    clienteTel: String(row.cliente_tel ?? ''),
    itens,
    total: Number(row.total) || 0,
    pagamento: String(row.pagamento ?? 'pix'),
    zona: String(row.zona ?? ''),
    reta: String(row.reta ?? ''),
    barraca: String(row.barraca ?? ''),
    clienteLat: Number(row.lat) || -24.0228,
    clienteLng: Number(row.lng) || -46.4305,
    ts: createdAt ? new Date(createdAt).getTime() : Date.now(),
  }
}

function getAudioContext(): AudioContext | null {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return null

    if (!sharedCtx) sharedCtx = new AudioContextCtor()
    if (sharedCtx.state === 'suspended') void sharedCtx.resume().catch(() => undefined)
    return sharedCtx
  } catch {
    return null
  }
}

if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    getAudioContext()
  }
  window.addEventListener('pointerdown', unlockAudio, { once: false })
  window.addEventListener('keydown', unlockAudio, { once: false })
}

function playNotificationBeep() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    ;[880, 1175, 1568].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.13)
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.13 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.13 + 0.11)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.13)
      osc.stop(now + i * 0.13 + 0.13)
    })
  } catch {
    // Audio pode ficar bloqueado ate o primeiro toque do usuario.
  }
}

function emitOrder(row: PedidoRow) {
  if (String(row.status ?? 'novo') !== 'novo') return

  const id = String(row.id ?? '')
  if (!id || notifiedRecently.has(id)) return

  notifiedRecently.add(id)
  window.setTimeout(() => notifiedRecently.delete(id), 8000)

  const order = rowToOrder(row)
  playNotificationBeep()
  listeners.forEach(listener => listener(order))
}

function clearActiveChannel() {
  if (!activeChannel) return

  try {
    void supabase.removeChannel(activeChannel)
  } catch (error) {
    console.warn('Falha ao remover canal de pedidos', error)
  } finally {
    activeChannel = null
    activeSellerId = null
  }
}

function removeStalePedidoChannels() {
  const getChannels = (supabase as typeof supabase & {
    getChannels?: () => Array<{ topic?: string }>
  }).getChannels

  if (typeof getChannels !== 'function') return

  getChannels.call(supabase).forEach(channel => {
    if (channel === activeChannel) return
    if (!channel.topic?.startsWith('realtime:pedidos_ambulante')) return

    try {
      void supabase.removeChannel(channel as ReturnType<typeof supabase.channel>)
    } catch (error) {
      console.warn('Falha ao limpar canal antigo de pedidos', error)
    }
  })
}

function ensureOrderChannel(sellerId: string) {
  if (activeChannel && activeSellerId === sellerId) return

  clearActiveChannel()
  removeStalePedidoChannels()

  const topic = `pedidos_ambulante_${sellerId}_${Date.now()}_${++channelSeq}`

  try {
    const channel = supabase
      .channel(topic)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${sellerId}` },
        payload => emitOrder(payload.new as PedidoRow),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${sellerId}` },
        payload => emitOrder(payload.new as PedidoRow),
      )
      .subscribe((status, error) => {
        if (error) console.error('Erro no realtime de pedidos', error)
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (activeChannel === channel) {
            activeChannel = null
            activeSellerId = null
            if (listeners.size > 0 && status !== 'CLOSED') {
              window.setTimeout(() => ensureOrderChannel(sellerId), 1500)
            }
          }
        }
      })
    activeChannel = channel
    activeSellerId = sellerId
  } catch (error) {
    activeChannel = null
    activeSellerId = null
    console.error('Falha ao iniciar realtime de pedidos', error)
  }
}

function addOrderListener(sellerId: string, listener: OrderListener) {
  listeners.add(listener)
  ensureOrderChannel(sellerId)

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) clearActiveChannel()
  }
}

export function useOrderNotifications() {
  const [orders, setOrders] = useState<IncomingOrder[]>([])
  const [latestOrder, setLatestOrder] = useState<IncomingOrder | null>(null)
  const seen = useRef<Set<string>>(new Set())

  useEffect(() => {
    const sessao = getSessao()
    if (!sessao?.id) return

    return addOrderListener(sessao.id, order => {
      if (seen.current.has(order.id)) return
      seen.current.add(order.id)
      setLatestOrder(order)
      setOrders(prev => (prev.some(current => current.id === order.id) ? prev : [order, ...prev]))
    })
  }, [])

  const dismissLatest = useCallback(() => setLatestOrder(null), [])

  return { orders, latestOrder, dismissLatest }
}
