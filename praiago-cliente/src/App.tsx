import { useEffect, useRef, useState } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Home, ClipboardList, ShoppingBag, MapPin, User, Calendar, X } from 'lucide-react'
import { iniciarCatalogo } from './store/useCatalogo'
import { useStore } from './store/useStore'
import { supabase } from './lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import HomePage from './pages/HomePage'
import MeusPedidosPage from './pages/MeusPedidosPage'
import PedirPage from './pages/PedirPage'
import EventosPage from './pages/EventosPage'
import AmbulantesPage from './pages/AmbulantesPage'
import PerfilPage from './pages/PerfilPage'
import EmailVerificationBanner from './components/EmailVerificationBanner'
import AiChatbot from './components/AiChatbot'
import { DialogHost } from './lib/dialog'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'

const navItems = [
  { to: '/',            icon: Home,          label: 'Início'    },
  { to: '/pedidos',     icon: ClipboardList, label: 'Pedidos'   },
  { to: '/pedir',       icon: ShoppingBag,   label: 'Pedir'     },
  { to: '/ambulantes',  icon: MapPin,        label: 'Radar'     },
  { to: '/eventos',     icon: Calendar,      label: 'Eventos'   },
  { to: '/perfil',      icon: User,          label: 'Perfil'    },
]

function playNotifySound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    const now = ctx.currentTime
    ;[[880, 0], [1175, 0.16], [988, 0.34]].forEach(([freq, start]) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + start)
      gain.gain.exponentialRampToValueAtTime(0.24, now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.14)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + start)
      osc.stop(now + start + 0.16)
    })
    setTimeout(() => ctx.close(), 900)
  } catch {
    // Navegadores podem bloquear audio antes do primeiro toque do usuario.
  }
}

