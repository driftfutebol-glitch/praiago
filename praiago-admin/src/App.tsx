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
import Sidebar from './components/Sidebar'

function NotificationSystem() {
  const [notifications, setNotifications] = useState<any[]>([])

  useEffect(() => {
    const sub = supabase.channel('tickets_inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets' }, (payload) => {
        const ticket = payload.new
        setNotifications(prev => [...prev, ticket])
        
        // Auto-remove after 8s
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== ticket.id))
        }, 8000)
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
            key={n.id}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, x: 20 }}
            className="pointer-events-auto bg-slate-900 border border-indigo-500/30 p-4 rounded-xl shadow-2xl shadow-indigo-500/20 flex items-start gap-4 min-w-[300px]"
          >
            <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400">
              <Bell size={20} />
            </div>
            <div className="flex-1">
              <h4 className="text-white font-bold text-sm">Novo Chamado: {n.plataforma}</h4>
              <p className="text-slate-400 text-xs mt-1">{n.assunto}</p>
              <p className="text-slate-500 text-xs mt-1">De: {n.usuario_nome}</p>
            </div>
            <button onClick={() => setNotifications(prev => prev.filter(t => t.id !== n.id))} className="text-slate-500 hover:text-white transition-colors cursor-pointer">
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false)

  if (!isAdmin) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<LoginPage onLogin={() => setIsAdmin(true)} />} />
        </Routes>
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar onLogout={() => setIsAdmin(false)} />
        <main className="flex-1 overflow-y-auto bg-slate-950 p-8 relative">
          <NotificationSystem />
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/pedidos" element={<PedidosPage />} />
            <Route path="/usuarios" element={<UsuariosPage />} />
            <Route path="/verificacoes" element={<VerificacoesPage />} />
            <Route path="/atendimento/:plataforma" element={<AtendimentoPage />} />
            <Route path="/erros" element={<ErrorsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
