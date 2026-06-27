import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, useMap } from 'react-leaflet'
import { motion, AnimatePresence } from 'framer-motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Zap, Navigation, RefreshCw, ShoppingBag, Users, TrendingUp, MapPin } from 'lucide-react'
import { useGPS } from '../hooks/useGPS'
import { useOrderNotifications } from '../hooks/useOrderNotifications'
import { supabase } from '../lib/supabase'
import {
  PRAIAGO_ZONES, BEACH_ZONES, getMockHeatData, NIVEL_CONFIG,
  type ZoneHeat, PRAIA_GRANDE_CENTER,
} from '../lib/praiagoZones'

// ── Fix Leaflet icons ──────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function mkIcon(html: string, size = 44) {
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}
const myIcon = mkIcon(`<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#22c55e);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 15px rgba(34,197,94,0.5);font-size:22px;backdrop-filter:blur(4px)">🥥</div>`)
// Cliente que fez pedido comigo
const clienteIcon = mkIcon(`<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#f43f5e,#fb7185);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 15px rgba(244,63,94,0.5);font-size:19px;backdrop-filter:blur(4px)">🛒</div>`, 40)

// Centraliza mapa na posição do usuário
function FlyTo({ pos }: { pos: [number, number] }) {
  const map = useMap()
  useEffect(() => { map.flyTo(pos, 15, { duration: 1.0 }) }, [pos[0], pos[1]])
  return null
}

// ── IA de recomendação de zona ─────────────────────────────────
function getRecomendacao(heatData: ZoneHeat[]): { zona: string; motivo: string; emoji: string; nivel: string } | null {
  const zonasPraia = heatData
    .filter(h => {
      const z = PRAIAGO_ZONES.find(z => z.id === h.zoneId)
      return z?.tipo === 'praia'
    })
    .sort((a, b) => {
      // Prefere zonas quentes mas não superlotadas de ambulantes
      const scoreA = a.score - a.ambulantesAtivos * 0.1
      const scoreB = b.score - b.ambulantesAtivos * 0.1
      return scoreB - scoreA
    })

  if (zonasPraia.length === 0) return null

  const melhor = zonasPraia[0]
  const zona   = PRAIAGO_ZONES.find(z => z.id === melhor.zoneId)
  const cfg    = NIVEL_CONFIG[melhor.nivel]

  if (!zona) return null

  const motivos = {
    explosivo: `${melhor.pedidosHora} pedidos/h · demanda altíssima!`,
    quente:    `${melhor.pedidosHora} pedidos/h · boa demanda agora`,
    morno:     `${melhor.pedidosHora} pedidos/h · movimento moderado`,
    frio:      `Pouco movimento · tente outra zona`,
  }

  return {
    zona:   zona.nome,
    motivo: motivos[melhor.nivel],
    emoji:  zona.emoji,
    nivel:  cfg.label,
  }
}

