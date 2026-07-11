import { Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Map, User, Users,
  Bell, LogOut, TrendingUp, Zap, Wifi,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessao, logout } from './lib/auth'
import { supabase } from './lib/supabase'
import { useOrders, connectRealtime } from './store/useOrders'
import LoginPage        from './pages/LoginPage'
import DashboardPage    from './pages/DashboardPage'
import PedidosPage      from './pages/PedidosPage'
import VendasPage       from './pages/VendasPage'
import CardapioPage     from './pages/CardapioPage'
import MapaPage         from './pages/MapaPage'
import EntregadoresPage from './pages/EntregadoresPage'
import PerfilPage       from './pages/PerfilPage'
import CarteiraPage     from './pages/CarteiraPage'
import VerificationBar  from './components/VerificationBar'
import AiChatbot        from './components/AiChatbot'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import { DialogHost } from './lib/dialog'

const navItems = [
  { to: '/',             icon: LayoutDashboard, label: 'Painel',        badge: null },
  { to: '/pedidos',      icon: ShoppingBag,     label: 'Pedidos',       badge: null },
  { to: '/vendas',       icon: TrendingUp,      label: 'Vendas',        badge: null },
  { to: '/cardapio',     icon: UtensilsCrossed, label: 'Cardápio',      badge: null },
  { to: '/entregadores', icon: Users,           label: 'Entregadores',  badge: null },
  { to: '/mapa',         icon: Map,             label: 'Zonas Ao Vivo', badge: null },
  { to: '/perfil',       icon: User,            label: 'Perfil',        badge: null },
]

const PUBLIC = ['/login']

const NOTIFS: any[] = []

function playAvisoSound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    const now = ctx.currentTime
    ;[659, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.15 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.14)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.16)
    })
    setTimeout(() => ctx.close(), 700)
  } catch {
    // Audio pode ficar bloqueado ate o primeiro toque do usuario.
  }
}

function GlobalAvisoToast() {
  const [aviso, setAviso] = useState<{ id?: string; titulo?: string; mensagem?: string; cupom_codigo?: string | null } | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel('avisos_restaurante')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos' }, payload => {
        const row = payload.new as { id?: string; titulo?: string; mensagem?: string; publico?: string; cupom_codigo?: string | null }
        if (row.publico && row.publico !== 'restaurantes' && row.publico !== 'todos') return
        setAviso(row)
        playAvisoSound()
        window.setTimeout(() => setAviso(current => current?.id === row.id ? null : current), 8000)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (!aviso) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.96 }}
      style={{
        position: 'fixed',
        right: 28,
        bottom: 28,
        zIndex: 9999,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        background: '#ffffff',
        border: '1px solid rgba(249,115,22,0.24)',
        borderRadius: 18,
        boxShadow: '0 18px 45px rgba(15,23,42,0.22)',
        padding: 14,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 14, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>!</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 900 }}>{aviso.titulo || 'Aviso PraiaGo'}</div>
        <div style={{ fontSize: 12, color: '#475569', fontWeight: 650, lineHeight: 1.35, marginTop: 3 }}>
          {aviso.mensagem}{aviso.cupom_codigo ? ` - Cupom ${aviso.cupom_codigo}` : ''}
        </div>
      </div>
      <button onClick={() => setAviso(null)} style={{ border: 0, borderRadius: 12, background: '#f1f5f9', color: '#64748b', width: 32, height: 32, cursor: 'pointer' }}>x</button>
    </motion.div>
  )
}

