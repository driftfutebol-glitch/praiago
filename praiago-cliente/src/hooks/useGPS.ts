import { useState, useEffect, useRef } from 'react'
import { channel, TOPICS } from '../lib/realtime'

export type GPSData = {
  lat: number
  lng: number
  accuracy: number
  speed: number | null
  heading: number | null
  ts: number
}
export type GPSStatus = 'idle' | 'requesting' | 'active' | 'error' | 'denied'

// Fallback (Praia Grande · Boqueirão) — usado enquanto o GPS real não responde
export const CLIENTE_FALLBACK: [number, number] = [-24.0020, -46.4085]

// GPS REAL e ROBUSTO do cliente.
// Antes usava Capacitor com enableHighAccuracy=true + timeout curto + maximumAge=0,
// o que estourava timeout no desktop ("GPS deu erro"). Agora:
//  1) pega um fix RÁPIDO inicial (baixa precisão, aceita cache) para já ter posição;
//  2) liga o watch de alta precisão para atualizações ao vivo;
//  3) trata permissão negada / timeout sem quebrar (mantém a última posição/fallback);
//  4) `pos` SEMPRE é válido.
export function useGPS() {
  const [data, setData] = useState<GPSData | null>(null)
  const [status, setStatus] = useState<GPSStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const ch = useRef<ReturnType<typeof channel<GPSData>> | null>(null)
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    ch.current = channel<GPSData>(TOPICS.clienteGPS)

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error')
      setError('Localização não suportada neste dispositivo')
      return
    }

    setStatus('requesting')

    // App NATIVO (Capacitor): pede a permissão de localização do Android antes —
    // sem isso o navigator.geolocation do WebView falha silenciosamente.
    const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (capacitor?.isNativePlatform?.()) {
      import('@capacitor/geolocation')
        .then(({ Geolocation }) => Geolocation.requestPermissions())
        .catch(() => { /* plugin ausente → segue com o geolocation web */ })
    }

    const onPos = (p: GeolocationPosition) => {
      const gps: GPSData = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy ?? 999,
        speed: p.coords.speed,
        heading: p.coords.heading,
        ts: Date.now(),
      }
      setData(gps)
      setStatus('active')
      setError(null)
      ch.current?.publish(gps)
    }

    const onErr = (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) {
        setStatus('denied')
        setError('Permissão de localização negada — ative para ver o que está perto de você.')
        return
      }
      // timeout / indisponível: não derruba; mantém o que já temos
      setStatus(prev => (prev === 'active' ? 'active' : 'error'))
      setError(e.code === e.TIMEOUT ? 'GPS demorou a responder…' : 'Localização indisponível no momento')
    }

    // 1) Fix rápido (baixa precisão, aceita posição em cache de até 1 min)
    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: false, timeout: 10000, maximumAge: 60000,
    })

    // 2) Acompanhamento ao vivo (alta precisão, timeout generoso)
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true, timeout: 30000, maximumAge: 5000,
    })

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
      ch.current?.close()
    }
  }, [])

  const pos: [number, number] = data ? [data.lat, data.lng] : CLIENTE_FALLBACK
  return { data, status, error, pos }
}
