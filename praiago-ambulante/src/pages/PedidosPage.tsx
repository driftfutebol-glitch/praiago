import { useState, useEffect, useRef } from 'react'
import { Bell, MapPin, CheckCircle, Clock, Navigation, X, Timer, QrCode, CreditCard, Banknote, ChevronRight } from 'lucide-react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import { motion, AnimatePresence } from 'framer-motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useRoute } from '../hooks/useRoute'
import { criarMonitorSentido, type SentidoStatus } from '../lib/trafego'
import { useOrderNotifications, type IncomingOrder } from '../hooks/useOrderNotifications'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'
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

const clienteIcon = makeIcon(`<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#0ea5e9,#06b6d4);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 15px rgba(14,165,233,0.6);font-size:20px;backdrop-filter:blur(4px)">👤</div>`)
const myIcon = makeIcon(`<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#22c55e,#16a34a);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.8);box-shadow:0 0 15px rgba(34,197,94,0.6);font-size:20px;backdrop-filter:blur(4px)">🥥</div>`)

type Status = 'novo' | 'preparando' | 'saiu_entrega' | 'entregue'

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
  pagamento: string
  isLive?: boolean
}

const pedidosIniciais: Pedido[] = []

const statusConfig = {
  novo: { label: 'Novo', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', icon: Clock },
  preparando: { label: 'Preparando', bg: 'rgba(14,165,233,0.15)', color: '#0284c7', icon: Timer },
  saiu_entrega: { label: 'Saiu p/ entrega', bg: 'rgba(249,115,22,0.15)', color: '#ea580c', icon: Navigation },
  entregue: { label: 'Entregue', bg: 'rgba(34,197,94,0.15)', color: '#16a34a', icon: CheckCircle },
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

  // Verificação de sentido: a rota OSRM já respeita a mão das vias.
  // Aqui detectamos se VOCÊ está se movendo contra o sentido planejado.
  const [sentido, setSentido] = useState<SentidoStatus>('indefinido')
  const monitorSentido = useRef(criarMonitorSentido())
  useEffect(() => {
    if (!myPos) return
    setSentido(monitorSentido.current.atualizar(route?.coords, myPos))
  }, [myPos?.[0], myPos?.[1]]) // eslint-disable-line react-hooks/exhaustive-deps

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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#ffffff' }}>
      <div className="glass-panel" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, borderRadius: 0 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>📍 {pedido.cliente}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>Pedido {pedido.id} · {pedido.clienteTel}</div>
        </div>
        {pedido.isLive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 10, padding: '4px 10px' }}>
            <div className="animate-pulse-neon" style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#38bdf8' }}>AO VIVO</span>
          </div>
        )}
        <motion.button whileTap={{ scale: 0.9 }} onClick={onClose} style={{ background: 'rgba(0,0,0,0.08)', border: 'none', borderRadius: 12, padding: 8, cursor: 'pointer', minWidth: 40, minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={20} color="#334155" />
        </motion.button>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        {/* Aviso de contramão / fora da rota */}
        {sentido === 'contramao' && (
          <div className="animate-pulse-neon" style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: '#ef4444', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 900, boxShadow: '0 8px 25px rgba(239,68,68,0.5)' }}>
            ⚠️ CONTRAMÃO — você está indo contra o sentido da rota!
          </div>
        )}
        {sentido === 'fora_da_rota' && (
          <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', zIndex: 1000, background: 'rgba(245,158,11,0.95)', color: '#fff', padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 900, boxShadow: '0 8px 25px rgba(245,158,11,0.4)' }}>
            🧭 Fora da rota — recalculando…
          </div>
        )}
        {myPos ? (
          <MapContainer center={myPos} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            {/* Dark map style */}
            <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            <FitBounds a={myPos} b={clientePos} />
            <Marker position={myPos} icon={myIcon}><Popup className="dark-popup"><b>🥥 Você (ambulante)</b></Popup></Marker>
            <Marker position={clientePos} icon={clienteIcon}><Popup className="dark-popup"><b>👤 {pedido.cliente}</b><br />{pedido.clienteTel}</Popup></Marker>
            {route && route.coords.length > 1
              ? <Polyline positions={route.coords} pathOptions={{ color: '#4ade80', weight: 5, opacity: 0.8 }} />
              : <Polyline positions={[myPos, clientePos]} pathOptions={{ color: '#4ade80', weight: 3, dashArray: '8 8', opacity: 0.4 }} />
            }
          </MapContainer>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <MapPin size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <p style={{ fontSize: 15, fontWeight: 700 }}>Buscando sua localização…</p>
            </div>
          </div>
        )}

        {myPos && (
          <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel" style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000, borderRadius: 20, padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div className="animate-pulse-neon" style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
              <span style={{ fontSize: 11, color: '#4ade80', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1 }}>
                {route ? 'Rota Otimizada' : 'Radar Ativo'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {distancia && <div><div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{distancia}</div><div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: 500 }}>distância</div></div>}
              {tempo && <div><div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{tempo}</div><div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: 500 }}>a pé</div></div>}
            </div>
          </motion.div>
        )}
      </div>

      <div style={{ padding: '20px', background: '#ffffff', borderTop: '1px solid rgba(0,0,0,0.05)', flexShrink: 0 }}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${pedido.clienteLat},${pedido.clienteLng}`)}
          style={{ width: '100%', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 20, padding: '16px 0', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 25px rgba(34,197,94,0.4)' }}>
          <Navigation size={20} /> INICIAR NAVEGAÇÃO
        </motion.button>
      </div>
    </motion.div>
  )
}

/* ─── BANNER DE NOVO PEDIDO ─────────────────────────────── */
function NewOrderBanner({ order, onDismiss, onView }: { order: IncomingOrder; onDismiss: () => void; onView: () => void }) {
  return (
    <motion.div
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -100, opacity: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 99999,
        background: 'linear-gradient(135deg, rgba(14,165,233,0.95), rgba(34,197,94,0.95))',
        backdropFilter: 'blur(10px)',
        padding: '16px 20px',
        boxShadow: '0 10px 40px rgba(14,165,233,0.5)',
        borderBottom: '1px solid rgba(255,255,255,0.2)'
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <motion.div animate={{ scale: [0.8, 1.2, 1] }} transition={{ duration: 0.5 }} style={{ width: 50, height: 50, borderRadius: 16, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0, boxShadow: 'inset 0 0 10px rgba(255,255,255,0.3)' }}>
          🔔
        </motion.div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: '#fef08a', letterSpacing: 1, marginBottom: 2 }}>
            🔔 NOVO PEDIDO NA ÁREA
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {order.clienteNome} — {order.itens[0]}{order.itens.length > 1 ? ` +${order.itens.length - 1}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4, fontWeight: 600 }}>
            R$ {order.total.toFixed(2)} · Zona {order.zona}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onView}
            style={{ background: '#fff', color: '#0ea5e9', border: 'none', borderRadius: 14, padding: '10px 16px', fontWeight: 900, fontSize: 13, cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}
          >VER</motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onDismiss}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 14, padding: '10px', cursor: 'pointer' }}
          >
            <X size={16} color="#fff" />
          </motion.button>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── PAINEL DE ZONAS ─────────────────────────────────── */
