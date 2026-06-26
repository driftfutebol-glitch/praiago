import { useState, useEffect, useRef } from 'react'
import { ShoppingBag, TrendingUp, Clock, Star, Users, Map as MapIcon,
         Zap, ArrowUpRight, CheckCircle2, ChefHat, Bike, Bell, X, Shield, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getMockHeatData, PRAIAGO_ZONES, NIVEL_CONFIG } from '../lib/praiagoZones'

// ── Tipos ────────────────────────────────────────────────────
type OrderPayload = {
  id: string
  clienteNome: string
  clienteTel: string
  itens: string[]
  total: number
  clienteLat: number
  clienteLng: number
  zona: string
  ts: number
}

type RobotStatus = 'verificando' | 'ok' | 'alerta'
type Robot = { id: string; nome: string; zona: string; status: RobotStatus; ultimo: string; pedidos: number }

// ── Som de notificação ────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    function beep(t: number, f: number, d: number, v = 0.35) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.type = 'sine'; o.frequency.setValueAtTime(f, t)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(v, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.001, t + d)
      o.start(t); o.stop(t + d)
    }
    const n = ctx.currentTime
    beep(n, 880, 0.14); beep(n + 0.18, 1046, 0.14); beep(n + 0.38, 1318, 0.22)
    setTimeout(() => ctx.close().catch(() => {}), 1000)
  } catch { /* silent fail */ }
}

// ── Dados mock estáticos ─────────────────────────────────────
const PEDIDOS_MOCK = [
  { id: '#104', cliente: 'Ana Silva',    itens: '2x Frango grelhado, 1x Suco',    total: 58.00, status: 'novo',       tempo: 'agora',  zona: 'Boqueirão'  },
  { id: '#103', cliente: 'Pedro Ferraz', itens: '1x Moqueca de camarão',           total: 42.50, status: 'preparando', tempo: '6 min',  zona: 'Canto Forte' },
  { id: '#102', cliente: 'Mariana Lima', itens: '3x Pastel de camarão, 2x Refri', total: 35.00, status: 'pronto',     tempo: '14 min', zona: 'Ocian'       },
  { id: '#101', cliente: 'Carlos Souza', itens: '1x Caldeirada de frutos do mar', total: 67.00, status: 'entregando', tempo: '20 min', zona: 'Tupi'        },
]

const STATUS_CFG: Record<string, { bg: string; cor: string; label: string; icon: any }> = {
  novo:       { bg: 'rgba(239,68,68,0.10)',  cor: '#ef4444', label: 'Novo',      icon: Zap         },
  preparando: { bg: 'rgba(14,165,233,0.10)', cor: '#0ea5e9', label: 'Cozinhando',icon: ChefHat     },
  pronto:     { bg: 'rgba(34,197,94,0.10)',  cor: '#22c55e', label: 'Pronto',    icon: CheckCircle2 },
  entregando: { bg: 'rgba(249,115,22,0.10)', cor: '#f97316', label: 'Em rota',   icon: Bike        },
}

const CARDAPIO_TOP = [
  { nome: 'Moqueca de Camarão',   vendas: 47, cor: '#f97316' },
  { nome: 'Casquinha de Siri',    vendas: 33, cor: '#0ea5e9' },
  { nome: 'Caipirinha de Limão',  vendas: 29, cor: '#22c55e' },
  { nome: 'Água de Coco Natural', vendas: 24, cor: '#a855f7' },
]

const ROBOTS_BASE: Robot[] = [
  { id: 'r1', nome: 'Robô Alpha', zona: 'Boqueirão',   status: 'ok',         ultimo: 'há 8s',   pedidos: 12 },
  { id: 'r2', nome: 'Robô Beta',  zona: 'Ocian',        status: 'verificando',ultimo: 'há 2s',   pedidos: 7  },
  { id: 'r3', nome: 'Robô Gamma', zona: 'Canto Forte',  status: 'alerta',     ultimo: 'há 15s',  pedidos: 4  },
  { id: 'r4', nome: 'Robô Delta', zona: 'Tupi',         status: 'ok',         ultimo: 'há 5s',   pedidos: 9  },
]

// ── StatCard ──────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, gradient, change, live }: {
  icon: any; label: string; value: string; sub?: string
  gradient: string; change?: string; live?: boolean
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 24, padding: '24px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s', cursor: 'default' }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: gradient, opacity: 0.08, filter: 'blur(20px)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, position: 'relative' }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.15)' }}>
          <Icon size={22} color="#fff" />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {live && <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f0fdf4', borderRadius: 20, padding: '4px 8px' }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e', animation: 'dotPulse 1.2s infinite' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: '#16a34a' }}>LIVE</span>
          </div>}
          {change && <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f0fdf4', color: '#16a34a', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20 }}>
            <ArrowUpRight size={11} /> {change}
          </div>}
        </div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── ZonePill ─────────────────────────────────────────────────