function NotificationToast() {
  const ultima = useStore(s => s.notificacoes[0])
  const [visivel, setVisivel] = useState(false)
  const initialNotifIdRef = useRef(ultima?.id ?? null)

  useEffect(() => {
    if (!ultima) return
    if (ultima.id === initialNotifIdRef.current) return
    setVisivel(true)
    playNotifySound()
    const t = window.setTimeout(() => setVisivel(false), 6500)
    return () => window.clearTimeout(t)
  }, [ultima?.id])

  if (!ultima || !visivel) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16, scale: 0.96 }}
      style={{
        position: 'fixed',
        top: 82,
        left: 16,
        right: 16,
        zIndex: 2000,
        background: '#ffffff',
        border: '1px solid rgba(14,165,233,0.22)',
        borderRadius: 18,
        padding: 14,
        boxShadow: '0 18px 40px rgba(15,23,42,0.18)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        maxWidth: 460,
        margin: '0 auto',
      }}
    >
      <div style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Bell size={19} color="#fff" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 900 }}>{ultima.titulo}</div>
        <div style={{ fontSize: 12, color: '#475569', fontWeight: 600, marginTop: 3, lineHeight: 1.35 }}>{ultima.texto}</div>
      </div>
      <button onClick={() => setVisivel(false)} style={{ border: 0, background: '#f1f5f9', width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <X size={15} color="#64748b" />
      </button>
    </motion.div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const sessao = useStore(s => s.sessao)
  const limparNotificacoesTeste = useStore(s => s.limparNotificacoesTeste)

  // Carrega o catálogo real (lojas/produtos do banco) + realtime, uma vez.
  useEffect(() => { iniciarCatalogo() }, [])
  useEffect(() => { limparNotificacoesTeste() }, [limparNotificacoesTeste])

  useEffect(() => {
    if (!sessao?.id) return

    let ativo = true
    const bloquearSeBanido = (perfil?: { status?: string } | null) => {
      if (!ativo || perfil?.status !== 'banido') return
      useStore.getState().logout()
      navigate('/perfil', { replace: true })
    }

    const checarStatus = () => {
      supabase
        .from('profiles')
        .select('status')
        .eq('id', sessao.id)
        .maybeSingle()
        .then(({ data }) => bloquearSeBanido(data))
    }
    checarStatus()
    const timer = window.setInterval(checarStatus, 30000)

    return () => {
      ativo = false
      window.clearInterval(timer)
    }
  }, [sessao?.id, navigate])

  // Promoções/avisos enviados pelo admin chegam na hora no sininho
  useEffect(() => {
    const ch = supabase.channel('avisos_cliente')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos' }, (payload) => {
        const a = payload.new as { titulo?: string; mensagem?: string; publico?: string; cupom_codigo?: string | null }
        if (a.publico && a.publico !== 'clientes' && a.publico !== 'todos') return
        if (`${a.titulo || ''} ${a.mensagem || ''}`.toUpperCase().includes('TESTE-NOTIF-FABLE')) return
        useStore.getState().addNotif({
          titulo: a.titulo || 'Novidade PraiaGo',
          texto: (a.mensagem || '') + (a.cupom_codigo ? ` · Use o cupom ${a.cupom_codigo}` : ''),
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'transparent' }}>
      <PasswordRecoveryHandler />
      {/* Logo bar - Glassmorphism */}
      <div className="glass-panel" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', position: 'sticky', top: 0, zIndex: 60,
        borderBottom: '1px solid rgba(0,0,0,0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(34,197,94,0.2))',
            borderRadius: 12, padding: 6, display: 'flex'
          }}>
            <svg width="28" height="28" viewBox="0 0 34 34" fill="none">
              <rect width="34" height="34" rx="9" fill="url(#cli-logo)"/>
              <defs>
                <linearGradient id="cli-logo" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#0ea5e9"/>
                  <stop offset="1" stopColor="#22c55e"/>
                </linearGradient>
              </defs>
              <path d="M6 24 Q10 20 14 24 Q18 28 22 24 Q26 20 28 24" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
              <circle cx="23" cy="10" r="5" fill="#fbbf24"/>
              <path d="M10 30 Q11 23 13 19" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
              <path d="M13 19 Q9 15 6 16 M13 19 Q13 14 11 12 M13 19 Q17 15 17 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }} className="beach-gradient-text">
              PraiaGo
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: '#64748b', textTransform: 'uppercase' }}>Premium</div>
          </div>
        </div>
        <motion.div 
          animate={{ opacity: [0.5, 1, 0.5] }} 
          transition={{ duration: 2, repeat: Infinity }}
          style={{ fontSize: 11, color: '#22c55e', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.1)', padding: '6px 12px', borderRadius: 20 }}
        >
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
          Online
        </motion.div>
      </div>

      <EmailVerificationBanner />

      {/* Page Content with Transitions */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: '90px', position: 'relative' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{ minHeight: '100%' }}
          >
            <Routes location={location}>
              <Route path="/"            element={<HomePage />} />
              <Route path="/pedidos"     element={<MeusPedidosPage />} />
              <Route path="/pedir"       element={<PedirPage />} />
              <Route path="/ambulantes"  element={<AmbulantesPage />} />
              <Route path="/eventos"     element={<EventosPage />} />
              <Route path="/perfil"      element={<PerfilPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      <AiChatbot plataforma="cliente" />
      <AnimatePresence>
        <NotificationToast />
      </AnimatePresence>
      <DialogHost />

      {/* Floating Bottom Nav - Glassmorphism Pill */}
      <div style={{
        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 40px)', maxWidth: '400px', zIndex: 100
      }}>
        <nav className="glass-panel" style={{
          display: 'flex', height: '64px', borderRadius: '32px',
          padding: '0 8px', alignItems: 'center', justifyContent: 'space-between'
        }}>
          {navItems.map(({ to, icon: Icon, label }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
            return (
              <NavLink key={to} to={to} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '4px',
                color: active ? '#0ea5e9' : '#64748b', textDecoration: 'none', position: 'relative',
                height: '100%'
              }}>
                {active && (
                  <motion.div
                    layoutId="navBubble"
                    style={{
                      position: 'absolute', inset: '4px', borderRadius: '28px',
                      background: 'rgba(14,165,233,0.12)', zIndex: 0
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <motion.div
                  whileTap={{ scale: 0.9 }}
                  style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                >
                  {to === '/pedir' ? (
                    <div style={{
                      width: active ? 42 : 38, height: active ? 42 : 38, borderRadius: '50%',
                      background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: active ? '0 0 15px rgba(34,197,94,0.4)' : 'none',
                      transition: 'all 0.3s'
                    }}>
                      <Icon size={18} color="#fff" />
                    </div>
                  ) : (
                    <Icon size={20} color={active ? '#0ea5e9' : '#64748b'} />
                  )}
                  {active && <span style={{ fontSize: '10px', fontWeight: 700 }}>{label}</span>}
                </motion.div>
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
