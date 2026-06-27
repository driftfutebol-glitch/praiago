import { useState, useEffect } from 'react'
import { Package, Bell, MapPin, TrendingUp, DollarSign,
         ShoppingBag, Settings, ChevronRight, Navigation } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGPS } from '../hooks/useGPS'

// Dados reais de stats do Supabase
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

// ── Barra de precisão GPS ────────────────────────────────────
function AccuracyBar({ accuracy }: { accuracy: number }) {
  const isExc  = accuracy < 25
  const isGood = accuracy < 80
  const cor    = isExc ? '#4ade80' : isGood ? '#fbbf24' : '#f87171'
  const label  = isExc ? 'Excelente' : isGood ? 'Boa' : 'Baixa'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', letterSpacing: 1 }}>PRECISÃO RADAR</span>
        <span style={{ fontSize: 10, fontWeight: 800, color: cor }}>{label} · ±{Math.round(accuracy)}m</span>
      </div>
      <div style={{ height: 6, background: 'rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden', display: 'flex', gap: 4 }}>
        <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 0.5, delay: 0.1 }} style={{ flex: 1, background: accuracy < 120 ? cor : 'rgba(255,255,255,0.1)', borderRadius: 10 }} />
        <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 0.5, delay: 0.2 }} style={{ flex: 1, background: accuracy <  80 ? cor : 'rgba(255,255,255,0.1)', borderRadius: 10 }} />
        <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 0.5, delay: 0.3 }} style={{ flex: 1, background: accuracy <  25 ? cor : 'rgba(255,255,255,0.1)', borderRadius: 10 }} />
      </div>
    </div>
  )
}

