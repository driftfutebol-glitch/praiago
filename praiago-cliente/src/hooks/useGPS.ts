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
// De onde veio a posição em uso:
//  gps     → fix real do aparelho
//  manual  → o usuário arrastou o pino no mapa
//  memoria → último fix real salvo neste aparelho
//  ip      → aproximada pela internet (nível de cidade)
//  padrao  → fallback fixo (Boqueirão) quando nada mais existe
export type GPSFonte = 'gps' | 'manual' | 'memoria' | 'ip' | 'padrao'

// Fallback (Praia Grande · Boqueirão) — usado enquanto o GPS real não responde
export const CLIENTE_FALLBACK: [number, number] = [-24.0020, -46.4085]

const POS_STORAGE = 'praiago:cliente:pos'
const MANUAL_STORAGE = 'praiago:cliente:posmanual'
const MEMORIA_FRESCA_MS = 6 * 60 * 60 * 1000 // 6h

type PontoSalvo = { lat: number; lng: number; ts: number }

function lerSalvo(chave: string): PontoSalvo | null {
  try {
    const raw = localStorage.getItem(chave)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<PontoSalvo>
    if (typeof p?.lat === 'number' && typeof p?.lng === 'number') {
      return { lat: p.lat, lng: p.lng, ts: p.ts ?? 0 }
    }
  } catch { /* storage bloqueado ou JSON inválido — ignora */ }
  return null
}

// GPS REAL e ROBUSTO do cliente.
//  1) pega um fix RÁPIDO inicial (baixa precisão, aceita cache) para já ter posição;
//  2) liga o watch de alta precisão para atualizações ao vivo;
//  3) sem GPS (PC/permissão negada): tenta posição aproximada pela internet,
//     reusa o último fix salvo e deixa o usuário AJUSTAR NO MAPA (pino arrastável);
//  4) `pos` SEMPRE é válido e `fonte` diz de onde ele veio.
export function useGPS() {
  const [data, setData] = useState<GPSData | null>(null)
  const [status, setStatus] = useState<GPSStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState<PontoSalvo | null>(() => lerSalvo(MANUAL_STORAGE))
  const [memoria] = useState<PontoSalvo | null>(() => lerSalvo(POS_STORAGE))
  const [ipPos, setIpPos] = useState<(PontoSalvo & { cidade?: string }) | null>(null)
  const ch = useRef<ReturnType<typeof channel<GPSData>> | null>(null)
  const watchId = useRef<number | null>(null)
  const buscouIp = useRef(false)
  const temFix = useRef(false)

  // Posição aproximada pela internet — só nível de cidade, mas muito melhor
  // que um ponto fixo quando o aparelho não tem GPS (PC, por exemplo).
  // Tenta direto (browser/APK) e cai pro proxy do vite ('/api/ip') no dev.
  async function buscarPorIP() {
    if (buscouIp.current) return
    buscouIp.current = true
    for (const url of ['/api/ip/', 'https://ipwho.is/']) {
      try {
        const r = await fetch(url)
        const j = await r.json()
        if (j?.success !== false && typeof j?.latitude === 'number' && typeof j?.longitude === 'number') {
          setIpPos({ lat: j.latitude, lng: j.longitude, ts: Date.now(), cidade: j.city })
          return
        }
      } catch { /* tenta o próximo provedor */ }
    }
  }

  useEffect(() => {
    ch.current = channel<GPSData>(TOPICS.clienteGPS)

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error')
      setError('Localização não suportada neste dispositivo')
      buscarPorIP()
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
      temFix.current = true
      setData(gps)
      setStatus('active')
      setError(null)
      ch.current?.publish(gps)
      try {
        localStorage.setItem(POS_STORAGE, JSON.stringify({ lat: gps.lat, lng: gps.lng, ts: gps.ts }))
      } catch { /* storage cheio/bloqueado — sem drama */ }
    }

    const onErr = (e: GeolocationPositionError) => {
      if (e.code === e.PERMISSION_DENIED) {
        setStatus('denied')
        setError('Permissão de localização negada — ative para ver o que está perto de você.')
        if (!temFix.current) buscarPorIP()
        return
      }
      // timeout / indisponível: não derruba; mantém o que já temos
      setStatus(prev => (prev === 'active' ? 'active' : 'error'))
      setError(e.code === e.TIMEOUT ? 'GPS demorou a responder…' : 'Localização indisponível no momento')
      if (!temFix.current) buscarPorIP()
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // O usuário arrastou o pino: essa posição vale até um GPS PRECISO aparecer.
  function definirPosicaoManual(lat: number, lng: number) {
    const p: PontoSalvo = { lat, lng, ts: Date.now() }
    setManual(p)
    try { localStorage.setItem(MANUAL_STORAGE, JSON.stringify(p)) } catch { /* ok */ }
  }

  function limparPosicaoManual() {
    setManual(null)
    try { localStorage.removeItem(MANUAL_STORAGE) } catch { /* ok */ }
  }

  // GPS preciso (≤300 m) vence o ajuste manual; GPS impreciso (aproximação por
  // torre/IP do navegador, às vezes a quilômetros) NÃO sobrescreve o pino do usuário.
  const gpsPreciso = data ? data.accuracy <= 300 : false
  const memoriaFresca = memoria && Date.now() - memoria.ts < MEMORIA_FRESCA_MS ? memoria : null

  let pos: [number, number]
  let fonte: GPSFonte
  if (manual && !gpsPreciso) {
    pos = [manual.lat, manual.lng]; fonte = 'manual'
  } else if (data) {
    pos = [data.lat, data.lng]; fonte = 'gps'
  } else if (memoriaFresca) {
    pos = [memoriaFresca.lat, memoriaFresca.lng]; fonte = 'memoria'
  } else if (ipPos) {
    pos = [ipPos.lat, ipPos.lng]; fonte = 'ip'
  } else if (memoria) {
    pos = [memoria.lat, memoria.lng]; fonte = 'memoria'
  } else {
    pos = CLIENTE_FALLBACK; fonte = 'padrao'
  }

  return {
    data, status, error, pos, fonte,
    cidadeAproximada: ipPos?.cidade,
    definirPosicaoManual, limparPosicaoManual,
  }
}
