import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getZone } from '../lib/praiagoZones'

export type GPSData = {
  lat: number
  lng: number
  accuracy: number
  speed: number | null
  heading: number | null
  ts: number
}
export type GPSStatus = 'idle' | 'requesting' | 'active' | 'error' | 'denied'

const STORAGE = 'praiago:ambulante:pos'
const DEVICE = 'praiago:ambulante:deviceid'

function deviceId(): string {
  let id = localStorage.getItem(DEVICE)
  if (!id) { id = 'amb-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE, id) }
  return id
}

// GPS REAL e ROBUSTO do ambulante.
// - navigator.geolocation com fix rápido inicial + watch ao vivo (sem timeout estourando);
// - publica um payload ENRIQUECIDO (id/nome/emoji/zona) via Supabase para que o app do
//   cliente mostre este ambulante no Radar em tempo real.
export function useGPS() {
  const [data, setData] = useState<GPSData | null>(null)
  const [status, setStatus] = useState<GPSStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const watchId = useRef<number | null>(null)
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const nome = useRef('Ambulante')

  useEffect(() => {
    channel.current = supabase.channel('praiago:ambulante:gps')
    channel.current.subscribe()
    supabase.auth.getUser()
      .then(({ data }) => { nome.current = (data.user?.user_metadata?.nome as string) || 'Ambulante' })
      .catch(() => {})

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error')
      setError('Localização não suportada neste dispositivo')
      return
    }
    setStatus('requesting')

    const onPos = (p: GeolocationPosition) => {
      const g: GPSData = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        accuracy: p.coords.accuracy ?? 999,
        speed: p.coords.speed,
        heading: p.coords.heading,
        ts: Date.now(),
      }
      setData(g)
      setStatus('active')
      setError(null)

      const zona = getZone(g.lat, g.lng)
      channel.current?.send({
        type: 'broadcast',
        event: 'msg',
        payload: {
          id: deviceId(),
          nome: nome.current,
          emoji: '🥥',
          categoria: 'Ambulante',
          lat: g.lat,
          lng: g.lng,
          accuracy: g.accuracy,
          aberto: true,
          zona: zona?.nome ?? 'Praia Grande',
          ts: g.ts,
        },
      })
      localStorage.setItem(STORAGE, JSON.stringify(g))
    }

    const onErr = (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) {
        setStatus('denied')
        setError('Permissão de localização negada — ative para vender com GPS.')
        return
      }
      setStatus(prev => (prev === 'active' ? 'active' : 'error'))
      setError(e.code === e.TIMEOUT ? 'GPS demorou a responder…' : 'Localização indisponível no momento')
    }

    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: false, timeout: 10000, maximumAge: 60000,
    })
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true, timeout: 30000, maximumAge: 5000,
    })

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
      if (channel.current) supabase.removeChannel(channel.current)
      localStorage.removeItem(STORAGE)
    }
  }, [])

  return { data, status, error }
}
