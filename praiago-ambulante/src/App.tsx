import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'
import { logout, useSessao } from './lib/auth'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PedidosPage from './pages/PedidosPage'
import VendasPage from './pages/VendasPage'
import CardapioPage from './pages/CardapioPage'
import PerfilPage from './pages/PerfilPage'
import ZonasPage from './pages/ZonasPage'
import BottomNav from './components/BottomNav'
import VerificationBar from './components/VerificationBar'
import AiChatbot from './components/AiChatbot'
import { useGPS } from './hooks/useGPS'

const PUBLIC_ROUTES = ['/login', '/cadastro']

// Logo do PraiaGo Ambulante
function LogoBar({ gpsStatus }: { gpsStatus: string }) {
  const isActive = gpsStatus === 'active'
  const isError = gpsStatus === 'error'
  return (
    <div className="glass-panel" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '16px 20px',
      borderBottom: '1px solid rgba(0,0,0,0.05)',
      position: 'sticky', top: 0, zIndex: 60,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="neon-border" style={{ borderRadius: 12, display: 'flex' }}>
          <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
            <rect width="38" height="38" rx="12" fill="url(#amb-g)"/>
            <defs>
              <linearGradient id="amb-g" x1="0" y1="0" x2="38" y2="38" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0ea5e9"/>
                <stop offset="1" stopColor="#22c55e"/>
              </linearGradient>
            </defs>
            <path d="M7 26 Q11 22 15 26 Q19 30 23 26 Q27 22 30 26" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
            <circle cx="25" cy="12" r="5" fill="#fbbf24" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5"/>
            <path d="M12 32 Q13 25 15 21" stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
            <path d="M15 21 Q11 17 8 18 M15 21 Q15 16 13 14 M15 21 Q19 17 19 14" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1, display: 'flex', alignItems: 'baseline' }}>
            <span style={{ color: '#0f172a' }}>Praia</span><span className="tactical-gradient-text" style={{ marginLeft: 1 }}>Go</span>
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: '#4ade80', textTransform: 'uppercase', marginTop: 2 }}>Ambulante</div>
        </div>
      </div>

      {/* GPS badge */}
      <motion.div animate={isActive ? { opacity: [0.7, 1, 0.7] } : {}} transition={{ repeat: Infinity, duration: 2 }} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: isActive ? 'rgba(34,197,94,0.15)' : isError ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)',
        border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : isError ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.3)'}`,
        borderRadius: 20, padding: '6px 12px',
        boxShadow: isActive ? '0 0 10px rgba(34,197,94,0.2)' : 'none'
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isActive ? '#22c55e' : isError ? '#ef4444' : '#64748b',
          boxShadow: isActive ? '0 0 8px #22c55e' : 'none',
        }} />
        <span style={{
          fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5,
          color: isActive ? '#4ade80' : isError ? '#f87171' : '#94a3b8',
        }}>
          {isActive ? 'GPS ON' : isError ? 'ERRO' : 'BUSCA'}
        </span>
      </motion.div>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isPublic = PUBLIC_ROUTES.includes(location.pathname)
  const sessao = useSessao()

  // GPS ativo em todo o app — transmite posição em tempo real
  const { status: gpsStatus } = useGPS()

  useEffect(() => {
    if (!sessao?.id || isPublic) return

    let ativo = true
    const bloquearSeBanido = (perfil?: { status?: string } | null) => {
      if (!ativo || perfil?.status !== 'banido') return
      logout()
      navigate('/login', { replace: true })
    }

    supabase
      .from('profiles')
      .select('status')
      .eq('id', sessao.id)
      .maybeSingle()
      .then(({ data }) => bloquearSeBanido(data))

    const channel = supabase
      .channel(`ambulante_status_${sessao.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, payload => {
        bloquearSeBanido(payload.new as { status?: string })
      })
      .subscribe()

    return () => {
      ativo = false
      supabase.removeChannel(channel)
    }
  }, [sessao?.id, isPublic, navigate])

  // Proteção de rota: sem sessão, vai para o login
  if (!sessao && !isPublic) return <Navigate to="/login" replace />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#ffffff' }}>
      {!isPublic && <LogoBar gpsStatus={gpsStatus} />}
      {!isPublic && <VerificationBar />}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: isPublic ? 0 : '80px', position: 'relative' }}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/login"    element={<PageWrapper><LoginPage /></PageWrapper>} />
            <Route path="/"         element={<PageWrapper><DashboardPage /></PageWrapper>} />
            <Route path="/pedidos"  element={<PageWrapper><PedidosPage /></PageWrapper>} />
            <Route path="/vendas"   element={<PageWrapper><VendasPage /></PageWrapper>} />
            <Route path="/cardapio" element={<PageWrapper><CardapioPage /></PageWrapper>} />
            <Route path="/zonas"    element={<PageWrapper><ZonasPage /></PageWrapper>} />
            <Route path="/perfil"   element={<PageWrapper><PerfilPage /></PageWrapper>} />
          </Routes>
        </AnimatePresence>
      </main>
      {!isPublic && <BottomNav />}
      {!isPublic && <AiChatbot plataforma="ambulante" />}
    </div>
  )
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      style={{ height: '100%' }}
    >
      {children}
    </motion.div>
  )
}
