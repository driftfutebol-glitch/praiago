import { useEffect, useState, Fragment } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Layers, Zap, Navigation, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  PRAIAGO_ZONES, PRAIA_GRANDE_CENTER,
  NIVEL_CONFIG, type ZoneHeat,
} from '../lib/praiagoZones'
import { supabase } from '../lib/supabase'

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
  restaurante: mkIcon(`<div style="width:48px;height:48px;border-radius:14px;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;border:2px solid #1e293b;box-shadow:0 0 20px rgba(249,115,22,0.6);font-size:26px">🍽️</div>`, 48),
  entregador:  mkIcon(`<div style="width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#0284c7);display:flex;align-items:center;justify-content:center;border:2px solid #1e293b;box-shadow:0 0 15px rgba(14,165,233,0.6);font-size:20px">🛵</div>`),
  cliente:     mkIcon(`<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#16a34a);display:flex;align-items:center;justify-content:center;border:2px solid #1e293b;box-shadow:0 0 15px rgba(34,197,94,0.6);font-size:18px">📍</div>`, 38),
  ambulante:   mkIcon(`<div style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#a855f7,#7c3aed);display:flex;align-items:center;justify-content:center;border:2px solid #1e293b;box-shadow:0 0 15px rgba(168,85,247,0.6);font-size:18px">🥥</div>`, 38),
}

// Fallback em terra (orla de Praia Grande) — usado só se o GPS for negado.
const REST_POS: [number, number] = [-24.0100, -46.4150]

type Operador = {
  id: string; tipo: 'entregador' | 'ambulante'
  nome: string; pos: [number, number]
  clientePos?: [number, number]
  status: string; zona: string; valor?: number
}

// ── Componente que centraliza o mapa ─────────────────────────
function FlyTo({ center, zoom }: { center: [number,number]; zoom: number }) {
  const map = useMap()
  useEffect(() => { map.flyTo(center, zoom, { duration: 1.2 }) }, [center[0], center[1], zoom])
  return null
}