function ZoneAgentPanel({ scores }: { scores: ZoneScore[] }) {
  const top = scores.slice().sort((a, b) => b.score - a.score).slice(0, 3)
  return (
    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel" style={{ margin: '0 20px 20px', borderRadius: 24, padding: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div className="neon-border" style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>Zonas ao Vivo</div>
          <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 2 }}>Movimento da praia em tempo real</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(168,85,247,0.15)', borderRadius: 10, padding: '6px 10px', border: '1px solid rgba(168,85,247,0.3)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#c084fc', boxShadow: '0 0 8px #c084fc' }} className="animate-pulse-neon" />
          <span style={{ fontSize: 10, fontWeight: 800, color: '#c084fc' }}>SYNC</span>
        </div>
      </div>
      {top.map((z, i) => {
        const nivel = z.score > 0.75 ? { emoji: '🔥', color: '#f87171' } : z.score > 0.5 ? { emoji: '🌡️', color: '#fbbf24' } : { emoji: '❄️', color: '#38bdf8' }
        return (
          <motion.div initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.1 }} key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>{nivel.emoji}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.nome}</span>
                <span style={{ fontSize: 12, color: nivel.color, fontWeight: 800, flexShrink: 0, marginLeft: 8 }}>{z.pedidosHora} ped/h</span>
              </div>
              <div style={{ height: 6, background: 'rgba(0,0,0,0.05)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${z.score * 100}%`, background: nivel.color, borderRadius: 10, transition: 'width 1s ease', boxShadow: `0 0 8px ${nivel.color}` }} />
              </div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 900, color: z.tendencia === 'subindo' ? '#4ade80' : z.tendencia === 'descendo' ? '#f87171' : '#94a3b8', flexShrink: 0, width: 16, textAlign: 'center' }}>
              {z.tendencia === 'subindo' ? '↑' : z.tendencia === 'descendo' ? '↓' : '—'}
            </div>
          </motion.div>
        )
      })}
    </motion.div>
  )
}

