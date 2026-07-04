import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

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
  pagamento: string
}

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

// O hook é montado no App (global) E na página de Pedidos — sem isso o mesmo
// pedido tocaria 2 beeps. Cada pedido só apita uma vez.
const beepRecentes = new Set<string>()

// Gera beep duplo estilo notificação usando Web Audio API pura
function playNotificationBeep(dedupeId?: string) {
  if (dedupeId) {
    if (beepRecentes.has(dedupeId)) return
    beepRecentes.add(dedupeId)
    setTimeout(() => beepRecentes.delete(dedupeId), 8000)
  }
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
  // Pedidos já notificados NESTA instância (evita repetir quando o mesmo
  // pedido chega por INSERT e depois por UPDATE do webhook de pagamento).
  const vistos = useRef<Set<string>>(new Set())

  useEffect(() => {
    const sessao = getSessao()
    if (!sessao) return

    const notificar = (row: Record<string, any>) => {
      // Pedido online ainda não pago fica INVISÍVEL pro vendedor: só chega
      // quando o Mercado Pago aprovar (webhook muda o status pra 'novo').
      if (row.status !== 'novo') return
      if (vistos.current.has(row.id)) return
      vistos.current.add(row.id)

      const order: IncomingOrder = {
        id: row.id,
        clienteNome: row.cliente_nome,
        clienteTel: row.cliente_tel || '(00) 00000-0000',
        itens: row.itens,
        total: Number(row.total),
        pagamento: row.pagamento,
        zona: row.zona || 'Desconhecida',
        reta: row.reta,
        barraca: row.barraca,
        clienteLat: Number(row.lat) || -24.0,
        clienteLng: Number(row.lng) || -46.41,
        ts: new Date(row.created_at).getTime()
      }

      playNotificationBeep(order.id)
      setLatestOrder(order)
      setOrders(prev => [order, ...prev])
    }

    const channel = supabase.channel('pedidos_ambulante')
      .on(
        'postgres_changes',
        // só pedidos DESTE vendedor (antes chegava pedido de todo mundo)
        { event: 'INSERT', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${sessao.id}` },
        (payload) => notificar(payload.new as Record<string, any>)
      )
      .on(
        'postgres_changes',
        // pagamento aprovado libera o pedido (aguardando_pagamento → novo)
        { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${sessao.id}` },
        (payload) => notificar(payload.new as Record<string, any>)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const dismissLatest = useCallback(() => setLatestOrder(null), [])

  return { orders, latestOrder, dismissLatest }
}
