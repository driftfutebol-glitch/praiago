// Hook que escuta posições GPS dos ambulantes em tempo real.
// Mantém um mapa vivo de ambulantes próximos, ordenados por distância.
// Funciona com Supabase Realtime (produção) ou BroadcastChannel (dev local).

import { useState, useEffect, useRef, useCallback } from 'react'
import { channel, TOPICS } from '../lib/realtime'

// ── Tipos ────────────────────────────────────────────────────

export type AmbulanteLive = {
  id: string
  nome: string
  emoji: string
  categoria: string
  lat: number
  lng: number
  accuracy: number
  lastSeen: number    // timestamp
  aberto: boolean
  zona: string
  distancia: number   // metros (calculado pelo hook)
}

export type AmbulanteGPSPayload = {
  id: string
  nome: string
  emoji: string
  categoria: string
  lat: number
  lng: number
  accuracy: number
  aberto: boolean
  zona: string
  ts: number
}

// ── Haversine ────────────────────────────────────────────────

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // raio da Terra em metros
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Config ───────────────────────────────────────────────────

const STALE_TIMEOUT = 2 * 60 * 1000 // 2 min sem update → remove
const PRUNE_INTERVAL = 10_000        // checa inativos a cada 10s
const MAX_RADIUS = 5_000             // raio máximo 5km

// ── Hook ─────────────────────────────────────────────────────

export function useNearbyAmbulantes(clientePos: [number, number]) {
  const [ambulantes, setAmbulantes] = useState<AmbulanteLive[]>([])
  const mapRef = useRef<Map<string, AmbulanteLive>>(new Map())
  const clientePosRef = useRef(clientePos)
  clientePosRef.current = clientePos

  const recalcAndSort = useCallback(() => {
    const [clat, clng] = clientePosRef.current
    const now = Date.now()
    const result: AmbulanteLive[] = []

    mapRef.current.forEach((a, id) => {
      // remove stale
      if (now - a.lastSeen > STALE_TIMEOUT) {
        mapRef.current.delete(id)
        return
      }
      const dist = haversine(clat, clng, a.lat, a.lng)
      if (dist <= MAX_RADIUS) {
        result.push({ ...a, distancia: Math.round(dist) })
      }
    })

    result.sort((a, b) => a.distancia - b.distancia)
    setAmbulantes(result)
  }, [])

  useEffect(() => {
    const ch = channel<AmbulanteGPSPayload>(TOPICS.ambulanteGPS)

    const unsub = ch.subscribe((payload) => {
      if (!payload?.id || typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return

      const entry: AmbulanteLive = {
        id: payload.id,
        nome: payload.nome ?? 'Ambulante',
        emoji: payload.emoji ?? '🛒',
        categoria: payload.categoria ?? '',
        lat: payload.lat,
        lng: payload.lng,
        accuracy: payload.accuracy ?? 999,
        lastSeen: payload.ts ?? Date.now(),
        aberto: payload.aberto ?? true,
        zona: payload.zona ?? '',
        distancia: 0,
      }

      mapRef.current.set(payload.id, entry)
      recalcAndSort()
    })

    // Pruning periódico
    const pruner = setInterval(recalcAndSort, PRUNE_INTERVAL)

    return () => {
      unsub()
      ch.close()
      clearInterval(pruner)
    }
  }, [recalcAndSort])

  // Recalcula quando posição do cliente muda
  useEffect(() => {
    recalcAndSort()
  }, [clientePos[0], clientePos[1], recalcAndSort])

  return { ambulantes, total: ambulantes.length }
}
