import { useEffect, useState, useCallback, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Layers, Zap, Navigation, RefreshCw } from 'lucide-react'
import {
  PRAIAGO_ZONES, PRAIA_GRANDE_CENTER, getMockHeatData,
  NIVEL_CONFIG, type Zone, type ZoneHeat,
} from '../lib/praiagoZones'

// ── Fix ícones Leaflet ───────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function mkIcon(html: string, size = 42) {
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

const ICONS = {
  restaurante: mkIcon(`<div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 6px 20px rgba(249,115,22,0.45);font-size:26px">🍽️</div>`, 48),
  entregador:  mkIcon(`<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#0284c7);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 14px rgba(14,165,233,0.5);font-size:20px">🛵</div>`),
  cliente:     mkIcon(`<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#16a34a);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 14px rgba(34,197,94,0.45);font-size:18px">📍</div>`, 38),
  ambulante:   mkIcon(`<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#7c3aed);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 14px rgba(168,85,247,0.5);font-size:18px">🥥</div>`, 38),
}

// Ponto fixo do restaurante (cidade)
const REST_POS: [number, number] = [-24.0230, -46.4320]

// ── Dados mock de agentes no mapa ────────────────────────────
type Agente = {
  id: string; tipo: 'entregador' | 'ambulante'
  nome: string; pos: [number, number]
  clientePos?: [number, number]
  status: string; zona: string; valor?: number
}

const AGENTES_INIT: Agente[] = [
  { id: 'e1', tipo: 'entregador', nome: 'Carlos M.',  pos: [-24.0195, -46.4290], clientePos: [-24.0040, -46.4100], status: 'A caminho da praia', zona: 'Boqueirão',  valor: 62 },
  { id: 'e2', tipo: 'entregador', nome: 'Lucas S.',   pos: [-24.0210, -46.4305], clientePos: [-24.0025, -46.4080], status: 'Entregando',          zona: 'Ocian',      valor: 35 },
  { id: 'a1', tipo: 'ambulante',  nome: 'Coco do João', pos: [-24.0050, -46.4105], status: 'Na praia · Online',   zona: 'Boqueirão' },
  { id: 'a2', tipo: 'ambulante',  nome: 'Mate Gelado', pos: [-23.9980, -46.4070], status: 'Na praia · Online',    zona: 'Ocian' },
]

// ── Busca rota real OSRM ─────────────────────────────────────
async function fetchRoute(from: [number, number], to: [number, number]): Promise<[number, number][]> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    const res  = await fetch(url)
    const data = await res.json()
    const coords = data.routes?.[0]?.geometry?.coordinates
    if (!coords) return []
    return coords.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number])
  } catch { return [] }
}

// ── Componente que centraliza o mapa ─────────────────────────
function FlyTo({ center, zoom }: { center: [number,number]; zoom: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo(center, zoom, { duration: 1.2 }) }, [center[0], center[1]])
  return null
}

