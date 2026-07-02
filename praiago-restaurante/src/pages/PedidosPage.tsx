import { useState, useEffect } from 'react'
import { CheckCircle2, ChevronRight, Zap, ChefHat, Bike,
         Search, MapPin, Truck, Package, QrCode, CreditCard, Banknote } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOrders, type Status } from '../store/useOrders'

const STATUS_CFG: Record<Status, { label: string; bg: string; cor: string; icon: any; glow: string }> = {
  novo:       { label: 'Novo',       bg: 'rgba(239,68,68,0.15)',   cor: '#f87171', icon: Zap,         glow: 'rgba(239,68,68,0.3)'   },
  preparando: { label: 'Cozinhando', bg: 'rgba(14,165,233,0.15)',  cor: '#38bdf8', icon: ChefHat,     glow: 'rgba(14,165,233,0.3)'  },
  pronto:     { label: 'Pronto',     bg: 'rgba(34,197,94,0.15)',   cor: '#4ade80', icon: CheckCircle2, glow: 'rgba(34,197,94,0.3)'  },
  entregando: { label: 'Em Rota',    bg: 'rgba(249,115,22,0.15)',  cor: '#fb923c', icon: Bike,        glow: 'rgba(249,115,22,0.3)'  },
  entregue:   { label: 'Entregue',   bg: 'rgba(100,116,139,0.15)', cor: '#94a3b8', icon: CheckCircle2, glow: 'transparent'           },
}

const NEXT: Record<Status, Status | null> = {
  novo: 'preparando', preparando: 'pronto', pronto: 'entregando', entregando: 'entregue', entregue: null,
}

const NEXT_LABEL: Record<Status, string> = {
  novo: '✅ Aceitar & Iniciar',
  preparando: '🍽️ Marcar como pronto',
  pronto: '🛵 Enviar p/ entrega',
  entregando: '—', entregue: '—',
}

const TABS: { key: Status | 'todos'; label: string; emoji: string }[] = [
  { key: 'todos',      label: 'Todos',     emoji: '📋' },
  { key: 'novo',       label: 'Novos',     emoji: '🆕' },
  { key: 'preparando', label: 'Cozinha',   emoji: '👨‍🍳' },
  { key: 'pronto',     label: 'Prontos',   emoji: '✅' },
  { key: 'entregando', label: 'Em Rota',   emoji: '🛵' },
  { key: 'entregue',   label: 'Entregues', emoji: '🏁' },
]

