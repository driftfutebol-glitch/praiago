// Simulação de ambulantes caminhando na praia — para demo/dev.
// Publica no canal 'praiago:ambulante:gps' para que o useNearbyAmbulantes
// escute normalmente. Ativa automaticamente; pode ser desativado.

import { useEffect, useRef } from 'react'
import { channel, TOPICS } from '../lib/realtime'
import type { AmbulanteGPSPayload } from './useNearbyAmbulantes'
import { getZone } from '../lib/praiagoZones'

// ── Ambulantes simulados com posições reais em Praia Grande ──

type SimAmb = {
  id: string
  nome: string
  emoji: string
  categoria: string
  lat: number
  lng: number
  aberto: boolean
  // velocidade de "caminhada" (graus por tick)
  dLat: number
  dLng: number
}

const INITIAL_AMBULANTES: SimAmb[] = [
  {
    id: 'sim-coco-joao',
    nome: 'Coco do João',
    emoji: '🥥',
    categoria: 'Bebidas naturais',
    lat: -24.0055,
    lng: -46.4135,
    aberto: true,
    dLat: 0.00008,
    dLng: 0.00012,
  },
  {
    id: 'sim-mate-ze',
    nome: 'Mate Gelado do Zé',
    emoji: '🧉',
    categoria: 'Bebidas',
    lat: -24.0440,
    lng: -46.4125,
    aberto: true,
    dLat: -0.00006,
    dLng: 0.00010,
  },
  {
    id: 'sim-espetinho-carlos',
    nome: 'Espetinho do Carlos',
    emoji: '🍢',
    categoria: 'Grelhados',
    lat: -24.0020,
    lng: -46.4095,
    aberto: true,
    dLat: 0.00005,
    dLng: -0.00008,
  },
  {
    id: 'sim-acai-bia',
    nome: 'Açaí da Bia',
    emoji: '🍦',
    categoria: 'Sorvetes · Açaí',
    lat: -24.0540,
    lng: -46.4120,
    aberto: true,
    dLat: -0.00007,
    dLng: 0.00006,
  },
  {
    id: 'sim-cerveja-tico',
    nome: 'Cerveja do Tico',
    emoji: '🍺',
    categoria: 'Bebidas',
    lat: -24.0150,
    lng: -46.4150,
    aberto: false,
    dLat: 0.00004,
    dLng: -0.00005,
  },
]

// Limites da praia de Praia Grande (lat/lng box para manter ambulantes na área)
const BOUNDS = {
  minLat: -24.060,
  maxLat: -23.995,
  minLng: -46.420,
  maxLng: -46.405,
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

// ── Hook ─────────────────────────────────────────────────────

export function useSimulatedAmbulantes(enabled: boolean = true) {
  const ambsRef = useRef<SimAmb[]>(INITIAL_AMBULANTES.map(a => ({ ...a })))

  useEffect(() => {
    if (!enabled) return

    const ch = channel<AmbulanteGPSPayload>(TOPICS.ambulanteGPS)

    const tick = setInterval(() => {
      ambsRef.current.forEach((a) => {
        // Movimenta com um pouco de aleatoriedade (simulando caminhada na areia)
        const jitterLat = (Math.random() - 0.5) * 0.00015
        const jitterLng = (Math.random() - 0.5) * 0.00015

        a.lat = clamp(a.lat + a.dLat + jitterLat, BOUNDS.minLat, BOUNDS.maxLat)
        a.lng = clamp(a.lng + a.dLng + jitterLng, BOUNDS.minLng, BOUNDS.maxLng)

        // Inverte direção quando bate nos limites
        if (a.lat <= BOUNDS.minLat + 0.001 || a.lat >= BOUNDS.maxLat - 0.001) {
          a.dLat = -a.dLat
        }
        if (a.lng <= BOUNDS.minLng + 0.001 || a.lng >= BOUNDS.maxLng - 0.001) {
          a.dLng = -a.dLng
        }

        // Detecta zona atual
        const zone = getZone(a.lat, a.lng)

        ch.publish({
          id: a.id,
          nome: a.nome,
          emoji: a.emoji,
          categoria: a.categoria,
          lat: a.lat,
          lng: a.lng,
          accuracy: 8 + Math.random() * 12,
          aberto: a.aberto,
          zona: zone?.nome ?? 'Praia Grande',
          ts: Date.now(),
        })
      })
    }, 3000) // atualiza posições a cada 3 segundos

    return () => {
      clearInterval(tick)
      ch.close()
    }
  }, [enabled])
}