// ── Page principal ───────────────────────────────────────────
export default function MapaPage() {
  const [agentes,    setAgentes]    = useState<Agente[]>(AGENTES_INIT)
  const [rotas,      setRotas]      = useState<Record<string, [number,number][]>>({})
  const [heatData,   setHeatData]   = useState<ZoneHeat[]>(getMockHeatData())
  const [selId,      setSelId]      = useState<string>('e1')
  const [camadas,    setCamadas]    = useState({ zonas: true, rotas: true, ambulantes: true, heatmap: true })
  const [tabMapa,    setTabMapa]    = useState<'tudo' | 'praia' | 'cidade'>('tudo')
  const [mapCenter,  setMapCenter]  = useState<[number,number]>(PRAIA_GRANDE_CENTER)
  const [mapZoom,    setMapZoom]    = useState(12)

  // Busca rotas OSRM na montagem
  const carregarRotas = useCallback((lista: Agente[]) => {
    lista.filter(a => a.tipo === 'entregador' && a.clientePos).forEach(a => {
      fetchRoute(a.pos, a.clientePos!).then(coords => {
        if (coords.length > 1) setRotas(prev => ({ ...prev, [a.id]: coords }))
      })
    })
  }, [])

  useEffect(() => {
    carregarRotas(AGENTES_INIT)

    // Escuta GPS real via BroadcastChannel
    const channels = [
      new BroadcastChannel('praiago:entregador:gps'),
      new BroadcastChannel('praiago:ambulante:gps'),
    ]
    channels.forEach((ch, i) => {
      ch.onmessage = (e) => {
        setAgentes(prev => prev.map((a, idx) => {
          if (idx === i) return { ...a, pos: [e.data.lat, e.data.lng] }
          return a
        }))
      }
    })
    return () => channels.forEach(c => c.close())
  }, [carregarRotas])

  // Simula movimento dos entregadores (GPS em tempo real mockado)
  useEffect(() => {
    const interval = setInterval(() => {
      setAgentes(prev => prev.map(a => {
        if (a.tipo !== 'entregador' || !a.clientePos) return a
        const step = 0.04
        const newPos: [number,number] = [
          a.pos[0] + (a.clientePos[0] - a.pos[0]) * step,
          a.pos[1] + (a.clientePos[1] - a.pos[1]) * step,
        ]
        return { ...a, pos: newPos }
      }))
    }, 2500)
    const routeTimer = setInterval(() => {
      setAgentes(curr => { carregarRotas(curr); return curr })
    }, 20000)
    return () => { clearInterval(interval); clearInterval(routeTimer) }
  }, [carregarRotas])

  // Simula atualização do heatmap
  useEffect(() => {
    const timer = setInterval(() => {
      setHeatData(getMockHeatData().map(h => ({
        ...h, score: Math.min(1, Math.max(0, h.score + (Math.random() - 0.5) * 0.05)),
      })))
    }, 8000)
    return () => clearInterval(timer)
  }, [])

  const agentesSelecionado = agentes.find(a => a.id === selId)

  // Zonas visíveis por tab
  const zonasFiltradas = PRAIAGO_ZONES.filter(z => {
    if (tabMapa === 'praia')   return z.tipo === 'praia'
    if (tabMapa === 'cidade')  return z.tipo === 'cidade'
    return true
  })

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div style={{ padding: '16px 28px 14px', background: '#fff', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0 }}>Zonas Ao Vivo</h1>
            <p style={{ fontSize: 12, color: '#64748b', margin: '3px 0 0' }}>
              GPS em tempo real · Cidade & Praia Grande, SP
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Tab cidade/praia/tudo */}
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 14, padding: 3 }}>
              {(['tudo','cidade','praia'] as const).map(t => (
                <button key={t} onClick={() => {
                  setTabMapa(t)
                  if (t === 'praia')  { setMapCenter([-24.0200, -46.4120]); setMapZoom(13) }
                  if (t === 'cidade') { setMapCenter([-24.0230, -46.4460]); setMapZoom(14) }
                  if (t === 'tudo')   { setMapCenter(PRAIA_GRANDE_CENTER);  setMapZoom(12) }
                }} style={{
                  padding: '7px 16px', borderRadius: 11, border: 'none', cursor: 'pointer',
                  background: tabMapa === t ? '#0f172a' : 'transparent',
                  color: tabMapa === t ? '#fff' : '#64748b',
                  fontSize: 12, fontWeight: 700, textTransform: 'capitalize',
                }}>
                  {t === 'tudo' ? '🗺️ Tudo' : t === 'cidade' ? '🏙️ Cidade' : '🏖️ Praia'}
                </button>
              ))}
            </div>

            {/* Indicador ao vivo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#f0fdf4', padding: '8px 14px', borderRadius: 12, border: '1px solid #bbf7d0' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.25)' }} />
              <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>
                {agentes.length} agentes online
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar esquerda ──────────────────────────────── */}
        <div style={{ width: 300, background: '#fff', borderRight: '1px solid #e2e8f0', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>

          {/* Heatmap das zonas */}
          <div style={{ padding: '16px 16px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              ⚡ Zonas por Demanda
            </div>

            {heatData.slice(0, 6).map(h => {
              const zone = PRAIAGO_ZONES.find(z => z.id === h.zoneId)
              if (!zone) return null
              const cfg = NIVEL_CONFIG[h.nivel]
              return (
                <div key={h.zoneId}
                  onClick={() => {
                    const centro = zone.poligono.reduce(
                      (acc, [lat, lng]) => [acc[0] + lat / zone.poligono.length, acc[1] + lng / zone.poligono.length],
                      [0, 0]
                    ) as [number, number]
                    setMapCenter(centro); setMapZoom(15)
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 14, marginBottom: 6, cursor: 'pointer',
                    background: cfg.corFill, border: `1px solid ${cfg.cor}30`,
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{zone.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      <span style={{ color: '#0f172a' }}>{zone.nome}</span>
                      <span style={{ color: cfg.cor, fontSize: 11 }}>{cfg.emoji} {h.pedidosHora}/h</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.5)', borderRadius: 10 }}>
                      <div style={{ height: '100%', width: `${h.score * 100}%`, background: cfg.cor, borderRadius: 10, transition: 'width 1s' }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ height: 1, background: '#f1f5f9', margin: '4px 16px' }} />

          {/* Lista de agentes */}
          <div style={{ padding: '12px 16px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              🛵 Agentes no Campo
            </div>
          </div>

          {agentes.map(a => (
            <button key={a.id} onClick={() => {
              setSelId(a.id)
              setMapCenter(a.pos)
              setMapZoom(15)
            }} style={{
              width: '100%', textAlign: 'left', border: 'none',
              background: selId === a.id ? '#f8fafc' : 'transparent',
              borderLeft: selId === a.id ? '3px solid #f97316' : '3px solid transparent',
              padding: '12px 16px', cursor: 'pointer',
              borderBottom: '1px solid #f8fafc',
              transition: 'all 0.15s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{a.tipo === 'entregador' ? '🛵' : '🥥'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{a.nome}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{a.status}</div>
                  <div style={{ fontSize: 10, color: '#94a3b8' }}>📍 {a.zona}</div>
                </div>
                {a.valor && (
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#f97316' }}>R$ {a.valor}</span>
                )}
              </div>
            </button>
          ))}

          {/* Camadas */}
          <div style={{ padding: '16px', marginTop: 'auto', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              <Layers size={11} style={{ marginRight: 4 }} />Camadas
            </div>
            {Object.entries(camadas).map(([key, val]) => {
              const labels: Record<string, string> = {
                zonas: '🗺️ Polígonos de zonas',
                rotas: '📍 Rotas OSRM',
                ambulantes: '🥥 Ambulantes',
                heatmap: '🔥 Heatmap',
              }
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#475569' }}>{labels[key]}</span>
                  <button onClick={() => setCamadas(c => ({ ...c, [key]: !val }))} style={{
                    width: 36, height: 20, borderRadius: 10, border: 'none',
                    background: val ? '#f97316' : '#e2e8f0', position: 'relative', cursor: 'pointer',
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3, left: val ? 19 : 3,
                      transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Mapa ──────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative' }}>
          <MapContainer
            center={PRAIA_GRANDE_CENTER} zoom={12}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <FlyTo center={mapCenter} zoom={mapZoom} />

            <TileLayer
              attribution='&copy; <a href="https://carto.com">CARTO</a> &copy; OpenStreetMap'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
            />

            {/* ── Polígonos de zonas ──────────────────────── */}
            {camadas.zonas && zonasFiltradas.map(zone => {
              const heat = heatData.find(h => h.zoneId === zone.id)
              const cfg  = heat ? NIVEL_CONFIG[heat.nivel] : null
              const fillColor = heat && camadas.heatmap ? cfg!.cor : zone.corMapa
              const fillOpacity = heat && camadas.heatmap ? heat.score * 0.45 : 0.2
              return (
                <Polygon
                  key={zone.id}
                  positions={zone.poligono as [number,number][]}
                  pathOptions={{
                    color: heat && camadas.heatmap ? cfg!.cor : zone.cor,
                    fillColor, fillOpacity,
                    weight: 2, dashArray: zone.tipo === 'acesso' ? '6 4' : undefined,
                  }}
                >
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <b style={{ fontSize: 14 }}>{zone.emoji} {zone.nome}</b>
                      <br />
                      <span style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{zone.tipo}</span>
                      {heat && (
                        <div style={{ marginTop: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: cfg!.cor }}>
                            {cfg!.emoji} {cfg!.label}
                          </span>
                          <br />
                          <span style={{ fontSize: 11, color: '#475569' }}>{heat.pedidosHora} pedidos/h</span>
                          <br />
                          <span style={{ fontSize: 11, color: '#475569' }}>{heat.ambulantesAtivos} ambulantes ativos</span>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Polygon>
              )
            })}

            {/* ── Restaurante ─────────────────────────────── */}
            <Marker position={REST_POS} icon={ICONS.restaurante}>
              <Popup>
                <b>🍽️ Restaurante Maré</b><br />
                <span style={{ fontSize: 11 }}>Av. Costa e Silva · Centro</span>
              </Popup>
            </Marker>

            {/* ── Entregadores + rotas ──────────────────── */}
            {agentes.filter(a => a.tipo === 'entregador').map(a => {
              const rota  = camadas.rotas ? (rotas[a.id] ?? []) : []
              const isSel = a.id === selId
              return (
                <Fragment key={a.id}>
                  <Marker position={a.pos} icon={ICONS.entregador}>
                    <Popup>
                      <b>🛵 {a.nome}</b><br />
                      <span style={{ fontSize: 11 }}>{a.status}</span><br />
                      {a.valor && <span style={{ fontSize: 12, fontWeight: 700, color: '#f97316' }}>R$ {a.valor}</span>}
                    </Popup>
                  </Marker>

                  {a.clientePos && (
                    <Marker position={a.clientePos} icon={ICONS.cliente}>
                      <Popup><b>📍 Cliente</b><br />Na praia · {a.zona}</Popup>
                    </Marker>
                  )}

                  {/* Círculo de precisão GPS */}
                  <Circle center={a.pos} radius={25}
                    pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.15, weight: 1 }} />

                  {/* Rota real OSRM ou linha reta */}
                  {rota.length > 1 ? (
                    <Polyline positions={rota} pathOptions={{ color: '#0ea5e9', weight: isSel ? 6 : 4, opacity: isSel ? 0.9 : 0.5 }} />
                  ) : a.clientePos ? (
                    <Polyline positions={[a.pos, a.clientePos]} pathOptions={{ color: '#0ea5e9', weight: isSel ? 5 : 3, dashArray: '8 5', opacity: 0.5 }} />
                  ) : null}
                </Fragment>
              )
            })}

            {/* ── Ambulantes ────────────────────────────── */}
            {camadas.ambulantes && agentes.filter(a => a.tipo === 'ambulante').map(a => (
              <Fragment key={a.id}>
                <Marker position={a.pos} icon={ICONS.ambulante}>
                  <Popup>
                    <b>🥥 {a.nome}</b><br />
                    <span style={{ fontSize: 11 }}>{a.status}</span><br />
                    <span style={{ fontSize: 11, color: '#64748b' }}>📍 {a.zona}</span>
                  </Popup>
                </Marker>
                <Circle center={a.pos} radius={40}
                  pathOptions={{ color: '#a855f7', fillColor: '#a855f7', fillOpacity: 0.12, weight: 1 }} />
              </Fragment>
            ))}
          </MapContainer>

          {/* ── Legenda flutuante ─────────────────────────── */}
          <div style={{
            position: 'absolute', bottom: 24, right: 24, zIndex: 999,
            background: 'rgba(255,255,255,0.97)', borderRadius: 20, padding: '14px 18px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)', border: '1px solid #f1f5f9',
            minWidth: 200,
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Legenda
            </div>
            {[
              { e: '🍽️', l: 'Restaurante' },
              { e: '🛵', l: 'Entregador (GPS ao vivo)' },
              { e: '🥥', l: 'Ambulante na praia' },
              { e: '📍', l: 'Cliente (destino)' },
            ].map(({ e, l }) => (
              <div key={l} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center', fontSize: 12, color: '#475569' }}>
                <span style={{ width: 20, textAlign: 'center' }}>{e}</span> {l}
              </div>
            ))}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>Calor de demanda</div>
              {Object.entries(NIVEL_CONFIG).map(([key, cfg]) => (
                <div key={key} style={{ display: 'flex', gap: 7, marginBottom: 5, alignItems: 'center' }}>
                  <div style={{ width: 12, height: 12, borderRadius: 4, background: cfg.cor, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#475569' }}>{cfg.emoji} {cfg.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