export default function PedidosPage() {
  const pedidos  = useOrders(s => s.pedidos)
  const avancar  = useOrders(s => s.avancar)
  const recusar  = useOrders(s => s.recusar)
  const markSeen = useOrders(s => s.markSeen)
  const [tab,    setTab]     = useState<Status | 'todos'>('todos')
  const [busca,  setBusca]   = useState('')

  // Ao abrir a tela, zera o contador de "novos" da sidebar
  useEffect(() => { markSeen() }, [markSeen])

  const filtrados = pedidos.filter(p => {
    const matchTab   = tab === 'todos' || p.status === tab
    const matchBusca = busca === ''
      || p.cliente.toLowerCase().includes(busca.toLowerCase())
      || p.id.includes(busca)
      || p.zona.toLowerCase().includes(busca.toLowerCase())
    return matchTab && matchBusca
  })

  const count = (s: Status | 'todos') =>
    s === 'todos' ? pedidos.length : pedidos.filter(p => p.status === s).length

  return (
    <div style={{ padding: '32px 40px 48px', minHeight: '100vh', position: 'relative' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', letterSpacing: -1, margin: '0 0 8px', textShadow: '0 0 30px rgba(0,0,0,0.08)' }}>
            Gerenciar Pedidos
          </h1>
          <p style={{ fontSize: 15, color: '#64748b', margin: 0, fontWeight: 500 }}>
            {pedidos.filter(p => p.status !== 'entregue').length} ativos ·{' '}
            <span className="animate-pulse-neon" style={{ color: '#f87171', fontWeight: 800, background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
              {pedidos.filter(p => p.status === 'novo').length} novos aguardando
            </span>
          </p>
        </div>

        {/* Busca */}
        <div style={{ position: 'relative' }}>
          <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente, zona..."
            style={{
              padding: '14px 16px 14px 44px', borderRadius: 16,
              border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)',
              fontSize: 14, color: '#0f172a', outline: 'none', width: 300,
              boxShadow: 'inset 0 2px 5px rgba(0,0,0,0.2)', transition: 'all 0.2s',
            }}
            onFocus={(e) => { e.target.style.border = '1px solid rgba(249,115,22,0.5)'; e.target.style.boxShadow = '0 0 15px rgba(249,115,22,0.2)' }}
            onBlur={(e) => { e.target.style.border = '1px solid rgba(0,0,0,0.08)'; e.target.style.boxShadow = 'inset 0 2px 5px rgba(0,0,0,0.2)' }}
          />
        </div>
      </motion.div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const active = tab === t.key
          const cnt = count(t.key as any)
          return (
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} key={t.key} onClick={() => setTab(t.key as any)} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 16, border: active ? '1px solid rgba(249,115,22,0.4)' : '1px solid rgba(0,0,0,0.05)',
              background: active ? 'linear-gradient(135deg,rgba(249,115,22,0.15),rgba(234,88,12,0.05))' : 'rgba(255,255,255,0.02)',
              color: active ? '#f97316' : '#94a3b8',
              fontWeight: 800, fontSize: 14, cursor: 'pointer',
              boxShadow: active ? '0 0 20px rgba(249,115,22,0.15)' : 'none',
              transition: 'all 0.2s',
            }}>
              <span style={{ fontSize: 16 }}>{t.emoji}</span> {t.label}
              {cnt > 0 && (
                <span style={{
                  background: active ? '#f97316' : 'rgba(0,0,0,0.08)',
                  color: active ? '#fff' : '#cbd5e1',
                  fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 10,
                  boxShadow: active ? '0 0 10px rgba(249,115,22,0.5)' : 'none'
                }}>{cnt}</span>
              )}
            </motion.button>
          )
        })}
      </motion.div>

      {/* ── Cards de pedidos ───────────────────────────────── */}
      <motion.div layout style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 24 }}>
        <AnimatePresence>
          {filtrados.length === 0 && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px 0', color: '#64748b' }}>
              <div style={{ fontSize: 60, marginBottom: 16, opacity: 0.5 }}>🔍</div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.5 }}>Nenhum pedido encontrado nesta categoria</div>
            </motion.div>
          )}

          {filtrados.map((p, idx) => {
            const s = STATUS_CFG[p.status]
            const SIcon = s.icon
            const canAdv = NEXT[p.status] !== null

            return (
              <motion.div layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.3 }} key={p.id} className="glass-panel" style={{
                borderRadius: 24, padding: '24px',
                border: p.status === 'novo' ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(0,0,0,0.06)',
                boxShadow: p.status === 'novo'
                  ? `0 0 30px ${s.glow}, inset 0 0 10px ${s.glow}`
                  : '0 8px 32px rgba(0,0,0,0.2)',
                position: 'relative', overflow: 'hidden'
              }}>
                {/* Efeito luminoso de fundo sutil */}
                <div style={{ position: 'absolute', top: -50, right: -50, width: 150, height: 150, background: s.cor, opacity: 0.05, filter: 'blur(40px)', borderRadius: '50%' }} />

                {/* Header do card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, position: 'relative', zIndex: 1 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <div className={p.status === 'novo' || p.status === 'preparando' ? "animate-pulse-neon" : ""} style={{ width: 44, height: 44, borderRadius: 14, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${s.cor}40`, boxShadow: `0 0 15px ${s.glow}` }}>
                        <SIcon size={22} color={s.cor} />
                      </div>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{p.cliente}</div>
                        <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: '#334155' }}>{p.id}</span> · {p.hora}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.05)', padding: '6px 12px', borderRadius: 12 }}>
                        <MapPin size={14} color="#a855f7" />
                        <span style={{ fontSize: 13, color: '#e9d5ff', fontWeight: 700 }}>{p.zona}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.05)', padding: '6px 12px', borderRadius: 12 }}>
                        {p.pagamento === 'pix' && <QrCode size={14} color="#22c55e" />}
                        {p.pagamento === 'cartao' && <CreditCard size={14} color="#0ea5e9" />}
                        {p.pagamento === 'dinheiro' && <Banknote size={14} color="#fbbf24" />}
                        <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 700, textTransform: 'uppercase' }}>{p.pagamento}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 900, color: '#4ade80', textShadow: '0 0 15px rgba(74,222,128,0.3)', marginBottom: 8 }}>
                      R$ {p.total.toFixed(2)}
                    </div>
                    <span style={{
                      fontSize: 11, fontWeight: 900, padding: '4px 12px', borderRadius: 12,
                      background: s.bg, color: s.cor, border: `1px solid ${s.cor}40`, letterSpacing: 0.5
                    }}>{s.label.toUpperCase()}</span>
                  </div>
                </div>

                {/* Itens */}
                <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 16, padding: '16px', marginBottom: 20, position: 'relative', zIndex: 1 }}>
                  {p.itens.map((item, i) => (
                    <div key={i} style={{ fontSize: 14, color: '#334155', lineHeight: '1.8', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.cor, boxShadow: `0 0 5px ${s.cor}` }} /> {item}
                    </div>
                  ))}
                </div>

                {/* Entregador */}
                {p.entregador && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13, color: '#38bdf8', fontWeight: 800, background: 'rgba(14,165,233,0.1)', padding: '8px 14px', borderRadius: 12, border: '1px solid rgba(14,165,233,0.2)' }}>
                    <Truck size={16} /> {p.entregador} em rota
                  </div>
                )}

                {/* Botões de ação */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                  {p.status === 'novo' && (
                    <div style={{ display: 'flex', gap: 12 }}>
                      <motion.button whileHover={{ scale: 1.02, backgroundColor: 'rgba(239,68,68,0.1)' }} whileTap={{ scale: 0.98 }} onClick={() => recusar(p.id)} style={{
                        flex: 1, padding: '14px 0', borderRadius: 16,
                        border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.05)',
                        color: '#f87171', fontSize: 14, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s'
                      }}>✕ RECUSAR</motion.button>
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => avancar(p.id)} style={{
                        flex: 2, padding: '14px 0', borderRadius: 16, border: 'none',
                        background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                        color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer',
                        boxShadow: '0 8px 25px rgba(34,197,94,0.4)', textShadow: '0 1px 2px rgba(0,0,0,0.2)'
                      }}>✅ ACEITAR & INICIAR</motion.button>
                    </div>
                  )}

                  {(p.status === 'preparando' || p.status === 'pronto') && canAdv && (
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => avancar(p.id)} style={{
                      width: '100%', padding: '14px 0', borderRadius: 16, border: 'none',
                      background: p.status === 'preparando'
                        ? 'linear-gradient(135deg,#0ea5e9,#0284c7)'
                        : 'linear-gradient(135deg,#f97316,#ea580c)',
                      color: '#fff', fontSize: 15, fontWeight: 900, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                      boxShadow: p.status === 'preparando' ? '0 8px 25px rgba(14,165,233,0.4)' : '0 8px 25px rgba(249,115,22,0.4)',
                      letterSpacing: 0.5
                    }}>
                      {NEXT_LABEL[p.status].toUpperCase()} <ChevronRight size={18} />
                    </motion.button>
                  )}

                  {p.status === 'entregando' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 0', color: '#fb923c', fontSize: 14, fontWeight: 800, background: 'rgba(249,115,22,0.05)', borderRadius: 16, border: '1px solid rgba(249,115,22,0.1)' }}>
                      <Bike size={18} className="animate-pulse-neon" /> ENTREGANDO NA PRAIA...
                    </div>
                  )}

                  {p.status === 'entregue' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '12px 0', color: '#64748b', fontSize: 14, fontWeight: 800, background: 'rgba(255,255,255,0.02)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.05)' }}>
                      <Package size={16} /> ENTREGA CONCLUÍDA
                    </div>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
