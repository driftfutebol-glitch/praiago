import { useState, useEffect, useRef } from 'react'
import { ShoppingBag, TrendingUp, Clock, Star, Users, Map as MapIcon,
         Zap, ArrowUpRight, CheckCircle2, ChefHat, Bike, Bell, X, Shield, Activity } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

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


// ── StatCard ──────────────────────────────────────────────────
const STATUS_CFG: Record<string, { bg: string; cor: string; label: string; icon: any }> = {
  novo:       { bg: 'rgba(239,68,68,0.15)',  cor: '#f87171', label: 'Novo',      icon: Zap         },
  preparando: { bg: 'rgba(14,165,233,0.15)', cor: '#38bdf8', label: 'Cozinhando',icon: ChefHat     },
  pronto:     { bg: 'rgba(34,197,94,0.15)',  cor: '#4ade80', label: 'Pronto',    icon: CheckCircle2 },
  entregando: { bg: 'rgba(249,115,22,0.15)', cor: '#fb923c', label: 'Em rota',   icon: Bike        },
}

function StatCard({ icon: Icon, label, value, sub, gradient, change, live, delay }: {
  icon: any; label: string; value: string; sub?: string
  gradient: string; change?: string; live?: boolean; delay: number
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.4 }} className="glass-panel" style={{ borderRadius: 24, padding: '24px', position: 'relative', overflow: 'hidden', transition: 'transform 0.2s' }} whileHover={{ y: -5 }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: gradient, opacity: 0.15, filter: 'blur(20px)' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, position: 'relative' }}>
        <div style={{ width: 48, height: 48, borderRadius: 16, background: gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(0,0,0,0.3)' }}>
          <Icon size={22} color="#fff" />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {live && <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '4px 8px' }}>
            <div className="animate-pulse-neon" style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
            <span style={{ fontSize: 9, fontWeight: 900, color: '#4ade80', letterSpacing: 0.5 }}>LIVE</span>
          </div>}
          {change && <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(34,197,94,0.1)', color: '#4ade80', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 20 }}>
            <ArrowUpRight size={11} /> {change}
          </div>}
        </div>
      </div>
      <div style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', letterSpacing: -1 }}>{value}</div>
      <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{sub}</div>}
    </motion.div>
  )
}

function ZonePill({ zoneId }: { zoneId: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 8, background: `rgba(0,0,0,0.05)`, color: '#334155', border: `1px solid rgba(0,0,0,0.08)` }}>
      📍 {zoneId.replace('praia_', '').toUpperCase()}
    </span>
  )
}

