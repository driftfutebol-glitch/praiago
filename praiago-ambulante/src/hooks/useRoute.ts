import { useState, useEffect, useRef } from 'react'

export type RouteInfo = {
  coords: [number, number][]
  distancia: string
  tempo: string
}

// OSRM — roteamento real por ruas, sem chave, sem limite
export function useRoute(from: [number, number] | null, to: [number, number] | null) {
  const [route, setRoute] = useState<RouteInfo | null>(null)
  const timerRef = useRef<number | null>(null)
  const fromLat = from?.[0] ?? null
  const fromLng = from?.[1] ?? null
  const toLat = to?.[0] ?? null
  const toLng = to?.[1] ?? null

  useEffect(() => {
    if (fromLat === null || fromLng === null || toLat === null || toLng === null) {
      setRoute(null)
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)

    // Debounce: só faz a requisição 2s depois da última mudança de GPS
    timerRef.current = window.setTimeout(() => {
      const url = `https://router.project-osrm.org/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson`
      fetch(url)
        .then(r => r.json())
        .then(data => {
          const r = data.routes?.[0]
          if (!r) return
          const coords: [number, number][] = r.geometry.coordinates.map(
            ([lng, lat]: [number, number]) => [lat, lng]
          )
          const dist = r.distance
          const dur = r.duration
          setRoute({
            coords,
            distancia: dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`,
            tempo: `${Math.ceil(dur / 60)} min`,
          })
        })
        .catch(() => {}) // silently fail — linha reta como fallback
    }, 2000)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [fromLat, fromLng, toLat, toLng])

  return route
}