function ZonePill({ zoneId }: { zoneId: string }) {
  const heat = getMockHeatData().find(h => h.zoneId === zoneId)
  if (!heat) return null
  const cfg = NIVEL_CONFIG[heat.nivel]
  return (
    <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 8, background: cfg.corFill, color: cfg.cor }}>
      {cfg.emoji} {heat.nivel.toUpperCase()}
    </span>
  )
}

// ── Painel de Robôs IA ────────────────────────────────────────
function RobotsPanel({ robots }: { robots: Robot[] }) {
  const statusCfg = {
    ok:          { label: 'OK',          bg: 'rgba(34,197,94,0.1)',   color: '#16a34a', dot: '#22c55e' },
    verificando: { label: 'Verificando', bg: 'rgba(14,165,233,0.1)',  color: '#0ea5e9', dot: '#0ea5e9' },
    alerta:      { label: 'Alerta',      bg: 'rgba(239,68,68,0.1)',   color: '#ef4444', dot: '#ef4444' },
  }
  return (
    <div style={{ background: '#fff', borderRadius: 28, padding: '24px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#a855f7,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🤖</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Robôs de Verificação IA</div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>Monitoramento automático de zonas</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '5px 10px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', animation: 'dotPulse 1.5s infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed' }}>{robots.length} ativos</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {robots.map(robot => {
          const sc = statusCfg[robot.status]
          return (
            <div key={robot.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 16, border: '1px solid #f1f5f9' }}>
              <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,#1e293b,#334155)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🤖</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{robot.nome}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>📍 {robot.zona} · {robot.pedidos} pedidos detectados</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: sc.bg, borderRadius: 8, padding: '4px 10px' }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc.dot, animation: robot.status === 'verificando' ? 'dotPulse 0.8s infinite' : 'none' }} />
                  <span style={{ fontSize: 10, fontWeight: 800, color: sc.color }}>{sc.label}</span>
                </div>
                <div style={{ fontSize: 9, color: '#94a3b8', textAlign: 'right', marginTop: 3 }}>{robot.ultimo}</div>
              </div>
            </div>
          )
        })}
      </div>
      {/* IA insight */}
      <div style={{ marginTop: 14, padding: '12px 14px', background: 'linear-gradient(135deg,rgba(168,85,247,0.07),rgba(139,92,246,0.04))', border: '1px solid rgba(168,85,247,0.15)', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Activity size={14} color="#a855f7" />
        <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
          IA detectou: Boqueirão com alta demanda — redirecionar 1 entregador
        </span>
      </div>
    </div>
  )
}

