import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ShieldCheck, CheckCircle2, XCircle, Clock, Eye,
  FileText, User, MapPin, Building2, AlertTriangle,
  X, Loader2, Filter
} from 'lucide-react'

interface Verificacao {
  id: string
  user_id: string
  tipo: string // 'ambulante' | 'restaurante' | 'entregador'
  nome: string
  cpf?: string
  cnpj?: string
  praia?: string
  documento_url?: string
  selfie_url?: string
  comprovante_url?: string
  status: string // 'pendente' | 'aprovado' | 'rejeitado'
  motivo_rejeicao?: string
  created_at: string
}

const statusConfig: Record<string, { label: string; color: string; bg: string; border: string; icon: typeof Clock }> = {
  pendente: { label: 'PENDENTE', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: Clock },
  aprovado: { label: 'APROVADO', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: CheckCircle2 },
  rejeitado: { label: 'REJEITADO', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle },
}

const tipoConfig: Record<string, { label: string; color: string; bg: string }> = {
  ambulante: { label: 'Ambulante', color: 'text-green-400', bg: 'bg-green-500/10' },
  restaurante: { label: 'Restaurante', color: 'text-orange-400', bg: 'bg-orange-500/10' },
  entregador: { label: 'Entregador', color: 'text-blue-400', bg: 'bg-blue-500/10' },
}

const filterTabs = [
  { key: 'todos', label: 'Todos' },
  { key: 'ambulante', label: 'Ambulantes' },
  { key: 'restaurante', label: 'Restaurantes' },
  { key: 'entregador', label: 'Entregadores' },
]

