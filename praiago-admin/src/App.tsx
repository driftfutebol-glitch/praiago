import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect, lazy, Suspense, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PedidosPage = lazy(() => import('./pages/PedidosPage'))
const UsuariosPage = lazy(() => import('./pages/UsuariosPage'))
const ExclusoesPage = lazy(() => import('./pages/ExclusoesPage'))
const VerificacoesPage = lazy(() => import('./pages/VerificacoesPage'))
const LiberacaoSaquePage = lazy(() => import('./pages/LiberacaoSaquePage'))
const AtendimentoPage = lazy(() => import('./pages/AtendimentoPage'))
const ErrorsPage = lazy(() => import('./pages/ErrorsPage'))
const EventosPage = lazy(() => import('./pages/EventosPage'))
const CuponsPage = lazy(() => import('./pages/CuponsPage'))
const PromocoesPage = lazy(() => import('./pages/PromocoesPage'))
const FinanceiroPage = lazy(() => import('./pages/FinanceiroPage'))
const TrocaContaPage = lazy(() => import('./pages/TrocaContaPage'))
const TrocaNomePage = lazy(() => import('./pages/TrocaNomePage'))
const CadastrosEventoPage = lazy(() => import('./pages/CadastrosEventoPage'))
const AdminsPage = lazy(() => import('./pages/AdminsPage'))
const AtualizacoesPage = lazy(() => import('./pages/AtualizacoesPage'))
const TestersPage = lazy(() => import('./pages/TestersPage'))
const NovosUsuariosPage = lazy(() => import('./pages/NovosUsuariosPage'))
const LocalizacoesPage = lazy(() => import('./pages/LocalizacoesPage'))
import AdminShell from './components/AdminShell'
import { allowedDestinations, canAccessAdmin, type AdminProfile } from './lib/adminNavigation'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import { DialogHost } from './lib/dialog'

export type PerfilAdmin = AdminProfile