// ── Banner de novo pedido ao vivo ─────────────────────────────
function LiveOrderBanner({ order, onDismiss }: { order: OrderPayload; onDismiss: () => void }) {
  return (
    <div style={{
      position: 'fixed', top: 80, right: 24, zIndex: 9999,
      width: 340, background: '#fff', borderRadius: 24,
      boxShadow: '0 20px 60px rgba(0,0,0,0.15)', border: '1px solid #f1f5f9',
      animation: 'notifSlide 0.4s cubic-bezier(0,0,0.2,1)',
      overflow: 'hidden',
    }}>
      {/* Top strip */}
      <div style={{ height: 4, background: 'linear-gradient(90deg,#0ea5e9,#22c55e)' }} />
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 12, background: 'linear-gradient(135deg,#ef4444,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🔔</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', letterSpacing: 0.4 }}>NOVO PEDIDO {order.id}</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>{order.clienteNome}</div>
            </div>
          </div>
          <button onClick={onDismiss} style={{ background: '#f8fafc', border: 'none', borderRadius: 10, padding: 6, cursor: 'pointer' }}>
            <X size={14} color="#94a3b8" />
          </button>
        </div>
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
          {order.itens.slice(0, 2).map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: '#475569', marginBottom: i < order.itens.length - 1 ? 3 : 0 }}>• {item}</div>
          ))}
          {order.itens.length > 2 && <div style={{ fontSize: 11, color: '#94a3b8' }}>+{order.itens.length - 2} itens</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} color="#a855f7" />
            <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>Zona {order.zona}</span>
          </div>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#16a34a' }}>R$ {order.total.toFixed(2)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Page principal ────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const heatData = getMockHeatData()
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'

  const [liveOrders, setLiveOrders] = useState<OrderPayload[]>([])
  const [latestOrder, setLatestOrder] = useState<OrderPayload | null>(null)
  const [robots, setRobots] = useState<Robot[]>(ROBOTS_BASE)
  const [todayCount, setTodayCount] = useState(28)
  const [revenue, setRevenue] = useState(1240)
  const channelRef = useRef<BroadcastChannel | null>(null)

  // Escuta pedidos ao vivo via BroadcastChannel
  useEffect(() => {
    channelRef.current = new BroadcastChannel('praiago:orders')
    channelRef.current.onmessage = (e: MessageEvent<OrderPayload>) => {
      const order = e.data
      playBeep()
      setLatestOrder(order)
      setLiveOrders(prev => [order, ...prev.slice(0, 9)])
      setTodayCount(c => c + 1)
      setRevenue(r => r + order.total)
    }
    return () => channelRef.current?.close()
  }, [])

  // Simula robôs mudando de status a cada 5s
  useEffect(() => {
    const id = setInterval(() => {
      setRobots(prev => prev.map(r => ({
        ...r,
        status: Math.random() < 0.2 ? 'verificando' : Math.random() < 0.1 ? 'alerta' : 'ok' as RobotStatus,
        ultimo: `há ${Math.floor(Math.random() * 20) + 1}s`,
        pedidos: r.pedidos + (Math.random() < 0.4 ? 1 : 0),
      })))
    }, 5000)
    return () => clearInterval(id)
  }, [])

  // Auto-dismiss banner após 6s
  useEffect(() => {
    if (!latestOrder) return
    const timer = setTimeout(() => setLatestOrder(null), 6000)
    return () => clearTimeout(timer)
  }, [latestOrder])

  const allPedidos = [
    ...(liveOrders.slice(0, 2).map(o => ({
      id: o.id, cliente: o.clienteNome, itens: o.itens.join(', '),
      total: o.total, status: 'novo', tempo: 'agora', zona: o.zona,
    }))),
    ...PEDIDOS_MOCK,
  ].slice(0, 6)

  return (
    <div style={{ padding: '32px 40px 48px', background: '#f8fafc', minHeight: '100vh' }}>

      {/* Notificação flutuante */}
      {latestOrder && <LiveOrderBanner order={latestOrder} onDismiss={() => setLatestOrder(null)} />}

      {/* ── Cabeçalho ────────────────────────────────────────── */}
      <div style={{ marginBottom: 36 }}>
        <p style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>{saudacao}, Restaurante Maré 👋</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 style={{ fontSize: 34, fontWeight: 900, color: '#0f172a', letterSpacing: -1, margin: 0 }}>Painel de Controle</h1>
          {liveOrders.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,rgba(239,68,68,0.08),rgba(249,115,22,0.06))', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 16, padding: '10px 18px', animation: 'fadeIn 0.3s' }}>
              <Bell size={16} color="#ef4444" />
              <span style={{ fontSize: 13, fontWeight: 800, color: '#ef4444' }}>{liveOrders.length} pedido{liveOrders.length > 1 ? 's' : ''} ao vivo</span>
            </div>
          )}
        </div>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 6 }}>
          Quarta-feira, 25 Jun 2026 · Praia Grande, SP
        </p>
      </div>

      {/* ── Stats ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20, marginBottom: 32 }}>
        <StatCard icon={ShoppingBag} label="Pedidos hoje"  value={String(todayCount)}         sub={`${allPedidos.filter(p=>p.status==='novo').length} em andamento`}  gradient="linear-gradient(135deg,#f97316,#ea580c)" change="+12%"  live />
        <StatCard icon={TrendingUp}  label="Faturamento"   value={`R$ ${revenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}`} sub="meta: R$ 1.500" gradient="linear-gradient(135deg,#22c55e,#16a34a)" change="+8.2%" live />
        <StatCard icon={Users}       label="Clientes hoje" value="21"                          sub="3 novos"                                                              gradient="linear-gradient(135deg,#0ea5e9,#0284c7)" />
        <StatCard icon={Star}        label="Avaliação"     value="4.8 ★"                       sub="142 avaliações"                                                       gradient="linear-gradient(135deg,#f59e0b,#d97706)" />
      </div>

      {/* ── Grid principal ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 28 }}>

        {/* Pedidos ativos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ background: '#fff', borderRadius: 28, padding: '28px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', margin: 0 }}>Pedidos Ativos</h2>
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  {liveOrders.length > 0 ? `⚡ ${liveOrders.length} chegaram em tempo real` : 'Atualizado em tempo real'}
                </p>
              </div>
              <button onClick={() => navigate('/pedidos')} style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', border: 'none', borderRadius: 14, padding: '8px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                Ver todos <ArrowUpRight size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {allPedidos.map((p, idx) => {
                const s = STATUS_CFG[p.status] ?? STATUS_CFG['novo']
                const SIcon = s.icon
                const isNew = idx < liveOrders.length
                return (
                  <div key={`${p.id}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', borderRadius: 20, background: isNew ? 'rgba(14,165,233,0.04)' : '#f8fafc', border: isNew ? '1px solid rgba(14,165,233,0.2)' : '1px solid #f1f5f9', animation: isNew ? 'cardSlide 0.3s ease' : 'none', transition: 'all 0.2s' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 16, flexShrink: 0, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      <SIcon size={22} color={s.cor} />
                      {isNew && <div style={{ position: 'absolute', top: -4, right: -4, width: 12, height: 12, borderRadius: '50%', background: '#ef4444', border: '2px solid #fff', animation: 'dotPulse 1s infinite' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{p.cliente}</span>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{p.id}</span>
                        {isNew && <span style={{ fontSize: 9, fontWeight: 800, color: '#0ea5e9', background: 'rgba(14,165,233,0.1)', borderRadius: 6, padding: '2px 6px' }}>AO VIVO</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>{p.itens}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ZonePill zoneId={`praia_${p.zona.toLowerCase().replace(' ', '_').replace(/ã/g,'a').replace(/ó/g,'o')}`} />
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>📍 {p.zona}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>R$ {p.total.toFixed(2)}</div>
                      <div style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: s.bg, color: s.cor, marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}><Clock size={10} /> {p.tempo}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Robôs IA */}
          <RobotsPanel robots={robots} />
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Entregas ao vivo */}
          <div style={{ background: 'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)', borderRadius: 28, padding: '28px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -15, bottom: -15, opacity: 0.06 }}>
              <MapIcon size={140} color="#fff" />
            </div>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.25)', animation: 'dotPulse 1.2s infinite' }} />
                <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Ao vivo</span>
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>Entregas em Rota</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>2 entregadores ativos agora</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
                {['🚴 Carlos · Boqueirão', '🏍️ Lucas · Ocian'].map(e => (
                  <div key={e} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '8px 12px', fontSize: 12, color: '#cbd5e1', fontWeight: 600, flex: 1, textAlign: 'center' }}>{e}</div>
                ))}
              </div>
              <button onClick={() => navigate('/mapa')} style={{ width: '100%', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', border: 'none', borderRadius: 18, padding: '14px', fontWeight: 800, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 8px 20px rgba(249,115,22,0.35)' }}>
                <MapIcon size={18} /> Ver Mapa de Zonas
              </button>
            </div>
          </div>

          {/* Zonas agora */}
          <div style={{ background: '#fff', borderRadius: 28, padding: '24px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>Zonas Agora</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Zap size={14} color="#a855f7" />
                <span style={{ fontSize: 10, color: '#a855f7', fontWeight: 700 }}>IA ativa</span>
              </div>
            </div>
            {heatData.slice(0, 4).map(h => {
              const zone = PRAIAGO_ZONES.find(z => z.id === h.zoneId)
              const cfg = NIVEL_CONFIG[h.nivel]
              if (!zone) return null
              return (
                <div key={h.zoneId} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>{zone.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                      <span style={{ color: '#0f172a' }}>{zone.nome}</span>
                      <span style={{ color: cfg.cor }}>{h.pedidosHora} pedidos/h</span>
                    </div>
                    <div style={{ height: 5, background: '#f1f5f9', borderRadius: 10 }}>
                      <div style={{ height: '100%', width: `${h.score * 100}%`, background: cfg.cor, borderRadius: 10, transition: 'width 0.8s' }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: cfg.cor }}>{cfg.emoji}</span>
                </div>
              )
            })}
            <button onClick={() => navigate('/mapa')} style={{ width: '100%', marginTop: 6, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: '10px', fontSize: 13, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>
              Ver mapa completo →
            </button>
          </div>

          {/* Top Cardápio */}
          <div style={{ background: '#fff', borderRadius: 28, padding: '24px', border: '1px solid #f1f5f9', boxShadow: '0 4px 20px rgba(0,0,0,0.04)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: '0 0 18px' }}>🏆 Top Cardápio Hoje</h3>
            {CARDAPIO_TOP.map((item, i) => (
              <div key={item.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 900, color: '#94a3b8', width: 16 }}>#{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    <span style={{ color: '#0f172a' }}>{item.nome}</span>
                    <span style={{ color: item.cor }}>{item.vendas}</span>
                  </div>
                  <div style={{ height: 4, background: '#f1f5f9', borderRadius: 10 }}>
                    <div style={{ height: '100%', width: `${(item.vendas / 50) * 100}%`, background: item.cor, borderRadius: 10 }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Segurança / Shield */}
          <div style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.06),rgba(14,165,233,0.04))', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 24, padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={20} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Sistema Seguro</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>4 robôs verificando · criptografia ativa</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: '#16a34a' }}>✓ Online</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dotPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.3)} }
        @keyframes cardSlide { from{transform:translateY(-8px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes notifSlide { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  )
}