/* ─── PÁGINA PRINCIPAL ───────────────────────────────────── */
const abas = ['Todos', 'Novos', 'Preparando', 'Em rota', 'Entregues'] as const

function rowToPedido(row: Record<string, unknown>): Pedido {
  const st = String(row.status ?? 'novo')
  return {
    id: String(row.id),
    cliente: String(row.cliente_nome ?? 'Cliente'),
    clienteTel: String(row.cliente_tel ?? '—'),
    itens: (row.itens as string[]) ?? [],
    total: Number(row.total) || 0,
    status: (['novo', 'preparando', 'saiu_entrega', 'entregue'].includes(st) ? st : 'novo') as Status,
    hora: new Date(String(row.created_at)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    clienteLat: Number(row.lat) || -24.0228,
    clienteLng: Number(row.lng) || -46.4305,
    pagamento: String(row.pagamento ?? 'pix'),
  }
}

export default function PedidosPage() {
  const [aba, setAba] = useState<typeof abas[number]>('Todos')
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciais)
  const [locModal, setLocModal] = useState<Pedido | null>(null)
  const [zoneScores, setZoneScores] = useState<ZoneScore[]>([])

  // Hook de notificações em tempo real
  const { orders: liveOrders, latestOrder, dismissLatest } = useOrderNotifications()

  // Carrega os pedidos REAIS deste vendedor ao abrir a tela
  useEffect(() => {
    const sessao = getSessao()
    if (!sessao) return
    supabase
      .from('pedidos')
      .select('*')
      .eq('vendedor_id', sessao.id)
      // pedido online ainda não pago (ou cancelado) não aparece pro vendedor
      .not('status', 'in', '(aguardando_pagamento,cancelado)')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setPedidos(data.map(rowToPedido))
      })
  }, [])

  // Radar de zonas: acompanha a demanda real recebida pelo app.
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
      pagamento: newest.pagamento,
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
    if (aba === 'Em rota') return p.status === 'saiu_entrega'
    if (aba === 'Entregues') return p.status === 'entregue'
    return true
  })

  async function avancar(id: string) {
    const map: Record<Status, Status> = { novo: 'preparando', preparando: 'saiu_entrega', saiu_entrega: 'entregue', entregue: 'entregue' }
    const atual = pedidos.find(p => p.id === id)
    if (!atual) return
    const novoStatus = map[atual.status]
    // otimista na tela + grava no banco (o cliente acompanha em tempo real)
    setPedidos(prev => prev.map(p => (p.id === id ? { ...p, status: novoStatus } : p)))
    const { error } = await supabase.from('pedidos').update({ status: novoStatus }).eq('id', id)
    if (error) {
      console.error('Falha ao atualizar status', error)
      setPedidos(prev => prev.map(p => (p.id === id ? { ...p, status: atual.status } : p)))
    }
  }

  const novosCount = pedidos.filter(p => p.status === 'novo').length

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 40 }}>
      {/* Banner de notificação ao vivo */}
      <AnimatePresence>
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
      </AnimatePresence>

      <AnimatePresence>
        {locModal && <LocationModal pedido={locModal} onClose={() => setLocModal(null)} />}
      </AnimatePresence>

      {/* Header */}
      <div style={{ padding: '24px 20px 0', borderBottom: '1px solid rgba(0,0,0,0.05)', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>Pedidos</h1>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: 500 }}>Radar tático em tempo real</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            {novosCount > 0 && (
              <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 800, border: '1px solid rgba(239,68,68,0.3)' }}>
                {novosCount} {novosCount === 1 ? 'NOVO' : 'NOVOS'}
              </motion.span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 10 }} className="hide-scrollbar">
          {abas.map(a => (
            <button key={a} onClick={() => setAba(a)} style={{ 
              padding: '10px 20px', background: aba === a ? 'rgba(14,165,233,0.15)' : 'rgba(0,0,0,0.05)',
              borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap',
              color: aba === a ? '#38bdf8' : '#94a3b8', transition: 'all 0.2s', border: `1px solid ${aba === a ? 'rgba(14,165,233,0.3)' : 'transparent'}`
            }}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Painel de demanda por zona */}
        {zoneScores.length > 0 && <ZoneAgentPanel scores={zoneScores} />}

        {/* Lista de pedidos */}
        <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filtrados.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
              <Bell size={40} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
              <p style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>Radar Limpo</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>Aguardando sinais de clientes...</p>
            </motion.div>
          )}
          
          <AnimatePresence mode="popLayout">
            {filtrados.map(pedido => {
              const { label, bg, color, icon: Icon } = statusConfig[pedido.status]
              const isNew = pedido.status === 'novo'
              return (
                <motion.div
                  key={pedido.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -20 }}
                  className="glass-panel"
                  style={{
                    borderRadius: 24, padding: 20,
                    boxShadow: isNew ? '0 10px 30px rgba(0,0,0,0.3)' : '0 4px 15px rgba(0,0,0,0.2)',
                    border: isNew
                      ? pedido.isLive ? '1px solid #38bdf8' : '1px solid #fbbf24'
                      : '1px solid rgba(0,0,0,0.05)',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {/* Live badge */}
                  {pedido.isLive && (
                    <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(14,165,233,0.15)', borderRadius: 10, padding: '4px 10px', border: '1px solid rgba(14,165,233,0.3)' }}>
                      <div className="animate-pulse-neon" style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                      <span style={{ fontSize: 10, fontWeight: 900, color: '#38bdf8' }}>AO VIVO</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{pedido.id}</span>
                        <span style={{ background: bg, color, borderRadius: 12, padding: '4px 10px', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${color}40` }}>
                          <Icon size={12} /> {label}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: '#64748b', marginTop: 6, fontWeight: 500 }}>{pedido.cliente} · {pedido.hora}</div>
                    </div>
                    <span style={{ fontSize: 18, fontWeight: 900, color: '#4ade80' }}>
                      R$ {pedido.total.toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, background: 'rgba(0,0,0,0.05)', padding: '6px 12px', borderRadius: 12, width: 'fit-content' }}>
                    {pedido.pagamento === 'pix' && <QrCode size={14} color="#22c55e" />}
                    {pedido.pagamento === 'cartao' && <CreditCard size={14} color="#0ea5e9" />}
                    {pedido.pagamento === 'dinheiro' && <Banknote size={14} color="#fbbf24" />}
                    <span style={{ fontSize: 12, color: '#0f172a', fontWeight: 800, textTransform: 'uppercase' }}>{pedido.pagamento}</span>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                    {pedido.itens.map((item, i) => (
                      <div key={i} style={{ fontSize: 13, color: '#334155', fontWeight: 600, paddingTop: i > 0 ? 6 : 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#475569' }}/>
                        {item}
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => setLocModal(pedido)} style={{ flex: 1, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px 0', color: '#0f172a', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <MapPin size={16} /> Mapa
                    </motion.button>

                    {pedido.status !== 'entregue' && (
                      <motion.button whileTap={{ scale: 0.95 }} onClick={() => avancar(pedido.id)} style={{ flex: 2, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 16, padding: '14px 0', color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}>
                        {pedido.status === 'novo' ? 'ACEITAR PEDIDO' : pedido.status === 'preparando' ? 'SAIU PRA ENTREGA' : 'MARCAR ENTREGUE'}
                        <ChevronRight size={18} />
                      </motion.button>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .dark-popup .leaflet-popup-content-wrapper { background: rgba(255,255,255,0.9); backdrop-filter: blur(10px); color: #f8fafc; border: 1px solid rgba(0,0,0,0.08); border-radius: 12px; }
        .dark-popup .leaflet-popup-tip { background: rgba(255,255,255,0.9); }
      `}</style>
    </div>
  )
}

