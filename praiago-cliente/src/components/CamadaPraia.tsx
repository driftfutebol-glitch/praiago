import { useEffect, useMemo, useState } from 'react'
import { Polygon, Polyline, Marker, Pane, useMap } from 'react-leaflet'
import L from 'leaflet'
import { BEACH_LAND, BEACH_SHAPES, between } from '../lib/beachMap'
import { MAPA_ATRIBUICAO } from '../lib/mapa'

// Arte local: não baixa tiles, não desenha ruas e não cria lojas/atividade fictícias.
const palmIcon = L.divIcon({
  className: 'pg-beach-palm', iconSize: [28, 32], iconAnchor: [14, 30],
  html: '<svg aria-hidden="true" width="28" height="32" viewBox="0 0 40 44" fill="none"><ellipse cx="20" cy="40" rx="8" ry="2" fill="#b38b27" opacity=".18"/><path d="M20 39Q16 24 23 15" stroke="#b08b4c" stroke-width="3" stroke-linecap="round"/><g fill="#418768"><path d="M23 15Q8 4 2 17Q13 11 23 15Z"/><path d="M23 15Q35 5 39 17Q30 11 23 15Z"/><path d="M23 15Q14 1 24 0Q21 8 23 15Z"/><path d="M23 15Q30 0 35 5Q27 9 23 15Z"/><path d="M23 15Q7 12 9 24Q14 17 23 15Z"/></g></svg>',
})
const labels = new Map(BEACH_SHAPES.map(({ zone }) => [zone.id, L.divIcon({
  className: 'pg-beach-label', iconSize: [130, 30], iconAnchor: [65, 15],
  // Nomes estáticos da geografia do app, nunca texto de usuários.
  html: '<span>' + zone.nome + '</span>',
})]))

export default function CamadaPraia({ activeZone }: { activeZone: string }) {
  const map = useMap()
  const [viewport, setViewport] = useState(() => ({ zoom: map.getZoom(), bounds: map.getBounds() }))
  useEffect(() => {
    const update = () => setViewport({ zoom: map.getZoom(), bounds: map.getBounds() })
    map.on('moveend zoomend', update)
    map.attributionControl?.addAttribution(MAPA_ATRIBUICAO)
    return () => {
      map.off('moveend zoomend', update)
      map.attributionControl?.removeAttribution(MAPA_ATRIBUICAO)
    }
  }, [map])
  const visible = useMemo(() => BEACH_SHAPES.filter(shape => viewport.bounds.intersects(L.latLngBounds(shape.sand))), [viewport.bounds])
  const palmCount = viewport.zoom >= 16 ? 7 : 3
  return <><Pane name="beach-artwork" style={{ zIndex: 250, pointerEvents: 'none' }}>
    <Polygon positions={BEACH_LAND} interactive={false} pathOptions={{ stroke: false, fillColor: '#edf1e2', fillOpacity: 1 }}/>
    {BEACH_SHAPES.map(shape => <Polygon key={shape.zone.id} positions={shape.sand} interactive={false} pathOptions={{ stroke: false, fillColor: shape.zone.id === activeZone ? '#ffcf4f' : '#f7d877', fillOpacity: 1 }}/>)}
    {visible.map(shape => <Polyline key={'walk-' + shape.zone.id} positions={shape.promenade} interactive={false} pathOptions={{ color: '#fffbec', weight: 6, opacity: 1 }}/>)}
    {visible.map(shape => <Polyline key={'wave-' + shape.zone.id} positions={shape.coast} interactive={false} pathOptions={{ color: '#e2f6ec', weight: 4, opacity: .9 }}/>)}
    {viewport.zoom >= 14 && visible.map(shape => <Polyline key={'zone-' + shape.zone.id} positions={[shape.sand[0], shape.sand[1]]} interactive={false} pathOptions={{ color: '#ac8b37', weight: 1.5, dashArray: '4 5', opacity: .8 }}/>)}
    </Pane><Pane name="beach-decoration" style={{ zIndex: 350, pointerEvents: 'none' }}>
    {viewport.zoom >= 15 && visible.flatMap(shape => Array.from({ length: palmCount }, (_, i) => {
      const point = between(shape.promenade[0], shape.promenade[1], (i + .5) / palmCount)
      return viewport.bounds.contains(point) ? <Marker key={shape.zone.id + '-palm-' + i} position={point} icon={palmIcon} interactive={false} keyboard={false}/> : null
    }))}
    {visible.filter((shape, i) => viewport.zoom >= 15 || shape.zone.id === activeZone || i % 2 === 0).map(shape => <Marker key={'label-' + shape.zone.id} position={shape.label} icon={labels.get(shape.zone.id)} interactive={false} keyboard={false}/>)}
  </Pane></>
}
