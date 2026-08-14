import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Bell, Home, ClipboardList, ShoppingBag, MapPin, User, Calendar, X } from 'lucide-react'
import { iniciarCatalogo } from './store/useCatalogo'
import { useStore } from './store/useStore'
import { supabase } from './lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import HomePage from './pages/HomePage'
// As outras telas entram por demanda. Antes tudo virava UM arquivo de 1 MB
// (289 KB gzip) que o cliente baixava inteiro só pra abrir a Home — incluindo o
// Leaflet, que pesa e só a tela do Radar usa. Quem abre isso está na praia, no
// 4G: cada KB do primeiro carregamento custa.
// A Home continua importada normalmente de propósito — ela é a rota de entrada,
// então adiar ela só somaria uma ida ao servidor antes da primeira pintura.
const MeusPedidosPage = lazy(() => import('./pages/MeusPedidosPage'))
const PedirPage = lazy(() => import('./pages/PedirPage'))
const EventosPage = lazy(() => import('./pages/EventosPage'))
const AmbulantesPage = lazy(() => import('./pages/AmbulantesPage'))
const PerfilPage = lazy(() => import('./pages/PerfilPage'))
import EmailVerificationBanner from './components/EmailVerificationBanner'
import AiChatbot from './components/AiChatbot'
import { DialogHost } from './lib/dialog'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import IntroSplash from './components/IntroSplash'
import { deveMostrarIntro } from './lib/introSession'

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

/** Espera enquanto o pedaço da tela chega. Altura cheia pra barra inferior não
 *  pular pra cima no meio da troca. */
