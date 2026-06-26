import { useState, useEffect, useRef } from 'react'
import { Geolocation } from '@capacitor/geolocation'

export type GPSData = {
  lat: number
  lng: number
  accuracy: number
  speed: number | null
  heading: number | null
  ts: number
}

export type GPSStatus = 'idle' | 'requesting' | 'active' | 'error'

const CHANNEL = 'praiago:ambulante:gps'
const STORAGE = 'praiago:ambulante:pos'

export function useGPS() {
  const [data, setData] = useState<GPSData | null>(null)
  const [status, setStatus] = useState<GPSStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const watchId = useRef<string | null>(null)
  const channel = useRef<BroadcastChannel | null>(null)

  useEffect(() => {
    channel.current = new BroadcastChannel(CHANNEL)
    setStatus('requesting')

    Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      (pos, err) => {
        if (err || !pos) {
          setStatus('error')
          setError(err?.message ?? 'Erro ao obter GPS')
          return
        }
        const gpsData: GPSData = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 999,
          speed: pos.coords.speed,
          heading: pos.coords.heading,
          ts: Date.now(),
        }
        setData(gpsData)
        setStatus('active')
        setError(null)
        channel.current?.postMessage(gpsData)
        localStorage.setItem(STORAGE, JSON.stringify(gpsData))
      },
    ).then(id => { watchId.current = id })

    return () => {
      if (watchId.current) Geolocation.clearWatch({ id: watchId.current })
      channel.current?.close()
      localStorage.removeItem(STORAGE)
    }
  }, [])

  return { data, status, error }
}
