// ==========================================================
//  AmbulantesPage — "Na Praia"
//  Mapa em tempo real + lista de ambulantes próximos do cliente.
//  Core feature do PraiaGo: conecta cliente com vendedores
//  ambulantes na areia via GPS ao vivo.
// ==========================================================

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, List, Map as MapIcon, Navigation, ChevronRight, Wifi, Eye, Clock, RefreshCw } from 'lucide-react'
import { useGPS } from '../hooks/useGPS'
import { useNearbyAmbulantes, type AmbulanteLive } from '../hooks/useNearbyAmbulantes'
import { useSimulatedAmbulantes } from '../hooks/useSimulatedAmbulantes'
import { VENDEDORES } from '../lib/catalogo'
import { getZone, BEACH_ZONES } from '../lib/praiagoZones'

import 'leaflet/dist/leaflet.css'

// ── Fix Leaflet default icons in Vite ────────────────────────
// @ts-expect-error leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Custom Marker Icons ──────────────────────────────────────

function clienteIcon() {
  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<div style="
      width:40px; height:40px; border-radius:50%;
      background: linear-gradient(135deg, #0ea5e9, #06b6d4);
      border: 3px solid #fff; box-shadow: 0 0 0 4px rgba(14,165,233,0.3), 0 4px 12px rgba(0,0,0,0.3);
      display:flex; align-items:center; justify-content:center;
      font-size:18px; animation: clientePulse 2s ease-in-out infinite;
    ">📍</div>`,
  })
}

function ambulanteIcon(emoji: string, aberto: boolean) {
  const bg = aberto
    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
    : 'linear-gradient(135deg, #475569, #64748b)'
  const shadow = aberto
    ? '0 0 0 3px rgba(34,197,94,0.3), 0 4px 12px rgba(0,0,0,0.3)'
    : '0 2px 8px rgba(0,0,0,0.3)'
  return L.divIcon({
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div style="
      width:44px; height:44px; border-radius:50%;
      background: ${bg};
      border: 3px solid ${aberto ? '#fff' : '#94a3b8'};
      box-shadow: ${shadow};
      display:flex; align-items:center; justify-content:center;
      font-size:20px; transition: transform 0.3s;
    ">${emoji}</div>`,
  })
}

// ── Recenter helper ──────────────────────────────────────────

function RecenterMap({ pos }: { pos: [number, number] }) {
  const map = useMap()
  const handleRecenter = () => {
    map.flyTo(pos, 15, { duration: 0.8 })
  }
  return (
    <button
      onClick={handleRecenter}
      style={{
        position: 'absolute', bottom: 20, right: 16, zIndex: 1000,
        width: 44, height: 44, borderRadius: '50%',
        background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(14,165,233,0.4)',
      }}
    >
      <Navigation size={20} color="#fff" />
    </button>
  )
}

// ── Formatar distância ───────────────────────────────────────

