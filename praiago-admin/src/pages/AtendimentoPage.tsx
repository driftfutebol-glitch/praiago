import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Headphones, ChevronDown, ChevronUp, Send, Clock,
  CheckCircle2, AlertCircle, Loader2, MessageSquare,
  XCircle, CircleDot
} from 'lucide-react'

interface Ticket {
  id: string
  plataforma: string
  usuario_nome: string
  usuario_email?: string
  assunto: string
  mensagem: string
  resposta?: string
  status: string // 'aberto' | 'em_andamento' | 'resolvido' | 'fechado'
  prioridade: string // 'baixa' | 'media' | 'alta' | 'urgente'
  created_at: string
  updated_at?: string
}

const platformLabels: Record<string, string> = {
  iphone: 'iPhone',
  android: 'Android',
  restaurante: 'Restaurante',
  ambulante: 'Ambulante',
  cliente: 'Cliente',
}

const prioridadeConfig: Record<string, { label: string; color: string; bg: string; border: string }> = {
  baixa: { label: 'BAIXA', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20' },
  media: { label: 'MÉDIA', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  alta: { label: 'ALTA', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  urgente: { label: 'URGENTE', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
}

const statusOptions = [
  { value: 'aberto', label: 'Aberto', color: 'text-blue-400', icon: CircleDot },
  { value: 'em_andamento', label: 'Em Andamento', color: 'text-amber-400', icon: Clock },
  { value: 'resolvido', label: 'Resolvido', color: 'text-green-400', icon: CheckCircle2 },
  { value: 'fechado', label: 'Fechado', color: 'text-slate-500', icon: XCircle },
]

export default function AtendimentoPage() {
  const { plataforma } = useParams<{ plataforma: string }>()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [sendingReply, setSendingReply] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)

  const platformLabel = platformLabels[plataforma || ''] || plataforma || 'Todas as Plataformas'
  const isTodas = !plataforma || plataforma === 'todas'

  const fetchTickets = useCallback(async () => {
    let query = supabase.from('tickets').select('*').order('created_at', { ascending: false })
    if (!isTodas) {
      query = query.eq('plataforma', plataforma)
    }
    const { data } = await query
    if (data) setTickets(data as Ticket[])
    setLoading(false)
  }, [plataforma, isTodas])

  useEffect(() => {
    setLoading(true)
    setExpandedTicket(null)
    fetchTickets()

    // Ouve a tabela de tickets de maneira global ou específica
    const channelName = isTodas ? 'admin_tickets_todas' : `admin_tickets_${plataforma}`
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        fetchTickets()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [plataforma, isTodas, fetchTickets])

  async function enviarResposta(ticketId: string) {
    const resposta = respostas[ticketId]
    if (!resposta?.trim()) return
    setSendingReply(ticketId)
    try {
      await supabase
        .from('tickets')
        .update({
          resposta: resposta.trim(),
          status: 'em_andamento',
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId)
      setRespostas(prev => ({ ...prev, [ticketId]: '' }))
    } catch (err) {
      console.error('Erro ao enviar resposta:', err)
    }
    setSendingReply(null)
  }

  async function mudarStatus(ticketId: string, novoStatus: string) {
    setUpdatingStatus(ticketId)
    try {
      await supabase
        .from('tickets') // BUG FIX AQUI (era tickets_suporte)
        .update({
          status: novoStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ticketId)
    } catch (err) {
      console.error('Erro ao mudar status:', err)
    }
    setUpdatingStatus(null)
  }

  function getStatusConfig(status: string) {
    return statusOptions.find(s => s.value === status) || statusOptions[0]
  }

  const abertos = tickets.filter(t => t.status === 'aberto' || t.status === 'em_andamento').length

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-purple-500/15 rounded-lg flex items-center justify-center border border-purple-500/20">
            <Headphones size={22} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">
              Atendimento {isTodas ? '' : '· '}
              <span className="neon-text-purple">{isTodas ? 'Global' : platformLabel}</span>
            </h1>
            <p className="text-slate-400 text-sm font-medium">
              {isTodas ? 'Todos os tickets de suporte de todas as plataformas.' : `Tickets de suporte da plataforma ${platformLabel}.`}
            </p>
          </div>
        </div>
      </header>

      {/* Stats */}
      <div className="flex items-center gap-4">
        <div className="glass-panel px-4 py-2.5 rounded-xl border-slate-800 flex items-center gap-2">
          <MessageSquare size={14} className="text-purple-400" />
          <span className="text-xs font-bold text-slate-400">Total:</span>
          <span className="text-sm font-black text-purple-400 font-mono">{tickets.length}</span>
        </div>
        <div className="glass-panel px-4 py-2.5 rounded-xl border-slate-800 flex items-center gap-2">
          <AlertCircle size={14} className="text-amber-400" />
          <span className="text-xs font-bold text-slate-400">Abertos:</span>
          <span className="text-sm font-black text-amber-400 font-mono">{abertos}</span>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="text-purple-400 animate-spin" />
        </div>
      )}

      {/* Tickets Table */}
      {!loading && (
        <div className="glass-panel rounded-2xl overflow-hidden border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/80 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-800">
                <th className="p-4 w-8"></th>
                <th className="p-4">ID</th>
                <th className="p-4">Data</th>
                <th className="p-4">Usuário</th>
                {isTodas && <th className="p-4">Plataforma</th>}
                <th className="p-4">Assunto</th>
                <th className="p-4">Prioridade</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30 text-sm">
              {tickets.map((ticket, i) => {
                const isExpanded = expandedTicket === ticket.id
                const prio = prioridadeConfig[ticket.prioridade] || prioridadeConfig.baixa
                const statusCfg = getStatusConfig(ticket.status)
                const StatusIcon = statusCfg.icon
                const pLabel = platformLabels[ticket.plataforma] || ticket.plataforma

                return (
                  <AnimatePresence key={ticket.id}>
                    <motion.tr
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                      className={`cursor-pointer transition-colors ${
                        isExpanded ? 'bg-slate-800/30' : 'hover:bg-slate-800/15'
                      } ${ticket.prioridade === 'urgente' ? 'border-l-2 border-l-red-500/50' : ''}`}
                    >
                      <td className="p-4">
                        <motion.div
                          animate={{ rotate: isExpanded ? 180 : 0 }}
                          transition={{ duration: 0.2 }}
                          className="text-slate-600"
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </motion.div>
                      </td>
                      <td className="p-4 font-mono font-bold text-purple-400 text-xs">
                        {ticket.id.substring(0, 8)}
                      </td>
                      <td className="p-4 text-slate-500 text-xs font-mono">
                        {format(new Date(ticket.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                      </td>
                      <td className="p-4 text-slate-200 font-semibold">{ticket.usuario_nome}</td>
                      {isTodas && (
                        <td className="p-4 text-slate-400 font-medium capitalize text-xs">
                          {pLabel}
                        </td>
                      )}
                      <td className="p-4 text-slate-300 max-w-[300px] truncate">{ticket.assunto}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${prio.bg} ${prio.color} ${prio.border} border`}>
                          {prio.label}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`flex items-center gap-1 text-xs font-bold ${statusCfg.color}`}>
                          <StatusIcon size={12} />
                          {statusCfg.label}
                        </span>
                      </td>
                    </motion.tr>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <motion.tr
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <td colSpan={isTodas ? 8 : 7} className="p-0">
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="p-6 bg-slate-900/40 border-t border-slate-800/30 space-y-4">
                              {/* Original Message */}
                              <div>
                                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 font-mono">
                                  Mensagem do Usuário
                                </div>
                                <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50 text-sm text-slate-300 leading-relaxed">
                                  {ticket.mensagem}
                                </div>
                              </div>

                              {/* Previous Response */}
                              {ticket.resposta && (
                                <div>
                                  <div className="text-[10px] font-bold text-purple-500 uppercase tracking-wider mb-2 font-mono">
                                    Resposta do Suporte
                                  </div>
                                  <div className="bg-purple-500/5 rounded-xl p-4 border border-purple-500/10 text-sm text-slate-300 leading-relaxed">
                                    {ticket.resposta}
                                  </div>
                                </div>
                              )}

                              {/* Reply + Status Controls */}
                              <div className="flex gap-4">
                                {/* Reply */}
                                <div className="flex-1">
                                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 font-mono">
                                    Escrever Resposta
                                  </div>
                                  <div className="flex gap-2">
                                    <textarea
                                      value={respostas[ticket.id] || ''}
                                      onChange={e => setRespostas(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                                      placeholder="Digite a resposta para o usuário..."
                                      className="flex-1 bg-slate-950/50 border border-slate-800/50 rounded-xl p-3 text-sm text-slate-200 outline-none focus:border-purple-500/30 resize-none h-20 transition-colors"
                                      onClick={e => e.stopPropagation()}
                                    />
                                    <button
                                      onClick={e => {
                                        e.stopPropagation()
                                        enviarResposta(ticket.id)
                                      }}
                                      disabled={!respostas[ticket.id]?.trim() || sendingReply === ticket.id}
                                      className="self-end px-4 py-3 bg-purple-500/15 text-purple-400 border border-purple-500/20 rounded-xl font-bold text-xs hover:bg-purple-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                      {sendingReply === ticket.id ? (
                                        <Loader2 size={14} className="animate-spin" />
                                      ) : (
                                        <Send size={14} />
                                      )}
                                      Enviar
                                    </button>
                                  </div>
                                </div>

                                {/* Status Changer */}
                                <div className="w-44">
                                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 font-mono">
                                    Alterar Status
                                  </div>
                                  <div className="space-y-1.5">
                                    {statusOptions.map(opt => {
                                      const OptIcon = opt.icon
                                      const isActive = ticket.status === opt.value
                                      return (
                                        <button
                                          key={opt.value}
                                          onClick={e => {
                                            e.stopPropagation()
                                            if (!isActive) mudarStatus(ticket.id, opt.value)
                                          }}
                                          disabled={isActive || updatingStatus === ticket.id}
                                          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                                            isActive
                                              ? `bg-purple-500/10 ${opt.color} border border-purple-500/20`
                                              : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300 border border-transparent'
                                          } disabled:cursor-not-allowed`}
                                        >
                                          <OptIcon size={12} />
                                          {opt.label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                )
              })}

              {tickets.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                        <Headphones size={28} className="text-slate-600" />
                      </div>
                      <h3 className="text-lg font-bold text-slate-400 mb-1">Nenhum ticket encontrado</h3>
                      <p className="text-sm text-slate-600">
                        Não há tickets de suporte para a plataforma {platformLabel}.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