function TelaCarregando() {
  return (
    <div style={{ height: '100%', minHeight: 320, display: 'grid', placeItems: 'center' }}>
      <div
        aria-label="Carregando"
        role="status"
        style={{
          width: 34, height: 34, borderRadius: '50%',
          border: '3px solid #e0f2fe', borderTopColor: '#0284c7',
          animation: 'spin 0.7s linear infinite',
        }}
      />
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  // Cinco destinos cabem com rótulo legível em celulares de 320 px. A quarta
  // aba acompanha a área especial aberta: Eventos no restante do app e Radar
  // quando o usuário está rastreando ambulantes.
  const navItems = [
    { to: '/',          icon: Home,          label: 'Início' },
    { to: '/pedidos',   icon: ClipboardList, label: 'Pedidos' },
    { to: '/pedir',     icon: ShoppingBag,   label: 'Explorar' },
    location.pathname.startsWith('/ambulantes')
      ? { to: '/ambulantes', icon: MapPin,   label: 'Radar',   novo: true }
      : { to: '/eventos',    icon: Calendar, label: 'Eventos', novo: true },
    { to: '/perfil',    icon: User,          label: 'Perfil' },
  ]
  const sessao = useStore(s => s.sessao)
  const limparNotificacoesTeste = useStore(s => s.limparNotificacoesTeste)
  // Decide na montagem: assim a abertura nao reaparece a cada re-render.
  const [mostrarIntro, setMostrarIntro] = useState(deveMostrarIntro)

  // Carrega o catálogo real (lojas/produtos do banco) + realtime, uma vez.
  useEffect(() => { iniciarCatalogo() }, [])
  useEffect(() => { limparNotificacoesTeste() }, [limparNotificacoesTeste])

  useEffect(() => {
    if (!sessao?.id) return

    let ativo = true
    const validarAcesso = (
      userId?: string,
      perfil?: { status?: string; role?: string } | null,
    ) => {
      if (!ativo) return
      if (
        userId !== sessao.id
        || perfil?.role !== 'cliente'
        || perfil?.status === 'banido'
      ) {
        useStore.getState().logout()
        supabase.auth.signOut()
        navigate('/perfil', { replace: true })
      }
    }

    const checarStatus = async () => {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        validarAcesso(undefined, null)
        return
      }
      const { data } = await supabase
        .from('profiles')
        .select('status,role')
        .eq('id', sessao.id)
        .maybeSingle()
      validarAcesso(authData.user.id, data)
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
    // `height` fixo (não só `minHeight`) porque é ele que dá altura DEFINIDA
    // pro `main` logo abaixo — sem isso, `height: 100%` dentro das páginas não
    // tem contra o que resolver e o mapa do Radar colapsa pra 0px.
    // Quem rola agora é o `main`, não a janela.
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: '100dvh', background: 'transparent' }}>
      <AnimatePresence>
        {mostrarIntro && <IntroSplash key="intro" onFim={() => setMostrarIntro(false)} />}
      </AnimatePresence>
      <PasswordRecoveryHandler />
      {/* Logo bar - Glassmorphism */}
      <div className="glass-panel" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 20px', position: 'sticky', top: 0, zIndex: 60,
        borderBottom: '1px solid rgba(0,0,0,0.05)'
      }}>
        <div
          aria-label="PraiaGo"
          style={{ width: 140, height: 59, overflow: 'hidden', position: 'relative', flexShrink: 0 }}
        >
          <img
            src="/praiago-logo-transparent.png"
            alt="PraiaGo"
            style={{
              position: 'absolute', width: 231, height: 231, maxWidth: 'none',
              left: -56, top: -67, display: 'block',
            }}
          />
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
      {/* `minHeight: 0` deixa o main encolher até a sobra da coluna em vez de
          crescer com o conteúdo — é o que torna a altura dele definida. */}
      <main style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingBottom: '90px', position: 'relative' }}>
        {/* Transição enxuta de propósito.
            Antes: `mode="wait"` + 0.38s + `scale`. Com `mode="wait"` a tela nova
            só COMEÇA a entrar depois de a antiga terminar de sair — 0.38 + 0.38
            = ~0.76s de espera a cada toque na aba, o que dava a sensação de app
            travado. E animar `scale` na página inteira força o navegador a
            repintar a camada toda em todo quadro, justamente no aparelho fraco
            onde já está apertado.
            Agora: 0.14s de saída + 0.18s de entrada (~0.32s no total, menos da
            metade), e só `opacity` + `y`, que o compositor resolve sozinho sem
            repintar. Mantive `mode="wait"`: sem ele as duas telas ficam montadas
            ao mesmo tempo no fluxo e a nova aparece EMBAIXO da antiga por um
            instante — pra cruzar de verdade elas teriam que ser absolutas, o que
            quebraria a rolagem (o `main` é o container que rola). */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.14 } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            // `height` (e não só `minHeight`) porque telas que precisam caber
            // exatamente numa tela — o Radar — usam `height: 100%` e flex pra
            // o mapa ocupar a sobra. Com `minHeight` a porcentagem do filho não
            // tem contra o que resolver e o mapa colapsava pra 0.
            // Páginas mais altas que isso continuam rolando: o `main` é quem
            // tem `overflowY: auto`.
            style={{ height: '100%', minHeight: '100%' }}
          >
            {/* O fallback é propositalmente discreto: a troca de aba já tem a
                própria animação, e um spinner grande piscando por 100ms entre
                as telas chama mais atenção que a espera em si. */}
            <Suspense fallback={<TelaCarregando />}>
              <Routes location={location}>
                <Route path="/"            element={<HomePage />} />
                <Route path="/pedidos"     element={<MeusPedidosPage />} />
                <Route path="/pedir"       element={<PedirPage />} />
                <Route path="/ambulantes"  element={<AmbulantesPage />} />
                <Route path="/eventos"     element={<EventosPage />} />
                <Route path="/perfil"      element={<PerfilPage />} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <AiChatbot plataforma="cliente" />
      <AnimatePresence>
        <NotificationToast />
      </AnimatePresence>
      <DialogHost />

      {/* Barra inferior com cinco destinos e rótulos sempre visíveis. */}
      <div style={{
        position: 'fixed', bottom: 14, left: '50%', transform: 'translateX(-50%)',
        width: 'calc(100% - 24px)', maxWidth: 440, zIndex: 100,
      }}>
        <nav style={{
          display: 'flex',
          height: 68,
          borderRadius: 26,
          padding: '0 4px',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(255,255,255,0.94)',
          backdropFilter: 'blur(18px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.5)',
          border: '1px solid #eef2f7',
          boxShadow: '0 2px 6px rgba(15,23,42,0.05), 0 16px 36px -14px rgba(15,23,42,0.28)',
        }}>
          {navItems.map(({ to, icon: Icon, label, novo }) => {
            const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
            return (
              <NavLink
                key={to}
                to={to}
                aria-label={label}
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  color: active ? '#0284c7' : '#94a3b8',
                  textDecoration: 'none',
                  position: 'relative',
                  height: '100%',
                }}
              >
                {active && (
                  <motion.div
                    layoutId="navBubble"
                    style={{
                      position: 'absolute', inset: '7px 3px', borderRadius: 18,
                      background: '#e0f2fe', zIndex: 0,
                    }}
                    transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                  />
                )}

                {novo && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: '50%',
                      marginRight: -26,
                      zIndex: 2,
                      padding: '1px 5px',
                      borderRadius: 999,
                      fontSize: 7.5,
                      fontWeight: 900,
                      letterSpacing: 0,
                      color: '#fff',
                      background: '#16a34a',
                      boxShadow: '0 2px 6px rgba(22,163,74,0.5)',
                    }}
                  >
                    NOVO
                  </span>
                )}

                <motion.div
                  whileTap={{ scale: 0.88 }}
                  style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                >
                  <Icon size={20} color={active ? '#0284c7' : '#94a3b8'} strokeWidth={active ? 2.6 : 2.1} />
                  <span
                    style={{
                      fontSize: 9.5,
                      fontWeight: active ? 900 : 700,
                      letterSpacing: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </span>
                </motion.div>
              </NavLink>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
