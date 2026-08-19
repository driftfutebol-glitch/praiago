import { NavLink, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import type { PerfilAdmin } from '../App'
import {
  Activity, Package, Users, AlertOctagon, LogOut, ShieldAlert,
  ShieldCheck, Headphones, ChevronDown, CalendarDays, LayoutGrid,
  Smartphone, TabletSmartphone, UtensilsCrossed, Umbrella, UserCircle, Ticket, Megaphone, WalletCards, MapPin,
  Landmark, Signature, UserPlus
} from 'lucide-react'

// `solicitacoes_troca_nome` ficou fora da publicacao `supabase_realtime`, entao
// postgres_changes nunca chega. Ate entrar la, o contador vive de polling.
const INTERVALO_TROCA_NOME_MS = 45000

const atendimentoSubItems = [
  { to: '/atendimento/todas', icon: LayoutGrid, label: 'Todas (Global)' },
  { to: '/atendimento/iphone', icon: Smartphone, label: 'iPhone' },
  { to: '/atendimento/android', icon: TabletSmartphone, label: 'Android' },
  { to: '/atendimento/restaurante', icon: UtensilsCrossed, label: 'Restaurante' },
  { to: '/atendimento/ambulante', icon: Umbrella, label: 'Ambulante' },
  { to: '/atendimento/cliente', icon: UserCircle, label: 'Cliente' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
    isActive
      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]'
      : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200 border border-transparent'
  }`

export default function Sidebar({ onLogout, perfil }: { onLogout: () => void; perfil: PerfilAdmin | null }) {
  const [pendingVerificacoes, setPendingVerificacoes] = useState(0)
  const [pendingLocalizacoes, setPendingLocalizacoes] = useState(0)
  const [pendingTrocaNome, setPendingTrocaNome] = useState(0)
  const [ticketsAbertos, setTicketsAbertos] = useState(0)
  const [atendimentoOpen, setAtendimentoOpen] = useState(false)
  const location = useLocation()

  const isSys = perfil?.role === 'sysadmin'
  // Regra: sysadmin vê tudo. Admin com permissions null = tudo (compat). Senão, só o que está na lista.
  function podeVer(secao: string) {
    if (isSys) return true
    const perms = perfil?.permissions
    if (!perms) return true
    return perms.includes(secao)
  }

  useEffect(() => {
    async function fetchTickets() {
      const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'aberto')
      setTicketsAbertos(count || 0)
    }
    fetchTickets()
    const ch = supabase.channel('sidebar_tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => fetchTickets())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => {
    async function fetchPendingLocalizacoes() {
      const { count } = await supabase
        .from('solicitacoes_correcao_localizacao')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente')
      setPendingLocalizacoes(count || 0)
    }
    fetchPendingLocalizacoes()
    const channel = supabase
      .channel('sidebar_localizacoes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'solicitacoes_correcao_localizacao',
      }, fetchPendingLocalizacoes)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  useEffect(() => {
    async function fetchPendingTrocaNome() {
      const { count } = await supabase
        .from('solicitacoes_troca_nome')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente')
      setPendingTrocaNome(count || 0)
    }
    fetchPendingTrocaNome()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') fetchPendingTrocaNome()
    }, INTERVALO_TROCA_NOME_MS)
    return () => { window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (location.pathname.startsWith('/atendimento')) {
      setAtendimentoOpen(true)
    }
  }, [location.pathname])

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
    { to: '/', key: 'dashboard', icon: Activity, label: 'Dashboard' },
    { to: '/pedidos', key: 'pedidos', icon: Package, label: 'Pedidos Globais' },
    { to: '/financeiro', key: 'financeiro', icon: WalletCards, label: 'Financeiro' },
    { to: '/troca-conta', key: 'financeiro', icon: Landmark, label: 'Troca de conta' },
    { to: '/usuarios', key: 'usuarios', icon: Users, label: 'Usuários' },
  ].filter(m => podeVer(m.key))

  const conteudoMenus = [
    { to: '/eventos', key: 'eventos', icon: CalendarDays, label: 'Eventos' },
    { to: '/cupons', key: 'cupons', icon: Ticket, label: 'Cupons' },
    { to: '/promocoes', key: 'promocoes', icon: Megaphone, label: 'Promoções' },
  ].filter(m => podeVer(m.key))

  const verVerificacoes = podeVer('verificacoes')
  const verLocalizacoes = podeVer('usuarios')
  // Trocar o nome do estabelecimento e edicao de cadastro: mesma permissao de 'usuarios'.
  const verTrocaNome = podeVer('usuarios')
  const verCadastrosEvento = podeVer('usuarios')
  const verAtendimento = podeVer('atendimento')
  const verErros = podeVer('erros')

  return (
    <aside className="w-72 bg-slate-900/80 backdrop-blur-xl border-r border-slate-800/50 flex flex-col relative z-20">
      {/* Logo / Header */}
      <div className="p-6 border-b border-slate-800/50 flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center border border-purple-500/30 pulse-neon">
          <ShieldAlert size={20} className="text-purple-400" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-100 tracking-wide">PRAIAGO <span className="neon-text-purple">ADMIN</span></h2>
          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 font-mono">
            {isSys ? 'Sysadmin · Nível 5' : 'Acesso Restrito'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {(mainMenus.length > 0 || verVerificacoes) && (
          <div className="px-3 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] font-mono">
            Principal
          </div>
        )}

        {mainMenus.map(m => (
          <NavLink key={m.to} to={m.to} end={m.to === '/'} className={linkClass}>
            <m.icon size={18} />
            {m.label}
          </NavLink>
        ))}

        {verLocalizacoes && (
          <NavLink to="/localizacoes" className={linkClass}>
            <MapPin size={18} />
            <span className="flex-1">Correcoes de local</span>
            {pendingLocalizacoes > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="min-w-[22px] h-[22px] flex items-center justify-center bg-amber-500 text-slate-950 text-[10px] font-black rounded-full"
              >
                {pendingLocalizacoes}
              </motion.span>
            )}
          </NavLink>
        )}

        {verTrocaNome && (
          <NavLink to="/troca-nome" className={linkClass}>
            <Signature size={18} />
            <span className="flex-1">Troca de nome</span>
            {pendingTrocaNome > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="min-w-[22px] h-[22px] flex items-center justify-center bg-amber-500 text-slate-950 text-[10px] font-black rounded-full"
              >
                {pendingTrocaNome}
              </motion.span>
            )}
          </NavLink>
        )}

        {verCadastrosEvento && (
          <NavLink to="/cadastros-evento" className={linkClass}>
            <UserPlus size={18} />
            <span className="flex-1">Cadastros do evento</span>
          </NavLink>
        )}

        {verVerificacoes && (
          <NavLink to="/verificacoes" className={linkClass}>
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
        )}

        {conteudoMenus.length > 0 && (
          <div className="px-3 pt-4 pb-2 text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] font-mono">
            Conteúdo
          </div>
        )}
        {conteudoMenus.map(m => (
          <NavLink key={m.to} to={m.to} className={linkClass}>
            <m.icon size={18} />
            {m.label}
          </NavLink>
        ))}

        {verAtendimento && (
          <>
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
              {ticketsAbertos > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="min-w-[22px] h-[22px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full pulse-red mr-1"
                >
                  {ticketsAbertos}
                </motion.span>
              )}
              <motion.div animate={{ rotate: atendimentoOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
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
          </>
        )}

        {(verErros || isSys) && (
          <div className="px-3 pt-4 pb-2 text-[10px] font-bold text-slate-600 uppercase tracking-[0.2em] font-mono">
            Sistema
          </div>
        )}

        {verErros && (
          <NavLink to="/erros" className={linkClass}>
            <AlertOctagon size={18} />
            Seguranca & Logs
          </NavLink>
        )}

        {/* Administradores — exclusivo do dono (sysadmin) */}
        {isSys && (
          <NavLink to="/admins" className={linkClass}>
            <ShieldAlert size={18} />
            Administradores
          </NavLink>
        )}
      </nav>

      {/* Session Info & Logout */}
      <div className="p-3 border-t border-slate-800/50 space-y-2">
        <div className="px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-800/30">
          <div className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">Sessão Ativa</div>
          <div className="text-xs text-slate-400 font-mono font-bold truncate">{perfil?.email || 'admin'}</div>
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
