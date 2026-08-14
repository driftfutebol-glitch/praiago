import { useEffect, useMemo, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Circle, MapContainer, Marker, Polygon, Popup, TileLayer, useMap } from 'react-leaflet'
import { Activity, Clock3, MapPin, ShoppingBag, ShoppingCart, TreePalm, TrendingUp, UserRound, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useGPS } from '../hooks/useGPS'
import { useOrderNotifications } from '../hooks/useOrderNotifications'
import {
  BEACH_ZONES,
  NIVEL_CONFIG,
  PRAIA_GRANDE_CENTER,
  getZone,
  type ZoneNivel,
  type ZoneHeat,
} from '../lib/praiagoZones'
import { supabase } from '../lib/supabase'

const PALM_POINTS: [number, number][] = [
  [-24.0164, -46.4078],
  [-24.0168, -46.4204],
  [-24.0200, -46.4371],
  [-24.0244, -46.4528],
  [-24.0303, -46.4705],
  [-24.0369, -46.4891],
  [-24.0468, -46.5141],
  [-24.0573, -46.5370],
]

function makeIcon(markup: string, className: string, size: number) {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div class="${className}">${markup}</div>`,
  })
}

const palmIcon = makeIcon(renderToStaticMarkup(<TreePalm size={21} strokeWidth={2.2} />), 'map-palm-marker', 34)
const sellerIcon = makeIcon(renderToStaticMarkup(<ShoppingCart size={21} strokeWidth={2.6} />), 'map-user-marker', 42)
const customerIcon = makeIcon(renderToStaticMarkup(<UserRound size={20} strokeWidth={2.6} />), 'map-customer-marker', 42)
const VALID_HEAT_LEVELS = new Set<ZoneNivel>(['frio', 'morno', 'quente', 'explosivo'])

function parseHeatPayload(payload: unknown, beachIds: Set<string>): ZoneHeat[] {
  if (!Array.isArray(payload)) return []

  const zones = new Map<string, ZoneHeat>()
  for (const value of payload.slice(0, 50)) {
    if (!value || typeof value !== 'object') continue
    const item = value as Record<string, unknown>
    const zoneId = typeof item.zoneId === 'string' ? item.zoneId : ''
    const nivel = typeof item.nivel === 'string' ? item.nivel as ZoneNivel : null
    const pedidosHora = Number(item.pedidosHora)
    const ambulantesAtivos = Number(item.ambulantesAtivos)
    const score = Number(item.score)

    if (!beachIds.has(zoneId) || !nivel || !VALID_HEAT_LEVELS.has(nivel)) continue
    if (!Number.isFinite(pedidosHora) || !Number.isFinite(ambulantesAtivos) || !Number.isFinite(score)) continue

    zones.set(zoneId, {
      zoneId,
      nivel,
      pedidosHora: Math.round(Math.min(Math.max(pedidosHora, 0), 10_000)),
      ambulantesAtivos: Math.round(Math.min(Math.max(ambulantesAtivos, 0), 10_000)),
      score: Math.min(Math.max(score, 0), 1),
    })
  }

  return [...zones.values()]
}

function FlyTo({ position }: { position: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(position, 14, { duration: 0.9 })
  }, [map, position])
  return null
}

export default function ZonasPage() {
  const { data: gpsData, status: gpsStatus } = useGPS()
  const { orders } = useOrderNotifications()
  const [heatData, setHeatData] = useState<ZoneHeat[]>([])
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const currentPosition: [number, number] = gpsData
    ? [gpsData.lat, gpsData.lng]
    : PRAIA_GRANDE_CENTER
  const currentZone = gpsData ? getZone(gpsData.lat, gpsData.lng)?.nome : null
  const beachIds = useMemo(() => new Set(BEACH_ZONES.map(zone => zone.id)), [])
  const rankedHeat = useMemo(() => (
    [...heatData]
      .filter(item => beachIds.has(item.zoneId) && item.score > 0)
      .sort((left, right) => right.score - left.score)
  ), [beachIds, heatData])

  useEffect(() => {
    const channel = supabase
      .channel('radar_demanda')
      .on('broadcast', { event: 'heat_update' }, payload => {
        const nextHeatData = parseHeatPayload(payload.payload, beachIds)
        setHeatData(nextHeatData)
        setLastUpdate(new Date())
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [beachIds])

  const locationState = gpsStatus === 'active'
    ? { label: currentZone || 'Praia Grande', detail: 'Sua posição está ativa', color: '#148447', background: '#eaf8ef' }
    : gpsStatus === 'denied' || gpsStatus === 'error'
      ? { label: 'Localização indisponível', detail: 'Ative a permissão para aparecer no radar', color: '#b54708', background: '#fff4e5' }
      : { label: 'Localizando', detail: 'Aguardando sinal do dispositivo', color: '#617089', background: '#edf1f5' }

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div>
          <h1>Mapa da praia</h1>
          <p>Veja sua posição, pedidos e movimento por região.</p>
        </div>
        <span className="status-pill" style={{ color: locationState.color, background: locationState.background }}>
          <span className="status-dot" style={{ background: locationState.color }} />
          {gpsStatus === 'active' ? 'Ao vivo' : 'GPS'}
        </span>
      </div>

      <section className="surface" style={{ marginBottom: 12, padding: 14, boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', flex: '0 0 42px', borderRadius: 8, background: locationState.background, color: locationState.color }}>
            <MapPin size={20} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#132238', fontSize: 14, fontWeight: 900 }}>{locationState.label}</div>
            <div style={{ marginTop: 3, color: '#617089', fontSize: 12, lineHeight: 1.35, fontWeight: 600 }}>{locationState.detail}</div>
          </div>
        </div>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ height: 390, position: 'relative', overflow: 'hidden', marginBottom: 14, border: '1px solid #dfe6ed', borderRadius: 8, background: '#dbeef4', boxShadow: '0 12px 30px rgba(23,45,74,0.12)' }}
      >
        <MapContainer center={currentPosition} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
          />

          {gpsStatus === 'active' && <FlyTo position={currentPosition} />}

          {BEACH_ZONES.map(zone => (
            <Polygon
              key={`sand-${zone.id}`}
              positions={zone.poligono}
              pathOptions={{
                color: '#d2a62f',
                fillColor: '#f4c95d',
                fillOpacity: 0.42,
                weight: 1.4,
              }}
            >
              <Popup>
                <strong>{zone.nome}</strong>
                <div style={{ marginTop: 4, color: '#6f5a20', fontSize: 12, fontWeight: 700 }}>Faixa de praia PraiaGo</div>
              </Popup>
            </Polygon>
          ))}

          {rankedHeat.map(heat => {
            const zone = BEACH_ZONES.find(item => item.id === heat.zoneId)
            if (!zone) return null
            const config = NIVEL_CONFIG[heat.nivel]
            return (
              <Polygon
                key={`demand-${zone.id}`}
                positions={zone.poligono}
                pathOptions={{
                  color: config.cor,
                  fillColor: config.cor,
                  fillOpacity: Math.min(0.24, 0.08 + heat.score * 0.16),
                  weight: 3,
                  dashArray: '7 6',
                }}
              >
                <Popup>
                  <strong>{zone.nome}</strong>
                  <div style={{ marginTop: 5, color: config.cor, fontWeight: 800 }}>{config.label}</div>
                  <div style={{ color: '#617089', fontSize: 12 }}>{heat.pedidosHora} pedidos na última hora</div>
                </Popup>
              </Polygon>
            )
          })}

          {PALM_POINTS.map((position, index) => (
            <Marker key={`palm-${index}`} position={position} icon={palmIcon} interactive={false} />
          ))}

          {gpsStatus === 'active' && (
            <>
              <Marker position={currentPosition} icon={sellerIcon}>
                <Popup><strong>Sua posição</strong><br />Visível quando você está atendendo.</Popup>
              </Marker>
              <Circle
                center={currentPosition}
                radius={Math.min(Math.max(gpsData?.accuracy || 20, 12), 100)}
                pathOptions={{ color: '#148447', fillColor: '#18a957', fillOpacity: 0.1, weight: 1 }}
              />
            </>
          )}

          {orders.filter(order => order.clienteLat !== null && order.clienteLng !== null).map(order => (
            <Marker key={order.id} position={[order.clienteLat!, order.clienteLng!]} icon={customerIcon}>
              <Popup>
                <strong>Pedido #{order.id.slice(0, 8).toUpperCase()}</strong>
                <div style={{ marginTop: 5 }}>{order.reta || order.zona || 'Ponto informado pelo cliente'}</div>
                <div style={{ color: '#148447', fontWeight: 800 }}>{order.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <div style={{ position: 'absolute', zIndex: 500, top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', pointerEvents: 'none' }}>
          <span className="status-pill" style={{ color: '#148447', background: 'rgba(255,255,255,0.94)', border: '1px solid #dfe6ed', boxShadow: '0 5px 16px rgba(23,45,74,0.12)' }}>
            <ShoppingBag size={14} />
            {orders.length} {orders.length === 1 ? 'pedido no mapa' : 'pedidos no mapa'}
          </span>
          <span className="status-pill" style={{ color: '#6f5a20', background: 'rgba(255,251,232,0.96)', border: '1px solid #e9ca75', boxShadow: '0 5px 16px rgba(23,45,74,0.1)' }}>
            <TreePalm size={14} />
            Orla
          </span>
        </div>
      </motion.section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9 }}>
          <div className="section-label">Movimento por região</div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#718096', fontSize: 10, fontWeight: 750 }}>
            <Clock3 size={13} />
            {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <AnimatePresence>
          {rankedHeat.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="surface" style={{ padding: '22px 18px', boxShadow: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', flex: '0 0 42px', borderRadius: 8, background: '#edf5f8', color: '#008fc0' }}>
                  <Activity size={21} />
                </div>
                <div>
                  <div style={{ color: '#132238', fontSize: 14, fontWeight: 900 }}>Sem concentração de pedidos agora</div>
                  <div style={{ marginTop: 3, color: '#617089', fontSize: 12, lineHeight: 1.4, fontWeight: 600 }}>O mapa será atualizado quando houver movimento real na orla.</div>
                </div>
              </div>
            </motion.div>
          ) : (
            <div style={{ display: 'grid', gap: 9 }}>
              {rankedHeat.map((heat, index) => {
                const zone = BEACH_ZONES.find(item => item.id === heat.zoneId)
                if (!zone) return null
                const config = NIVEL_CONFIG[heat.nivel]
                return (
                  <motion.article layout key={heat.zoneId} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="surface" style={{ padding: 13, boxShadow: 'none', borderLeft: `4px solid ${config.cor}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <div style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', flex: '0 0 34px', borderRadius: 8, background: `${config.cor}12`, color: config.cor, fontSize: 13, fontWeight: 900 }}>{index + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ color: '#132238', fontSize: 14, fontWeight: 900 }}>{zone.nome}</div>
                          <span style={{ color: config.cor, fontSize: 10, fontWeight: 850 }}>{config.label}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, marginTop: 5, color: '#617089', fontSize: 11, fontWeight: 650 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ShoppingBag size={12} />{heat.pedidosHora} pedidos</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Users size={12} />{heat.ambulantesAtivos} vendedores</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><TrendingUp size={12} />{Math.round(heat.score * 100)}%</span>
                        </div>
                      </div>
                    </div>
                  </motion.article>
                )
              })}
            </div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}
