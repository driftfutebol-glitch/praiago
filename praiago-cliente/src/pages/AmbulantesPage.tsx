// ==========================================================
//  AmbulantesPage — "Na Praia"
//  Mapa em tempo real + lista de ambulantes próximos do cliente.
//  Core feature do PraiaGo: conecta cliente com vendedores
//  ambulantes na areia via GPS ao vivo.
// ==========================================================

import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import { MapPin, List, Map as MapIcon, Navigation, ChevronRight, Wifi, Eye, Clock, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGPS } from '../hooks/useGPS'
import { useNearbyAmbulantes, type AmbulanteLive } from '../hooks/useNearbyAmbulantes'
import { useCatalogo } from '../store/useCatalogo'
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
      border: 2px solid #0f172a; box-shadow: 0 0 15px rgba(14,165,233,0.6);
      display:flex; align-items:center; justify-content:center;
      font-size:18px; animation: clientePulse 2s ease-in-out infinite;
    ">📍</div>`,
  })
}

function ambulanteIcon(emoji: string, aberto: boolean) {
  const bg = aberto
    ? 'linear-gradient(135deg, #22c55e, #16a34a)'
    : 'linear-gradient(135deg, #334155, #475569)'
  const shadow = aberto
    ? '0 0 15px rgba(34,197,94,0.6)'
    : '0 0 8px rgba(0,0,0,0.5)'
  return L.divIcon({
    className: '',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div style="
      width:44px; height:44px; border-radius:50%;
      background: ${bg};
      border: 2px solid #0f172a;
      box-shadow: ${shadow};
      display:flex; align-items:center; justify-content:center;
      font-size:20px; transition: transform 0.3s;
    ">${emoji}</div>`,
  })
}

// ── Recenter helper ──────────────────────────────────────────

// Voa até a posição do cliente quando ela muda de verdade (chegou GPS/IP/ajuste)
function FlyToCliente({ pos }: { pos: [number, number] }) {
  const map = useMap()
  const last = useRef(pos)
  useEffect(() => {
    const moveu = Math.abs(last.current[0] - pos[0]) + Math.abs(last.current[1] - pos[1]) > 0.0005
    if (moveu) map.flyTo(pos, Math.max(map.getZoom(), 14), { duration: 0.8 })
    last.current = pos
  }, [map, pos])
  return null
}

