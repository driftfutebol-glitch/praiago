import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { 
  DollarSign, ShoppingBag, TrendingUp, Users, 
  ShieldCheck, Headphones, Clock, AlertCircle 
} from 'lucide-react'

export default function DashboardPage() {
  const [pedidos, setPedidos] = useState<any[]>([])
  const [profiles, setProfiles] = useState(0)
  const [pendingVerificacoes, setPendingVerificacoes] = useState(0)
  const [openTickets, setOpenTickets] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: pData } = await supabase.from('pedidos').select('*')
      if (pData) setPedidos(pData)
      
      const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
      setProfiles(profileCount || 0)

      // Pending verifications
      const { count: verifCount } = await supabase
        .from('verificacoes')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente')
      setPendingVerificacoes(verifCount || 0)

      // Open tickets
      const { count: ticketCount } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .in('status', ['aberto', 'em_andamento'])
      setOpenTickets(ticketCount || 0)
    }
    load()

    const channel = supabase.channel('admin_dash')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPedidos(prev => [...prev, payload.new])
        } else if (payload.eventType === 'UPDATE') {
          setPedidos(prev => prev.map(p => p.id === payload.new.id ? payload.new : p))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes' }, () => {
        supabase.from('verificacoes').select('*', { count: 'exact', head: true }).eq('status', 'pendente')
          .then(({ count }) => setPendingVerificacoes(count || 0))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        supabase.from('tickets').select('*', { count: 'exact', head: true }).in('status', ['aberto', 'em_andamento'])
          .then(({ count }) => setOpenTickets(count || 0))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const faturamento = pedidos.filter(p => p.status === 'entregue').reduce((acc, p) => acc + Number(p.total), 0)
  const ativos = pedidos.filter(p => p.status !== 'entregue' && p.status !== 'cancelado').length

  const stats = [
    { label: 'Faturamento Total', value: `R$ ${faturamento.toFixed(2)}`, icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10', glow: 'shadow-[0_0_20px_rgba(74,222,128,0.05)]' },
    { label: 'Pedidos Ativos', value: ativos, icon: ActivityIcon, color: 'text-purple-400', bg: 'bg-purple-500/10', glow: 'shadow-[0_0_20px_rgba(168,85,247,0.05)]' },
    { label: 'Pedidos Totais', value: pedidos.length, icon: ShoppingBag, color: 'text-blue-400', bg: 'bg-blue-500/10', glow: 'shadow-[0_0_20px_rgba(59,130,246,0.05)]' },
    { label: 'Usuários Registrados', value: profiles, icon: Users, color: 'text-orange-400', bg: 'bg-orange-500/10', glow: 'shadow-[0_0_20px_rgba(251,146,60,0.05)]' },
    { label: 'Verificações Pendentes', value: pendingVerificacoes, icon: ShieldCheck, color: 'text-amber-400', bg: 'bg-amber-500/10', glow: 'shadow-[0_0_20px_rgba(251,191,36,0.05)]' },
    { label: 'Tickets Abertos', value: openTickets, icon: Headphones, color: 'text-pink-400', bg: 'bg-pink-500/10', glow: 'shadow-[0_0_20px_rgba(236,72,153,0.05)]' },
  ]

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Centro de Comando</h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-500/10 text-green-400 rounded-full text-[10px] font-bold uppercase border border-green-500/15">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            Online
          </div>
        </div>
        <p className="text-slate-400 font-medium">Visão global da operação PraiaGo — dados em tempo real.</p>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: i * 0.08, duration: 0.4 }}
            key={s.label} 
            className={`glass-panel p-5 rounded-2xl flex items-center gap-4 border-slate-800 hover:border-slate-700/50 transition-all duration-300 ${s.glow}`}
          >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.bg}`}>
              <s.icon size={22} className={s.color} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-0.5 font-mono">{s.label}</div>
              <div className="text-2xl font-black text-slate-100 font-mono">{s.value}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Alert Banners */}
      {pendingVerificacoes > 0 && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/15 rounded-xl"
        >
          <div className="w-8 h-8 bg-amber-500/15 rounded-lg flex items-center justify-center">
            <Clock size={16} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-bold text-amber-400">{pendingVerificacoes} verificação(ões) aguardando aprovação</span>
            <span className="text-xs text-slate-500 ml-2">— acesse a seção Verificações para revisar</span>
          </div>
        </motion.div>
      )}

      {openTickets > 0 && (
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-3 p-4 bg-pink-500/5 border border-pink-500/15 rounded-xl"
        >
          <div className="w-8 h-8 bg-pink-500/15 rounded-lg flex items-center justify-center">
            <AlertCircle size={16} className="text-pink-400" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-bold text-pink-400">{openTickets} ticket(s) de suporte aberto(s)</span>
            <span className="text-xs text-slate-500 ml-2">— acesse o menu Atendimento para responder</span>
          </div>
        </motion.div>
      )}

      {/* Recent Activity */}
      <div className="glass-panel rounded-2xl p-6 border-slate-800">
        <h2 className="text-lg font-bold text-slate-100 mb-6 flex items-center gap-2">
          <TrendingUp className="text-purple-400" size={20} /> 
          Atividade Recente
          <span className="text-xs text-slate-600 font-mono ml-2">(Últimos 5 Pedidos)</span>
        </h2>
        <div className="space-y-3">
          {[...pedidos].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5).map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex justify-between items-center p-4 bg-slate-900/40 rounded-xl border border-slate-800/40 hover:border-slate-700/40 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-purple-400 font-mono font-bold text-xs bg-purple-500/10 px-2 py-1 rounded">
                  {typeof p.id === 'string' ? p.id.substring(0, 8) : p.id}
                </span>
                <div>
                  <span className="text-slate-200 font-bold text-sm">{p.cliente_nome}</span>
                  <span className="text-slate-600 text-xs ml-2">em {p.zona}</span>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-black text-green-400 font-mono text-sm">R$ {Number(p.total).toFixed(2)}</span>
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${
                  p.status === 'cancelado' ? 'bg-red-500/10 text-red-400 border border-red-500/15' : 
                  p.status === 'entregue' ? 'bg-green-500/10 text-green-400 border border-green-500/15' : 
                  'bg-blue-500/10 text-blue-400 border border-blue-500/15'
                }`}>
                  {p.status}
                </span>
              </div>
            </motion.div>
          ))}
          {pedidos.length === 0 && (
            <div className="text-center text-slate-500 py-8 font-bold text-sm">
              Nenhum pedido registrado no banco ainda.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ActivityIcon(props: any) {
  return <TrendingUp {...props} />
}