function KycLockedPanel() {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 18, padding: 20, maxWidth: 760, margin: '0 auto' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#92400e', marginBottom: 8 }}>KYC obrigatorio do restaurante</div>
        <p style={{ margin: 0, color: '#92400e', fontSize: 14, lineHeight: 1.55, fontWeight: 600 }}>
          O painel operacional fica bloqueado ate a verificacao ser aprovada. Envie nome real do responsavel, CPF, CNPJ real, documento, selfie e comprovacao do local. Enquanto isso o restaurante nao aparece no mapa e nao pode criar produtos.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const location    = useLocation()
  const navigate    = useNavigate()
  const isPublic    = PUBLIC.includes(location.pathname)
  const sessao      = useSessao()
  const [aberto, setAberto]       = useState(true)
  const [notifOpen, setNotifOpen] = useState(false)
  const [kycLocked, setKycLocked] = useState(false)

  const pedidos = useOrders(s => s.pedidos)            // referência estável
  const pedidosNovos = pedidos.filter(p => p.status === 'novo')
  const novos = pedidosNovos.length

  // Recebe pedidos do cliente em tempo real (uma vez)
  useEffect(() => { connectRealtime() }, [])

  useEffect(() => {
    if (!sessao?.id || isPublic) return

    let ativo = true
    const bloquearSeBanido = (perfil?: { status?: string; ban_motivo?: string | null; verificado?: boolean | null } | null) => {
      if (!ativo || perfil?.status !== 'banido') return
      logout()
      navigate('/login', { replace: true })
    }
    const atualizarGate = (perfil?: { status?: string; ban_motivo?: string | null; verificado?: boolean | null } | null) => {
      if (!ativo) return
      bloquearSeBanido(perfil)
      setKycLocked(perfil?.status !== 'banido' && perfil?.verificado !== true)
    }

    supabase
      .from('profiles')
      .select('status,ban_motivo,verificado')
      .eq('id', sessao.id)
      .maybeSingle()
      .then(({ data }) => atualizarGate(data))

    const channel = supabase
      .channel(`restaurante_status_${sessao.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, payload => {
        atualizarGate(payload.new as { status?: string; ban_motivo?: string | null; verificado?: boolean | null })
      })
      .subscribe()

    return () => {
      ativo = false
      supabase.removeChannel(channel)
    }
  }, [sessao?.id, isPublic, navigate])

  // Notificacoes: pedidos novos reais + alertas operacionais
  const notifs = [
    ...pedidosNovos.slice(0, 3).map(p => ({ id: p.id, msg: `Novo pedido ${p.id} — ${p.cliente}`, time: p.hora, cor: '#f97316' })),
    ...NOTIFS,
  ].slice(0, 5)

  // Proteção de rota: sem sessão, vai para o login
  if (!sessao && !isPublic) return <Navigate to="/login" replace />

  function sair() { logout(); navigate('/login') }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <PasswordRecoveryHandler />

      {/* ══ SIDEBAR ══════════════════════════════════════════ */}
      {!isPublic && !kycLocked && (
        <aside style={{
          width: 256,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column',
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
          borderRight: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.4)',
        }}>

          {/* Logo + status */}
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <motion.svg initial={{ scale: 0.8, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} width="44" height="44" viewBox="0 0 34 34" fill="none">
                <rect width="34" height="34" rx="12" fill="url(#app-rest-g)"/>
                <defs>
                  <linearGradient id="app-rest-g" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#f97316"/><stop offset="1" stopColor="#ea580c"/>
                  </linearGradient>
                </defs>
                <path d="M6 24 Q10 20 14 24 Q18 28 22 24 Q26 20 28 24" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
                <circle cx="23" cy="10" r="5" fill="#fbbf24"/>
                <path d="M10 30 Q11 23 13 19" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <path d="M13 19 Q9 15 6 16 M13 19 Q13 14 11 12 M13 19 Q17 15 17 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </motion.svg>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
                  <span style={{ color: '#f97316', textShadow: '0 0 15px rgba(249,115,22,0.6)' }}>Praia</span><span style={{ color: '#0f172a' }}>Go</span>
                </div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.5, color: '#f97316', textTransform: 'uppercase', marginTop: 4 }}>
                  Restaurante
                </div>
              </div>
            </div>

            {/* Toggle aberto/fechado */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: aberto ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${aberto ? 'rgba(34,197,94,0.3)' : 'rgba(0,0,0,0.05)'}`,
              borderRadius: 14, padding: '12px 16px',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={aberto ? 'animate-pulse-neon' : ''} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: aberto ? '#4ade80' : '#64748b',
                  boxShadow: aberto ? '0 0 10px #4ade80' : 'none',
                }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: aberto ? '#4ade80' : '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {aberto ? 'Aberto' : 'Fechado'}
                </span>
              </div>
              <button onClick={() => setAberto(v => !v)} style={{
                width: 46, height: 24, borderRadius: 12,
                background: aberto ? '#22c55e' : '#334155',
                border: 'none', position: 'relative', cursor: 'pointer',
                transition: 'background 0.3s',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: aberto ? 25 : 3,
                  transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          </div>

          {/* Navegação */}
          <nav style={{ flex: 1, padding: '20px 14px', overflowY: 'auto' }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: '#64748b', textTransform: 'uppercase', marginBottom: 12, paddingLeft: 10 }}>
              Gestão
            </p>
            {navItems.map(({ to, icon: Icon, label, badge }) => {
              const badgeVal = to === '/pedidos' ? (novos > 0 ? String(novos) : null) : badge
              return (
                <NavLink key={to} to={to} style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', borderRadius: 14, marginBottom: 6,
                  textDecoration: 'none',
                  background: isActive ? 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(234,88,12,0.05))' : 'transparent',
                  color: isActive ? '#f97316' : '#94a3b8',
                  fontWeight: isActive ? 800 : 600, fontSize: 14,
                  borderLeft: isActive ? '3px solid #f97316' : '3px solid transparent',
                  transition: 'all 0.2s',
                  boxShadow: isActive ? 'inset 0 0 20px rgba(249,115,22,0.05)' : 'none'
                })}>
                  <Icon size={18} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badgeVal && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 20, boxShadow: '0 0 10px rgba(239,68,68,0.5)' }}>
                      {badgeVal}
                    </motion.span>
                  )}
                </NavLink>
              )
            })}

            {/* Radar da praia */}
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: '#64748b', textTransform: 'uppercase', margin: '24px 0 12px', paddingLeft: 10 }}>
              Radar da Praia
            </p>
            <div className="glass-panel" style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(139,92,246,0.05))',
              border: '1px solid rgba(168,85,247,0.3)', borderRadius: 16, padding: '16px',
              position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, background: '#a855f7', opacity: 0.2, filter: 'blur(20px)', borderRadius: '50%' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, position: 'relative', zIndex: 1 }}>
                <Zap size={16} color="#c084fc" />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#c084fc', letterSpacing: 0.5, textTransform: 'uppercase' }}>Radar Ativo</span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', marginLeft: 'auto', boxShadow: '0 0 10px #c084fc' }} className="animate-pulse-neon" />
              </div>
              <p style={{ fontSize: 13, color: '#7e22ce', lineHeight: 1.5, marginBottom: 10, fontWeight: 500, position: 'relative', zIndex: 1 }}>
                Acompanhe o movimento das zonas da praia no mapa.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1 }}>
                <TrendingUp size={14} color="#a855f7" />
                <span style={{ fontSize: 11, color: '#9333ea', fontWeight: 800 }}>ATUALIZAÇÃO EM TEMPO REAL</span>
              </div>
            </div>
          </nav>

          {/* Rodapé */}
          <div style={{ padding: '16px', borderTop: '1px solid rgba(0,0,0,0.05)', position: 'relative' }}>
            <button onClick={() => setNotifOpen(v => !v)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(0,0,0,0.05)',
              background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
              color: '#334155', fontSize: 14, fontWeight: 700, marginBottom: 8,
              transition: 'background 0.2s'
            }}>
              <Bell size={18} />
              <span style={{ flex: 1, textAlign: 'left' }}>Notificações</span>
              <span style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 20, boxShadow: '0 0 10px rgba(239,68,68,0.5)' }}>{notifs.length}</span>
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} style={{
                  position: 'absolute', bottom: 100, left: 16, width: 232,
                  background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 100,
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>Notificações</span>
                  </div>
                  {notifs.map(n => (
                    <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.02)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.cor, flexShrink: 0, marginTop: 4, boxShadow: `0 0 8px ${n.cor}` }} />
                      <div>
                        <div style={{ fontSize: 12, color: '#0f172a', lineHeight: 1.4, fontWeight: 500 }}>{n.msg}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontWeight: 700 }}>{n.time} atrás</div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <button onClick={sair} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 14, border: 'none',
              background: 'transparent', cursor: 'pointer', color: '#64748b', fontSize: 13, fontWeight: 700,
              transition: 'color 0.2s'
            }} onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'} onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}>
              <LogOut size={16} /> Desconectar Terminal
            </button>
          </div>
        </aside>
      )}

      {/* ══ MAIN ═════════════════════════════════════════════ */}
      <main style={{ flex: 1, marginLeft: isPublic || kycLocked ? 0 : 256, overflowY: 'auto', minHeight: '100vh', position: 'relative' }}>
        <AnimatePresence mode="wait">
          {!isPublic && !kycLocked && (
            <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{
              position: 'sticky', top: 0, zIndex: 30,
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
              borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="animate-pulse-neon" style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 10px #4ade80' }} />
                <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Base do restaurante ativa</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.1)', padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(34,197,94,0.2)' }}>
                <Wifi size={14} color="#4ade80" />
                <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sinal Estável</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div 
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{ height: isPublic ? '100vh' : 'calc(100vh - 60px)' }}
          >
            {!isPublic && <VerificationBar />}
            {!isPublic && kycLocked ? (
              <KycLockedPanel />
            ) : (
              <Routes location={location}>
                <Route path="/login"         element={<LoginPage />} />
                <Route path="/"              element={<DashboardPage />} />
                <Route path="/pedidos"       element={<PedidosPage />} />
                <Route path="/vendas"        element={<VendasPage />} />
                <Route path="/cardapio"      element={<CardapioPage />} />
                <Route path="/entregadores"  element={<EntregadoresPage />} />
                <Route path="/mapa"          element={<MapaPage />} />
                <Route path="/perfil"        element={<PerfilPage />} />
                <Route path="/carteira"      element={<CarteiraPage />} />
              </Routes>
            )}
          </motion.div>
        </AnimatePresence>
        {!isPublic && !kycLocked && <AiChatbot plataforma="restaurante" />}
        {!isPublic && (
          <AnimatePresence>
            <GlobalAvisoToast />
          </AnimatePresence>
        )}
      </main>
      <DialogHost />
    </div>
  )
}