function RecenterMap({ pos }: { pos: [number, number] }) {
  const map = useMap()
  const handleRecenter = () => {
    map.flyTo(pos, 15, { duration: 0.8 })
  }
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={handleRecenter}
      style={{
        position: 'absolute', bottom: 20, right: 16, zIndex: 1000,
        width: 48, height: 48, borderRadius: '50%',
        background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(14,165,233,0.4)',
      }}
    >
      <Navigation size={22} color="#fff" />
    </motion.button>
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
  const { pos, status: gpsStatus, fonte, cidadeAproximada, definirPosicaoManual, limparPosicaoManual } = useGPS()
  const { ambulantes, total } = useNearbyAmbulantes(pos)
  const vendedores = useCatalogo(s => s.vendedores)
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')

  // Zona atual do cliente
  const zonaCliente = useMemo(() => getZone(pos[0], pos[1]), [pos])

  // Ambulante MAIS PRÓXIMO (a lista já vem ordenada por distância)
  const nearest = ambulantes[0]
  const walkMin = nearest ? Math.max(1, Math.round(nearest.distancia / 75)) : 0

  // Navegar para pedir de um ambulante (vincula ao catálogo se existir)
  const handlePedir = (amb: AmbulanteLive) => {
    const vendedor = vendedores.find(v =>
      v.nome.toLowerCase().includes(amb.nome.split(' ')[0].toLowerCase()) ||
      amb.id.includes(v.id)
    )
    if (vendedor) {
      navigate(`/pedir?v=${vendedor.id}`)
    } else {
      alert('Esse vendedor ainda não publicou um cardápio.')
    }
  }

  return (
    <div style={{ minHeight: '100%', background: '#ffffff', color: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="glass-panel" style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 24, fontWeight: 900,
              display: 'flex', alignItems: 'center', gap: 8,
            }} className="beach-gradient-text">
              <MapPin size={24} style={{ color: '#22c55e' }} />
              Radar PraiaGo
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              Ambulantes ao vivo perto de você
              {zonaCliente && <span style={{ color: '#38bdf8' }}> · {zonaCliente.emoji} {zonaCliente.nome}</span>}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Badge ao vivo */}
            <motion.div animate={total > 0 ? { opacity: [0.7, 1, 0.7] } : {}} transition={{ repeat: Infinity, duration: 2 }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 20,
              background: total > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
              border: `1px solid ${total > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: total > 0 ? '#22c55e' : '#64748b',
                boxShadow: total > 0 ? '0 0 10px #22c55e' : 'none',
              }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: total > 0 ? '#22c55e' : '#94a3b8' }}>
                {total} online
              </span>
            </motion.div>

            {/* Toggle mapa/lista */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setViewMode(v => v === 'map' ? 'list' : 'map')}
              style={{
                width: 42, height: 42, borderRadius: 14,
                background: '#f8fafc', border: '1px solid rgba(0,0,0,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: '#fff',
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div key={viewMode} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                  {viewMode === 'map' ? <List size={20} /> : <MapIcon size={20} />}
                </motion.div>
              </AnimatePresence>
            </motion.button>
          </div>
        </div>

        {/* GPS status / fonte da posição */}
        {fonte === 'manual' ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{
            marginTop: 12, padding: '8px 14px', borderRadius: 12,
            background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)',
            fontSize: 12, fontWeight: 600, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <MapPin size={14} />
            <span style={{ flex: 1, minWidth: 180 }}>Posição ajustada por você — arraste o pino azul para mudar.</span>
            <button onClick={limparPosicaoManual} style={{
              border: '1px solid rgba(14,165,233,0.35)', background: '#fff', color: '#0284c7',
              borderRadius: 10, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
            }}>
              Voltar pro GPS
            </button>
          </motion.div>
        ) : gpsStatus !== 'active' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{
            marginTop: 12, padding: '8px 14px', borderRadius: 12,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)',
            fontSize: 12, fontWeight: 600, color: '#d97706', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
            {gpsStatus === 'requesting'
              ? 'Obtendo radar...'
              : fonte === 'ip'
                ? `Sem GPS — posição aproximada pela internet${cidadeAproximada ? ` (${cidadeAproximada})` : ''}. Arraste o pino azul até onde você está.`
                : fonte === 'memoria'
                  ? 'Sem GPS — usando sua última posição conhecida. Arraste o pino azul para ajustar.'
                  : 'GPS indisponível — arraste o pino azul no mapa até onde você está.'}
          </motion.div>
        )}
      </div>

      {/* ── Destaque: ambulante mais próximo ────────────── */}
      <AnimatePresence>
        {nearest && (
          <motion.div
            key={nearest.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              margin: '12px 16px 0', borderRadius: 22, padding: 16,
              background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(14,165,233,0.12))',
              border: '1px solid rgba(34,197,94,0.35)', boxShadow: '0 8px 30px rgba(34,197,94,0.12)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ fontSize: 14 }}>⚡</motion.span>
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1, color: '#4ade80', textTransform: 'uppercase' }}>
                Ambulante mais próximo de você
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 60, height: 60, borderRadius: 20, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }}>
                {nearest.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{nearest.nome}</div>
                <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600 }}>
                  {nearest.categoria}{nearest.zona ? ` · ${nearest.zona}` : ''}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#38bdf8' }}>{formatDist(nearest.distancia)}</span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>· ~{walkMin} min a pé</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: nearest.aberto ? '#4ade80' : '#94a3b8', background: nearest.aberto ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)', padding: '2px 8px', borderRadius: 8 }}>
                    {nearest.aberto ? 'ABERTO' : 'FECHADO'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setViewMode('map')} style={{ flex: 1, padding: '12px', borderRadius: 14, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.05)', color: '#0f172a', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <MapPin size={15} /> No mapa
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => handlePedir(nearest)} disabled={!nearest.aberto} style={{ flex: 2, padding: '12px', borderRadius: 14, border: 'none', background: nearest.aberto ? 'linear-gradient(135deg,#0ea5e9,#22c55e)' : '#475569', color: '#fff', fontWeight: 900, fontSize: 14, cursor: nearest.aberto ? 'pointer' : 'not-allowed', boxShadow: nearest.aberto ? '0 6px 20px rgba(34,197,94,0.3)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                🛒 {nearest.aberto ? 'Pedir agora' : 'Fechado'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Conteúdo ── altura explícita: com flex:1 puro o pai sem altura
          definida colapsava pra 0px e o mapa ficava invisível */}
      <div style={{ flex: 1, position: 'relative', minHeight: 'max(420px, calc(100dvh - 330px))' }}>
        <AnimatePresence mode="wait">
          {viewMode === 'map' ? (
            <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}>
              <MapView
                clientePos={pos}
                ambulantes={ambulantes}
                onPedir={handlePedir}
                onAjustarPos={definirPosicaoManual}
              />
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }} style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, overflowY: 'auto' }}>
              <ListView
                ambulantes={ambulantes}
                onPedir={handlePedir}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Inline styles (keyframes) ───────────────────── */}
      <style>{`
        @keyframes clientePulse {
          0%, 100% { box-shadow: 0 0 0 4px rgba(14,165,233,0.3), 0 0 20px rgba(14,165,233,0.6); }
          50% { box-shadow: 0 0 0 12px rgba(14,165,233,0.1), 0 0 30px rgba(14,165,233,0.8); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
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
  onAjustarPos,
}: {
  clientePos: [number, number]
  ambulantes: AmbulanteLive[]
  onPedir: (a: AmbulanteLive) => void
  onAjustarPos: (lat: number, lng: number) => void
}) {
  return (
    <div style={{ position: 'relative', height: '100%', width: '100%', background: '#eef2f7' }}>
      <MapContainer
        center={clientePos}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

        <FlyToCliente pos={clientePos} />

        {/* Cliente — pino ARRASTÁVEL: sem GPS, o usuário posiciona onde está */}
        <Marker
          position={clientePos}
          icon={clienteIcon()}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng()
              onAjustarPos(p.lat, p.lng)
            },
          }}
        >
          <Popup>
            <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
              <strong style={{ color: '#0f172a' }}>📍 Radar Central</strong>
              <br />
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {clientePos[0].toFixed(4)}, {clientePos[1].toFixed(4)}
              </span>
              <br />
              <span style={{ fontSize: 10.5, color: '#0284c7', fontWeight: 700 }}>
                Arraste o pino para ajustar sua posição
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
            fillOpacity: 0.05,
            weight: 1,
            dashArray: '6,4',
          }}
        />

        {/* Precisão GPS */}
        <Circle
          center={clientePos}
          radius={30}
          pathOptions={{
            color: '#22c55e',
            fillColor: '#22c55e',
            fillOpacity: 0.1,
            weight: 1,
            className: 'animate-pulse-neon'
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 32 }}>{a.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 15, color: '#0f172a' }}>{a.nome}</div>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{a.categoria}</div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', gap: 8, marginBottom: 12, fontSize: 12,
                }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 10,
                    background: a.aberto ? '#dcfce7' : '#f1f5f9',
                    color: a.aberto ? '#16a34a' : '#64748b',
                    fontWeight: 800,
                  }}>
                    {a.aberto ? '🟢 Aberto' : '⚫ Fechado'}
                  </span>
                  <span style={{
                    padding: '4px 10px', borderRadius: 10,
                    background: '#f0f9ff', color: '#0ea5e9', fontWeight: 800,
                  }}>
                    📏 {formatDist(a.distancia)}
                  </span>
                </div>
                {a.zona && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, fontWeight: 600 }}>
                    📍 {a.zona}
                  </div>
                )}
                <button
                  onClick={() => onPedir(a)}
                  style={{
                    width: '100%', padding: '10px 0', border: 'none', borderRadius: 12,
                    background: a.aberto ? 'linear-gradient(135deg, #0ea5e9, #22c55e)' : '#94a3b8',
                    color: '#fff', fontWeight: 900, fontSize: 14, cursor: a.aberto ? 'pointer' : 'not-allowed',
                    boxShadow: a.aberto ? '0 4px 15px rgba(34,197,94,0.3)' : 'none'
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
                fillOpacity: 0.05,
                weight: 1,
                dashArray: '3,6',
              }}
            />
          )
        })}

        <RecenterMap pos={clientePos} />
      </MapContainer>

      {/* Mini-lista sobreposta no mapa (3 mais próximos) */}
      {ambulantes.length > 0 && (
        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{
          position: 'absolute', bottom: 16, left: 16, right: 80, zIndex: 1000,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
          borderRadius: 20, padding: '12px',
          border: '1px solid rgba(0,0,0,0.08)',
          maxHeight: 180, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          {ambulantes.slice(0, 3).map((a, i) => (
            <motion.div
              whileTap={{ scale: 0.98 }}
              key={a.id}
              onClick={() => onPedir(a)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 8px',
                borderBottom: i < 2 && ambulantes.length > 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 12, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{a.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{a.nome}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                  {a.zona} · {a.aberto ? <span style={{ color: '#4ade80' }}>Online</span> : 'Offline'}
                </div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 900,
                color: '#38bdf8',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {formatDist(a.distancia)}
                <ChevronRight size={16} />
              </div>
            </motion.div>
          ))}
          {ambulantes.length > 3 && (
            <div style={{
              textAlign: 'center', fontSize: 11, color: '#64748b',
              padding: '8px 0 4px', fontWeight: 700,
            }}>
              +{ambulantes.length - 3} mais no radar
            </div>
          )}
        </motion.div>
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
        padding: '80px 32px', textAlign: 'center',
      }}>
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ fontSize: 70, marginBottom: 20 }}>🏖️</motion.div>
        <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
          Nenhum ambulante no radar
        </h2>
        <p style={{ margin: '0 0 32px', fontSize: 15, color: '#64748b', lineHeight: 1.5, fontWeight: 500 }}>
          A praia parece tranquila agora.
          <br />Que tal pedir de um restaurante local?
        </p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => window.location.href = '/'}
          style={{
            padding: '16px 36px', borderRadius: 20, border: 'none',
            background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
            color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(34,197,94,0.4)'
          }}
        >
          Ver Restaurantes →
        </motion.button>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 20px 80px' }}>
      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 24, overflowX: 'auto',
        scrollbarWidth: 'none', paddingBottom: 4
      }}>
        {[
          { label: 'Próximos', value: ambulantes.length, icon: <Eye size={16} />, color: '#0ea5e9' },
          { label: 'Abertos', value: ambulantes.filter(a => a.aberto).length, icon: <Wifi size={16} />, color: '#22c55e' },
          { label: 'Mais perto', value: ambulantes[0] ? formatDist(ambulantes[0].distancia) : '—', icon: <Navigation size={16} />, color: '#fbbf24' },
        ].map((s, i) => (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} key={i} style={{
            flex: '0 0 auto', padding: '12px 20px', borderRadius: 16,
            background: '#f8fafc', border: '1px solid rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            <div style={{ color: s.color, background: 'rgba(0,0,0,0.05)', padding: 8, borderRadius: 10 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ambulantes.map((a, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileTap={{ scale: 0.98 }}
            key={a.id}
            onClick={() => onPedir(a)}
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: 16, borderRadius: 20,
              background: '#f8fafc', border: '1px solid rgba(0,0,0,0.05)',
              cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
            }}
          >
            {/* Emoji avatar */}
            <div style={{
              width: 56, height: 56, borderRadius: 18,
              background: a.aberto
                ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(14,165,233,0.15))'
                : 'rgba(71,85,105,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, flexShrink: 0,
              border: `1px solid ${a.aberto ? 'rgba(34,197,94,0.2)' : 'rgba(71,85,105,0.2)'}`,
            }}>
              {a.emoji}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{a.nome}</span>
                {a.aberto && (
                  <span style={{
                    fontSize: 9, fontWeight: 900, color: '#4ade80',
                    padding: '3px 8px', borderRadius: 8,
                    background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    Aberto
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6, fontWeight: 500 }}>
                {a.categoria}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontWeight: 600 }}>
                {a.zona && (
                  <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} /> {a.zona}
                  </span>
                )}
                <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={12} /> Online
                </span>
              </div>
            </div>

            {/* Distância */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: 20, fontWeight: 900,
                background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {formatDist(a.distancia)}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Radar</div>
            </div>

            <ChevronRight size={20} color="#475569" style={{ marginLeft: -4 }} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
