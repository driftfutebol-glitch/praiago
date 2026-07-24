import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { logout, useSessao } from './lib/auth'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PedidosPage from './pages/PedidosPage'
import VendasPage from './pages/VendasPage'
import AvaliacoesPage from './pages/AvaliacoesPage'
import CardapioPage from './pages/CardapioPage'
import PerfilPage from './pages/PerfilPage'
import ZonasPage from './pages/ZonasPage'
import CarteiraPage from './pages/CarteiraPage'
import BottomNav from './components/BottomNav'
import VerificationBar from './components/VerificationBar'
import { DialogHost } from './lib/dialog'
import AiChatbot from './components/AiChatbot'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import { useGPS } from './hooks/useGPS'
import { useOrderNotifications } from './hooks/useOrderNotifications'

const PUBLIC_ROUTES = ['/login']

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

function GlobalOrderToast() {
  const navigate = useNavigate()
  const location = useLocation()
  const { latestOrder, dismissLatest } = useOrderNotifications()

  if (!latestOrder || location.pathname === '/pedidos') return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -18, scale: 0.96 }}
        style={{
          position: 'fixed',
          top: 92,
          left: 14,
          right: 14,
          zIndex: 9999,
          background: '#ffffff',
          border: '1px solid rgba(14,165,233,0.24)',
          borderRadius: 20,
          boxShadow: '0 18px 45px rgba(15,23,42,0.2)',
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ width: 46, height: 46, borderRadius: 16, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900 }}>
          R$
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>Novo pedido recebido</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {latestOrder.clienteNome} - R$ {latestOrder.total.toFixed(2).replace('.', ',')}
          </div>
        </div>
        <button
          onClick={() => { dismissLatest(); navigate('/pedidos') }}
          style={{ border: 0, borderRadius: 13, background: '#0ea5e9', color: '#fff', padding: '10px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
        >
          Ver
        </button>
        <button
          aria-label="Fechar aviso"
          onClick={dismissLatest}
          style={{ border: 0, borderRadius: 12, background: '#f1f5f9', color: '#64748b', width: 34, height: 34, fontSize: 18, cursor: 'pointer' }}
        >
          x
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

function playAvisoSound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    const now = ctx.currentTime
    ;[740, 988].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.16)
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.16 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.14)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.16)
      osc.stop(now + i * 0.16 + 0.16)
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
      .channel('avisos_ambulante')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos' }, payload => {
        const row = payload.new as { id?: string; titulo?: string; mensagem?: string; publico?: string; cupom_codigo?: string | null }
        if (row.publico && row.publico !== 'ambulantes' && row.publico !== 'todos') return
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
        left: 14,
        right: 14,
        bottom: 96,
        zIndex: 9998,
        background: '#ffffff',
        border: '1px solid rgba(34,197,94,0.24)',
        borderRadius: 20,
        boxShadow: '0 18px 45px rgba(15,23,42,0.18)',
        padding: 14,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 15, background: 'linear-gradient(135deg,#22c55e,#0ea5e9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>!</div>
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
    <div style={{ padding: 24 }}>
      <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#92400e', marginBottom: 6 }}>Verificacao obrigatoria</div>
        <p style={{ margin: 0, color: '#92400e', fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
          Seu acesso operacional fica bloqueado ate o KYC ser aprovado. Envie CPF real, documento, selfie e local de atuacao acima. Enquanto isso voce nao aparece no mapa e nao pode criar produtos.
        </p>
      </div>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isPublic = PUBLIC_ROUTES.includes(location.pathname)
  const sessao = useSessao()
  const [kycLocked, setKycLocked] = useState(false)

  // GPS ativo em todo o app — transmite posição em tempo real
  const { status: gpsStatus } = useGPS()

  useEffect(() => {
    if (!sessao?.id || isPublic) return

    let ativo = true
    const bloquearSeBanido = (perfil?: { status?: string; verificado?: boolean | null } | null) => {
      if (!ativo || perfil?.status !== 'banido') return
      logout()
      navigate('/login', { replace: true })
    }
    const atualizarGate = (perfil?: { status?: string; verificado?: boolean | null } | null) => {
      if (!ativo) return
      bloquearSeBanido(perfil)
      setKycLocked(perfil?.status !== 'banido' && perfil?.verificado !== true)
    }

    const checarStatus = () => {
      supabase
        .from('profiles')
        .select('status,verificado')
        .eq('id', sessao.id)
        .maybeSingle()
        .then(({ data }) => atualizarGate(data))
    }
    checarStatus()
    const channel = supabase.channel(`ambulante_kyc_gate_${sessao.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, payload => atualizarGate(payload.new as { status?: string; verificado?: boolean | null }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes', filter: `user_id=eq.${sessao.id}` }, () => checarStatus())
      .subscribe()
    const timer = window.setInterval(checarStatus, 10000)

    return () => {
      ativo = false
      supabase.removeChannel(channel)
      window.clearInterval(timer)
    }
  }, [sessao?.id, isPublic, navigate])

  // Proteção de rota: sem sessão, vai para o login
  if (!sessao && !isPublic) return <Navigate to="/login" replace />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#ffffff' }}>
      <PasswordRecoveryHandler />
      {!isPublic && <LogoBar gpsStatus={gpsStatus} />}
      {!isPublic && <VerificationBar />}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: isPublic ? 0 : '80px', position: 'relative' }}>
        {!isPublic && kycLocked ? (
          <KycLockedPanel />
        ) : (
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/login"    element={<PageWrapper><LoginPage /></PageWrapper>} />
              <Route path="/"         element={<PageWrapper><DashboardPage /></PageWrapper>} />
              <Route path="/pedidos"  element={<PageWrapper><PedidosPage /></PageWrapper>} />
              <Route path="/vendas"   element={<PageWrapper><VendasPage /></PageWrapper>} />
              <Route path="/avaliacoes" element={<PageWrapper><AvaliacoesPage /></PageWrapper>} />
              <Route path="/cardapio" element={<PageWrapper><CardapioPage /></PageWrapper>} />
              <Route path="/zonas"    element={<PageWrapper><ZonasPage /></PageWrapper>} />
              <Route path="/perfil"   element={<PageWrapper><PerfilPage /></PageWrapper>} />
              <Route path="/carteira" element={<PageWrapper><CarteiraPage /></PageWrapper>} />
            </Routes>
          </AnimatePresence>
        )}
      </main>
      {!isPublic && !kycLocked && <BottomNav />}
      {!isPublic && !kycLocked && <AiChatbot plataforma="ambulante" />}
      {!isPublic && !kycLocked && <GlobalOrderToast />}
      {!isPublic && (
        <AnimatePresence>
          <GlobalAvisoToast />
        </AnimatePresence>
      )}
      <DialogHost />
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
