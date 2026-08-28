import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Headphones, ChevronDown, ChevronUp, Send, Clock,
  CheckCircle2, AlertCircle, Loader2, MessageSquare,
  XCircle, CircleDot, Star, Bot, ShieldAlert
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
  avaliacao_nota?: number | null
  avaliacao_comentario?: string | null
  avaliado_em?: string | null
  // Triagem da IA: quando o assistente nao resolve, ele abre o caso ja
  // classificado. Casos com comprovacao ficam aguardando decisao do admin.
  origem?: string // 'humano' | 'ia'
  ia_categoria?: string | null
  ia_resumo?: string | null
  ia_exige_comprovacao?: boolean | null
  ia_triagem_status?: string | null // 'pendente' | 'aprovado' | 'negado'
  ia_observacao_admin?: string | null
  pedido_ref?: string | null
}

// Identificam a loja e a conta na URL do painel da Pagar.me. Nao sao segredo:
// aparecem na barra de endereco de quem abre o dashboard.
const PAGARME_MERCHANT = 'merch_Nv59PdnHDlc591xW'
const PAGARME_ACCOUNT = 'acc_e60kz6Jirfxgz48B'

const iaCategoriaLabel: Record<string, string> = {
  reembolso: 'Reembolso',
  pagamento: 'Pagamento',
  entrega: 'Entrega',
  produto: 'Produto',
  conta: 'Conta',
  fraude: 'Fraude',
  outro: 'Outro',
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
  const [mensagens, setMensagens] = useState<Record<string, { id: string; autor: string; mensagem: string; created_at: string }[]>>({})
  const [aba, setAba] = useState<'todos' | 'triagem'>('todos')
  const [decidindo, setDecidindo] = useState<string | null>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  const carregarMensagens = useCallback(async (ticketId: string) => {
    const { data } = await supabase.from('ticket_mensagens').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true })
    setMensagens(prev => ({ ...prev, [ticketId]: (data as { id: string; autor: string; mensagem: string; created_at: string }[]) ?? [] }))
  }, [])

  async function abrirTicket(ticketId: string) {
    const abrindo = expandedTicket !== ticketId
    setExpandedTicket(abrindo ? ticketId : null)
    if (abrindo) {
      carregarMensagens(ticketId)
      // marca como lido pelo admin
      await supabase.from('tickets').update({ nao_lida_admin: false }).eq('id', ticketId)
    }
  }

  // realtime das mensagens do ticket aberto
  useEffect(() => {
    if (!expandedTicket) return
    const ch = supabase.channel(`tm_${expandedTicket}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ticket_mensagens', filter: `ticket_id=eq.${expandedTicket}` }, () => {
        carregarMensagens(expandedTicket)
        setTimeout(() => fimRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [expandedTicket, carregarMensagens])

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
      await supabase.from('ticket_mensagens').insert({ ticket_id: ticketId, autor: 'admin', mensagem: resposta.trim() })
      // avisa o usuário (não-lida) e mantém o atendimento em andamento
      await supabase.from('tickets').update({
        status: 'em_andamento',
        resposta: resposta.trim(),
        nao_lida_usuario: true,
        nao_lida_admin: false,
        updated_at: new Date().toISOString(),
      }).eq('id', ticketId)
      setRespostas(prev => ({ ...prev, [ticketId]: '' }))
      carregarMensagens(ticketId)
    } catch (err) {
      console.error('Erro ao enviar resposta:', err)
    }
    setSendingReply(null)
  }

  async function mudarStatus(ticketId: string, novoStatus: string) {
    setUpdatingStatus(ticketId)
    try {
      await supabase
        .from('tickets')
        .update({
          status: novoStatus,
          // ao resolver/fechar, avisa o usuário (pra ele ver "resolvido" e avaliar)
          ...(novoStatus === 'resolvido' || novoStatus === 'fechado' ? { nao_lida_usuario: true } : {}),
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

  async function decidirTriagem(ticketId: string, decisao: 'aprovado' | 'negado') {
    const observacao = window.prompt(
      decisao === 'aprovado'
        ? 'Observacao da aprovacao (opcional) — fica registrada para auditoria:'
        : 'Motivo da recusa (recomendado):',
      decisao === 'aprovado' ? 'Comprovacao conferida e aprovada.' : '',
    )
    if (observacao === null) return
    setDecidindo(ticketId)
    const { error } = await supabase.rpc('decidir_triagem_ia', {
      p_ticket_id: ticketId,
      p_decisao: decisao,
      p_observacao: observacao,
    })
    setDecidindo(null)
    if (error) {
      window.alert('Nao foi possivel registrar a decisao: ' + error.message)
      return
    }
    setTickets(prev => prev.map(t => t.id === ticketId
      ? { ...t, ia_triagem_status: decisao, ia_observacao_admin: observacao || null, status: decisao === 'negado' ? 'resolvido' : 'em_andamento' }
      : t))
  }

  const triagemPendentes = tickets.filter(t => t.origem === 'ia' && t.ia_triagem_status === 'pendente')
  const ticketsVisiveis = aba === 'triagem' ? tickets.filter(t => t.origem === 'ia') : tickets

  const abertos = tickets.filter(t => t.status === 'aberto' || t.status === 'em_andamento').length
  const avaliados = tickets.filter(t => typeof t.avaliacao_nota === 'number')
  const mediaAvaliacao = avaliados.length ? (avaliados.reduce((a, t) => a + (t.avaliacao_nota || 0), 0) / avaliados.length) : 0

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
        {avaliados.length > 0 && (
          <div className="glass-panel px-4 py-2.5 rounded-xl border-slate-800 flex items-center gap-2">
            <Star size={14} className="text-yellow-400 fill-yellow-400" />
            <span className="text-xs font-bold text-slate-400">Avaliação:</span>
            <span className="text-sm font-black text-yellow-400 font-mono">{mediaAvaliacao.toFixed(1)}</span>
            <span className="text-[10px] text-slate-500 font-mono">({avaliados.length})</span>
          </div>
        )}
      </div>

      {/* Abas: todos x triagem da IA */}
      <div className="flex items-center gap-1 glass-panel rounded-xl p-1.5 border-slate-800 w-fit">
        <button
          onClick={() => setAba('todos')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
            aba === 'todos'
              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          Todos os atendimentos
          <span className="ml-1.5 text-[10px] opacity-60">({tickets.length})</span>
        </button>
        <button
          onClick={() => setAba('triagem')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
            aba === 'triagem'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/25'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          <Bot size={13} />
          Comprovação IA
          {triagemPendentes.length > 0 && (
            <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-cyan-500/25 text-cyan-200 text-[10px] font-black">
              {triagemPendentes.length}
            </span>
          )}
        </button>
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
              {ticketsVisiveis.map((ticket, i) => {
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
                      onClick={() => abrirTicket(ticket.id)}
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
                      <td className="p-4 text-slate-300 max-w-[300px]">
                        <div className="truncate">{ticket.assunto}</div>
                        {ticket.origem === 'ia' && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[9px] font-black uppercase">
                              <Bot size={9} /> IA
                            </span>
                            {ticket.ia_exige_comprovacao && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[9px] font-black uppercase">
                                Comprovação
                              </span>
                            )}
                            {ticket.ia_triagem_status === 'pendente' && (
                              <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/20 text-[9px] font-black uppercase">
                                Aguarda decisão
                              </span>
                            )}
                          </div>
                        )}
                      </td>
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
                              {/* Verificação de recebedor: o atendente precisa
                                  sair daqui, gerar o link na Pagar.me e voltar
                                  para colar. Sem o atalho, ele procura o
                                  recebedor na mão numa lista de ids iguais. */}
                              {ticket.origem === 'kyc' && (
                                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-2 flex-wrap mb-2">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-300 uppercase tracking-wider font-mono">
                                      <ShieldAlert size={12} /> Liberar movimentação do saldo
                                    </span>
                                  </div>
                                  <p className="text-slate-300 text-sm leading-relaxed mb-3">
                                    Abra o recebedor na Pagar.me, clique em <strong>Criar link</strong> e cole o
                                    endereço na resposta abaixo. O vendedor recebe aviso na hora e o link
                                    aparece como botão no app dele. <strong>Vale poucos minutos</strong> — só gere
                                    quando ele estiver com o documento em mãos.
                                  </p>
                                  {(() => {
                                    const rec = ticket.mensagem.match(/re_[a-z0-9]+/i)?.[0]
                                    if (!rec) return null
                                    return (
                                      <a
                                        href={`https://dash.pagar.me/${PAGARME_MERCHANT}/${PAGARME_ACCOUNT}/${rec}/recipient-details`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-bold hover:bg-amber-500/20 transition-colors font-mono"
                                      >
                                        Abrir {rec} na Pagar.me
                                      </a>
                                    )
                                  })()}
                                </div>
                              )}

                              {/* Triagem da IA: resumo + decisão do admin */}
                              {ticket.origem === 'ia' && (
                                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-xl p-4" onClick={e => e.stopPropagation()}>
                                  <div className="flex items-center gap-2 flex-wrap mb-2">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-cyan-300 uppercase tracking-wider font-mono">
                                      <Bot size={12} /> Triagem do assistente
                                    </span>
                                    {ticket.ia_categoria && (
                                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-200 border border-cyan-500/20 text-[10px] font-black uppercase">
                                        {iaCategoriaLabel[ticket.ia_categoria] || ticket.ia_categoria}
                                      </span>
                                    )}
                                    {ticket.pedido_ref && (
                                      <span className="px-2 py-0.5 rounded bg-slate-700/40 text-slate-300 text-[10px] font-mono font-bold">
                                        {ticket.pedido_ref}
                                      </span>
                                    )}
                                    {ticket.ia_exige_comprovacao && (
                                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] font-black uppercase">
                                        Exige comprovação
                                      </span>
                                    )}
                                  </div>

                                  {ticket.ia_resumo && (
                                    <p className="text-sm text-slate-300 leading-relaxed">{ticket.ia_resumo}</p>
                                  )}

                                  {ticket.ia_triagem_status === 'pendente' ? (
                                    <div className="flex items-center gap-3 mt-4">
                                      <button
                                        onClick={() => decidirTriagem(ticket.id, 'aprovado')}
                                        disabled={decidindo === ticket.id}
                                        className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide border bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/15 disabled:opacity-50 flex items-center gap-1.5"
                                      >
                                        {decidindo === ticket.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                        Aprovar caso
                                      </button>
                                      <button
                                        onClick={() => decidirTriagem(ticket.id, 'negado')}
                                        disabled={decidindo === ticket.id}
                                        className="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wide border bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/15 disabled:opacity-50 flex items-center gap-1.5"
                                      >
                                        <XCircle size={13} />
                                        Negar
                                      </button>
                                      <span className="text-[11px] text-slate-500">
                                        {ticket.ia_exige_comprovacao ? 'Confira a comprovação enviada antes de decidir.' : 'Analise o caso e decida.'}
                                      </span>
                                    </div>
                                  ) : ticket.ia_triagem_status ? (
                                    <div className={`mt-3 text-xs font-bold ${ticket.ia_triagem_status === 'aprovado' ? 'text-green-400' : 'text-red-400'}`}>
                                      {ticket.ia_triagem_status === 'aprovado' ? '✅ Caso aprovado' : '❌ Caso negado'}
                                      {ticket.ia_observacao_admin && (
                                        <span className="text-slate-400 font-medium"> · {ticket.ia_observacao_admin}</span>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
                              )}

                              {/* Conversa (thread) */}
                              <div>
                                <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 font-mono">
                                  Conversa
                                </div>
                                <div className="bg-slate-950/40 rounded-xl p-4 border border-slate-800/50 max-h-72 overflow-y-auto space-y-3" onClick={e => e.stopPropagation()}>
                                  {/* primeira mensagem = a que abriu o ticket */}
                                  <div className="flex justify-start">
                                    <div className="max-w-[75%] bg-slate-800/60 rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-slate-200">
                                      {ticket.mensagem}
                                      <div className="text-[10px] text-slate-500 mt-1">{ticket.usuario_nome} · {format(new Date(ticket.created_at), 'dd/MM HH:mm')}</div>
                                    </div>
                                  </div>
                                  {(mensagens[ticket.id] || []).map(m => (
                                    <div key={m.id} className={`flex ${m.autor === 'admin' ? 'justify-end' : 'justify-start'}`}>
                                      <div className={`max-w-[75%] px-4 py-2.5 text-sm ${m.autor === 'admin' ? 'bg-purple-500/20 text-purple-100 rounded-2xl rounded-tr-sm' : 'bg-slate-800/60 text-slate-200 rounded-2xl rounded-tl-sm'}`}>
                                        {m.mensagem}
                                        <div className={`text-[10px] mt-1 ${m.autor === 'admin' ? 'text-purple-300/70' : 'text-slate-500'}`}>{m.autor === 'admin' ? 'Suporte' : ticket.usuario_nome} · {format(new Date(m.created_at), 'dd/MM HH:mm')}</div>
                                      </div>
                                    </div>
                                  ))}
                                  <div ref={fimRef} />
                                </div>
                              </div>

                              {/* Avaliação do atendimento (feita pelo usuário) */}
                              {typeof ticket.avaliacao_nota === 'number' && (
                                <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider font-mono">Avaliação do usuário</span>
                                    <div className="flex gap-0.5">
                                      {[1, 2, 3, 4, 5].map(i => (
                                        <Star key={i} size={14} className={i <= (ticket.avaliacao_nota || 0) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'} />
                                      ))}
                                    </div>
                                    <span className="text-xs font-black text-yellow-400 font-mono">{ticket.avaliacao_nota}/5</span>
                                  </div>
                                  {ticket.avaliacao_comentario && (
                                    <p className="text-sm text-slate-300 italic mt-2">"{ticket.avaliacao_comentario}"</p>
                                  )}
                                </div>
                              )}

                              {/* Reply + Status Controls */}
                              <div className="flex gap-4">
                                {/* Reply */}
                                <div className="flex-1">
                                  <div className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-2 font-mono">
                                    Responder
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
