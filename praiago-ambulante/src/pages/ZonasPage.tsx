import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, useMap } from 'react-leaflet'
import { motion, AnimatePresence } from 'framer-motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, RefreshCw, ShoppingBag, TrendingUp, Users } from 'lucide-react'
import { useGPS } from '../hooks/useGPS'
import { useOrderNotifications } from '../hooks/useOrderNotifications'
import { supabase } from '../lib/supabase'
import {
  BEACH_ZONES,
  NIVEL_CONFIG,
  PRAIA_GRANDE_CENTER,
  PRAIAGO_ZONES,
  getMockHeatData,
  type ZoneHeat,
} from '../lib/praiagoZones'

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function mkIcon(label: string, bg: string) {
  return L.divIcon({
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    html: `<div style="width:42px;height:42px;border-radius:16px;background:${bg};display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,.9);box-shadow:0 12px 28px rgba(15,23,42,.18);font-size:20px">${label}</div>`,
  })
}

const vendedorIcon = mkIcon('V', 'linear-gradient(135deg,#22c55e,#0ea5e9)')
const clienteIcon = mkIcon('P', 'linear-gradient(135deg,#f43f5e,#fb7185)')

function FlyTo({ pos }: { pos: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.flyTo(pos, 14, { duration: 0.9 })
  }, [map, pos])
  return null
}

