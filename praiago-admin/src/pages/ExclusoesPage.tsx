import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Trash2, Check, X, Search, Clock, Mail, IdCard, UserCircle } from 'lucide-react'
import { format } from 'date-fns'
import { alertDialog, promptDialog } from '../lib/dialog'

type Solicitacao = {
  id: string
  user_id: string
  email_informado: string | null
  nome_informado: string | null
  cpf_informado: string | null
  papel_informado: string | null
  motivo: string | null
  status: 'pendente' | 'concluida' | 'recusada'
  criada_em: string
  processada_em: string | null
  observacao: string | null
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  pendente: { label: 'Pendente', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  concluida: { label: 'Concluída', cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
  recusada: { label: 'Recusada', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
}

export default function ExclusoesPage() {
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'pendente' | 'todas'>('pendente')
  const [acaoId, setAcaoId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('solicitacoes_exclusao')
      .select('*')
      .order('criada_em', { ascending: false })
    if (data) setItens(data as Solicitacao[])
  }, [])

  useEffect(() => {
    carregar()
    const ch = supabase
      .channel('admin_exclusoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_exclusao' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  // Só muda o status do pedido. A exclusão em si continua sendo feita à mão
  // na aba Usuários, de propósito: quem aperta o botão vê antes o saldo, os
  // repasses e as disputas daquela conta.
  async function marcar(s: Solicitacao, status: 'concluida' | 'recusada') {
    const rotulo = status === 'concluida' ? 'concluída' : 'recusada'
    const observacao = await promptDialog({
      title: `Marcar como ${rotulo}`,
      message: status === 'concluida'
        ? 'Confirme que a conta já foi apagada na aba Usuários. Anote o que foi feito.'
        : 'Explique por que o pedido foi recusado. O titular pode pedir essa justificativa.',
      defaultValue: status === 'concluida' ? 'Conta e dados apagados.' : '',
      confirmText: `Marcar ${rotulo}`,
      tone: status === 'recusada' ? 'danger' : undefined,
    })
    if (observacao === null) return

    setAcaoId(s.id)
    const { error } = await supabase
      .from('solicitacoes_exclusao')
      .update({
        status,
        observacao: observacao.trim() || null,
        processada_em: new Date().toISOString(),
      })
      .eq('id', s.id)

    if (error) {
      alertDialog({ title: 'Erro', message: 'Não foi possível atualizar: ' + error.message, tone: 'danger' })
    } else {
      setItens(prev => prev.map(i => i.id === s.id ? { ...i, status, observacao: observacao.trim() || null } : i))
    }
    setAcaoId(null)
  }

  async function copiarId(s: Solicitacao) {
    try {
      await navigator.clipboard.writeText(s.user_id)
      await alertDialog({
        title: 'ID copiado',
        message: 'Cole na busca da aba Usuários para localizar a conta.',
      })
    } catch {
      await alertDialog({ title: 'ID do usuário', message: s.user_id })
    }
  }

  const filtrados = itens.filter(s => {
    const t = busca.toLowerCase()
    const matchBusca = !busca ||
      (s.email_informado || '').toLowerCase().includes(t) ||
      (s.nome_informado || '').toLowerCase().includes(t) ||
      (s.cpf_informado || '').includes(busca) ||
      s.user_id.toLowerCase().includes(t)
    const matchStatus = filtro === 'todas' || s.status === 'pendente'
    return matchBusca && matchStatus
  })

  const pendentes = itens.filter(s => s.status === 'pendente').length

  return (
    <div className="space-y-6">
      <header className="mb-4">
        <h1 className="text-3xl font-black text-slate-100 tracking-tight">Pedidos de Exclusão</h1>
        <p className="text-slate-400 font-medium">
          Solicitações abertas pelos próprios titulares dentro do aplicativo.
        </p>
      </header>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Buscar e-mail, nome, CPF ou ID..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-slate-900/50 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-sm text-slate-200 outline-none focus:border-purple-500/30 w-72 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1 glass-panel rounded-xl p-1 border-slate-800">
          {(['pendente', 'todas'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                filtro === f
                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                  : 'text-slate-500 hover:text-slate-300 border border-transparent'
              }`}
            >
              {f === 'pendente' ? `Pendentes${pendentes ? ` (${pendentes})` : ''}` : 'Todas'}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-slate-500 font-mono">
          {filtrados.length} pedido(s)
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtrados.map((s, i) => {
          const sc = statusConfig[s.status] || statusConfig.pendente
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              className={`glass-panel p-5 rounded-2xl flex flex-col relative overflow-hidden transition-all duration-300 ${
                s.status === 'pendente'
                  ? 'border-amber-500/30 hover:border-amber-500/50'
                  : 'border-slate-800 hover:border-slate-700/50'
              }`}
            >
              <div className={`absolute top-0 left-0 w-full h-0.5 ${s.status === 'pendente' ? 'bg-amber-500' : 'bg-slate-700'}`} />

              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-slate-100 font-black truncate">
                    <Mail size={13} className="text-slate-500 shrink-0" />
                    {s.email_informado || '—'}
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 text-sm font-bold truncate mt-1">
                    <UserCircle size={13} className="text-slate-600 shrink-0" />
                    {s.nome_informado || 'sem nome informado'}
                  </div>
                </div>
                <span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-wider shrink-0 ${sc.cls}`}>
                  {sc.label}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-500 font-mono">
                {s.cpf_informado && (
                  <div className="flex items-center gap-2">
                    <IdCard size={12} /> {s.cpf_informado}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <UserCircle size={12} /> papel: {s.papel_informado || '—'}
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={12} /> {format(new Date(s.criada_em), 'dd/MM/yyyy HH:mm')}
                </div>
                <button
                  onClick={() => copiarId(s)}
                  className="text-left text-slate-600 hover:text-slate-400 transition-colors truncate w-full"
                  title="Copiar ID para buscar na aba Usuários"
                >
                  id: {s.user_id}
                </button>
              </div>

              {s.motivo && (
                <p className="mt-3 text-sm text-slate-400 bg-slate-900/40 rounded-lg p-3 border border-slate-800">
                  {s.motivo}
                </p>
              )}

              {s.observacao && (
                <p className="mt-3 text-xs text-slate-500 italic">
                  {s.observacao}
                </p>
              )}

              {s.status === 'pendente' && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => marcar(s, 'concluida')}
                    disabled={acaoId === s.id}
                    className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <Check size={12} />
                    Concluída
                  </button>
                  <button
                    onClick={() => marcar(s, 'recusada')}
                    disabled={acaoId === s.id}
                    className="px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/15 disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    <X size={12} />
                    Recusar
                  </button>
                </div>
              )}
            </motion.div>
          )
        })}

        {filtrados.length === 0 && (
          <div className="col-span-full text-center text-slate-500 py-12 font-bold flex flex-col items-center gap-2">
            <Trash2 size={22} className="text-slate-700" />
            {filtro === 'pendente' ? 'Nenhum pedido pendente.' : 'Nenhum pedido registrado.'}
          </div>
        )}
      </div>
    </div>
  )
}
