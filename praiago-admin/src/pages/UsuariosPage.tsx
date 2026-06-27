import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { UserCheck, ShieldCheck, ShieldX, Search } from 'lucide-react'
import { format } from 'date-fns'

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [filtroRole, setFiltroRole] = useState('todos')

  useEffect(() => {
    async function load() {
      // Puxa da tabela public.profiles
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      if (data) setUsuarios(data)
    }
    load()

    const channel = supabase.channel('admin_usuarios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        load()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const roleConfig: Record<string, { color: string; bg: string; border: string; bar: string }> = {
    restaurante: { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', bar: 'bg-orange-500' },
    ambulante: { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', bar: 'bg-green-500' },
    cliente: { color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', bar: 'bg-blue-500' },
    entregador: { color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', bar: 'bg-purple-500' },
  }

  const filtrados = usuarios.filter(u => {
    const matchBusca = !busca || 
      (u.nome && u.nome.toLowerCase().includes(busca.toLowerCase())) ||
      u.id.toLowerCase().includes(busca.toLowerCase())
    const matchRole = filtroRole === 'todos' || u.role === filtroRole
    return matchBusca && matchRole
  })

  const roles = ['todos', ...new Set(usuarios.map(u => u.role).filter(Boolean))]

  return (
    <div className="space-y-6">
      <header className="mb-4">
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">Usuários do Sistema</h1>
        <p className="text-slate-400 font-medium">Todos os perfis cadastrados (Clientes, Ambulantes, Restaurantes e Entregadores).</p>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar nome ou ID..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-slate-900/50 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 outline-none focus:border-purple-500/30 w-56 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 glass-panel rounded-xl p-1 border-slate-800">
          {roles.map(role => (
            <button
              key={role}
              onClick={() => setFiltroRole(role)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${
                filtroRole === role
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {role === 'todos' ? 'Todos' : role}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-slate-500 font-mono">
          {filtrados.length} usuário(s)
        </div>
      </div>

      {/* Users Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map((u, i) => {
          const rc = roleConfig[u.role] || roleConfig.cliente
          return (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              className="glass-panel p-5 rounded-2xl border-slate-800 flex flex-col relative overflow-hidden hover:border-slate-700/50 transition-all duration-300"
            >
              {/* Top color bar */}
              <div className={`absolute top-0 left-0 w-full h-0.5 ${rc.bar}`} />
              
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-100">{u.nome}</h3>
                  <span className="text-[10px] font-mono text-slate-600">{u.id.substring(0, 12)}...</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Verificado Badge */}
                  {u.verificado ? (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-green-500/10 border border-green-500/15">
                      <ShieldCheck size={11} className="text-green-400" />
                      <span className="text-[9px] font-bold text-green-400 uppercase tracking-wider">Verificado</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-800/50 border border-slate-700/30">
                      <ShieldX size={11} className="text-slate-600" />
                      <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">Não Verif.</span>
                    </div>
                  )}
                  <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${rc.bg} ${rc.color} ${rc.border}`}>
                    {u.role}
                  </div>
                </div>
              </div>

              {/* Extra info */}
              {u.email && (
                <div className="text-xs text-slate-500 mb-1 truncate font-mono">{u.email}</div>
              )}
              {u.telefone && (
                <div className="text-xs text-slate-500 mb-1 font-mono">{u.telefone}</div>
              )}
              
              <div className="mt-auto pt-3 border-t border-slate-800/50 flex justify-between items-center text-xs">
                <span className="text-slate-400 font-medium flex items-center gap-1">
                  <UserCheck size={12} />
                  Ativo
                </span>
                <span className="text-slate-600 text-[10px] font-mono">
                  Desde {u.created_at ? format(new Date(u.created_at), 'dd/MM/yyyy') : '—'}
                </span>
              </div>
            </motion.div>
          )
        })}
        
        {filtrados.length === 0 && (
          <div className="col-span-full text-center text-slate-500 py-12 font-bold">Nenhum perfil encontrado.</div>
        )}
      </div>
    </div>
  )
}
