// Aprovacao de troca do nome do estabelecimento (quiosque / restaurante / ambulante).
//
// Por que passa pelo admin: o nome e a identidade que o cliente ve no app e nos
// comprovantes. Deixar o vendedor renomear sozinho abre espaco pra se passar por
// outro negocio ("Quiosque do Ze" virar "Quiosque do Zeca") depois de ja ter
// reputacao, e pra fugir de avaliacao ruim trocando de fachada.
//
// Quem realmente troca o nome e o banco: as funcoes `aprovar_troca_nome` /
// `recusar_troca_nome` gravam o `profiles.nome` e registram quem decidiu, tudo
// numa transacao so. O painel nunca da UPDATE direto nessa tabela.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { formatDistanceToNow, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ArrowRight, CheckCircle2, Clock, Loader2, RefreshCw, Signature, User, XCircle,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { alertDialog, confirmDialog } from '../lib/dialog'

type StatusSolicitacao = 'pendente' | 'aprovada' | 'recusada' | 'cancelada'

type Solicitacao = {
  id: string
  vendedor_id: string
  nome_atual: string
  nome_novo: string
  motivo: string | null
  status: StatusSolicitacao
  observacao_admin: string | null
  decidido_por: string | null
  decidido_em: string | null
  created_at: string
}

type PessoaResumo = {
  id: string
  nome: string | null
  email: string | null
  role: string | null
}

const STATUS: Record<StatusSolicitacao, { label: string; classes: string }> = {
  pendente: { label: 'Pendente', classes: 'bg-amber-500/10 text-amber-300 border-amber-500/25' },
  aprovada: { label: 'Aprovada', classes: 'bg-green-500/10 text-green-300 border-green-500/25' },
  recusada: { label: 'Recusada', classes: 'bg-red-500/10 text-red-300 border-red-500/25' },
  cancelada: { label: 'Cancelada pelo vendedor', classes: 'bg-slate-500/10 text-slate-400 border-slate-500/25' },
}