export default function ZonasPage() {
  const { data: gpsData, status: gpsStatus } = useGPS()
  const { orders } = useOrderNotifications()
  const [heatData, setHeatData] = useState<ZoneHeat[]>(getMockHeatData())
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const myPos: [number, number] = gpsData ? [gpsData.lat, gpsData.lng] : PRAIA_GRANDE_CENTER
  const beachIds = useMemo(() => new Set(BEACH_ZONES.map(z => z.id)), [])
  const heatOrdenado = useMemo(
    () => [...heatData].filter(h => beachIds.has(h.zoneId)).sort((a, b) => b.score - a.score),
    [beachIds, heatData],
  )

  useEffect(() => {
    const channel = supabase.channel('radar_demanda')
      .on('broadcast', { event: 'heat_update' }, payload => {
        if (Array.isArray(payload.payload)) {
          setHeatData(payload.payload)
          setLastUpdate(new Date())
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return (
    <div style={{ minHeight: '100vh', padding: '20px 20px 104px' }}>
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel"
        style={{
          borderRadius: 26,
          padding: 20,
          marginBottom: 18,
          border: '1px solid rgba(14,165,233,.14)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.2, color: '#0ea5e9', textTransform: 'uppercase' }}>
              Zonas PraiaGo
            </div>
            <h1 style={{ margin: '4px 0 6px', fontSize: 28, lineHeight: 1.05, fontWeight: 950, color: '#0f172a' }}>
              Radar de demanda
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              Baseado somente em pedidos e vendedores reais.
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 999,
              background: gpsStatus === 'active' ? 'rgba(34,197,94,.12)' : 'rgba(100,116,139,.12)',
              border: `1px solid ${gpsStatus === 'active' ? 'rgba(34,197,94,.25)' : 'rgba(100,116,139,.2)'}`,
              color: gpsStatus === 'active' ? '#16a34a' : '#64748b',
              fontSize: 12,
              fontWeight: 900,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: gpsStatus === 'active' ? '#22c55e' : '#94a3b8',
                boxShadow: gpsStatus === 'active' ? '0 0 0 5px rgba(34,197,94,.12)' : 'none',
              }} />
              {gpsStatus === 'active' ? `GPS ${Math.round(gpsData?.accuracy ?? 0)}m` : 'GPS buscando'}
            </div>
            <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 11, fontWeight: 700 }}>
              Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      </motion.header>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel"
        style={{ borderRadius: 24, padding: 16, marginBottom: 18 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 16,
            background: 'linear-gradient(135deg,rgba(244,63,94,.14),rgba(14,165,233,.10))',
            display: 'grid',
            placeItems: 'center',
            color: '#f43f5e',
          }}>
            <ShoppingBag size={21} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>
              {orders.length} cliente{orders.length === 1 ? '' : 's'} no radar
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              Pedidos aparecem aqui quando forem feitos para sua loja.
            </div>
          </div>
          <div style={{
            borderRadius: 999,
            padding: '6px 10px',
            background: 'rgba(34,197,94,.12)',
            color: '#16a34a',
            fontSize: 11,
            fontWeight: 900,
            border: '1px solid rgba(34,197,94,.20)',
          }}>
            Ao vivo
          </div>
        </div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        style={{
          borderRadius: 28,
          overflow: 'hidden',
          marginBottom: 18,
          border: '1px solid rgba(15,23,42,.08)',
          boxShadow: '0 20px 50px rgba(15,23,42,.12)',
        }}
      >
        <MapContainer center={myPos} zoom={13} style={{ height: 350, width: '100%' }} zoomControl={false}>
          <TileLayer
            attribution='&copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
          />

          {gpsStatus === 'active' && <FlyTo pos={myPos} />}

          {BEACH_ZONES.map(zone => {
            const heat = heatData.find(h => h.zoneId === zone.id)
            const cfg = heat ? NIVEL_CONFIG[heat.nivel] : null
            const score = heat?.score ?? 0

            return (
              <Polygon
                key={zone.id}
                positions={zone.poligono as [number, number][]}
                pathOptions={{
                  color: cfg?.cor ?? zone.cor,
                  fillColor: cfg?.cor ?? zone.cor,
                  fillOpacity: score > 0 ? score * 0.45 + 0.12 : 0.1,
                  weight: 2,
                }}
              >
                <Popup>
                  <div style={{ minWidth: 150 }}>
                    <strong>{zone.nome}</strong>
                    <div style={{ marginTop: 6, color: cfg?.cor ?? '#64748b', fontWeight: 800 }}>
                      {cfg?.label ?? 'Sem movimento'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{heat?.pedidosHora ?? 0} pedidos/h</div>
                  </div>
                </Popup>
              </Polygon>
            )
          })}

          {gpsStatus === 'active' && (
            <>
              <Marker position={myPos} icon={vendedorIcon}>
                <Popup>Voce esta aqui</Popup>
              </Marker>
              <Circle
                center={myPos}
                radius={gpsData?.accuracy ?? 30}
                pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.15, weight: 1 }}
              />
            </>
          )}

          {orders.map(o => (
            <Marker key={o.id} position={[o.clienteLat, o.clienteLng]} icon={clienteIcon}>
              <Popup>
                <strong>{o.clienteNome}</strong>
                <br />
                {o.itens.join(', ')}
                <br />
                R$ {o.total.toFixed(2)}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </motion.section>

      <section style={{ marginBottom: 18 }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 12, fontWeight: 950, color: '#64748b', letterSpacing: 1.1, textTransform: 'uppercase' }}>
            Zonas por demanda
          </div>
          <RefreshCw size={15} color="#0ea5e9" className="animate-spin-slow" />
        </div>

        <AnimatePresence>
          {heatOrdenado.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel"
              style={{ borderRadius: 22, padding: 18, color: '#64748b', fontWeight: 700, textAlign: 'center' }}
            >
              Aguardando pedidos reais para calcular demanda.
            </motion.div>
          ) : (
            heatOrdenado.map((h, i) => {
              const zone = PRAIAGO_ZONES.find(z => z.id === h.zoneId)
              if (!zone) return null
              const cfg = NIVEL_CONFIG[h.nivel]

              return (
                <motion.div
                  layout
                  key={h.zoneId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="glass-panel"
                  style={{ borderRadius: 22, padding: 16, marginBottom: 12, border: `1px solid ${cfg.cor}33` }}
                >
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: 17,
                      display: 'grid',
                      placeItems: 'center',
                      background: `${cfg.cor}18`,
                      color: cfg.cor,
                      fontWeight: 950,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                        <div>
                          <div style={{ color: '#0f172a', fontSize: 16, fontWeight: 950 }}>{zone.nome}</div>
                          <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>{h.pedidosHora} pedidos na ultima hora</div>
                        </div>
                        <div style={{
                          color: cfg.cor,
                          background: `${cfg.cor}14`,
                          border: `1px solid ${cfg.cor}30`,
                          borderRadius: 999,
                          padding: '5px 10px',
                          height: 28,
                          fontSize: 11,
                          fontWeight: 950,
                          whiteSpace: 'nowrap',
                        }}>
                          {cfg.label}
                        </div>
                      </div>

                      <div style={{ height: 7, borderRadius: 999, background: 'rgba(15,23,42,.07)', overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.round(h.score * 100)}%` }}
                          style={{ height: '100%', borderRadius: 999, background: `linear-gradient(90deg, ${cfg.cor}99, ${cfg.cor})` }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 14, marginTop: 10, color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Users size={13} /> {h.ambulantesAtivos} vendedores</span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><TrendingUp size={13} /> {Math.round(h.score * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel"
        style={{ borderRadius: 22, padding: 16, display: 'flex', gap: 14, alignItems: 'center' }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'rgba(14,165,233,.12)' }}>
          <MapPin size={22} color="#0ea5e9" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: '#0f172a', fontSize: 14, fontWeight: 950 }}>Sinal GPS</div>
          <div style={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>
            {gpsStatus === 'active'
              ? `Lat ${gpsData?.lat.toFixed(5)} / Lng ${gpsData?.lng.toFixed(5)}`
              : 'Aguardando permissao de localizacao'}
          </div>
        </div>
        <div style={{
          borderRadius: 999,
          padding: '6px 10px',
          color: gpsStatus === 'active' ? '#16a34a' : '#64748b',
          background: gpsStatus === 'active' ? 'rgba(34,197,94,.12)' : 'rgba(100,116,139,.12)',
          fontSize: 11,
          fontWeight: 950,
        }}>
          {gpsStatus === 'active' ? 'Ativo' : 'Off'}
        </div>
      </motion.section>
    </div>
  )
}
