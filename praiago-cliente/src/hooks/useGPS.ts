import { useState, useEffect, useRef } from 'react'
import { Geolocation } from '@capacitor/geolocation'
import { channel, TOPICS } from '../lib/realtime'

export type GPSData = {
  lat: number
  lng: number
  accuracy: number
  speed: number | null
  heading: number | null
  ts: number
}
export type GPSStatus = 'idle' | 'requesting' | 'active' | 'error'

// Fallback usado enquanto o GPS real não responde (Praia Grande · Boqueirão)
export const CLIENTE_FALLBACK: [number, number] = [-24.0020, -46.4085]

// GPS REAL do cliente — antes a posição era hardcoded. Agora transmite a
// localização verdadeira para que ambulante/entregador calculem rota e distância.
export function useGPS() {
  const [data, setData] = useState<GPSData | null>(null)
  const [status, setStatus] = useState<GPSStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const watchId = useRef<string | null>(null)
  const ch = useRef<ReturnType<typeof channel<GPSData>> | null>(null)

  useEffect(() => {
    ch.current = channel<GPSData>(TOPICS.clienteGPS)
    setStatus('requesting')

    Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      (pos, err) => {
        if (err || !pos) {
          setStatus('error')
          setError(err?.message ?? 'Não foi possível obter sua localização')
          return
        }
        const gps: GPSData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 999,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          ts: Date.now(),
        }
        setData(gps)
        setStatus('active')
        setError(null)
        ch.current?.publish(gps)
      },
    ).then(id => { watchId.current = id }).catch(() => setStatus('error'))

    return () => {
      if (watchId.current) Geolocation.clearWatch({ id: watchId.current })
      ch.current?.close()
    }
  }, [])

  const pos: [number, number] = data ? [data.lat, data.lng] : CLIENTE_FALLBACK
  return { data, status, error, pos }
}