export default function MapaPage() {
  const [operadores, setOperadores] = useState<Operador[]>([])
  const [heatData,   setHeatData]   = useState<ZoneHeat[]>([])
  const [selId,      setSelId]      = useState<string | null>(null)
  const [camadas,    setCamadas]    = useState({ zonas: true, rotas: true, ambulantes: true, heatmap: true })
  const [tabMapa,    setTabMapa]    = useState<'tudo' | 'praia' | 'cidade'>('tudo')
  const [mapCenter,  setMapCenter]  = useState<[number,number]>(PRAIA_GRANDE_CENTER)
  const [mapZoom,    setMapZoom]    = useState(12)
  const [restPos,    setRestPos]    = useState<[number, number]>(REST_POS)

  // Localização REAL do restaurante (GPS do dispositivo) — sem ponto fantasma fixo
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      p => {
        const pos: [number, number] = [p.coords.latitude, p.coords.longitude]
        setRestPos(pos); setMapCenter(pos); setMapZoom(15)
      },
      () => { /* permissão negada → mantém o fallback em terra */ },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    )
  }, [])

  // Escuta GPS real via Supabase (Realtime) e Broadcast
  useEffect(() => {
    // 1. Ouvir BroadcastChannel para testes locais de desenvolvimento
    const channels = [
      new BroadcastChannel('praiago:entregador:gps'),
      new BroadcastChannel('praiago:ambulante:gps'),
    ]

    channels.forEach(ch => {
      ch.onmessage = (e) => {
        const operador: Operador = {
          id: e.data.id || String(Math.random()),
          nome: e.data.nome || 'Equipe',
          tipo: e.data.emoji === '🥥' ? 'ambulante' : 'entregador',
          pos: [e.data.lat, e.data.lng],
          status: e.data.aberto ? 'Online' : 'Trabalhando',
          zona: e.data.zona || 'Desconhecida'
        }
        setOperadores(prev => {
          const idx = prev.findIndex(a => a.id === operador.id)
          if (idx >= 0) {
            const copy = [...prev]
            copy[idx] = operador
            return copy
          }
          return [...prev, operador]
        })
      }
    })

    // 2. Ouvir atualizações de heatmap via Supabase (se houver)
    const supChannel = supabase.channel('radar_ia')
      .on('broadcast', { event: 'heat_update' }, (payload) => {
         if (payload && Array.isArray(payload.payload)) {
           setHeatData(payload.payload)
         }
      })
      .subscribe()

    return () => {
      channels.forEach(c => c.close())
      supabase.removeChannel(supChannel)
    }
  }, [])

  const zonasFiltradas = PRAIAGO_ZONES.filter(z => {
    if (tabMapa === 'praia')   return z.tipo === 'praia'
    if (tabMapa === 'cidade')  return z.tipo === 'cidade'
    return true
  })

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .leaflet-layer,
      .leaflet-control-zoom-in,
      .leaflet-control-zoom-out,
      .leaflet-control-attribution {
        filter: invert(100%) hue-rotate(180deg) brightness(85%) contrast(100%);
      }
      .leaflet-popup-content-wrapper, .leaflet-popup-tip {
        background: rgba(255,255,255,0.95);
        color: #f8fafc;
        border: 1px solid rgba(249,115,22,0.3);
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div style={{ padding: '20px 32px', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(0,0,0,0.05)', flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Navigation size={24} color="#f97316" /> Radar Tático Ao Vivo
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0', fontWeight: 500 }}>
              Acompanhe entregas e ambulantes em tempo real
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Tab cidade/praia/tudo */}
            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.05)', borderRadius: 16, padding: 4, border: '1px solid rgba(0,0,0,0.08)' }}>
              {(['tudo','cidade','praia'] as const).map(t => (
                <button key={t} onClick={() => {
                  setTabMapa(t)
                  if (t === 'praia')  { setMapCenter([-24.0200, -46.4120]); setMapZoom(13) }
                  if (t === 'cidade') { setMapCenter([-24.0230, -46.4460]); setMapZoom(14) }
                  if (t === 'tudo')   { setMapCenter(PRAIA_GRANDE_CENTER);  setMapZoom(12) }
                }} style={{
                  padding: '8px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: tabMapa === t ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'transparent',
                  color: tabMapa === t ? '#fff' : '#94a3b8',
                  fontSize: 13, fontWeight: 800, textTransform: 'capitalize',
                  boxShadow: tabMapa === t ? '0 4px 15px rgba(249,115,22,0.3)' : 'none',
                  transition: 'all 0.2s',
                }}>
                  {t === 'tudo' ? '🗺️ TUDO' : t === 'cidade' ? '🏙️ CIDADE' : '🏖️ PRAIA'}
                </button>
              ))}
            </div>

            {/* Indicador ao vivo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.1)', padding: '10px 18px', borderRadius: 16, border: '1px solid rgba(34,197,94,0.2)' }}>
              <div className="animate-pulse-neon" style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 10px #4ade80' }} />
              <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 800, letterSpacing: 0.5 }}>
                {operadores.length} NA RUA AGORA
              </span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Sidebar esquerda ──────────────────────────────── */}
        <div className="glass-panel" style={{ width: 340, borderRight: '1px solid rgba(0,0,0,0.05)', overflowY: 'auto', flexShrink: 0, display: 'flex', flexDirection: 'column', zIndex: 10 }}>

          {/* Heatmap das zonas */}
          <div style={{ padding: '24px 24px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={14} color="#f97316" /> DEMANDA REAL (Heatmap)
            </div>

            {heatData.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(0,0,0,0.05)' }}>
                Nenhum dado térmico no momento.
                <br/>Aguardando atividade nas zonas.
              </div>
            ) : (
              heatData.slice(0, 6).map(h => {
                const zone = PRAIAGO_ZONES.find(z => z.id === h.zoneId)
                if (!zone) return null
                const cfg = NIVEL_CONFIG[h.nivel]
                return (
                  <motion.div whileHover={{ scale: 1.02 }} key={h.zoneId}
                    onClick={() => {
                      const centro = zone.poligono.reduce(
                        (acc, [lat, lng]) => [acc[0] + lat / zone.poligono.length, acc[1] + lng / zone.poligono.length],
                        [0, 0]
                      ) as [number, number]
                      setMapCenter(centro); setMapZoom(15)
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '14px',
                      borderRadius: 16, marginBottom: 10, cursor: 'pointer',
                      background: 'rgba(255,255,255,0.02)', border: `1px solid ${cfg.cor}40`,
                      transition: 'all 0.2s', boxShadow: `0 4px 15px rgba(0,0,0,0.2), inset 0 0 10px ${cfg.cor}10`
                    }}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                      {zone.emoji}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                        <span style={{ color: '#0f172a' }}>{zone.nome}</span>
                        <span style={{ color: cfg.cor, fontSize: 11, textShadow: `0 0 10px ${cfg.cor}50` }}>{cfg.emoji} {h.pedidosHora}/h</span>
                      </div>
                      <div style={{ height: 6, background: 'rgba(0,0,0,0.05)', borderRadius: 10, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${h.score * 100}%`, background: cfg.cor, borderRadius: 10, transition: 'width 1s', boxShadow: `0 0 10px ${cfg.cor}` }} />
                      </div>
                    </div>
                  </motion.div>
                )
              })
            )}
          </div>

          <div style={{ height: 1, background: 'rgba(0,0,0,0.05)', margin: '4px 24px' }} />

          {/* Lista da equipe em campo */}
          <div style={{ padding: '20px 24px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
              🛵 EQUIPE NA RUA
            </div>
            {operadores.length === 0 && (
              <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(0,0,0,0.05)' }}>
                Nenhum entregador ou ambulante enviando GPS no momento.
              </div>
            )}
          </div>

          {operadores.map(a => (
            <button key={a.id} onClick={() => {
              setSelId(a.id)
              setMapCenter(a.pos)
              setMapZoom(16)
            }} style={{
              width: '100%', textAlign: 'left', border: 'none',
              background: selId === a.id ? 'rgba(249,115,22,0.1)' : 'transparent',
              borderLeft: selId === a.id ? '4px solid #f97316' : '4px solid transparent',
              padding: '16px 24px', cursor: 'pointer',
              borderBottom: '1px solid rgba(255,255,255,0.02)',
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, border: '1px solid rgba(0,0,0,0.05)' }}>
                  {a.tipo === 'entregador' ? '🛵' : '🥥'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{a.nome}</div>
                  <div style={{ fontSize: 12, color: '#334155', marginTop: 4, fontWeight: 500 }}>{a.status}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} /> {a.zona}
                  </div>
                </div>
              </div>
            </button>
          ))}

          {/* Camadas */}
          <div style={{ padding: '24px', marginTop: 'auto', borderTop: '1px solid rgba(0,0,0,0.05)', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={14} /> CAMADAS
            </div>
            {Object.entries(camadas).map(([key, val]) => {
              const labels: Record<string, string> = {
                zonas: '🗺️ Polígonos de zonas',
                rotas: '📍 Rotas e destinos',
                ambulantes: '🥥 Ambulantes',
                heatmap: '🔥 Heatmap (Ao vivo)',
              }
              return (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{labels[key]}</span>
                  <button onClick={() => setCamadas(c => ({ ...c, [key]: !val }))} style={{
                    width: 44, height: 24, borderRadius: 12, border: 'none',
                    background: val ? '#f97316' : 'rgba(0,0,0,0.08)', position: 'relative', cursor: 'pointer',
                    boxShadow: val ? '0 0 10px rgba(249,115,22,0.4)' : 'inset 0 2px 4px rgba(0,0,0,0.3)'
                  }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3, left: val ? 23 : 3,
                      transition: 'left 0.2s', boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
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
            style={{ height: '100%', width: '100%', background: '#ffffff' }}
            zoomControl={true}
          >
            <FlyTo center={mapCenter} zoom={mapZoom} />

            <TileLayer
              attribution='&copy; <a href="https://carto.com">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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
                        <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.05)', padding: 10, borderRadius: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: cfg!.cor }}>
                            {cfg!.emoji} {cfg!.label.toUpperCase()}
                          </span>
                          <br />
                          <span style={{ fontSize: 12, color: '#334155', display: 'block', marginTop: 4 }}>⚡ {heat.pedidosHora} pedidos/h</span>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Polygon>
              )
            })}

            {/* ── Restaurante ─────────────────────────────── */}
            <Marker position={restPos} icon={ICONS.restaurante}>
              <Popup>
                <b>🍽️ Seu restaurante</b><br />
                <span style={{ fontSize: 11, color: '#64748b' }}>Sua localização atual (GPS)</span>
              </Popup>
            </Marker>

            {/* ── Entregadores + rotas ──────────────────── */}
            {operadores.filter(a => a.tipo === 'entregador').map(a => {
              const isSel = a.id === selId
              return (
                <Fragment key={a.id}>
                  <Marker position={a.pos} icon={ICONS.entregador}>
                    <Popup>
                      <b>🛵 {a.nome}</b><br />
                      <span style={{ fontSize: 12, color: '#334155' }}>{a.status}</span>
                    </Popup>
                  </Marker>

                  {a.clientePos && (
                    <Marker position={a.clientePos} icon={ICONS.cliente}>
                      <Popup><b>📍 Cliente (Destino)</b><br /><span style={{color: '#64748b'}}>Em andamento</span></Popup>
                    </Marker>
                  )}

                  {/* Círculo de precisão GPS */}
                  <Circle center={a.pos} radius={40}
                    pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.15, weight: 1 }} />

                  {/* Rota (Reta de origem ao destino) */}
                  {camadas.rotas && a.clientePos && (
                    <Polyline positions={[a.pos, a.clientePos]} pathOptions={{ color: '#0ea5e9', weight: isSel ? 5 : 3, dashArray: '8 5', opacity: 0.5 }} />
                  )}
                </Fragment>
              )
            })}

            {/* ── Ambulantes ────────────────────────────── */}
            {camadas.ambulantes && operadores.filter(a => a.tipo === 'ambulante').map(a => (
              <Fragment key={a.id}>
                <Marker position={a.pos} icon={ICONS.ambulante}>
                  <Popup>
                    <b>🥥 {a.nome}</b><br />
                    <span style={{ fontSize: 12, color: '#334155' }}>{a.status}</span><br />
                    <span style={{ fontSize: 11, color: '#a855f7' }}>📍 {a.zona}</span>
                  </Popup>
                </Marker>
                <Circle center={a.pos} radius={60}
                  pathOptions={{ color: '#a855f7', fillColor: '#a855f7', fillOpacity: 0.12, weight: 1 }} />
              </Fragment>
            ))}
          </MapContainer>

          {/* ── Legenda flutuante ─────────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} style={{
            position: 'absolute', bottom: 24, right: 24, zIndex: 999,
            background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderRadius: 20, padding: '20px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.4)', border: '1px solid rgba(0,0,0,0.08)',
            minWidth: 220,
          }}>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 14 }}>
              LEGENDA TÁTICA
            </div>
            {[
              { e: '🍽️', l: 'Restaurante / Base' },
              { e: '🛵', l: 'Entregador (GPS ao vivo)' },
              { e: '🥥', l: 'Ambulante parceiro' },
              { e: '📍', l: 'Cliente (Destino)' },
            ].map(({ e, l }) => (
              <div key={l} style={{ display: 'flex', gap: 12, marginBottom: 8, alignItems: 'center', fontSize: 13, color: '#334155', fontWeight: 500 }}>
                <span style={{ width: 24, textAlign: 'center', fontSize: 16 }}>{e}</span> {l}
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