function NotificationSystem() {
  const [notifications, setNotifications] = useState<any[]>([])

  useEffect(() => {
    function playSound() {
      try {
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
        if (!AudioContextCtor) return
        const ctx = new AudioContextCtor()
        const now = ctx.currentTime
        ;[[784, 0], [1046, 0.14], [1318, 0.32]].forEach(([freq, start]) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'triangle'
          osc.frequency.value = freq
          gain.gain.setValueAtTime(0.0001, now + start)
          gain.gain.exponentialRampToValueAtTime(0.22, now + start + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, now + start + 0.16)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(now + start)
          osc.stop(now + start + 0.18)
        })
        setTimeout(() => ctx.close(), 900)
      } catch {
        // Audio pode ficar bloqueado ate o primeiro clique do usuario.
      }
    }

    function pushNotification(n: any) {
      const toast = { ...n, _toastId: `${n.id || crypto.randomUUID()}-${Date.now()}` }
      setNotifications(prev => [toast, ...prev].slice(0, 5))
      playSound()
      setTimeout(() => {
        setNotifications(prev => prev.filter(item => item._toastId !== toast._toastId))
      }, 9000)
    }

    const sub = supabase.channel('admin_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, (payload) => {
        const ticket = payload.new
        pushNotification({
          id: ticket.id,
          titulo: `Novo chamado: ${ticket.plataforma || 'suporte'}`,
          texto: ticket.assunto || ticket.mensagem || 'Chamado recebido no atendimento.',
          origem: ticket.usuario_nome || ticket.user_nome || 'Usuario',
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'verificacoes' }, (payload) => {
        const v = payload.new
        pushNotification({
          id: v.id,
          titulo: `Nova verificacao: ${v.tipo || 'usuario'}`,
          texto: 'Documento enviado e aguardando analise.',
          origem: v.nome || v.email || v.user_id || 'Cadastro',
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payment_notifications' }, (payload) => {
        const pagamento = payload.new
        const mensagens: Record<string, { titulo: string; texto: string }> = {
          pendente: {
            titulo: 'Pagamento pendente',
            texto: `Pedido ${String(pagamento.pedido_id || '').slice(0, 8)} aguardando ${String(pagamento.pagamento || 'pagamento').toUpperCase()} de R$ ${Number(pagamento.valor || 0).toFixed(2).replace('.', ',')}`,
          },
          aprovado: {
            titulo: 'Pagamento aprovado',
            texto: `Pedido ${String(pagamento.pedido_id || '').slice(0, 8)} confirmado no valor de R$ ${Number(pagamento.valor || 0).toFixed(2).replace('.', ',')}`,
          },
          recusado: {
            titulo: 'Pagamento recusado',
            texto: `A cobranca do pedido ${String(pagamento.pedido_id || '').slice(0, 8)} nao foi aprovada.`,
          },
          cancelado: {
            titulo: 'Pagamento cancelado',
            texto: `O pagamento do pedido ${String(pagamento.pedido_id || '').slice(0, 8)} foi cancelado.`,
          },
          estornado: {
            titulo: 'Pagamento estornado',
            texto: `O pedido ${String(pagamento.pedido_id || '').slice(0, 8)} recebeu um estorno.`,
          },
        }
        const mensagem = mensagens[String(pagamento.tipo)] || mensagens.pendente
        pushNotification({
          id: pagamento.id,
          ...mensagem,
          origem: 'Financeiro',
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (payload) => {
        const p = payload.new
        if (p.payment_provider === 'pagarme') return
        pushNotification({
          id: p.id,
          titulo: 'Novo pedido recebido',
          texto: `Pedido ${p.id?.slice?.(0, 8) || ''} no valor de R$ ${Number(p.total || 0).toFixed(2).replace('.', ',')}`,
          origem: p.cliente_nome || p.cliente || 'Cliente',
        })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitacoes_correcao_localizacao' }, (payload) => {
        const pedido = payload.new
        pushNotification({
          id: pedido.id,
          titulo: 'Correcao de localizacao',
          texto: pedido.motivo || 'Restaurante solicitou autorizacao para corrigir o ponto fixo.',
          origem: pedido.restaurante_id || 'Restaurante',
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
  }, [])

  return (
    <div className="admin-toasts fixed z-50 flex flex-col gap-2 pointer-events-none" aria-live="polite">
      <AnimatePresence>
        {notifications.map(n => (
          <motion.div
            key={n._toastId || n.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className="pointer-events-auto bg-slate-900 border border-indigo-500/30 p-4 rounded-xl shadow-2xl shadow-indigo-500/20 flex items-start gap-4 min-w-0"
          >
            <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
              <Bell size={20} />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-bold text-sm">{n.titulo}</h4>
              <p className="text-slate-400 text-xs mt-1">{n.texto}</p>
              <p className="text-slate-500 text-xs mt-1">De: {n.origem}</p>
            </div>
            <button aria-label="Fechar notificação" onClick={() => setNotifications(prev => prev.filter(t => (t._toastId || t.id) !== (n._toastId || n.id)))} className="text-slate-500 hover:text-white transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  const [authState, setAuthState] = useState<'loading' | 'guest' | 'admin'>('loading')
  const [perfil, setPerfil] = useState<PerfilAdmin | null>(null)
  const [authCheck, setAuthCheck] = useState(0)

  useEffect(() => {
    let cancelado = false
    async function validarAdmin() {
      const { data: authData } = await supabase.auth.getUser()
      if (!authData.user) {
        if (!cancelado) {
          setPerfil(null)
          setAuthState('guest')
        }
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id,nome,email,role,permissions,status')
        .eq('id', authData.user.id)
        .maybeSingle()

      const autorizado = (
        (profile?.role === 'admin' || profile?.role === 'sysadmin')
        && profile?.status !== 'banido'
      )
      if (!autorizado) {
        await supabase.auth.signOut()
        if (!cancelado) {
          setPerfil(null)
          setAuthState('guest')
        }
        return
      }

      if (!cancelado) {
        setPerfil(profile as PerfilAdmin)
        setAuthState('admin')
      }
    }

    validarAdmin()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setPerfil(null)
        setAuthState('guest')
      } else {
        window.setTimeout(validarAdmin, 0)
      }
    })

    return () => {
      cancelado = true
      data.subscription.unsubscribe()
    }
  }, [authCheck])

  function entrarAdmin() {
    setAuthState('loading')
    setAuthCheck(value => value + 1)
  }

  async function sairAdmin() {
    await supabase.auth.signOut()
    setPerfil(null)
    setAuthState('guest')
  }

  if (authState === 'loading') {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 font-bold">Carregando painel...</div>
  }

  if (authState === 'guest') {
    return (
      <BrowserRouter>
        <PasswordRecoveryHandler />
        <Routes>
          <Route path="*" element={<LoginPage onLogin={entrarAdmin} />} />
        </Routes>
        <DialogHost />
      </BrowserRouter>
    )
  }

  if (perfil === null) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 font-bold">Carregando painel...</div>
  }

  const fallback = allowedDestinations(perfil)[0]?.to
  const denied = fallback ? <Navigate to={fallback} replace /> : <div className="glass-panel rounded-2xl p-6"><h1 className="text-xl font-bold">Nenhuma seção liberada</h1><p className="mt-2 text-slate-400">Peça ao administrador responsável para revisar suas permissões.</p></div>
  const guard = (section: string, element: ReactNode, ownerOnly = false) => canAccessAdmin(perfil, section, ownerOnly) ? element : denied

  return (
    <BrowserRouter>
      <PasswordRecoveryHandler />
      <AdminShell profile={perfil} onLogout={sairAdmin}>
        <NotificationSystem />
        <Suspense fallback={<div className="admin-loading" role="status">Carregando esta seção…</div>}>
          <Routes>
            <Route path="/" element={guard('dashboard', <DashboardPage />)} />
            <Route path="/pedidos" element={guard('pedidos', <PedidosPage />)} />
            <Route path="/usuarios" element={guard('usuarios', <UsuariosPage />)} />
            <Route path="/novos-usuarios" element={guard('usuarios', <NovosUsuariosPage />)} />
            <Route path="/testers" element={guard('usuarios', <TestersPage />)} />
            <Route path="/exclusoes" element={guard('usuarios', <ExclusoesPage />)} />
            <Route path="/localizacoes" element={guard('usuarios', <LocalizacoesPage />)} />
            {/* Troca de nome mexe no cadastro do vendedor, entao mora na mesma
                permissao de 'usuarios' — nao vale criar secao nova so pra isso. */}
            <Route path="/troca-nome" element={guard('usuarios', <TrocaNomePage />)} />
            {/* Relatorio do cadastro assistido no evento: e lista de usuario,
                entao mora na mesma permissao de 'usuarios'. */}
            <Route path="/cadastros-evento" element={guard('usuarios', <CadastrosEventoPage />)} />
            <Route path="/verificacoes" element={guard('verificacoes', <VerificacoesPage />)} />
            <Route path="/liberacao-saque" element={guard('atendimento', <LiberacaoSaquePage />)} />
            <Route path="/atendimento/:plataforma" element={guard('atendimento', <AtendimentoPage />)} />
            <Route path="/eventos" element={guard('eventos', <EventosPage />)} />
            <Route path="/cupons" element={guard('cupons', <CuponsPage />)} />
            <Route path="/promocoes" element={guard('promocoes', <PromocoesPage />)} />
            <Route path="/financeiro" element={guard('financeiro', <FinanceiroPage />)} />
            <Route path="/troca-conta" element={guard('financeiro', <TrocaContaPage />)} />
            <Route path="/erros" element={guard('erros', <ErrorsPage />)} />
            <Route path="/admins" element={guard('admins', <AdminsPage />, true)} />
            <Route path="/atualizacoes" element={guard('atualizacoes', <AtualizacoesPage />, true)} />
            <Route path="*" element={denied} />
          </Routes>
        </Suspense>
      </AdminShell>
      <DialogHost />
    </BrowserRouter>
  )
}