const ROLE: Record<string, { label: string; classes: string }> = {
  restaurante: { label: 'Restaurante', classes: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  ambulante: { label: 'Ambulante', classes: 'bg-green-500/10 text-green-400 border-green-500/20' },
  entregador: { label: 'Entregador', classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
}

// A tabela nao esta na publicacao `supabase_realtime`, entao um channel de
// postgres_changes nunca dispararia aqui. Ate ela entrar na publicacao, a tela
// se atualiza sozinha por polling (so com a aba em primeiro plano) e no botao.
const INTERVALO_ATUALIZACAO_MS = 45000

function dataHora(valor: string | null) {
  if (!valor) return '-'
  return format(new Date(valor), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })
}

function haQuantoTempo(valor: string) {
  return formatDistanceToNow(new Date(valor), { addSuffix: true, locale: ptBR })
}

export default function TrocaNomePage() {
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [pessoas, setPessoas] = useState<Record<string, PessoaResumo>>({})
  const [carregando, setCarregando] = useState(true)
  const [acaoId, setAcaoId] = useState<string | null>(null)
  const [aba, setAba] = useState<'pendentes' | 'historico'>('pendentes')
  const [observacoes, setObservacoes] = useState<Record<string, string>>({})

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    const { data, error } = await supabase
      .from('solicitacoes_troca_nome')
      .select('id,vendedor_id,nome_atual,nome_novo,motivo,status,observacao_admin,decidido_por,decidido_em,created_at')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      if (!silencioso) {
        setCarregando(false)
        await alertDialog({ title: 'Erro ao carregar', message: error.message, tone: 'danger' })
      }
      return
    }

    const lista = (data as Solicitacao[]) ?? []
    setSolicitacoes(lista)

    // O `vendedor_id` aponta pra `auth.users`, nao pra `profiles` — o PostgREST
    // nao consegue embutir o perfil no mesmo select. Por isso a segunda consulta.
    const ids = Array.from(new Set(
      lista.flatMap(s => [s.vendedor_id, s.decidido_por]).filter((id): id is string => !!id),
    ))
    if (ids.length > 0) {
      const { data: perfis } = await supabase
        .from('profiles')
        .select('id,nome,email,role')
        .in('id', ids)
      const mapa: Record<string, PessoaResumo> = {}
      for (const p of (perfis as PessoaResumo[]) ?? []) mapa[p.id] = p
      setPessoas(mapa)
    } else {
      setPessoas({})
    }

    if (!silencioso) setCarregando(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') carregar(true)
    }, INTERVALO_ATUALIZACAO_MS)
    return () => window.clearInterval(timer)
  }, [carregar])

  const pendentes = useMemo(
    () => solicitacoes.filter(item => item.status === 'pendente'),
    [solicitacoes],
  )
  const exibidas = aba === 'pendentes'
    ? pendentes
    : solicitacoes.filter(item => item.status !== 'pendente')

  async function decidir(item: Solicitacao, aprovar: boolean) {
    const vendedor = pessoas[item.vendedor_id]
    const observacao = (observacoes[item.id] ?? '').trim()

    const ok = await confirmDialog({
      title: aprovar ? 'Aprovar troca de nome?' : 'Recusar troca de nome?',
      message: aprovar
        ? `"${item.nome_atual}" passa a se chamar "${item.nome_novo}" em todos os apps, na hora.`
        : `${vendedor?.nome || 'O vendedor'} continua com o nome "${item.nome_atual}".`
          + (observacao ? '' : ' Sem observacao ele nao vai saber o porque.'),
      confirmText: aprovar ? 'Aprovar' : 'Recusar',
      tone: aprovar ? 'success' : 'danger',
    })
    if (!ok) return

    setAcaoId(item.id)
    const { error } = await supabase.rpc(aprovar ? 'aprovar_troca_nome' : 'recusar_troca_nome', {
      p_solicitacao_id: item.id,
      p_observacao: observacao || null,
    })
    setAcaoId(null)

    if (error) {
      // A funcao levanta 22023 quando a solicitacao ja saiu de 'pendente' — ou
      // seja, outro admin (ou o proprio vendedor, cancelando) chegou antes.
      // Nesse caso a lista da tela esta velha: mostra o aviso e recarrega.
      const jaDecidida = error.code === '22023' || /ja foi decidida|nao encontrada/i.test(error.message)
      await alertDialog({
        title: jaDecidida ? 'Solicitacao ja resolvida' : 'Nao foi possivel decidir',
        message: jaDecidida
          ? 'Essa solicitacao ja tinha sido decidida ou cancelada. Atualizando a lista com a situacao real.'
          : error.message,
        tone: 'danger',
      })
      if (jaDecidida) carregar()
      return
    }

    setObservacoes(atuais => {
      const copia = { ...atuais }
      delete copia[item.id]
      return copia
    })
    // Recarrega tudo (e nao so a linha): aprovar mudou o `profiles.nome`, entao o
    // "nome atual" de outros pedidos pendentes do mesmo vendedor ficou defasado.
    carregar()
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Troca de nome</h1>
          <p className="text-slate-400 font-medium mt-1 max-w-3xl">
            O nome do estabelecimento e a identidade que o cliente ve no app. Confira se a troca
            faz sentido (reforma, mudanca de dono, erro de digitacao) antes de aprovar — aprovar
            renomeia o perfil na hora.
          </p>
        </div>
        <button
          type="button"
          onClick={() => carregar()}
          disabled={carregando}
          title="Atualizar solicitacoes"
          className="w-10 h-10 shrink-0 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 flex items-center justify-center disabled:opacity-50"
        >
          <RefreshCw size={17} className={carregando ? 'animate-spin' : ''} />
        </button>
      </header>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAba('pendentes')}
          className={`px-4 py-2 rounded-lg border text-sm font-black ${
            aba === 'pendentes'
              ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Pendentes ({pendentes.length})
        </button>
        <button
          type="button"
          onClick={() => setAba('historico')}
          className={`px-4 py-2 rounded-lg border text-sm font-black ${
            aba === 'historico'
              ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
              : 'bg-slate-900 border-slate-800 text-slate-400'
          }`}
        >
          Historico
        </button>
      </div>

      {carregando && solicitacoes.length === 0 ? (
        <div className="py-14 flex items-center justify-center gap-2 text-slate-500 font-bold">
          <Loader2 size={18} className="animate-spin" /> Carregando solicitacoes...
        </div>
      ) : exibidas.length === 0 ? (
        <div className="py-14 text-center text-slate-500 rounded-xl border border-slate-800 bg-slate-900/50">
          <Signature size={30} className="mx-auto mb-3 opacity-50" />
          <div className="font-bold">
            {aba === 'pendentes'
              ? 'Nenhum pedido de troca de nome aguardando analise.'
              : 'Nenhuma solicitacao no historico.'}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {exibidas.map(item => {
            const vendedor = pessoas[item.vendedor_id]
            const decisor = item.decidido_por ? pessoas[item.decidido_por] : null
            const status = STATUS[item.status]
            const role = vendedor?.role ? ROLE[vendedor.role] : null
            const processando = acaoId === item.id

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-800 bg-slate-900/50 p-5"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User size={15} className="text-slate-500 shrink-0" />
                      <span className="font-bold text-slate-100">{vendedor?.nome || 'Vendedor'}</span>
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-black uppercase ${
                        role?.classes || 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}>
                        {role?.label || vendedor?.role || 'sem perfil'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 font-mono truncate">
                      {vendedor?.email || item.vendedor_id}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex px-2.5 py-1 rounded-md border text-[10px] font-black uppercase ${status.classes}`}>
                      {status.label}
                    </span>
                    <div className="text-[11px] text-slate-500 mt-2 flex items-center justify-end gap-1.5">
                      <Clock size={11} /> pediu {haQuantoTempo(item.created_at)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-3 flex-wrap bg-slate-950/50 border border-slate-800/70 rounded-xl p-4">
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">Nome atual</div>
                    <div className="text-sm font-bold text-slate-400 line-through decoration-slate-600 mt-0.5 break-words">
                      {item.nome_atual}
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-slate-600 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-wider text-slate-600">Nome novo</div>
                    <div className="text-sm font-black text-purple-300 mt-0.5 break-words">{item.nome_novo}</div>
                  </div>
                </div>

                <div className="mt-3 text-sm text-slate-300 leading-relaxed">
                  <span className="text-slate-500 font-bold">Motivo: </span>
                  {item.motivo?.trim() || <span className="text-slate-600 italic">nao informado</span>}
                </div>

                {item.status !== 'pendente' && (
                  <div className="mt-3 text-xs text-slate-500 space-y-1">
                    {item.observacao_admin && (
                      <div><span className="font-bold text-slate-400">Observacao do admin: </span>{item.observacao_admin}</div>
                    )}
                    <div>
                      Decidido em {dataHora(item.decidido_em)}
                      {decisor?.nome || decisor?.email ? ` por ${decisor.nome || decisor.email}` : ''}
                    </div>
                  </div>
                )}

                {item.status === 'pendente' && (
                  <div className="mt-4 grid gap-3">
                    <input
                      value={observacoes[item.id] ?? ''}
                      onChange={e => setObservacoes(v => ({ ...v, [item.id]: e.target.value }))}
                      placeholder="Observacao (opcional) — o vendedor le isso, principalmente na recusa"
                      className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5 text-sm font-medium text-slate-200 placeholder:text-slate-600 outline-none focus:border-purple-500/40"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => decidir(item, false)}
                        disabled={processando}
                        className="px-4 py-2 rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <XCircle size={14} /> Recusar
                      </button>
                      <button
                        type="button"
                        onClick={() => decidir(item, true)}
                        disabled={processando}
                        className="px-4 py-2 rounded-lg border border-green-500/25 bg-green-500/10 text-green-300 text-xs font-black flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {processando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Aprovar
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
