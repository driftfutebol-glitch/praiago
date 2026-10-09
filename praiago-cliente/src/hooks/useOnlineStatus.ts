import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'

export function useOnlineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    let disposed = false
    let removeNative: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      void import('@capacitor/network').then(async ({ Network }) => {
        const listener = await Network.addListener('networkStatusChange', status => {
          if (!disposed) setOnline(status.connected)
        })
        if (disposed) { void listener.remove(); return }
        removeNative = () => { void listener.remove() }
        const status = await Network.getStatus()
        if (!disposed) setOnline(status.connected)
      }).catch(() => { /* Eventos web continuam disponíveis. */ })
    }
    return () => {
      disposed = true
      removeNative?.()
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