// Removido RobotsPanel
// ── Banner de novo pedido ao vivo ─────────────────────────────
function LiveOrderBanner({ order, onDismiss }: { order: OrderPayload; onDismiss: () => void }) {
  return (
    <motion.div initial={{ x: 100, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 100, opacity: 0 }} style={{
      position: 'fixed', top: 80, right: 24, zIndex: 9999,
      width: 340, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(20px)', borderRadius: 24,
      boxShadow: '0 20px 60px rgba(0,0,0,0.5)', border: '1px solid rgba(0,0,0,0.08)',
      overflow: 'hidden',
    }}>
      {/* Top strip */}
      <div style={{ height: 4, background: 'linear-gradient(90deg,#0ea5e9,#4ade80)', boxShadow: '0 0 10px #4ade80' }} />
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#ef4444,#f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 0 15px rgba(239,68,68,0.4)' }}>🔔</div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 900, color: '#f87171', letterSpacing: 0.5 }}>NOVO PEDIDO {order.id}</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>{order.clienteNome}</div>
            </div>
          </div>
          <button onClick={onDismiss} style={{ background: 'rgba(0,0,0,0.05)', border: 'none', borderRadius: 10, padding: 6, cursor: 'pointer' }}>
            <X size={16} color="#94a3b8" />
          </button>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: '12px', marginBottom: 12, border: '1px solid rgba(0,0,0,0.05)' }}>
          {order.itens.slice(0, 2).map((item, i) => (
            <div key={i} style={{ fontSize: 12, color: '#334155', marginBottom: i < order.itens.length - 1 ? 4 : 0, fontWeight: 500 }}>• {item}</div>
          ))}
          {order.itens.length > 2 && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4, fontWeight: 700 }}>+{order.itens.length - 2} itens</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={14} color="#c084fc" />
            <span style={{ fontSize: 12, color: '#c084fc', fontWeight: 800 }}>Zona {order.zona}</span>
          </div>
          <span style={{ fontSize: 16, fontWeight: 900, color: '#4ade80' }}>R$ {order.total.toFixed(2)}</span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Page principal ────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const sessao = getSessao()
  const nomeRestaurante = sessao?.nome?.trim() || 'seu restaurante'
  const dataHoje = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date())

  const [liveOrders, setLiveOrders] = useState<OrderPayload[]>([])
  const [latestOrder, setLatestOrder] = useState<OrderPayload | null>(null)
  const [todayCount, setTodayCount] = useState(0)
  const [revenue, setRevenue] = useState(0)
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

  useEffect(() => {
    async function loadStats() {
      const s = getSessao()
      if (!s) return
      
      const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0)  // dia LOCAL, não UTC
      const { data } = await supabase
        .from('pedidos')
        .select('total,status')
        .eq('vendedor_id', s.id)
        .gte('created_at', inicioDia.toISOString())
      if (data) {
        // só conta pedido pago/válido (fora aguardando_pagamento e cancelado)
        const validos = data.filter(p => !['aguardando_pagamento', 'cancelado', 'pagamento_recusado'].includes(String(p.status)))
        setTodayCount(validos.length)
        setRevenue(validos.reduce((acc, p) => acc + Number(p.total), 0))
      }
    }
    loadStats()
  }, [])

  // Auto-dismiss banner após 6s
  useEffect(() => {
    if (!latestOrder) return
    const timer = setTimeout(() => setLatestOrder(null), 6000)
    return () => clearTimeout(timer)
  }, [latestOrder])

  const allPedidos = liveOrders.slice(0, 6).map(o => ({
      id: o.id, cliente: o.clienteNome, itens: o.itens.join(', '),
      total: o.total, status: 'novo', tempo: 'agora', zona: o.zona,
  }))

  return (
    <div style={{ padding: '32px 40px 48px', minHeight: '100vh', position: 'relative' }}>

      {/* Notificação flutuante */}
      <AnimatePresence>
        {latestOrder && <LiveOrderBanner order={latestOrder} onDismiss={() => setLatestOrder(null)} />}
      </AnimatePresence>

      {/* ── Cabeçalho ────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: 36 }}>
        <p style={{ fontSize: 15, color: '#64748b', fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>{saudacao}, {nomeRestaurante} 👋</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', letterSpacing: -1, margin: 0, textShadow: '0 0 30px rgba(0,0,0,0.08)' }}>Painel de Controle</h1>
          <AnimatePresence>
            {liveOrders.length > 0 && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '12px 20px', boxShadow: '0 0 20px rgba(239,68,68,0.2)' }}>
                <Bell size={18} color="#f87171" className="animate-pulse-neon" />
                <span style={{ fontSize: 14, fontWeight: 900, color: '#f87171', letterSpacing: 0.5 }}>{liveOrders.length} PEDIDO{liveOrders.length > 1 ? 'S' : ''} AO VIVO</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 8, fontWeight: 500 }}>
          {dataHoje} · Praia Grande, SP
        </p>
      </motion.div>

      {/* ── Stats ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, marginBottom: 36 }}>
        <StatCard delay={0.1} icon={ShoppingBag} label="Pedidos hoje"  value={String(todayCount)}         sub={`${allPedidos.filter(p=>p.status==='novo').length} em andamento`}  gradient="linear-gradient(135deg,#f97316,#ea580c)" change="+0%"  live />
        <StatCard delay={0.2} icon={TrendingUp}  label="Faturamento"   value={`R$ ${revenue.toLocaleString('pt-BR',{minimumFractionDigits:0})}`} sub="meta: R$ 0" gradient="linear-gradient(135deg,#22c55e,#16a34a)" change="+0%" live />
        <StatCard delay={0.3} icon={Users}       label="Clientes hoje" value="0"                          sub="0 novos"                                                              gradient="linear-gradient(135deg,#0ea5e9,#0284c7)" />
        <StatCard delay={0.4} icon={Star}        label="Avaliação"     value="0.0 ★"                       sub="0 avaliações"                                                       gradient="linear-gradient(135deg,#f59e0b,#d97706)" />
      </div>

      {/* ── Grid principal ────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 28 }}>

        {/* Pedidos ativos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="glass-panel" style={{ borderRadius: 28, padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  Pedidos Ativos <div className="animate-pulse-neon" style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }} />
                </h2>
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 6, fontWeight: 500 }}>
                  {liveOrders.length > 0 ? `⚡ ${liveOrders.length} chegaram em tempo real` : 'Atualizado em tempo real'}
                </p>
              </div>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/pedidos')} style={{ background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', border: 'none', borderRadius: 16, padding: '10px 20px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 20px rgba(249,115,22,0.3)' }}>
                Ver todos <ArrowUpRight size={16} />
              </motion.button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AnimatePresence>
                {allPedidos.map((p, idx) => {
                  const s = STATUS_CFG[p.status] ?? STATUS_CFG['novo']
                  const SIcon = s.icon
                  const isNew = idx < liveOrders.length
                  return (
                    <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} key={`${p.id}-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderRadius: 20, background: isNew ? 'rgba(14,165,233,0.05)' : 'rgba(255,255,255,0.02)', border: isNew ? '1px solid rgba(14,165,233,0.3)' : '1px solid rgba(0,0,0,0.05)', transition: 'all 0.2s', boxShadow: isNew ? '0 0 20px rgba(14,165,233,0.1)' : 'none' }}>
                      <div style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', border: `1px solid ${s.cor}30` }}>
                        <SIcon size={24} color={s.cor} />
                        {isNew && <div className="animate-pulse-neon" style={{ position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: '#f87171', border: '3px solid #1e293b' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{p.cliente}</span>
                          <span style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>{p.id}</span>
                          {isNew && <span style={{ fontSize: 10, fontWeight: 900, color: '#38bdf8', background: 'rgba(14,165,233,0.15)', borderRadius: 8, padding: '2px 8px', letterSpacing: 0.5 }}>AO VIVO</span>}
                        </div>
                        <div style={{ fontSize: 13, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6, fontWeight: 500 }}>{p.itens}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ZonePill zoneId={`praia_${p.zona.toLowerCase().replace(' ', '_').replace(/ã/g,'a').replace(/ó/g,'o')}`} />
                          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>📍 {p.zona}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginBottom: 6, textShadow: '0 0 10px rgba(0,0,0,0.08)' }}>R$ {p.total.toFixed(2)}</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, padding: '4px 12px', borderRadius: 10, background: s.bg, color: s.cor, marginBottom: 6, border: `1px solid ${s.cor}30` }}>{s.label.toUpperCase()}</div>
                        <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', fontWeight: 700 }}><Clock size={12} /> {p.tempo}</div>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </motion.div>

        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* Entregas ao vivo */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="glass-panel neon-border" style={{ borderRadius: 28, padding: '28px', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.9) 100%)' }}>
            <div style={{ position: 'absolute', right: -20, bottom: -20, opacity: 0.1 }}>
              <MapIcon size={160} color="#f97316" />
            </div>
            <div style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div className="animate-pulse-neon" style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.5 }}>Ao vivo</span>
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', margin: '0 0 8px' }}>Entregas em Rota</h3>
              <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px', fontWeight: 500 }}>0 entregadores ativos agora</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {([] as string[]).map((e, i) => (
                  <motion.div whileHover={{ scale: 1.02 }} key={e} style={{ background: 'rgba(0,0,0,0.05)', borderRadius: 16, padding: '12px 16px', fontSize: 14, color: '#0f172a', fontWeight: 700, border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: i === 0 ? 'rgba(14,165,233,0.2)' : 'rgba(249,115,22,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: i === 0 ? '#38bdf8' : '#fb923c' }}>{e.split(' ')[0]}</div>
                    {e.split(' ').slice(1).join(' ')}
                  </motion.div>
                ))}
              </div>
              <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/mapa')} style={{ width: '100%', background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', border: 'none', borderRadius: 20, padding: '16px', fontWeight: 900, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 8px 30px rgba(249,115,22,0.4)', letterSpacing: 0.5 }}>
                <MapIcon size={20} /> ACESSAR RADAR TÁTICO
              </motion.button>
            </div>
          </motion.div>

          {/* Zonas agora */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="glass-panel" style={{ borderRadius: 28, padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h3 style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', margin: 0 }}>Zonas Agora</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(168,85,247,0.1)', padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(168,85,247,0.3)' }}>
                <Zap size={14} color="#c084fc" />
                <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 800, letterSpacing: 0.5 }}>AO VIVO</span>
              </div>
            </div>
          </motion.div>



          {/* Segurança / Shield */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.8 }} style={{ background: 'linear-gradient(135deg,rgba(34,197,94,0.1),rgba(14,165,233,0.05))', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 24, padding: '20px', boxShadow: '0 0 20px rgba(34,197,94,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(34,197,94,0.4)' }}>
                <Shield size={22} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>Sistema Seguro</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>4 robôs verificando · Criptografia ativa</div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 900, color: '#4ade80', textShadow: '0 0 10px rgba(74,222,128,0.5)' }}>✓ ONLINE</div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
