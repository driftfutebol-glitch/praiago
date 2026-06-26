import { useState, useEffect, useCallback } from 'react'
import { MapContainer, TileLayer, Polygon, Circle, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Zap, TrendingUp, Navigation, RefreshCw, MapPin, Users, ShoppingBag } from 'lucide-react'
import { useGPS } from '../hooks/useGPS'
import { useOrderNotifications } from '../hooks/useOrderNotifications'
import {
  PRAIAGO_ZONES, BEACH_ZONES, getMockHeatData, NIVEL_CONFIG, scoreToNivel,
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
const myIcon = mkIcon(`<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#22c55e);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 16px rgba(14,165,233,0.6);font-size:22px">🧑‍🤝‍🧑</div>`)
// Cliente que fez pedido comigo
const clienteIcon = mkIcon(`<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#f43f5e,#fb7185);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 4px 14px rgba(244,63,94,0.5);font-size:19px">🛒</div>`, 40)

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

  // Simula atualização automática do heatmap (IA agente)
  const refreshHeat = useCallback(() => {
    setHeatData(getMockHeatData().map(h => ({
      ...h,
      score: Math.min(1, Math.max(0, h.score + (Math.random() - 0.48) * 0.08)),
      pedidosHora: Math.max(0, h.pedidosHora + Math.floor((Math.random() - 0.5) * 5)),
    })).map(h => ({ ...h, nivel: scoreToNivel(h.score) })))
    setLastUpdate(new Date())
  }, [])

  useEffect(() => {
    const timer = setInterval(refreshHeat, 10000) // Atualiza a cada 10s
    return () => clearInterval(timer)
  }, [refreshHeat])

  const recomendacao = getRecomendacao(heatData)

  // Ambulante atua SOMENTE na praia
  const zonasFiltradas = BEACH_ZONES
  const beachIds = new Set(BEACH_ZONES.map(z => z.id))
  const heatOrdenado = [...heatData]
    .filter(h => beachIds.has(h.zoneId))
    .sort((a, b) => b.score - a.score)

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', paddingBottom: 100 }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)',
        padding: '20px 20px 30px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.06 }}>
          <svg viewBox="0 0 400 120" style={{ width: '100%' }}>
            <path fill="#fff" d="M0,60 Q100,20 200,60 Q300,100 400,60 L400,120 L0,120Z" />
          </svg>
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>
                ⚡ PraiaGo Zones
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: -0.5, margin: 0 }}>
                Radar de Demanda
              </h1>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: 20 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: gpsStatus === 'active' ? '#fff' : 'rgba(255,255,255,0.4)' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                  {gpsStatus === 'active' ? `GPS ±${Math.round(gpsData?.accuracy ?? 0)}m` : 'GPS...'}
                </span>
              </div>
              <button onClick={refreshHeat} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 12, padding: '5px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <RefreshCw size={12} color="#fff" />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Atualizar</span>
              </button>
            </div>
          </div>

          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', margin: 0 }}>
            Última atualização: {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </p>
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: -16, position: 'relative', zIndex: 10 }}>

        {/* ── Card de Recomendação da IA ─────────────────── */}
        {recomendacao && (
          <div style={{
            background: '#1e293b',
            borderRadius: 24, padding: '20px',
            marginBottom: 16,
            border: '1px solid rgba(34,197,94,0.3)',
            boxShadow: '0 0 30px rgba(34,197,94,0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Zap size={17} color="#22c55e" />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: 1.2, textTransform: 'uppercase' }}>Agente IA · Recomendação</div>
                <div style={{ fontSize: 12, color: '#94a3b8' }}>Baseado no movimento atual</div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
                {recomendacao.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#f1f5f9' }}>Vá para: {recomendacao.zona}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{recomendacao.motivo}</div>
              </div>
              <button style={{
                background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
                border: 'none', borderRadius: 14, padding: '10px 16px',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Navigation size={15} color="#fff" />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>Ir</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Clientes que pediram comigo ─────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1e293b', borderRadius: 16, padding: '12px 16px', marginBottom: 16, border: '1px solid #334155' }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(244,63,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19 }}>🛒</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#f1f5f9' }}>
              {orders.length} cliente{orders.length === 1 ? '' : 's'} aguardando
            </div>
            <div style={{ fontSize: 11, color: '#64748b' }}>Aparecem no mapa 🛒 quando fazem um pedido com você</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: '4px 10px' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#22c55e' }}>🏖️ Praia</span>
          </div>
        </div>

        {/* ── Mapa ──────────────────────────────────────── */}
        <div style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 16, border: '1px solid #334155' }}>
          <MapContainer
            center={myPos} zoom={13}
            style={{ height: 280, width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://carto.com">CARTO</a> &copy; OpenStreetMap'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
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
                  <Popup>
                    <div style={{ minWidth: 140 }}>
                      <b>{zone.emoji} {zone.nome}</b>
                      {heat && cfg && (
                        <div style={{ marginTop: 6 }}>
                          <div style={{ color: cfg.cor, fontWeight: 700 }}>{cfg.emoji} {cfg.label}</div>
                          <div style={{ fontSize: 11, color: '#666' }}>{heat.pedidosHora} pedidos/h</div>
                          <div style={{ fontSize: 11, color: '#666' }}>{heat.ambulantesAtivos} ambulantes aqui</div>
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
                  <Popup><b>📍 Você está aqui</b><br />GPS ativo</Popup>
                </Marker>
                <Circle
                  center={myPos}
                  radius={gpsData?.accuracy ?? 30}
                  pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.12, weight: 1.5 }}
                />
              </>
            )}

            {/* Clientes que fizeram pedido comigo */}
            {orders.map(o => (
              <Marker key={o.id} position={[o.clienteLat, o.clienteLng]} icon={clienteIcon}>
                <Popup>
                  <b>🛒 {o.clienteNome}</b><br />
                  {o.itens.join(', ')}<br />
                  <b>R$ {o.total.toFixed(2)}</b> · {o.zona}
                  {(o.reta || o.barraca) && <><br />🏖️ {o.reta ? `Reta ${o.reta}` : ''}{o.reta && o.barraca ? ' · ' : ''}{o.barraca ? `Barraca ${o.barraca}` : ''}</>}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* ── Lista de Zonas ─────────────────────────────── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }}>
            Zonas por demanda
          </div>

          {heatOrdenado.map(h => {
            const zone = PRAIAGO_ZONES.find(z => z.id === h.zoneId)
            if (!zone) return null
            const cfg = NIVEL_CONFIG[h.nivel]

            return (
              <div key={h.zoneId} style={{
                background: '#1e293b',
                borderRadius: 20, padding: '16px',
                marginBottom: 10,
                border: `1px solid ${cfg.cor}30`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Ícone */}
                  <div style={{
                    width: 48, height: 48, borderRadius: 16,
                    background: `${cfg.cor}20`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, flexShrink: 0,
                    border: `1px solid ${cfg.cor}30`,
                  }}>
                    {zone.emoji}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>{zone.nome}</div>
                        <div style={{ fontSize: 11, color: '#64748b', textTransform: 'capitalize' }}>{zone.tipo}</div>
                      </div>
                      <div style={{
                        background: `${cfg.cor}20`, color: cfg.cor,
                        padding: '4px 10px', borderRadius: 10,
                        fontSize: 11, fontWeight: 800,
                      }}>
                        {cfg.emoji} {cfg.label}
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    <div style={{ height: 5, background: '#0f172a', borderRadius: 10, marginBottom: 8 }}>
                      <div style={{
                        height: '100%',
                        width: `${h.score * 100}%`,
                        background: `linear-gradient(90deg, ${cfg.cor}88, ${cfg.cor})`,
                        borderRadius: 10,
                        transition: 'width 1.5s ease',
                      }} />
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <ShoppingBag size={11} color="#64748b" />
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{h.pedidosHora}/h</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Users size={11} color="#64748b" />
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{h.ambulantesAtivos} ambulantes</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <TrendingUp size={11} color="#64748b" />
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{Math.round(h.score * 100)}% calor</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Info GPS ───────────────────────────────────── */}
        <div style={{
          background: '#1e293b', borderRadius: 20, padding: '16px',
          display: 'flex', alignItems: 'center', gap: 12,
          border: '1px solid #334155',
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(14,165,233,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={20} color="#0ea5e9" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>GPS PraiaGo</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
              {gpsStatus === 'active'
                ? `Lat: ${gpsData?.lat.toFixed(5)} · Lng: ${gpsData?.lng.toFixed(5)}`
                : 'Aguardando sinal GPS...'
              }
            </div>
          </div>
          <div style={{
            background: gpsStatus === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
            border: `1px solid ${gpsStatus === 'active' ? 'rgba(34,197,94,0.3)' : '#334155'}`,
            borderRadius: 10, padding: '4px 10px',
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: gpsStatus === 'active' ? '#22c55e' : '#64748b' }}>
              {gpsStatus === 'active' ? '● ATIVO' : '○ OFF'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