// ── Page principal ───────────────────────────────────────────
export default function DashboardPage() {
  const { data, status } = useGPS()
  const [online,  setOnline]  = useState(false)
  const sessao = getSessao()
  const [pedidosHoje, setPedidosHoje] = useState(0)
  const [faturamentoHoje, setFaturamentoHoje] = useState(0)

  useEffect(() => {
    async function loadStats() {
      if (!sessao) return
      
      const hojeStr = new Date().toISOString().split('T')[0]
      const { data } = await supabase
        .from('pedidos')
        .select('total')
        .eq('vendedor_id', sessao.id)
        .gte('created_at', `${hojeStr}T00:00:00Z`)
      
      if (data) {
        setPedidosHoje(data.length)
        setFaturamentoHoje(data.reduce((acc, p) => acc + Number(p.total), 0))
      }
    }
    loadStats()

    if (!sessao) return
    const ch = supabase.channel('ambulante_stats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${sessao.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPedidosHoje(p => p + 1)
          setFaturamentoHoje(f => f + Number(payload.new.total))
        }
      }).subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [sessao])

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 120 }}>

      {/* ── Header gradient ──────────────────────────────────── */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(14,165,233,0.2) 0%, rgba(34,197,94,0.2) 100%)',
        padding: '32px 20px 80px', color: '#f8fafc', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(255,255,255,0.05)'
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(14,165,233,0.3), rgba(34,197,94,0.3))', filter: 'blur(40px)' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1 }}>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div className="neon-border" style={{ width: 56, height: 56, borderRadius: 18, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: '0 8px 25px rgba(34,197,94,0.4)' }}>
              🏖️
            </div>
            <div>
              <p style={{ fontSize: 12, opacity: 0.8, fontWeight: 700, margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Base Operacional</p>
              <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.5, margin: 0 }}>Ambulante Show</h1>
            </div>
          </motion.div>
          <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} style={{ display: 'flex', gap: 10 }}>
            <motion.button whileTap={{ scale: 0.9 }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)' }}>
              <Bell size={22} color="#fff" />
            </motion.button>
            <motion.button whileTap={{ scale: 0.9 }} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 16, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)' }}>
              <Settings size={22} color="#fff" />
            </motion.button>
          </motion.div>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginTop: -50, position: 'relative', zIndex: 2 }}>

        {/* ── Toggle Aberto/Fechado (DESTAQUE PRINCIPAL) ────── */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel" style={{
          borderRadius: 28, padding: '24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 20, position: 'relative', overflow: 'hidden'
        }}>
          <AnimatePresence>
            {online && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(34,197,94,0.1), transparent)', zIndex: -1 }}
              />
            )}
          </AnimatePresence>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 56, height: 56, borderRadius: 20,
              background: online ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${online ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <ShoppingBag size={28} color={online ? '#4ade80' : '#64748b'} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc' }}>
                Ponto {online ? <span style={{ color: '#4ade80' }}>Aberto</span> : <span style={{ color: '#94a3b8' }}>Fechado</span>}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, fontWeight: 500 }}>
                {online ? 'Radar transmitindo aos clientes' : 'Você está invisível no mapa'}
              </div>
            </div>
          </div>
          <button onClick={() => setOnline(!online)} style={{
            width: 72, height: 40, borderRadius: 20,
            background: online ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'rgba(255,255,255,0.1)',
            border: online ? 'none' : '1px solid rgba(255,255,255,0.2)', position: 'relative', cursor: 'pointer', transition: 'background 0.3s',
            boxShadow: online ? '0 4px 15px rgba(34,197,94,0.4)' : 'none'
          }}>
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 700, damping: 30 }}
              style={{
                width: 32, height: 32, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3, left: online ? 36 : 4,
                boxShadow: '0 2px 10px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}
            >
              {online && <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} />}
            </motion.div>
          </button>
        </motion.div>

        {/* ── Card GPS Status ───────────────────────────────── */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="glass-panel" style={{
          borderRadius: 24, padding: '22px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className={online ? "neon-border" : ""} style={{
                width: 52, height: 52, borderRadius: 18,
                background: online ? 'rgba(34,197,94,0.1)' : status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <MapPin size={24} color={online ? '#4ade80' : status === 'error' ? '#f87171' : '#64748b'} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc' }}>
                  {online ? 'Radar Ativo' : status === 'error' ? 'Radar Offline' : 'Iniciando Radar...'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, fontWeight: 500 }}>
                  {online
                    ? `${data?.lat.toFixed(5)}, ${data?.lng.toFixed(5)}`
                    : status === 'error' ? 'Verifique as permissões' : 'Aguardando sinal estável'}
                </div>
              </div>
            </div>

            {/* Indicador pulsante */}
            <div style={{ position: 'relative', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className={online ? "animate-pulse-neon" : ""} style={{
                width: 12, height: 12, borderRadius: '50%',
                background: online ? '#4ade80' : status === 'error' ? '#ef4444' : '#475569',
              }} />
            </div>
          </div>

          {online && data && <AccuracyBar accuracy={data.accuracy} />}

          {status === 'error' && (
            <motion.button whileTap={{ scale: 0.95 }} style={{
              width: '100%', marginTop: 16, padding: '14px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 16, color: '#f87171', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
              onClick={() => window.location.reload()}
            >
              <Navigation size={18} /> Reiniciar Radar
            </motion.button>
          )}
        </motion.div>



        {/* ── Stats ─────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {[
            { icon: Package,    cor: '#38bdf8', bg: 'rgba(56,189,248,0.1)', valor: String(pedidosHoje), label: 'Pedidos hoje',  change: '+0%' },
            { icon: DollarSign, cor: '#4ade80', bg: 'rgba(74,222,128,0.1)', valor: `R$ ${faturamentoHoje.toFixed(2)}`, label: 'Ganhos hoje', change: '+0%' },
          ].map(({ icon: Icon, cor, bg, valor, label, change }, i) => (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + (i * 0.1) }} key={label} className="glass-panel" style={{ borderRadius: 24, padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${cor}40` }}>
                  <Icon size={22} color={cor} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4ade80', fontSize: 11, fontWeight: 900, background: 'rgba(74,222,128,0.1)', padding: '4px 8px', borderRadius: 8 }}>
                  <TrendingUp size={12} /> {change}
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#f8fafc' }}>{valor}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, fontWeight: 600 }}>{label}</div>
            </motion.div>
          ))}
        </div>

        {/* ── Atalho Cardápio ───────────────────────────────── */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="glass-panel" style={{
          borderRadius: 24, padding: '20px',
          display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer'
        }} whileTap={{ scale: 0.98 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: '1px solid rgba(255,255,255,0.1)' }}>
            🛒
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>Gerenciar Estoque</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, fontWeight: 500 }}>0 itens online agora</div>
          </div>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ChevronRight size={20} color="#94a3b8" />
          </div>
        </motion.div>

      </div>

      {/* ── Badge GPS visível flutuante ───────────────────────── */}
      <AnimatePresence>
        {online && (
          <motion.div
            initial={{ y: 50, opacity: 0, x: '-50%' }}
            animate={{ y: 0, opacity: 1, x: '-50%' }}
            exit={{ y: 50, opacity: 0, x: '-50%' }}
            style={{
              position: 'fixed', bottom: 100, left: '50%',
              background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
              color: '#fff', padding: '12px 24px', borderRadius: 30,
              display: 'flex', alignItems: 'center', gap: 12,
              fontWeight: 900, fontSize: 13,
              boxShadow: '0 10px 30px rgba(34,197,94,0.4)',
              zIndex: 100, whiteSpace: 'nowrap',
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            <div className="animate-pulse-neon" style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }} />
            RADAR ONLINE: CLIENTES TE VEEM
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
