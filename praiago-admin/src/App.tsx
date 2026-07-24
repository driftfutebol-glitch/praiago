import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X } from 'lucide-react'
import { supabase } from './lib/supabase'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PedidosPage from './pages/PedidosPage'
import UsuariosPage from './pages/UsuariosPage'
import VerificacoesPage from './pages/VerificacoesPage'
import AtendimentoPage from './pages/AtendimentoPage'
import ErrorsPage from './pages/ErrorsPage'
import EventosPage from './pages/EventosPage'
import CuponsPage from './pages/CuponsPage'
import PromocoesPage from './pages/PromocoesPage'
import FinanceiroPage from './pages/FinanceiroPage'
import AdminsPage from './pages/AdminsPage'
import Sidebar from './components/Sidebar'
import { DialogHost } from './lib/dialog'

export type PerfilAdmin = {
  id: string
  nome: string | null
  email: string | null
  role: string
  permissions: string[] | null
}

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

    const sub = supabase.channel('tickets_inserts')
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pedidos' }, (payload) => {
        const p = payload.new
        pushNotification({
          id: p.id,
          titulo: 'Novo pedido recebido',
          texto: `Pedido ${p.id?.slice?.(0, 8) || ''} no valor de R$ ${Number(p.total || 0).toFixed(2).replace('.', ',')}`,
          origem: p.cliente_nome || p.cliente || 'Cliente',
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(sub)
    }
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {notifications.map(n => (
          <motion.div
            key={n._toastId || n.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className="pointer-events-auto bg-slate-900 border border-indigo-500/30 p-4 rounded-xl shadow-2xl shadow-indigo-500/20 flex items-start gap-4 min-w-[300px]"
          >
            <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
              <Bell size={20} />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-bold text-sm">{n.titulo}</h4>
              <p className="text-slate-400 text-xs mt-1">{n.texto}</p>
              <p className="text-slate-500 text-xs mt-1">De: {n.origem}</p>
            </div>
            <button onClick={() => setNotifications(prev => prev.filter(t => (t._toastId || t.id) !== (n._toastId || n.id)))} className="text-slate-500 hover:text-white transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      return window.localStorage.getItem('praiago_admin_auth') === 'true'
    } catch {
      return false
    }
  })
  const [perfil, setPerfil] = useState<PerfilAdmin | null>(null)

  // Carrega o perfil do admin logado (role + permissões) pra montar o menu
  // e liberar/bloquear a página de Administradores.
  useEffect(() => {
    if (!isAdmin) { setPerfil(null); return }
    let cancelado = false
    async function carregar() {
      const { data: u } = await supabase.auth.getUser()
      if (!u.user) return
      const { data } = await supabase
        .from('profiles')
        .select('id,nome,email,role,permissions')
        .eq('id', u.user.id)
        .maybeSingle()
      if (!cancelado && data) setPerfil(data as PerfilAdmin)
    }
    carregar()
    return () => { cancelado = true }
  }, [isAdmin])

  function entrarAdmin() {
    try {
      window.localStorage.setItem('praiago_admin_auth', 'true')
    } catch {
      // Mantem a sessao em memoria quando o navegador bloqueia storage.
    }
    setIsAdmin(true)
  }

  function sairAdmin() {
    try {
      window.localStorage.removeItem('praiago_admin_auth')
    } catch {
      // Sem acao extra.
    }
    setIsAdmin(false)
  }

  if (!isAdmin) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage onLogin={entrarAdmin} />} />
        </Routes>
      </BrowserRouter>
    )
  }

  // #22: enquanto o perfil não carregou, mostra loading — antes o refresh em /admins
  // decidia com perfil=null e chutava o sysadmin pro dashboard.
  if (isAdmin && perfil === null) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400 font-bold">Carregando painel…</div>
  }

  // #4: permissão por seção também nas ROTAS (não só no menu) — bloqueia acesso por URL.
  const isSys = perfil?.role === 'sysadmin'
  const podeVer = (secao: string) => isSys || !perfil?.permissions || perfil.permissions.includes(secao)
  const guard = (secao: string, el: React.ReactNode) => (podeVer(secao) ? el : <Navigate to="/" replace />)

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar onLogout={sairAdmin} perfil={perfil} />
        <main className="flex-1 overflow-y-auto bg-slate-950 p-8 relative">
          <NotificationSystem />
          <Routes>
            <Route path="/" element={guard('dashboard', <DashboardPage />)} />
            <Route path="/pedidos" element={guard('pedidos', <PedidosPage />)} />
            <Route path="/usuarios" element={guard('usuarios', <UsuariosPage />)} />
            <Route path="/verificacoes" element={guard('verificacoes', <VerificacoesPage />)} />
            <Route path="/atendimento/:plataforma" element={guard('atendimento', <AtendimentoPage />)} />
            <Route path="/eventos" element={guard('eventos', <EventosPage />)} />
            <Route path="/cupons" element={guard('cupons', <CuponsPage />)} />
            <Route path="/promocoes" element={guard('promocoes', <PromocoesPage />)} />
            <Route path="/financeiro" element={guard('financeiro', <FinanceiroPage />)} />
            <Route path="/erros" element={guard('erros', <ErrorsPage />)} />
            <Route path="/admins" element={perfil?.role === 'sysadmin' ? <AdminsPage /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <DialogHost />
    </BrowserRouter>
  )
}