function formatDist(m: number): string {
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

// ── Componente principal ─────────────────────────────────────

export default function AmbulantesPage() {
  const navigate = useNavigate()
  const { pos, status: gpsStatus } = useGPS()
  const { ambulantes, total } = useNearbyAmbulantes(pos)
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')

  // Simulação automática de ambulantes para demo
  useSimulatedAmbulantes(true)

  // Zona atual do cliente
  const zonaCliente = useMemo(() => getZone(pos[0], pos[1]), [pos])

  // Navegar para pedir de um ambulante (vincula ao catálogo se existir)
  const handlePedir = (amb: AmbulanteLive) => {
    const vendedor = VENDEDORES.find(v =>
      v.nome.toLowerCase().includes(amb.nome.split(' ')[0].toLowerCase()) ||
      amb.id.includes(v.id)
    )
    if (vendedor) {
      navigate(`/pedir?v=${vendedor.id}`)
    } else {
      // ambulante sem catálogo vinculado — mostra primeiro vendedor como fallback
      navigate(`/pedir?v=${VENDEDORES[0].id}`)
    }
  }

  return (
    <div style={{ minHeight: '100%', background: '#0f172a', color: '#e2e8f0' }}>
      {/* ── Header ──────────────────────────────────────── */}
      <div style={{
        padding: '16px 20px 12px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderBottom: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 22, fontWeight: 900,
              background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <MapPin size={22} style={{ color: '#22c55e' }} />
              Na Praia
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Ambulantes ao vivo perto de você
              {zonaCliente && <span> · {zonaCliente.emoji} {zonaCliente.nome}</span>}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Badge ao vivo */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 20,
              background: total > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
              border: `1px solid ${total > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: total > 0 ? '#22c55e' : '#64748b',
                boxShadow: total > 0 ? '0 0 8px rgba(34,197,94,0.6)' : 'none',
                animation: total > 0 ? 'livePulse 2s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: total > 0 ? '#22c55e' : '#64748b' }}>
                {total} {total === 1 ? 'online' : 'online'}
              </span>
            </div>

            {/* Toggle mapa/lista */}
            <button
              onClick={() => setViewMode(v => v === 'map' ? 'list' : 'map')}
              style={{
                width: 38, height: 38, borderRadius: 12,
                background: '#1e293b', border: '1px solid #334155',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#94a3b8',
              }}
            >
              {viewMode === 'map' ? <List size={18} /> : <MapIcon size={18} />}
            </button>
          </div>
        </div>

        {/* GPS status */}
        {gpsStatus !== 'active' && (
          <div style={{
            marginTop: 8, padding: '6px 12px', borderRadius: 8,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)',
            fontSize: 11, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
            {gpsStatus === 'requesting' ? 'Obtendo sua localização...' : 'GPS indisponível — usando posição aproximada'}
          </div>
        )}
      </div>

      {/* ── Conteúdo ────────────────────────────────────── */}
      {viewMode === 'map' ? (
        <MapView
          clientePos={pos}
          ambulantes={ambulantes}
          onPedir={handlePedir}
        />
      ) : (
        <ListView
          ambulantes={ambulantes}
          onPedir={handlePedir}
        />
      )}

      {/* ── Inline styles (keyframes) ───────────────────── */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        @keyframes clientePulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(14,165,233,0.3), 0 4px 12px rgba(0,0,0,0.3); }
          50% { box-shadow: 0 0 0 12px rgba(14,165,233,0.1), 0 4px 12px rgba(0,0,0,0.3); }
        }
        @keyframes cardFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .ambulante-card:active {
          transform: scale(0.97) !important;
        }
      `}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MapView — Leaflet com ambulantes + cliente
// ══════════════════════════════════════════════════════════════

function MapView({
  clientePos,
  ambulantes,
  onPedir,
}: {
  clientePos: [number, number]
  ambulantes: AmbulanteLive[]
  onPedir: (a: AmbulanteLive) => void
}) {
  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={clientePos}
        zoom={15}
        style={{ height: 'calc(100vh - 200px)', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

        {/* Cliente */}
        <Marker position={clientePos} icon={clienteIcon()}>
          <Popup>
            <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
              <strong>📍 Você está aqui</strong>
              <br />
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {clientePos[0].toFixed(4)}, {clientePos[1].toFixed(4)}
              </span>
            </div>
          </Popup>
        </Marker>

        {/* Círculo de área (raio de cobertura — 2km) */}
        <Circle
          center={clientePos}
          radius={2000}
          pathOptions={{
            color: '#0ea5e9',
            fillColor: '#0ea5e9',
            fillOpacity: 0.04,
            weight: 1,
            dashArray: '6,4',
          }}
        />

        {/* Precisão GPS */}
        <Circle
          center={clientePos}
          radius={30}
          pathOptions={{
            color: '#0ea5e9',
            fillColor: '#0ea5e9',
            fillOpacity: 0.15,
            weight: 1,
          }}
        />

        {/* Ambulantes */}
        {ambulantes.map((a) => (
          <Marker
            key={a.id}
            position={[a.lat, a.lng]}
            icon={ambulanteIcon(a.emoji, a.aberto)}
          >
            <Popup>
              <div style={{ minWidth: 180, fontFamily: 'Inter, sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 28 }}>{a.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{a.nome}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{a.categoria}</div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', gap: 8, marginBottom: 10, fontSize: 12,
                }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 8,
                    background: a.aberto ? '#dcfce7' : '#f1f5f9',
                    color: a.aberto ? '#16a34a' : '#64748b',
                    fontWeight: 700,
                  }}>
                    {a.aberto ? '🟢 Aberto' : '⚫ Fechado'}
                  </span>
                  <span style={{
                    padding: '2px 8px', borderRadius: 8,
                    background: '#f0f9ff', color: '#0ea5e9', fontWeight: 700,
                  }}>
                    📏 {formatDist(a.distancia)}
                  </span>
                </div>
                {a.zona && (
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                    📍 {a.zona}
                  </div>
                )}
                <button
                  onClick={() => onPedir(a)}
                  style={{
                    width: '100%', padding: '8px 0', border: 'none', borderRadius: 10,
                    background: a.aberto ? 'linear-gradient(135deg, #0ea5e9, #22c55e)' : '#94a3b8',
                    color: '#fff', fontWeight: 800, fontSize: 13, cursor: a.aberto ? 'pointer' : 'not-allowed',
                  }}
                  disabled={!a.aberto}
                >
                  {a.aberto ? '🛒 Ver Cardápio' : 'Fechado agora'}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Zonas da praia (contorno sutil) */}
        {BEACH_ZONES.map(z => {
          const positions = z.poligono as [number, number][]
          return (
            <Circle
              key={z.id}
              center={[
                positions.reduce((s, p) => s + p[0], 0) / positions.length,
                positions.reduce((s, p) => s + p[1], 0) / positions.length,
              ]}
              radius={500}
              pathOptions={{
                color: z.cor,
                fillColor: z.cor,
                fillOpacity: 0.03,
                weight: 0.5,
                dashArray: '3,6',
              }}
            />
          )
        })}

        <RecenterMap pos={clientePos} />
      </MapContainer>

      {/* Mini-lista sobreposta no mapa (3 mais próximos) */}
      {ambulantes.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16, right: 60, zIndex: 1000,
          background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(12px)',
          borderRadius: 16, padding: '12px',
          border: '1px solid rgba(51,65,85,0.5)',
          maxHeight: 160, overflowY: 'auto',
        }}>
          {ambulantes.slice(0, 3).map((a, i) => (
            <div
              key={a.id}
              onClick={() => onPedir(a)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 4px',
                borderBottom: i < 2 && ambulantes.length > 1 ? '1px solid #1e293b' : 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 22 }}>{a.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>{a.nome}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  {a.zona} · {a.aberto ? '🟢 Aberto' : '⚫ Fechado'}
                </div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 800,
                color: '#0ea5e9',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {formatDist(a.distancia)}
                <ChevronRight size={14} />
              </div>
            </div>
          ))}
          {ambulantes.length > 3 && (
            <div style={{
              textAlign: 'center', fontSize: 11, color: '#64748b',
              padding: '6px 0 2px', fontWeight: 600,
            }}>
              +{ambulantes.length - 3} mais ambulantes por perto
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  ListView — Cards de ambulantes (modo lista)
// ══════════════════════════════════════════════════════════════

function ListView({
  ambulantes,
  onPedir,
}: {
  ambulantes: AmbulanteLive[]
  onPedir: (a: AmbulanteLive) => void
}) {
  if (ambulantes.length === 0) {
    return (
      <div style={{
        padding: '60px 32px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 60, marginBottom: 16 }}>🏖️</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#e2e8f0' }}>
          Nenhum ambulante por perto
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>
          Parece que ninguém está vendendo na praia agora.
          <br />Que tal pedir de um restaurante?
        </p>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            padding: '12px 32px', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
            color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer',
          }}
        >
          Ver Restaurantes →
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 16px 80px' }}>
      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {[
          { label: 'Próximos', value: ambulantes.length, icon: <Eye size={14} />, color: '#0ea5e9' },
          { label: 'Abertos', value: ambulantes.filter(a => a.aberto).length, icon: <Wifi size={14} />, color: '#22c55e' },
          { label: 'Mais perto', value: ambulantes[0] ? formatDist(ambulantes[0].distancia) : '—', icon: <Navigation size={14} />, color: '#fbbf24' },
        ].map((s, i) => (
          <div key={i} style={{
            flex: '0 0 auto', padding: '10px 16px', borderRadius: 14,
            background: '#1e293b', border: '1px solid #334155',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{ color: s.color }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>{s.value}</div>
              <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Cards */}
      {ambulantes.map((a, i) => (
        <div
          key={a.id}
          className="ambulante-card"
          onClick={() => onPedir(a)}
          style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: 16, marginBottom: 10, borderRadius: 16,
            background: '#1e293b', border: '1px solid #334155',
            cursor: 'pointer', transition: 'transform 0.15s',
            animation: `cardFadeIn 0.4s ease-out ${i * 0.08}s both`,
          }}
        >
          {/* Emoji avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: a.aberto
              ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(14,165,233,0.15))'
              : 'rgba(71,85,105,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, flexShrink: 0,
            border: `1px solid ${a.aberto ? 'rgba(34,197,94,0.2)' : 'rgba(71,85,105,0.2)'}`,
          }}>
            {a.emoji}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              marginBottom: 3,
            }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#e2e8f0' }}>{a.nome}</span>
              {a.aberto && (
                <span style={{
                  fontSize: 8, fontWeight: 800, color: '#22c55e',
                  padding: '2px 6px', borderRadius: 6,
                  background: 'rgba(34,197,94,0.15)',
                  textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  Aberto
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              {a.categoria}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
              {a.zona && (
                <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <MapPin size={10} /> {a.zona}
                </span>
              )}
              <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={10} /> Agora
              </span>
            </div>
          </div>

          {/* Distância */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{
              fontSize: 18, fontWeight: 900,
              background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              {formatDist(a.distancia)}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>de você</div>
          </div>

          <ChevronRight size={16} color="#334155" />
        </div>
      ))}
    </div>
  )
}
