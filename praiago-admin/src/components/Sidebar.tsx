import { NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import {
  Activity, Package, Users, AlertOctagon, LogOut, ShieldAlert,
  ShieldCheck, Headphones, ChevronDown,
  Smartphone, TabletSmartphone, UtensilsCrossed, Umbrella, UserCircle
} from 'lucide-react'

const atendimentoSubItems = [
  { to: '/atendimento/iphone', icon: Smartphone, label: 'iPhone' },
  { to: '/atendimento/android', icon: TabletSmartphone, label: 'Android' },
  { to: '/atendimento/restaurante', icon: UtensilsCrossed, label: 'Restaurante' },
  { to: '/atendimento/ambulante', icon: Umbrella, label: 'Ambulante' },
  { to: '/atendimento/cliente', icon: UserCircle, label: 'Cliente' },
]

export default function Sidebar({ onLogout }: { onLogout: () => void }) {
  const [pendingVerificacoes, setPendingVerificacoes] = useState(0)
  const [atendimentoOpen, setAtendimentoOpen] = useState(false)
  const location = useLocation()

  // Auto-expand Atendimento submenu when on an atendimento route
  useEffect(() => {
    if (location.pathname.startsWith('/atendimento')) {
      setAtendimentoOpen(true)
    }
  }, [location.pathname])

  // Fetch pending verification count with realtime updates
  useEffect(() => {
    async function fetchPending() {
      const { count } = await supabase
        .from('verificacoes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente')
      setPendingVerificacoes(count || 0)
    }
    fetchPending()

    const channel = supabase
      .channel('sidebar_verificacoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes' }, () => {
        fetchPending()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const mainMenus = [
    { to: '/', icon: Activity, label: 'Dashboard' },
    { to: '/pedidos', icon: Package, label: 'Pedidos Globais' },
    { to: '/usuarios', icon: Users, label: 'Usuários' },
  ]

  return (
    <aside className="w-72 bg-slate-900/80 backdrop-blur-xl border-r border-slate-800/50 flex flex-col relative z-20">
      {/* Logo / Header */}
      <div className="p-6 border-b border-slate-800/50 flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center border border-purple-500/30 pulse-neon">
          <ShieldAlert size={20} className="text-purple-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-100 tracking-wide">PRAIAGO <span className="neon-text-purple">ADMIN</span></h2>
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-mono">Acesso Restrito · Nível 5</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {/* Section Label */}
        <div className="px-3 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] font-mono">
          Principal
        </div>

        {mainMenus.map(m => (
          <NavLink
            key={m.to}
            to={m.to}
            end={m.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                isActive
                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
              }`
            }
          >
            <m.icon size={18} />
            {m.label}
          </NavLink>
        ))}

        {/* Verificações with badge */}
        <NavLink
          to="/verificacoes"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
              isActive
                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
            }`
          }
        >
          <ShieldCheck size={18} />
          <span className="flex-1">Verificações</span>
          {pendingVerificacoes > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="min-w-[22px] h-[22px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full pulse-red"
            >
              {pendingVerificacoes}
            </motion.span>
          )}
        </NavLink>

        {/* Atendimento Section */}
        <div className="px-3 pt-4 pb-2 text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] font-mono">
          Suporte
        </div>

        <button
          onClick={() => setAtendimentoOpen(!atendimentoOpen)}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 border border-transparent ${
            location.pathname.startsWith('/atendimento')
              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
              : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
          }`}
        >
          <Headphones size={18} />
          <span className="flex-1 text-left">Atendimento</span>
          <motion.div
            animate={{ rotate: atendimentoOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={16} />
          </motion.div>
        </button>

        <AnimatePresence>
          {atendimentoOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden ml-3"
            >
              <div className="border-l border-slate-800/50 pl-3 space-y-0.5 py-1">
                {atendimentoSubItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        isActive
                          ? 'bg-purple-500/10 text-purple-300 border border-purple-500/15'
                          : 'text-slate-500 hover:bg-slate-800/40 hover:text-slate-300 border border-transparent'
                      }`
                    }
                  >
                    <item.icon size={14} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* System Section */}
        <div className="px-3 pt-4 pb-2 text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] font-mono">
          Sistema
        </div>

        <NavLink
          to="/erros"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
              isActive
                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
                : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
            }`
          }
        >
          <AlertOctagon size={18} />
          Log de Erros
        </NavLink>
      </nav>

      {/* Session Info & Logout */}
      <div className="p-3 border-t border-slate-800/50 space-y-2">
        <div className="px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-800/30">
          <div className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">Sessão Ativa</div>
          <div className="text-xs text-slate-400 font-mono font-bold">admin@praiago.local</div>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold text-sm hover:bg-red-500/20 transition-all duration-200 hover:shadow-[0_0_15px_rgba(248,113,113,0.15)]"
        >
          <LogOut size={16} />
          ENCERRAR SESSÃO
        </button>
      </div>
    </aside>
  )
}
