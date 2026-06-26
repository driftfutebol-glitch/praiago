import { useState, useEffect, useRef } from 'react'
import { Clock, CheckCircle, ChevronRight, Timer, Navigation, MapPin, X, Route, Bell, Zap } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useRoute } from '../hooks/useRoute'
import { useOrderNotifications, type IncomingOrder } from '../hooks/useOrderNotifications'
import { ZoneAgent, type ZoneScore } from '../lib/zoneAgent'

delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function makeIcon(html: string, size = 40) {
  return L.divIcon({ className: '', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
}

const clienteIcon = makeIcon(`<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#06b6d4);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 3px 12px rgba(14,165,233,0.5);font-size:20px">👤</div>`)
const myIcon = makeIcon(`<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#16a34a);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 3px 12px rgba(34,197,94,0.5);font-size:20px">🥥</div>`)

type Status = 'novo' | 'preparando' | 'entregue'

type Pedido = {
  id: string
  cliente: string
  clienteTel: string
  itens: string[]
  total: number
  status: Status
  hora: string
  clienteLat: number
  clienteLng: number
  isLive?: boolean
}

const mockPedidos: Pedido[] = [
  {
    id: '#001', cliente: 'João S.', clienteTel: '(13) 98888-1111',
    itens: ['2x Água de Coco', '1x Mate Gelado'], total: 22,
    status: 'novo', hora: 'Agora',
    clienteLat: -24.0045, clienteLng: -46.4115,
  },
  {
    id: '#002', cliente: 'Maria L.', clienteTel: '(13) 97777-2222',
    itens: ['3x Biscoito Globo'], total: 15,
    status: 'preparando', hora: '5 min',
    clienteLat: -24.0060, clienteLng: -46.4100,
  },
  {
    id: '#003', cliente: 'Carlos M.', clienteTel: '(13) 96666-3333',
    itens: ['1x Suco Natural', '1x Água de Coco'], total: 16,
    status: 'entregue', hora: '22 min',
    clienteLat: -24.0070, clienteLng: -46.4130,
  },
]

const statusConfig = {
  novo: { label: 'Novo', bg: '#fef3c7', color: '#d97706', icon: Clock },
  preparando: { label: 'Preparando', bg: '#dbeafe', color: '#2563eb', icon: Timer },
  entregue: { label: 'Entregue', bg: '#dcfce7', color: '#16a34a', icon: CheckCircle },
}

function FitBounds({ a, b }: { a: [number, number]; b: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(L.latLngBounds([a, b]), { padding: [60, 60], animate: true })
  }, [a[0], a[1], b[0], b[1]])
  return null
}

function LocationModal({ pedido, onClose }: { pedido: Pedido; onClose: () => void }) {
  const [myPos, setMyPos] = useState<[number, number] | null>(null)
  const watchId = useRef<number | null>(null)
  const clientePos: [number, number] = [pedido.clienteLat, pedido.clienteLng]
  const route = useRoute(myPos, clientePos)

  useEffect(() => {
    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        pos => setMyPos([pos.coords.latitude, pos.coords.longitude]),
        () => setMyPos([-24.0055, -46.4135]),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      )
    } else {
      setMyPos([-24.0055, -46.4135])
    }
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  function calcDist(pos: [number, number]): number {
    const R = 6371000
    const dLat = (clientePos[0] - pos[0]) * Math.PI / 180
    const dLng = (clientePos[1] - pos[1]) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(pos[0] * Math.PI / 180) * Math.cos(clientePos[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  const distancia = myPos ? (route?.distancia ?? (calcDist(myPos) < 1000 ? `${Math.round(calcDist(myPos))}m` : `${(calcDist(myPos) / 1000).toFixed(1)}km`)) : null
  const tempo = route?.tempo ?? null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
      <div style={{ padding: '14px 20px', background: '#0f172a', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#f1f5f9' }}>📍 {pedido.cliente}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 1 }}>Pedido {pedido.id} · {pedido.clienteTel}</div>
        </div>
        {pedido.isLive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 10, padding: '4px 10px' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0ea5e9', animation: 'livePulse 1s infinite' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#0ea5e9' }}>AO VIVO</span>
          </div>
        )}
        <button onClick={onClose} style={{ background: '#1e293b', border: 'none', borderRadius: 10, padding: 8, cursor: 'pointer', minWidth: 36, minHeight: 36 }}>
          <X size={18} color="#94a3b8" />
        </button>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {myPos ? (
          <MapContainer center={myPos} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer attribution='&copy; CARTO &copy; OpenStreetMap' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            <FitBounds a={myPos} b={clientePos} />
            <Marker position={myPos} icon={myIcon}><Popup><b>🥥 Você (ambulante)</b></Popup></Marker>
            <Marker position={clientePos} icon={clienteIcon}><Popup><b>👤 {pedido.cliente}</b><br />{pedido.clienteTel}</Popup></Marker>
            {route && route.coords.length > 1
              ? <Polyline positions={route.coords} pathOptions={{ color: '#22c55e', weight: 5, opacity: 0.85 }} />
              : <Polyline positions={[myPos, clientePos]} pathOptions={{ color: '#22c55e', weight: 3, dashArray: '8 6', opacity: 0.5 }} />
            }
          </MapContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center', color: '#475569' }}>
              <MapPin size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
              <p style={{ fontSize: 14, fontWeight: 600 }}>Obtendo localização…</p>
            </div>
          </div>
        )}

        {myPos && (
          <div style={{ position: 'absolute', top: 14, left: 14, zIndex: 1000, background: 'rgba(15,23,42,0.92)', borderRadius: 16, padding: '12px 16px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
              <span style={{ fontSize: 10, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                {route ? 'Rota calculada' : 'GPS ativo'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {distancia && <div><div style={{ fontSize: 18, fontWeight: 900, color: '#f1f5f9', lineHeight: 1 }}>{distancia}</div><div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>distância</div></div>}
              {tempo && <div><div style={{ fontSize: 18, fontWeight: 900, color: '#f1f5f9', lineHeight: 1 }}>{tempo}</div><div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>a pé</div></div>}
            </div>
            {route && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Route size={10} color="#0ea5e9" /><span style={{ fontSize: 9, color: '#0ea5e9' }}>Via ruas · OSRM</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '16px', background: '#0f172a', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
        <button
          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${pedido.clienteLat},${pedido.clienteLng}`)}
          style={{ width: '100%', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 16, padding: '16px 0', color: '#fff', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 24px rgba(34,197,94,0.3)', minHeight: 52 }}>
          <Navigation size={20} /> Abrir no Google Maps
        </button>
      </div>
      <style>{`@keyframes livePulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }`}</style>
    </div>
  )
}

/* ─── BANNER DE NOVO PEDIDO ─────────────────────────────── */
function NewOrderBanner({ order, onDismiss, onView }: { order: IncomingOrder; onDismiss: () => void; onView: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
      background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
      padding: '16px 20px',
      animation: 'bannerSlide 0.4s cubic-bezier(0,0,0.2,1)',
      boxShadow: '0 8px 32px rgba(14,165,233,0.45)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Icon pulsante */}
        <div style={{ width: 50, height: 50, borderRadius: 18, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, animation: 'iconBounce 0.6s ease', flexShrink: 0 }}>
          🔔
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.8)', letterSpacing: 0.6, marginBottom: 2 }}>
            🤖 AGENTE IA · NOVO PEDIDO
          </div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.clienteNome} — {order.itens[0]}{order.itens.length > 1 ? ` +${order.itens.length - 1}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>
            R$ {order.total.toFixed(2)} · Zona {order.zona}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={onView}
            style={{ background: '#fff', color: '#0ea5e9', border: 'none', borderRadius: 14, padding: '10px 16px', fontWeight: 800, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
          >Ver</button>
          <button
            onClick={onDismiss}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 14, padding: '10px', cursor: 'pointer' }}
          >
            <X size={16} color="#fff" />
          </button>
        </div>
      </div>
      <style>{`
        @keyframes bannerSlide { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes iconBounce { 0% { transform: scale(0.8); } 60% { transform: scale(1.2); } 100% { transform: scale(1); } }
      `}</style>
    </div>
  )
}

/* ─── PAINEL DE ZONAS IA ─────────────────────────────────── */
function ZoneAgentPanel({ scores }: { scores: ZoneScore[] }) {
  const top = scores.slice().sort((a, b) => b.score - a.score).slice(0, 3)
  return (
    <div style={{ margin: '0 16px 14px', background: '#0f172a', borderRadius: 20, padding: '16px', border: '1px solid #1e293b' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🤖</div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9' }}>Agente IA · Zonas ao Vivo</div>
          <div style={{ fontSize: 10, color: '#475569' }}>Atualização automática a cada 10s</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(168,85,247,0.12)', borderRadius: 8, padding: '4px 8px' }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#a855f7', animation: 'aiPulse 1.5s infinite' }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: '#a855f7' }}>ATIVO</span>
        </div>
      </div>
      {top.map(z => {
        const nivel = z.score > 0.75 ? { emoji: '🔥', color: '#f97316' } : z.score > 0.5 ? { emoji: '🌡️', color: '#eab308' } : { emoji: '❄️', color: '#0ea5e9' }
        return (
          <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{nivel.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.nome}</span>
                <span style={{ fontSize: 11, color: nivel.color, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{z.pedidosHora} pedidos/h</span>
              </div>
              <div style={{ height: 5, background: '#1e293b', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${z.score * 100}%`, background: nivel.color, borderRadius: 10, transition: 'width 1s ease' }} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: z.tendencia === 'subindo' ? '#22c55e' : z.tendencia === 'descendo' ? '#ef4444' : '#64748b', flexShrink: 0 }}>
              {z.tendencia === 'subindo' ? '↑' : z.tendencia === 'descendo' ? '↓' : '→'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── PÁGINA PRINCIPAL ───────────────────────────────────── */
const abas = ['Todos', 'Novos', 'Preparando', 'Entregues'] as const

export default function PedidosPage() {
  const [aba, setAba] = useState<typeof abas[number]>('Todos')
  const [pedidos, setPedidos] = useState<Pedido[]>(mockPedidos)
  const [locModal, setLocModal] = useState<Pedido | null>(null)
  const [zoneScores, setZoneScores] = useState<ZoneScore[]>([])

  // Hook de notificações em tempo real
  const { orders: liveOrders, latestOrder, dismissLatest } = useOrderNotifications()

  // IA: subscrevendo ao ZoneAgent
  useEffect(() => {
    const unsub = ZoneAgent.subscribe(scores => setZoneScores(scores))
    return unsub
  }, [])

  // Quando chega pedido ao vivo, registra no agente e adiciona à lista
  useEffect(() => {
    if (!liveOrders.length) return
    const newest = liveOrders[0]
    ZoneAgent.registerOrder(newest.clienteLat, newest.clienteLng)

    const newPedido: Pedido = {
      id: newest.id,
      cliente: newest.clienteNome,
      clienteTel: newest.clienteTel,
      itens: newest.itens,
      total: newest.total,
      status: 'novo',
      hora: 'Agora',
      clienteLat: newest.clienteLat,
      clienteLng: newest.clienteLng,
      isLive: true,
    }
    setPedidos(prev => {
      if (prev.find(p => p.id === newest.id)) return prev
      return [newPedido, ...prev]
    })
  }, [liveOrders])

  const filtrados = pedidos.filter(p => {
    if (aba === 'Todos') return true
    if (aba === 'Novos') return p.status === 'novo'
    if (aba === 'Preparando') return p.status === 'preparando'
    if (aba === 'Entregues') return p.status === 'entregue'
    return true
  })

  function avancar(id: string) {
    setPedidos(prev => prev.map(p => {
      if (p.id !== id) return p
      const map: Record<Status, Status> = { novo: 'preparando', preparando: 'entregue', entregue: 'entregue' }
      return { ...p, status: map[p.status] }
    }))
  }

  const novosCount = pedidos.filter(p => p.status === 'novo').length

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: 24 }}>
      {/* Banner de notificação ao vivo */}
      {latestOrder && (
        <NewOrderBanner
          order={latestOrder}
          onDismiss={dismissLatest}
          onView={() => {
            dismissLatest()
            setAba('Novos')
          }}
        />
      )}
      {locModal && <LocationModal pedido={locModal} onClose={() => setLocModal(null)} />}

      {/* Header */}
      <div style={{ background: '#fff', padding: '20px 16px 0', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Pedidos</h1>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>Conexão interligada com clientes em tempo real</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {novosCount > 0 && (
              <span style={{ background: '#fee2e2', color: '#ef4444', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                {novosCount} {novosCount === 1 ? 'novo' : 'novos'}
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(168,85,247,0.08)', borderRadius: 10, padding: '4px 10px', border: '1px solid rgba(168,85,247,0.15)' }}>
              <Zap size={11} color="#a855f7" />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#a855f7' }}>IA Ativa</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {abas.map(a => (
            <button key={a} onClick={() => setAba(a)} style={{ padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', color: aba === a ? '#0ea5e9' : '#94a3b8', borderBottom: aba === a ? '2px solid #0ea5e9' : '2px solid transparent', minHeight: 44 }}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Painel do agente IA */}
        {zoneScores.length > 0 && <ZoneAgentPanel scores={zoneScores} />}

        {/* Lista de pedidos */}
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtrados.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <Bell size={32} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
              <p style={{ fontSize: 14, fontWeight: 600 }}>Aguardando pedidos…</p>
              <p style={{ fontSize: 12, marginTop: 4 }}>O agente IA notificará automaticamente</p>
            </div>
          )}
          {filtrados.map(pedido => {
            const { label, bg, color, icon: Icon } = statusConfig[pedido.status]
            const isNew = pedido.status === 'novo'
            return (
              <div
                key={pedido.id}
                style={{
                  background: '#fff',
                  borderRadius: 20,
                  padding: 16,
                  boxShadow: isNew ? '0 4px 20px rgba(14,165,233,0.12)' : '0 2px 8px rgba(0,0,0,0.05)',
                  border: isNew
                    ? pedido.isLive ? '2px solid #0ea5e9' : '2px solid #fbbf24'
                    : '1.5px solid #f1f5f9',
                  animation: pedido.isLive ? 'cardPop 0.4s cubic-bezier(0,0,0.2,1)' : 'none',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Live badge */}
                {pedido.isLive && (
                  <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 4, background: '#0ea5e9', borderRadius: 8, padding: '3px 8px' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', animation: 'livePulse 1s infinite' }} />
                    <span style={{ fontSize: 9, fontWeight: 800, color: '#fff' }}>AO VIVO</span>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{pedido.id}</span>
                      <span style={{ background: bg, color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Icon size={10} /> {label}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b', marginTop: 3 }}>{pedido.cliente} · {pedido.hora}</div>
                  </div>
                  <span style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                    R$ {pedido.total.toFixed(2).replace('.', ',')}
                  </span>
                </div>

                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, marginBottom: 12 }}>
                  {pedido.itens.map((item, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#475569', paddingTop: i > 0 ? 3 : 0 }}>• {item}</div>
                  ))}
                </div>

                <button onClick={() => setLocModal(pedido)} style={{ width: '100%', background: '#f0fdf4', border: '1.5px solid #bbf7d0', borderRadius: 12, padding: '11px 0', marginBottom: 10, color: '#16a34a', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
                  <MapPin size={15} /> Ver rota até o cliente
                </button>

                {pedido.status !== 'entregue' && (
                  <button onClick={() => avancar(pedido.id)} style={{ width: '100%', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 12, padding: '13px 0', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 44 }}>
                    {pedido.status === 'novo' ? 'Iniciar preparo' : 'Marcar como entregue'}
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes cardPop { from { transform: scale(0.97) translateY(-6px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
        @keyframes livePulse { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
        @keyframes aiPulse { 0%,100% { opacity:1; transform: scale(1); } 50% { opacity:0.4; transform: scale(1.3); } }
      `}</style>
    </div>
  )
}