export default function ZonasPage() {
  const { data: gpsData, status: gpsStatus } = useGPS()
  const { orders } = useOrderNotifications()           // clientes que pediram comigo
  const [heatData, setHeatData] = useState<ZoneHeat[]>(getMockHeatData())
  const [lastUpdate, setLastUpdate] = useState(new Date())

  const myPos: [number, number] = gpsData ? [gpsData.lat, gpsData.lng] : PRAIA_GRANDE_CENTER

  // O Cérebro IA (Agente Node.js) vai enviar o Heatmap processado pra cá!
  useEffect(() => {
    const channel = supabase.channel('radar_ia')
      .on('broadcast', { event: 'heat_update' }, (payload) => {
        if (payload.payload && Array.isArray(payload.payload)) {
          setHeatData(payload.payload)
          setLastUpdate(new Date())
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const recomendacao = getRecomendacao(heatData)

  // Ambulante atua SOMENTE na praia
  const zonasFiltradas = BEACH_ZONES
  const beachIds = new Set(BEACH_ZONES.map(z => z.id))
  const heatOrdenado = [...heatData]
    .filter(h => beachIds.has(h.zoneId))
    .sort((a, b) => b.score - a.score)

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 100 }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(14,165,233,0.2) 0%, rgba(34,197,94,0.2) 100%)',
        padding: '24px 20px 30px',
        position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{ position: 'absolute', top: -50, left: -50, width: 200, height: 200, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(34,197,94,0.2))', filter: 'blur(40px)' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#4ade80', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>
                ⚡ PraiaGo Zones
              </div>
              <h1 style={{ fontSize: 24, fontWeight: 900, color: '#f8fafc', letterSpacing: -0.5, margin: 0 }}>
                Radar de Demanda
              </h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className={gpsStatus === 'active' ? "animate-pulse-neon" : ""} style={{ width: 8, height: 8, borderRadius: '50%', background: gpsStatus === 'active' ? '#4ade80' : '#64748b' }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: gpsStatus === 'active' ? '#4ade80' : '#64748b' }}>
                  {gpsStatus === 'active' ? `GPS ±${Math.round(gpsData?.accuracy ?? 0)}m` : 'GPS...'}
                </span>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <RefreshCw size={12} color="#f8fafc" className="animate-spin-slow" />
                <span style={{ fontSize: 10, fontWeight: 800, color: '#f8fafc' }}>IA SYNC</span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 11, color: '#94a3b8', margin: 0, fontWeight: 500 }}>
            Satélite atualizado: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginTop: 16, position: 'relative', zIndex: 10 }}>

        {/* ── Card de Recomendação da IA ─────────────────── */}
        <AnimatePresence mode="wait">
        {recomendacao && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel" style={{
            borderRadius: 24, padding: '20px',
            marginBottom: 20, position: 'relative', overflow: 'hidden',
            border: '1px solid rgba(34,197,94,0.3)',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: '50%', background: '#22c55e', opacity: 0.1, filter: 'blur(20px)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div className="neon-border" style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={16} color="#4ade80" />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 900, color: '#4ade80', letterSpacing: 1.2, textTransform: 'uppercase' }}>Agente IA · Sugestão</div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Sinais de calor na orla</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, border: '1px solid rgba(255,255,255,0.1)' }}>
                {recomendacao.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc' }}>Alvo: {recomendacao.zona}</div>
                <div style={{ fontSize: 12, color: '#4ade80', marginTop: 4, fontWeight: 700 }}>{recomendacao.motivo}</div>
              </div>
              <motion.button whileTap={{ scale: 0.95 }} style={{
                background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
                border: 'none', borderRadius: 16, padding: '12px 20px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 4px 15px rgba(34,197,94,0.3)'
              }}>
                <Navigation size={16} color="#fff" />
                <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>IR</span>
              </motion.button>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* ── Clientes que pediram comigo ─────────────────── */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 20, padding: '16px', marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(244,63,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, border: '1px solid rgba(244,63,94,0.2)' }}>🛒</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc' }}>
              {orders.length} cliente{orders.length === 1 ? '' : 's'} no radar
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>Eles aparecem no mapa após pedirem</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '4px 10px' }}>
            <span style={{ fontSize: 10, fontWeight: 900, color: '#4ade80', textTransform: 'uppercase' }}>Ativo</span>
          </div>
        </motion.div>

        {/* ── Mapa ──────────────────────────────────────── */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 20, border: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
          <MapContainer
            center={myPos} zoom={13}
            style={{ height: 320, width: '100%' }}
            zoomControl={false}
          >
            {/* Dark map style */}
            <TileLayer
              attribution='&copy; <a href="https://carto.com">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
            />

            {gpsStatus === 'active' && <FlyTo pos={myPos} />}

            {/* Zonas coloridas por demanda */}
            {zonasFiltradas.map(zone => {
              const heat = heatData.find(h => h.zoneId === zone.id)
              const cfg  = heat ? NIVEL_CONFIG[heat.nivel] : null
              return (
                <Polygon
                  key={zone.id}
                  positions={zone.poligono as [number, number][]}
                  pathOptions={{
                    color: cfg ? cfg.cor : zone.cor,
                    fillColor: cfg ? cfg.cor : zone.cor,
                    fillOpacity: heat ? heat.score * 0.55 + 0.15 : 0.2,
                    weight: 2,
                  }}
                >
                  <Popup className="dark-popup">
                    <div style={{ minWidth: 140 }}>
                      <b style={{ fontSize: 14 }}>{zone.emoji} {zone.nome}</b>
                      {heat && cfg && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ color: cfg.cor, fontWeight: 900, fontSize: 12 }}>{cfg.emoji} {cfg.label}</div>
                          <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>{heat.pedidosHora} pedidos/h</div>
                          <div style={{ fontSize: 12, color: '#cbd5e1' }}>{heat.ambulantesAtivos} ambulantes</div>
                        </div>
                      )}
                    </div>
                  </Popup>
                </Polygon>
              )
            })}

            {/* Minha posição */}
            {gpsStatus === 'active' && (
              <>
                <Marker position={myPos} icon={myIcon}>
                  <Popup className="dark-popup"><b>📍 Você está aqui</b><br />Radar ativo</Popup>
                </Marker>
                <Circle
                  center={myPos}
                  radius={gpsData?.accuracy ?? 30}
                  pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.15, weight: 1 }}
                />
              </>
            )}

            {/* Clientes que fizeram pedido comigo */}
            {orders.map(o => (
              <Marker key={o.id} position={[o.clienteLat, o.clienteLng]} icon={clienteIcon}>
                <Popup className="dark-popup">
                  <b>🛒 {o.clienteNome}</b><br />
                  {o.itens.join(', ')}<br />
                  <b style={{ color: '#4ade80' }}>R$ {o.total.toFixed(2)}</b> · {o.zona}
                  {(o.reta || o.barraca) && <><br />🏖️ {o.reta ? `Reta ${o.reta}` : ''}{o.reta && o.barraca ? ' · ' : ''}{o.barraca ? `Barraca ${o.barraca}` : ''}</>}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </motion.div>

        {/* ── Lista de Zonas ─────────────────────────────── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 16 }}>
            Zonas por Demanda
          </div>

          <AnimatePresence>
            {heatOrdenado.map((h, i) => {
              const zone = PRAIAGO_ZONES.find(z => z.id === h.zoneId)
              if (!zone) return null
              const cfg = NIVEL_CONFIG[h.nivel]

              return (
                <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} key={h.zoneId} className="glass-panel" style={{
                  borderRadius: 20, padding: '16px',
                  marginBottom: 12,
                  border: `1px solid ${cfg.cor}30`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Ícone */}
                    <div style={{
                      width: 50, height: 50, borderRadius: 16,
                      background: `${cfg.cor}15`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 26, flexShrink: 0,
                      border: `1px solid ${cfg.cor}40`,
                    }}>
                      {zone.emoji}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 900, color: '#f8fafc' }}>{zone.nome}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'capitalize', fontWeight: 600 }}>{zone.tipo}</div>
                        </div>
                        <div style={{
                          background: `${cfg.cor}15`, color: cfg.cor,
                          padding: '4px 12px', borderRadius: 12,
                          fontSize: 11, fontWeight: 900, textTransform: 'uppercase', border: `1px solid ${cfg.cor}40`
                        }}>
                          {cfg.emoji} {cfg.label}
                        </div>
                      </div>

                      {/* Barra de progresso */}
                      <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
                        <motion.div layout style={{
                          height: '100%',
                          width: `${h.score * 100}%`,
                          background: `linear-gradient(90deg, ${cfg.cor}88, ${cfg.cor})`,
                          borderRadius: 10,
                          boxShadow: `0 0 10px ${cfg.cor}`
                        }} transition={{ type: 'spring', bounce: 0, duration: 1 }} />
                      </div>

                      {/* Stats */}
                      <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <ShoppingBag size={12} color="#94a3b8" />
                          <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>{h.pedidosHora}/h</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Users size={12} color="#94a3b8" />
                          <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>{h.ambulantesAtivos} amb.</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <TrendingUp size={12} color="#94a3b8" />
                          <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 600 }}>{Math.round(h.score * 100)}% calor</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {/* ── Info GPS ───────────────────────────────────── */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="glass-panel" style={{
          borderRadius: 20, padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div className={gpsStatus === 'active' ? "neon-border" : ""} style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={22} color={gpsStatus === 'active' ? '#38bdf8' : '#64748b'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#f8fafc' }}>Sinal Satélite</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: 500 }}>
              {gpsStatus === 'active'
                ? `Lat: ${gpsData?.lat.toFixed(5)} · Lng: ${gpsData?.lng.toFixed(5)}`
                : 'Aguardando radar...'
              }
            </div>
          </div>
          <div style={{
            background: gpsStatus === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.1)',
            border: `1px solid ${gpsStatus === 'active' ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 12, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6
          }}>
            <div className={gpsStatus === 'active' ? "animate-pulse-neon" : ""} style={{ width: 6, height: 6, borderRadius: '50%', background: gpsStatus === 'active' ? '#4ade80' : '#64748b' }} />
            <span style={{ fontSize: 10, fontWeight: 900, color: gpsStatus === 'active' ? '#4ade80' : '#94a3b8' }}>
              {gpsStatus === 'active' ? 'ATIVO' : 'OFF'}
            </span>
          </div>
        </motion.div>
      </div>

      <style>{`
        .dark-popup .leaflet-popup-content-wrapper { background: rgba(15,23,42,0.9); backdrop-filter: blur(10px); color: #f8fafc; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; }
        .dark-popup .leaflet-popup-tip { background: rgba(15,23,42,0.9); }
      `}</style>
    </div>
  )
}
