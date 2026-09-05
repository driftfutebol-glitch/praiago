import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { Trash2, Check, X, Search, Clock, Mail, IdCard, UserCircle, ShieldAlert, Loader2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog'

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

// O protocolo de verdade — o que apaga a conta — vive em account_deletion_requests
// e é movido pela Edge Function excluir-conta. A lista de baixo (solicitacoes_exclusao)
// é só o recado que o titular deixou pelo app; marcar aquilo como "concluída" não
// apaga nada.
//
// Conta cliente sem impedimento conclui sozinha na primeira chamada. Conta de
// vendedor NUNCA conclui sozinha: por desenho, alguém precisa confirmar que o
// recebedor foi encerrado no Pagar.me antes do histórico de repasse perder o
// vínculo. Sem um botão para essa confirmação, todo protocolo de vendedor ficava
// preso em manual_review para sempre — clicar de novo em "Solicitar exclusão" na
// aba Usuários só reabria o mesmo protocolo e reparava no mesmo lugar.
type Protocolo = {
  id: string
  role: 'cliente' | 'ambulante' | 'restaurante' | 'entregador'
  status: 'requested' | 'manual_review' | 'blocked' | 'processing' | 'completed' | 'failed'
  phase: string
  attempt_count: number
  blockers: string[] | null
  requested_at: string
  deadline_at: string
  completed_at: string | null
  notification_email: string | null
}

type OperacaoRecebedor = {
  id: string
  deletion_request_id: string
  state: string
  recipient_id: string | null
}

const protocoloStatus: Record<string, { label: string; cls: string }> = {
  requested: { label: 'Aberto', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  processing: { label: 'Processando', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  manual_review: { label: 'Revisão manual', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  blocked: { label: 'Bloqueado', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  failed: { label: 'Falhou', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  completed: { label: 'Concluído', cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
}

// Os códigos vêm de get_account_deletion_blockers. Traduzir aqui evita que quem
// atende leia "ingresso_ou_reembolso_em_andamento" e tenha de adivinhar.
const impedimentoLegivel: Record<string, string> = {
  pedido_em_andamento: 'pedido em andamento',
  reembolso_em_andamento: 'reembolso em andamento',
  ingresso_ou_reembolso_em_andamento: 'ingresso ou reembolso em andamento',
  saldo_a_receber: 'saldo a receber',
  repasse_pendente: 'repasse pendente',
  chamado_aberto: 'chamado de suporte aberto',
  recebedor_pendente: 'recebedor pendente no gateway',
}

export default function ExclusoesPage() {
  const [itens, setItens] = useState<Solicitacao[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<'pendente' | 'todas'>('pendente')
  const [acaoId, setAcaoId] = useState<string | null>(null)
  const [protocolos, setProtocolos] = useState<Protocolo[]>([])
  const [operacoes, setOperacoes] = useState<OperacaoRecebedor[]>([])
  const [carregandoProtocolos, setCarregandoProtocolos] = useState(true)
  const [erroProtocolos, setErroProtocolos] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('solicitacoes_exclusao')
      .select('*')
      .order('criada_em', { ascending: false })
    if (data) setItens(data as Solicitacao[])
  }, [])

  const carregarProtocolos = useCallback(async (tentativa = 1) => {
    setCarregandoProtocolos(true)

    // `functions.invoke` pega o token da sessão NO MOMENTO da chamada. Este
    // useEffect roda na montagem, e a sessão do supabase-js é restaurada do
    // localStorage de forma assíncrona: numa carga limpa a chamada saía antes,
    // sem Authorization, e a função respondia "Sessao invalida ou expirada".
    // Como não havia repetição, a fila ficava vazia até alguém trocar de aba —
    // e recarregar com Ctrl+Shift+R só aumentava a chance de perder a corrida.
    const { data: sess } = await supabase.auth.getSession()
    if (!sess.session) {
      if (tentativa <= 5) {
        setTimeout(() => void carregarProtocolos(tentativa + 1), 400 * tentativa)
        return
      }
      setErroProtocolos('Sessão não carregada. Recarregue a página.')
      setCarregandoProtocolos(false)
      return
    }

    const { data, error } = await supabase.functions.invoke('excluir-conta', {
      body: { action: 'list', pageSize: 100 },
    })
    const resp = (data || {}) as { requests?: Protocolo[]; recipientOperations?: OperacaoRecebedor[]; error?: string }

    if (error || resp.error) {
      // A mensagem real vem no corpo da resposta, que o invoke não devolve em
      // erro. Sem ela a tela dizia só "não foi possível" e não dava para saber
      // se era sessão, permissão ou a função fora do ar.
      let msg = resp.error || ''
      try {
        const corpo = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.()
        if (corpo?.error) msg = corpo.error
      } catch { /* fica com o que tiver */ }
      const status = (error as { context?: { status?: number } } | null)?.context?.status
      if ((status === 401 || /sess/i.test(msg)) && tentativa <= 5) {
        setTimeout(() => void carregarProtocolos(tentativa + 1), 400 * tentativa)
        return
      }
      setErroProtocolos(`${msg || 'Não foi possível carregar a fila de protocolos.'}${status ? ` (HTTP ${status})` : ''}`)
    } else {
      setErroProtocolos(null)
      setProtocolos(resp.requests || [])
      setOperacoes(resp.recipientOperations || [])
    }
    setCarregandoProtocolos(false)
  }, [])

  useEffect(() => {
    carregar()
    carregarProtocolos()
    const ch = supabase
      .channel('admin_exclusoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'solicitacoes_exclusao' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar, carregarProtocolos])

  async function concluirProtocolo(p: Protocolo) {
    const ehVendedor = p.role !== 'cliente'
    const alvo = p.notification_email || p.id
    const pendente = operacoes.find(o => o.deletion_request_id === p.id)

    if (pendente) {
      await alertDialog({
        title: 'Recebedor pendente',
        message: `Existe uma operação de recebedor em "${pendente.state}" ligada a este protocolo${pendente.recipient_id ? ` (${pendente.recipient_id})` : ''}. Resolva ela antes de concluir a exclusão.`,
        tone: 'danger',
      })
      return
    }

    const confirmado = await confirmDialog({
      title: 'Concluir exclusão definitiva?',
      message: ehVendedor
        ? `A conta de ${alvo} será apagada agora: documentos de KYC no Storage, fotos, pedidos anonimizados e login removido. Não dá para desfazer.\n\nAo continuar você confirma que o recebedor desta conta já foi encerrado no painel do Pagar.me. É a única coisa que o sistema não consegue verificar sozinho.`
        : `A conta de ${alvo} será apagada agora: dados pessoais, fotos e login. Pedidos e registros financeiros de obrigação legal ficam anonimizados. Não dá para desfazer.`,
      confirmText: 'Concluir exclusão',
      tone: 'danger',
    })
    if (!confirmado) return

    setAcaoId(p.id)
    const { data, error } = await supabase.functions.invoke('excluir-conta', {
      body: {
        action: 'process',
        requestId: p.id,
        // Só o vendedor precisa desta confirmação; mandá-la para cliente seria
        // afirmar uma checagem que ninguém fez.
        ...(ehVendedor ? { externalCleanupConfirmed: true } : {}),
      },
    })
    const resp = (data || {}) as { error?: string; completed?: boolean; status?: string; blockers?: string[]; message?: string }

    if (error || resp.error) {
      let msg = resp.error || 'Não foi possível concluir a exclusão.'
      try {
        const p2 = await (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context?.json?.()
        if (p2?.error) msg = p2.error
      } catch { /* usa a msg padrão */ }
      await alertDialog({ title: 'Erro', message: msg, tone: 'danger' })
      setAcaoId(null)
      return
    }

    if (resp.completed === false) {
      const lista = (resp.blockers || []).map(b => impedimentoLegivel[b] || b)
      await alertDialog({
        title: 'Ainda não concluiu',
        message: lista.length
          ? `Impedimentos: ${lista.join(', ')}.\n\nResolva na aba Pedidos ou Financeiro e tente de novo.`
          : resp.message || 'O protocolo continua em revisão.',
      })
    } else {
      await alertDialog({ title: 'Conta apagada', message: `${alvo} foi removido. O e-mail e o CPF ficam livres para um cadastro novo.` })
    }
    await carregarProtocolos()
    await carregar()
    setAcaoId(null)
  }

  const abertos = protocolos.filter(p => p.status !== 'completed')

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
          Protocolos em andamento e solicitações abertas pelos titulares no aplicativo.
        </p>
      </header>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldAlert size={16} className="text-purple-400" />
          <h2 className="text-lg font-black text-slate-100">Protocolos em andamento</h2>
          <span className="text-xs text-slate-500 font-mono">{abertos.length} aberto(s)</span>
          {carregandoProtocolos && <Loader2 size={13} className="animate-spin text-slate-600" />}
        </div>
        <p className="text-xs text-slate-500 font-medium -mt-1">
          Esta é a fila que apaga de verdade. Conta de vendedor não conclui sozinha:
          precisa da confirmação de que o recebedor foi encerrado no Pagar.me.
        </p>

        {erroProtocolos && (
          <div className="glass-panel p-4 rounded-xl border-rose-500/25 text-sm text-rose-300 font-bold flex items-center gap-2">
            <AlertTriangle size={14} /> {erroProtocolos}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {abertos.map(p => {
            const sc = protocoloStatus[p.status] || protocoloStatus.manual_review
            const impedimentos = (p.blockers || []).map(b => impedimentoLegivel[b] || b)
            const pendente = operacoes.find(o => o.deletion_request_id === p.id)
            const podeConcluir = impedimentos.length === 0 && !pendente
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel p-5 rounded-2xl border-purple-500/25 flex flex-col"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-slate-100 font-black truncate">
                      <Mail size={13} className="text-slate-500 shrink-0" />
                      {p.notification_email || '—'}
                    </div>
                    <div className="text-slate-400 text-xs font-bold uppercase tracking-wide mt-1">
                      {p.role}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-md border text-[10px] font-black uppercase tracking-wider shrink-0 ${sc.cls}`}>
                    {sc.label}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-500 font-mono">
                  <div className="flex items-center gap-2">
                    <Clock size={12} /> aberto em {format(new Date(p.requested_at), 'dd/MM/yyyy HH:mm')}
                  </div>
                  <div className="truncate" title={p.id}>id: {p.id}</div>
                  {p.attempt_count > 1 && <div>tentativas: {p.attempt_count}</div>}
                </div>

                {impedimentos.length > 0 && (
                  <div className="mt-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 font-bold">
                    Impedimentos: {impedimentos.join(', ')}.
                  </div>
                )}

                {pendente && (
                  <div className="mt-3 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 font-bold">
                    Recebedor em "{pendente.state}"{pendente.recipient_id ? ` (${pendente.recipient_id})` : ''}. Resolva antes de concluir.
                  </div>
                )}

                <button
                  onClick={() => concluirProtocolo(p)}
                  disabled={acaoId === p.id || !podeConcluir}
                  title={podeConcluir
                    ? 'Apaga a conta agora. Não dá para desfazer.'
                    : 'Resolva os impedimentos acima antes de concluir.'}
                  className="mt-4 px-3 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-wide border bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/15 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                >
                  {acaoId === p.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Concluir exclusão
                </button>
              </motion.div>
            )
          })}

          {!carregandoProtocolos && abertos.length === 0 && !erroProtocolos && (
            <div className="col-span-full text-center text-slate-500 py-8 font-bold flex flex-col items-center gap-2">
              <Check size={20} className="text-slate-700" />
              Nenhum protocolo em aberto.
            </div>
          )}
        </div>
      </section>

      <div className="pt-2 border-t border-slate-800/60">
        <h2 className="text-lg font-black text-slate-100 mt-4 mb-1">Recados dos titulares</h2>
        <p className="text-xs text-slate-500 font-medium mb-4">
          Pedidos abertos pelo app. Marcar aqui só registra o atendimento — quem apaga é a fila acima.
        </p>
      </div>

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