export default function VerificacoesPage() {
  const [verificacoes, setVerificacoes] = useState<Verificacao[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [rejectModalOpen, setRejectModalOpen] = useState<string | null>(null)
  const [motivoRejeicao, setMotivoRejeicao] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const fetchVerificacoes = useCallback(async () => {
    const { data } = await supabase
      .from('verificacoes')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setVerificacoes(data as Verificacao[])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchVerificacoes()

    const channel = supabase
      .channel('admin_verificacoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes' }, () => {
        fetchVerificacoes()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchVerificacoes])

  async function aprovar(verificacao: Verificacao) {
    setActionLoading(verificacao.id)
    try {
      // Update verificacao status
      await supabase
        .from('verificacoes')
        .update({ status: 'aprovado' })
        .eq('id', verificacao.id)

      // Update user profile to verificado=true
      await supabase
        .from('profiles')
        .update({ verificado: true })
        .eq('id', verificacao.user_id)
    } catch (err) {
      console.error('Erro ao aprovar:', err)
    }
    setActionLoading(null)
  }

  async function rejeitar(id: string) {
    if (!motivoRejeicao.trim()) return
    setActionLoading(id)
    try {
      await supabase
        .from('verificacoes')
        .update({
          status: 'rejeitado',
          motivo_rejeicao: motivoRejeicao.trim(),
        })
        .eq('id', id)
    } catch (err) {
      console.error('Erro ao rejeitar:', err)
    }
    setActionLoading(null)
    setRejectModalOpen(null)
    setMotivoRejeicao('')
  }

  const filtradas = filtroTipo === 'todos'
    ? verificacoes
    : verificacoes.filter(v => v.tipo === filtroTipo)

  const counts = {
    todos: verificacoes.length,
    ambulante: verificacoes.filter(v => v.tipo === 'ambulante').length,
    restaurante: verificacoes.filter(v => v.tipo === 'restaurante').length,
    entregador: verificacoes.filter(v => v.tipo === 'entregador').length,
  }

  const pendentes = verificacoes.filter(v => v.status === 'pendente').length

  return (
    <div className="space-y-6">
      <header className="mb-2">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 bg-purple-500/15 rounded-lg flex items-center justify-center border border-purple-500/20">
            <ShieldCheck size={22} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">Verificações</h1>
            <p className="text-slate-400 text-sm font-medium">
              Aprovação de cadastros de ambulantes, restaurantes e entregadores.
            </p>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="flex items-center gap-4">
        <div className="glass-panel px-4 py-2.5 rounded-xl border-slate-800 flex items-center gap-2">
          <Clock size={14} className="text-amber-400" />
          <span className="text-xs font-bold text-slate-400">Pendentes:</span>
          <span className="text-sm font-black text-amber-400 font-mono">{pendentes}</span>
        </div>
        <div className="glass-panel px-4 py-2.5 rounded-xl border-slate-800 flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-400" />
          <span className="text-xs font-bold text-slate-400">Aprovados:</span>
          <span className="text-sm font-black text-green-400 font-mono">
            {verificacoes.filter(v => v.status === 'aprovado').length}
          </span>
        </div>
        <div className="glass-panel px-4 py-2.5 rounded-xl border-slate-800 flex items-center gap-2">
          <XCircle size={14} className="text-red-400" />
          <span className="text-xs font-bold text-slate-400">Rejeitados:</span>
          <span className="text-sm font-black text-red-400 font-mono">
            {verificacoes.filter(v => v.status === 'rejeitado').length}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 glass-panel rounded-xl p-1.5 border-slate-800 w-fit">
        <Filter size={14} className="text-slate-500 mx-2" />
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFiltroTipo(tab.key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all duration-200 ${
              filtroTipo === tab.key
                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border border-transparent'
            }`}
          >
            {tab.label}
            <span className="ml-1.5 text-[10px] opacity-60">({counts[tab.key as keyof typeof counts]})</span>
          </button>
        ))}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="text-purple-400 animate-spin" />
        </div>
      )}

      {/* Cards Grid */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {filtradas.map((v, i) => {
              const status = statusConfig[v.status] || statusConfig.pendente
              const tipo = tipoConfig[v.tipo] || tipoConfig.ambulante
              const StatusIcon = status.icon

              return (
                <motion.div
                  key={v.id}
                  layout
                  initial={{ opacity: 0, y: 20, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.03, duration: 0.3 }}
                  className={`glass-panel rounded-2xl border-slate-800 overflow-hidden relative ${
                    v.status === 'pendente' ? 'border-l-2 border-l-amber-500/50' : ''
                  }`}
                >
                  {/* Header */}
                  <div className="p-5 pb-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tipo.bg}`}>
                          <User size={18} className={tipo.color} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-100">{v.nome}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${tipo.bg} ${tipo.color}`}>
                              {tipo.label}
                            </span>
                            <span className="text-[10px] text-slate-600 font-mono">
                              {format(new Date(v.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase ${status.bg} ${status.color} ${status.border} border`}>
                        <StatusIcon size={12} />
                        {status.label}
                      </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {v.cpf && (
                        <div className="flex items-center gap-2">
                          <FileText size={12} className="text-slate-600" />
                          <span className="text-slate-500">CPF:</span>
                          <span className="text-slate-300 font-mono font-bold">{v.cpf}</span>
                        </div>
                      )}
                      {v.cnpj && (
                        <div className="flex items-center gap-2">
                          <Building2 size={12} className="text-slate-600" />
                          <span className="text-slate-500">CNPJ:</span>
                          <span className="text-slate-300 font-mono font-bold">{v.cnpj}</span>
                        </div>
                      )}
                      {v.praia && (
                        <div className="flex items-center gap-2">
                          <MapPin size={12} className="text-slate-600" />
                          <span className="text-slate-500">Praia:</span>
                          <span className="text-slate-300 font-bold">{v.praia}</span>
                        </div>
                      )}
                    </div>

                    {/* Document Previews */}
                    <div className="flex gap-2 mt-4">
                      {v.documento_url && (
                        <button
                          onClick={() => setPreviewImage(v.documento_url!)}
                          className="w-16 h-16 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center hover:border-purple-500/30 transition-all group overflow-hidden relative"
                        >
                          <img src={v.documento_url} alt="Documento" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye size={14} className="text-purple-400" />
                          </div>
                        </button>
                      )}
                      {v.selfie_url && (
                        <button
                          onClick={() => setPreviewImage(v.selfie_url!)}
                          className="w-16 h-16 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center hover:border-purple-500/30 transition-all group overflow-hidden relative"
                        >
                          <img src={v.selfie_url} alt="Selfie" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye size={14} className="text-purple-400" />
                          </div>
                        </button>
                      )}
                      {v.comprovante_url && (
                        <button
                          onClick={() => setPreviewImage(v.comprovante_url!)}
                          className="w-16 h-16 rounded-lg bg-slate-800/50 border border-slate-700/50 flex items-center justify-center hover:border-purple-500/30 transition-all group overflow-hidden relative"
                        >
                          <img src={v.comprovante_url} alt="Comprovante" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Eye size={14} className="text-purple-400" />
                          </div>
                        </button>
                      )}
                      {!v.documento_url && !v.selfie_url && !v.comprovante_url && (
                        <div className="text-[10px] text-slate-600 font-mono italic py-2">
                          Nenhum documento enviado
                        </div>
                      )}
                    </div>

                    {/* Rejection reason if rejected */}
                    {v.status === 'rejeitado' && v.motivo_rejeicao && (
                      <div className="mt-3 p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                        <div className="flex items-center gap-1.5 text-red-400 text-[10px] font-bold uppercase mb-1">
                          <AlertTriangle size={10} />
                          Motivo da Rejeição
                        </div>
                        <p className="text-xs text-red-300/70">{v.motivo_rejeicao}</p>
                      </div>
                    )}
                  </div>

                  {/* Action Buttons - only for pending */}
                  {v.status === 'pendente' && (
                    <div className="flex border-t border-slate-800/50">
                      <button
                        onClick={() => aprovar(v)}
                        disabled={actionLoading === v.id}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-green-400 bg-green-500/5 hover:bg-green-500/15 transition-all duration-200 disabled:opacity-50 border-r border-slate-800/50"
                      >
                        {actionLoading === v.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        APROVAR
                      </button>
                      <button
                        onClick={() => {
                          setRejectModalOpen(v.id)
                          setMotivoRejeicao('')
                        }}
                        disabled={actionLoading === v.id}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-red-400 bg-red-500/5 hover:bg-red-500/15 transition-all duration-200 disabled:opacity-50"
                      >
                        <XCircle size={16} />
                        REJEITAR
                      </button>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>

          {!loading && filtradas.length === 0 && (
            <div className="col-span-full glass-panel rounded-2xl p-12 border-slate-800 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4">
                <ShieldCheck size={28} className="text-slate-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-400 mb-1">Nenhuma verificação encontrada</h2>
              <p className="text-sm text-slate-600">Não há solicitações de verificação para o filtro selecionado.</p>
            </div>
          )}
        </div>
      )}

      {/* Rejection Modal */}
      <AnimatePresence>
        {rejectModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setRejectModalOpen(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-panel-solid rounded-2xl p-6 w-full max-w-md"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500/15 rounded-lg flex items-center justify-center border border-red-500/20">
                    <XCircle size={20} className="text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">Rejeitar Verificação</h3>
                    <p className="text-xs text-slate-500">Informe o motivo da rejeição</p>
                  </div>
                </div>
                <button
                  onClick={() => setRejectModalOpen(null)}
                  className="p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <textarea
                value={motivoRejeicao}
                onChange={e => setMotivoRejeicao(e.target.value)}
                placeholder="Ex: Documento ilegível, CPF inválido, foto desfocada..."
                className="w-full h-32 bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 outline-none focus:border-red-500/30 resize-none transition-colors font-mono"
                autoFocus
              />

              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setRejectModalOpen(null)}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-400 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/30 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => rejeitar(rejectModalOpen)}
                  disabled={!motivoRejeicao.trim() || actionLoading === rejectModalOpen}
                  className="flex-1 py-3 rounded-xl text-sm font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {actionLoading === rejectModalOpen ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <XCircle size={16} />
                  )}
                  CONFIRMAR REJEIÇÃO
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-8"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative max-w-3xl max-h-[80vh]"
            >
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute -top-3 -right-3 p-2 bg-slate-800 text-slate-300 rounded-full border border-slate-700 hover:bg-slate-700 transition-colors z-10"
              >
                <X size={16} />
              </button>
              <img
                src={previewImage}
                alt="Preview do documento"
                className="max-w-full max-h-[80vh] rounded-xl border border-slate-800 object-contain"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
