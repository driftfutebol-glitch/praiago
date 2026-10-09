type Listener = { position: PositionCallback; error: PositionErrorCallback }
const listeners = new Set<Listener>()
let watchId: number | null = null
let generation = 0
let lastPosition: GeolocationPosition | null = null

/** Um único sensor por aplicativo, mesmo com mapa, catálogo e checkout montados. */
export function subscribeGeolocation(position: PositionCallback, error: PositionErrorCallback) {
  const listener = { position, error }
  listeners.add(listener)
  if (lastPosition && Date.now() - lastPosition.timestamp < 60_000) position(lastPosition)
  if (listeners.size === 1) {
    const currentGeneration = ++generation
    const start = () => {
      if (currentGeneration !== generation || !listeners.size) return
      const onPosition: PositionCallback = p => {
        if (currentGeneration !== generation) return
        lastPosition = p
        for (const l of listeners) l.position(p)
      }
      const onError: PositionErrorCallback = e => {
        if (currentGeneration !== generation) return
        for (const l of listeners) l.error(e)
      }
      navigator.geolocation.getCurrentPosition(onPosition, onError, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 })
      watchId = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 })
    }
    const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (capacitor?.isNativePlatform?.()) {
      void import('@capacitor/geolocation').then(({ Geolocation }) => Geolocation.requestPermissions()).catch(() => {}).finally(start)
    } else start()
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      ++generation
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
  }
}
