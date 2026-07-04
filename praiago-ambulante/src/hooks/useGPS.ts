import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { getZone } from '../lib/praiagoZones'
import { getSessao } from '../lib/auth'

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
export const ONLINE_STORAGE = 'praiago:ambulante:online'
export const ONLINE_EVENT = 'praiago:ambulante:online-change'

function deviceId(): string {
  let id = localStorage.getItem(DEVICE)
  if (!id) { id = 'amb-' + Math.random().toString(36).slice(2, 10); localStorage.setItem(DEVICE, id) }
  return id
}

function isOnline(): boolean {
  try { return localStorage.getItem(ONLINE_STORAGE) === 'true' } catch { return false }
}

// Canal de broadcast do GPS: SINGLETON do módulo. O useGPS roda no App e no
// Dashboard ao mesmo tempo — se cada instância criasse/assinasse o mesmo tópico
// ('praiago:ambulante:gps' precisa ser fixo, é ele que o radar do cliente ouve),
// o segundo subscribe() estourava e o unmount de uma tela matava o canal da outra.
let gpsChannel: ReturnType<typeof supabase.channel> | null = null
function getGpsChannel() {
  if (!gpsChannel) {
    gpsChannel = supabase.channel('praiago:ambulante:gps')
    gpsChannel.subscribe()
  }
  return gpsChannel
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
  const lastGPS = useRef<GPSData | null>(null)

  async function publishPosition(g: GPSData, aberto = isOnline()) {
    const sessao = getSessao()
    const zona = getZone(g.lat, g.lng)
    const id = sessao?.id || deviceId()
    const nomeAtual = sessao?.nome || nome.current

    channel.current?.send({
      type: 'broadcast',
      event: 'msg',
      payload: {
        id,
        nome: nomeAtual,
        emoji: '🥥',
        categoria: 'Ambulante',
        lat: g.lat,
        lng: g.lng,
        accuracy: g.accuracy,
        aberto,
        zona: zona?.nome ?? 'Praia Grande',
        ts: g.ts,
      },
    })

    if (sessao?.id) {
      await supabase
        .from('profiles')
        .update({
          online: aberto,
          lat: g.lat,
          lng: g.lng,
          zona: zona?.nome ?? 'Praia Grande',
        })
        .eq('id', sessao.id)
    }
  }

  useEffect(() => {
    channel.current = getGpsChannel()
    supabase.auth.getUser()
      .then(({ data }) => { nome.current = (data.user?.user_metadata?.nome as string) || 'Ambulante' })
      .catch(() => {})

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error')
      setError('Localização não suportada neste dispositivo')
      return
    }
    setStatus('requesting')

    // App NATIVO (Capacitor): pede a permissão de localização do Android antes —
    // sem isso o watchPosition do WebView falha silenciosamente no APK.
    const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (capacitor?.isNativePlatform?.()) {
      import('@capacitor/geolocation')
        .then(({ Geolocation }) => Geolocation.requestPermissions())
        .catch(() => { /* plugin ausente → segue com o geolocation web */ })
    }

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
      lastGPS.current = g
      setStatus('active')
      setError(null)
      publishPosition(g)
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

    const onOnlineChange = () => {
      const g = lastGPS.current
      const sessao = getSessao()
      if (g) {
        publishPosition(g)
      } else if (sessao?.id) {
        supabase.from('profiles').update({ online: isOnline() }).eq('id', sessao.id)
      }
    }
    window.addEventListener(ONLINE_EVENT, onOnlineChange)

    navigator.geolocation.getCurrentPosition(onPos, onErr, {
      enableHighAccuracy: false, timeout: 10000, maximumAge: 60000,
    })
    watchId.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true, timeout: 30000, maximumAge: 5000,
    })

    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current)
      // o canal de GPS é singleton e fica vivo pro app inteiro — não remover aqui
      window.removeEventListener(ONLINE_EVENT, onOnlineChange)
    }
  }, [])

  return { data, status, error }
}
