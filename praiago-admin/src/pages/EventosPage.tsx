import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { confirmDialog, alertDialog, promptDialog } from '../lib/dialog'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarDays, Plus, Trash2, Star, Eye, EyeOff, Loader2, MapPin, Ticket, Sun, Sunset, Moon, MoonStar, X, Bot, ExternalLink,
  CheckCircle2, Clock3, ShoppingCart, Send, PauseCircle, RefreshCw, AlertTriangle, Activity,
} from 'lucide-react'

type EventoStatus = 'pendente' | 'ativo' | 'inativo'
type PrecoSituacao = 'a_confirmar' | 'gratuito' | 'pago'

interface Evento {
  id: string
  titulo: string
  descricao: string | null
  periodo: 'manha' | 'tarde' | 'noite' | 'madrugada'
  data: string | null
  hora: string | null
  local_nome: string | null
  endereco: string | null
  lat: number | null
  lng: number | null
  preco: number
  preco_situacao?: PrecoSituacao
  preco_verificado_em?: string | null
  categoria: string | null
  emoji: string | null
  destaque: boolean
  status: EventoStatus
  fonte?: string | null
  fonte_url?: string | null
  descricao_curta?: string | null
  created_at: string
  ingressos_enabled?: boolean
  event_ticket_lots?: TicketLot[]
}

type TicketLot = {
  id: string
  nome: string
  preco_origem: number
  markup_percent: number
  preco_venda: number
  markup_percent_credito: number
  preco_venda_credito: number
  lote_ordem: number | null
  lote_grupo?: string | null
  pausado_admin?: boolean
  estoque_disponivel: number | null
  status: 'pendente_aprovacao' | 'disponivel' | 'pausado' | 'esgotado'
  fonte_url: string | null
}

type TicketOrder = {
  id: string
  cliente_nome: string
  cliente_email: string | null
  cliente_telefone: string | null
  quantidade: number
  total: number
  status: string
  delivery_status: string
  created_at: string
  eventos?: { titulo?: string | null } | { titulo?: string | null }[] | null
  event_ticket_lots?: { nome?: string | null } | { nome?: string | null }[] | null
}

type TicketRefund = {
  id: string
  order_id: string
  status: string
  motivo: string | null
  valor: number | null
  created_at: string
  event_ticket_orders?: (TicketOrder & {
    eventos?: { titulo?: string | null } | { titulo?: string | null }[] | null
    event_ticket_lots?: { nome?: string | null } | { nome?: string | null }[] | null
  }) | (TicketOrder & {
    eventos?: { titulo?: string | null } | { titulo?: string | null }[] | null
    event_ticket_lots?: { nome?: string | null } | { nome?: string | null }[] | null
  })[] | null
}

type CrawlerRun = {
  id: string
  version: string
  status: 'rodando' | 'concluido' | 'falhou'
  started_at: string
  finished_at: string | null
  stats: {
    modo?: 'novos' | 'precos'
    inseridos?: number
    ingressos_salvos?: number
    revalidacao?: { revalidados?: number; encerrados?: number; sem_preco?: number }
    fontes_resultado?: { fonte: string; ok: boolean; eventos: number; tempo_ms: number }[]
  } | null
  errors: { fonte?: string; erro: string }[] | null
}

const PERIODOS = [
  { id: 'manha', label: 'Manhã', icon: Sun },
  { id: 'tarde', label: 'Tarde', icon: Sunset },
  { id: 'noite', label: 'Noite', icon: Moon },
  { id: 'madrugada', label: 'Madrugada', icon: MoonStar },
] as const

const vazio = {
  titulo: '', periodo: 'noite' as const, data: '', hora: '', local_nome: '',
  endereco: '', lat: '', lng: '', preco: '0', preco_situacao: 'a_confirmar' as PrecoSituacao, categoria: 'Festa', emoji: '🎉', destaque: false,
}

function hojeSpIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [orders, setOrders] = useState<TicketOrder[]>([])
  const [refunds, setRefunds] = useState<TicketRefund[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...vazio })
  const [salvando, setSalvando] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [erro, setErro] = useState('')
  const [cacando, setCacando] = useState(false)
  const [revalidando, setRevalidando] = useState(false)
  const [cacaMsg, setCacaMsg] = useState('')
  const [runs, setRuns] = useState<CrawlerRun[]>([])
  const [fontesTeste, setFontesTeste] = useState<{ fonte: string; ok: boolean; http?: number; tempo_ms: number; erro?: string }[]>([])
  const [testandoFontes, setTestandoFontes] = useState(false)
  const [filtro, setFiltro] = useState<'todos' | 'pendentes' | 'preco' | 'repetidos'>('todos')

  async function cacarEventos() {
    setCacando(true); setCacaMsg('')
    // Dispara o robô em SEGUNDO PLANO (RPC async, via pg_net). Antes o navegador
    // esperava ~100s pelo scrape inteiro e estourava o limite do gateway do
    // Supabase ("Edge Function returned a non-2xx"). Agora retorna na hora e os
    // eventos aparecem sozinhos (realtime) conforme o robô salva.
    const { error } = await supabase.rpc('rodar_robo_eventos')
    setCacando(false)
    if (error) { setCacaMsg('Não deu pra iniciar o robô: ' + error.message); return }
    setCacaMsg('🤖 Robô rodando em segundo plano — os eventos e ingressos aparecem aqui em até ~2 min.')
    setTimeout(() => { void carregar() }, 15000)
    setTimeout(() => { void carregar() }, 90000)
  }

  async function testarFontes() {
    setTestandoFontes(true); setCacaMsg('')
    const { data, error } = await supabase.functions.invoke('caca-eventos', { body: { acao: 'diagnostico' } })
    setTestandoFontes(false)
    if (error) { setCacaMsg(`Falha ao testar fontes: ${error.message}`); return }
    setFontesTeste(Array.isArray(data?.fontes) ? data.fontes : [])
  }

  async function revalidarPrecos() {
    setRevalidando(true); setCacaMsg('')
    const { error } = await supabase.rpc('rodar_robo_eventos_precos')
    setRevalidando(false)
    if (error) { setCacaMsg(`Não deu para iniciar a rechecagem: ${error.message}`); return }
    setCacaMsg('Rechecagem de preços e lotes iniciada em segundo plano. Atualize o painel para ver a conclusão.')
    setTimeout(() => { void carregar() }, 15000)
    setTimeout(() => { void carregar() }, 90000)
  }

  const carregar = useCallback(async () => {
    const hoje = hojeSpIso()
    // (removido) NAO chamar a edge function a cada load — virava tempestade de
    // chamadas com o realtime. A limpeza/ciclo de vida roda no cron horario.
    const [{ data }, { data: pedidos }, { data: reembolsos }, { data: rodadas }] = await Promise.all([
      supabase
        .from('eventos')
        .select('*, event_ticket_lots(id,nome,preco_origem,markup_percent,preco_venda,markup_percent_credito,preco_venda_credito,lote_ordem,lote_grupo,pausado_admin,estoque_disponivel,status,fonte_url)')
        .neq('status', 'inativo')
        .or(`data.is.null,data.gte.${hoje}`)
        .order('created_at', { ascending: false }),
      supabase
        .from('event_ticket_orders')
        .select('id,cliente_nome,cliente_email,cliente_telefone,quantidade,total,status,delivery_status,created_at,eventos(titulo),event_ticket_lots(nome)')
        .in('status', ['entrega_pendente', 'entregue'])
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('event_ticket_refunds')
        .select('id,order_id,status,motivo,valor,created_at,event_ticket_orders(id,cliente_nome,cliente_email,cliente_telefone,quantidade,total,status,delivery_status,created_at,eventos(titulo),event_ticket_lots(nome))')
        .in('status', ['pendente_admin', 'aprovado', 'processando'])
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('event_crawler_runs').select('id,version,status,started_at,finished_at,stats,errors').order('started_at', { ascending: false }).limit(5),
    ])
    setEventos((data as Evento[]) ?? [])
    setOrders((pedidos as TicketOrder[]) ?? [])
    setRefunds((reembolsos as TicketRefund[]) ?? [])
    setRuns((rodadas as CrawlerRun[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    carregar()
    const timer = window.setInterval(() => { void carregar() }, 30000)
    const ch = supabase.channel('admin_eventos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, () => carregar())
      .subscribe()
    return () => { window.clearInterval(timer); supabase.removeChannel(ch) }
  }, [carregar])

  async function criar() {
    if (!form.titulo.trim()) { setErro('Informe o título do evento.'); return }
    if (form.preco_situacao === 'pago' && !(Number(form.preco) > 0)) { setErro('Informe um preço maior que zero para evento pago.'); return }
    if (form.preco_situacao !== 'pago' && Number(form.preco) > 0) { setErro('Preço positivo exige a opção Pago.'); return }
    setErro(''); setSalvando(true)
    const { error } = await supabase.from('eventos').insert({
      titulo: form.titulo.trim(),
      periodo: form.periodo,
      data: form.data || null,
      hora: form.hora || null,
      local_nome: form.local_nome || null,
      endereco: form.endereco || null,
      lat: form.lat ? Number(form.lat) : null,
      lng: form.lng ? Number(form.lng) : null,
      preco: Number(form.preco) || 0,
      preco_situacao: form.preco_situacao,
      preco_verificado_em: form.preco_situacao === 'a_confirmar' ? null : new Date().toISOString(),
      categoria: form.categoria || null,
      emoji: form.emoji || '🎉',
      destaque: form.destaque,
      status: form.preco_situacao === 'a_confirmar' ? 'pendente' : 'ativo',
      fonte: 'admin',
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setForm({ ...vazio }); setShowForm(false)
  }

  async function toggle(id: string, campo: 'status' | 'destaque', atual: EventoStatus | boolean) {
    const novo = campo === 'status' ? (atual === 'ativo' ? 'inativo' : 'ativo') : !atual
    await supabase.from('eventos').update({ [campo]: novo }).eq('id', id)
  }

  async function aprovar(id: string) {
    const precoEvento = eventos.find(ev => ev.id === id)
    if (precoEvento && Number(precoEvento.preco) <= 0 && precoEvento.preco_situacao !== 'gratuito') {
      await alertDialog({ title: 'Confirme o preço', message: 'Este evento ainda não tem valor confirmado. Use “Revisar preço” antes de publicar, para o app antigo não mostrar “Grátis” por engano.', tone: 'danger' })
      return
    }
    const { error } = await supabase.from('eventos').update({ status: 'ativo' }).eq('id', id)
    if (!error) {
      const evento = eventos.find(ev => ev.id === id)
      const grupos = new Map<string, TicketLot[]>()
      const precosVigentes = (evento?.event_ticket_lots || []).filter(l => l.status === 'disponivel').map(l => Number(l.preco_venda)).filter(v => v > 0)
      for (const lote of evento?.event_ticket_lots || []) {
        const key = lote.lote_grupo || lote.nome
        grupos.set(key, [...(grupos.get(key) || []), lote])
      }
      for (const lotes of grupos.values()) {
        const pendentes = lotes.filter(l => l.status === 'pendente_aprovacao' && !l.pausado_admin && l.estoque_disponivel !== 0 && Number(l.preco_origem) > 0)
          .sort((a, b) => (a.lote_ordem ?? 999) - (b.lote_ordem ?? 999))
        const jaVigente = lotes.some(l => l.status === 'disponivel')
        for (const [index, lote] of pendentes.entries()) {
          const vigente = !jaVigente && index === 0
          await supabase.from('event_ticket_lots').update({ status: vigente ? 'disponivel' : 'pausado', pausado_admin: false, aprovado_admin: true }).eq('id', lote.id)
          if (vigente && Number(lote.preco_venda) > 0) precosVigentes.push(Number(lote.preco_venda))
        }
      }
      if (precosVigentes.length) await supabase.from('eventos').update({ preco: Math.min(...precosVigentes), preco_situacao: 'pago', preco_verificado_em: new Date().toISOString() }).eq('id', id)
    }
    carregar()
  }

  async function adicionarIngresso(ev: Evento) {
    const nome = await promptDialog({ title: 'Novo ingresso/lote', message: 'Nome do ingresso ou lote', defaultValue: 'Entrada' })
    if (!nome?.trim()) return
    const precoRaw = await promptDialog({ title: 'Preço do ingresso', message: 'Preço original em R$', defaultValue: String(ev.preco || '') })
    const preco = Number((precoRaw || '').replace(',', '.'))
    if (!Number.isFinite(preco) || preco <= 0) {
      await alertDialog({ title: 'Preço inválido', message: 'Confira o valor e tente de novo.', tone: 'danger' })
      return
    }
    const estoqueRaw = await promptDialog({ title: 'Estoque', message: 'Quantidade disponível. Deixe vazio se for manual/sem limite.', placeholder: 'Ex: 100' })
    const estoque = estoqueRaw?.trim() ? Math.max(0, Math.floor(Number(estoqueRaw.replace(',', '.')) || 0)) : null

    const { error } = await supabase.from('event_ticket_lots').insert({
      evento_id: ev.id,
      nome: nome.trim(),
      preco_origem: preco,
      markup_percent: 10,
      estoque_total: estoque,
      estoque_disponivel: estoque,
      status: ev.status === 'ativo' ? 'disponivel' : 'pendente_aprovacao',
      aprovado_admin: ev.status === 'ativo',
      fonte_url: ev.fonte_url || null,
      criado_por: 'admin',
      metadata: { criado_no_admin: true },
    })
    if (error) alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else carregar()
  }

  async function alternarLote(ev: Evento, lote: TicketLot) {
    const pausar = lote.status === 'disponivel'
    const anteriorVigente = (ev.event_ticket_lots || []).some(outro =>
      outro.id !== lote.id && outro.status === 'disponivel'
      && (outro.lote_grupo || outro.nome) === (lote.lote_grupo || lote.nome)
      && outro.lote_ordem != null && lote.lote_ordem != null && outro.lote_ordem < lote.lote_ordem)
    const novo = pausar ? 'pausado' : anteriorVigente ? 'pausado' : 'disponivel'
    const { error } = await supabase.from('event_ticket_lots').update({ status: novo, pausado_admin: pausar, aprovado_admin: true }).eq('id', lote.id)
    if (error) alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else carregar()
  }

  async function revisarPreco(ev: Evento) {
    const resposta = await promptDialog({
      title: 'Verificar preço do evento',
      message: 'Digite o valor em R$ para Pago, 0 para Gratuito confirmado ou ? quando a fonte não comprova o preço. Confira a fonte antes de salvar.',
      defaultValue: ev.preco_situacao === 'a_confirmar' ? '?' : String(ev.preco),
      confirmText: 'Salvar verificação',
    })
    if (resposta == null) return
    const valor = resposta.trim()
    const preco = Number(valor.replace(',', '.'))
    const possuiLotePago = (ev.event_ticket_lots || []).some(l => Number(l.preco_origem) > 0)
    if (valor !== '?' && (!Number.isFinite(preco) || preco < 0)) {
      await alertDialog({ title: 'Valor inválido', message: 'Use um valor positivo, 0 ou ?.', tone: 'danger' }); return
    }
    if ((valor === '?' || preco === 0) && possuiLotePago) {
      await alertDialog({ title: 'Há ingressos pagos', message: 'Este evento possui lotes com preço positivo. Revise os lotes antes de classificá-lo como gratuito ou desconhecido.', tone: 'danger' }); return
    }
    const situacao: PrecoSituacao = valor === '?' ? 'a_confirmar' : preco === 0 ? 'gratuito' : 'pago'
    const { error } = await supabase.from('eventos').update({
      preco: situacao === 'pago' ? preco : 0,
      preco_situacao: situacao,
      preco_verificado_em: situacao === 'a_confirmar' ? null : new Date().toISOString(),
    }).eq('id', ev.id)
    if (error) await alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else void carregar()
  }

  async function marcarEntregue(orderId: string) {
    const { error } = await supabase
      .from('event_ticket_orders')
      .update({ status: 'entregue', delivery_status: 'enviado', delivered_at: new Date().toISOString() })
      .eq('id', orderId)
    if (error) alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else carregar()
  }

  async function aprovarReembolso(refundId: string) {
    const resposta = await promptDialog({ title: 'Aprovar reembolso', message: 'Resposta para registrar no pedido', defaultValue: 'Reembolso aprovado pelo admin.', tone: 'success', confirmText: 'Aprovar' })
    const { error } = await supabase.functions.invoke('evento-ticket-refund', {
      body: { acao: 'aprovar', refund_id: refundId, resposta_admin: resposta || 'Reembolso aprovado pelo admin.' },
    })
    if (error) alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else carregar()
  }

  async function negarReembolso(refundId: string) {
    const resposta = await promptDialog({ title: 'Negar reembolso', message: 'Motivo para negar o reembolso', defaultValue: 'Solicitação fora da política de reembolso.', tone: 'danger', confirmText: 'Negar' })
    if (!resposta) return
    const { error } = await supabase.functions.invoke('evento-ticket-refund', {
      body: { acao: 'negar', refund_id: refundId, resposta_admin: resposta },
    })
    if (error) alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else carregar()
  }

  async function processarReembolso(refundId: string) {
    if (!await confirmDialog({ title: 'Processar reembolso', message: 'Processar o reembolso agora?', confirmText: 'Processar', tone: 'danger' })) return
    const { error } = await supabase.functions.invoke('evento-ticket-refund', {
      body: { acao: 'processar', refund_id: refundId },
    })
    if (error) alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else carregar()
  }

  async function excluir(id: string) {
    if (!await confirmDialog({ title: 'Excluir evento?', message: 'Essa ação não pode ser desfeita.', confirmText: 'Excluir', tone: 'danger' })) return
    await supabase.from('eventos').delete().eq('id', id)
  }

  const set = (k: keyof typeof vazio, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))
  const pendentes = eventos.filter(ev => ev.status === 'pendente').length
  const semPreco = eventos.filter(ev => !ev.preco_situacao || ev.preco_situacao === 'a_confirmar').length
  const contagemTitulos = new Map<string, number>()
  for (const ev of eventos) {
    const chave = `${ev.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${ev.data || ''}`
    contagemTitulos.set(chave, (contagemTitulos.get(chave) || 0) + 1)
  }
  const possiveisRepetidos = eventos.filter(ev => {
    const chave = `${ev.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}|${ev.data || ''}`
    return (contagemTitulos.get(chave) || 0) > 1
  })
  const eventosFiltrados = filtro === 'pendentes' ? eventos.filter(ev => ev.status === 'pendente')
    : filtro === 'preco' ? eventos.filter(ev => !ev.preco_situacao || ev.preco_situacao === 'a_confirmar')
      : filtro === 'repetidos' ? possiveisRepetidos : eventos
  const pedidosPendentes = orders.filter(o => o.status === 'entrega_pendente')
  const reembolsosPendentes = refunds.filter(r => ['pendente_admin', 'aprovado', 'processando'].includes(r.status))

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/15 rounded-lg flex items-center justify-center border border-purple-500/20">
            <CalendarDays size={22} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">Eventos <span className="neon-text-purple">PraiaGo</span></h1>
            <p className="text-slate-400 text-sm font-medium">
              {eventos.length} evento(s) · {pendentes} pendente(s) para aprovar
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={cacarEventos} disabled={cacando} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-xl font-bold text-sm hover:bg-emerald-500/25 transition-all disabled:opacity-50">
            {cacando ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />} {cacando ? 'Caçando...' : 'Caçar eventos'}
          </button>
          <button onClick={revalidarPrecos} disabled={revalidando} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/10 text-amber-300 border border-amber-500/25 rounded-xl font-bold text-sm hover:bg-amber-500/20 transition-all disabled:opacity-50">
            {revalidando ? <Loader2 size={16} className="animate-spin" /> : <Ticket size={16} />} Revalidar preços
          </button>
          <button onClick={testarFontes} disabled={testandoFontes} className="flex items-center gap-2 px-4 py-2.5 bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 rounded-xl font-bold text-sm hover:bg-cyan-500/20 transition-all disabled:opacity-50">
            {testandoFontes ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />} Testar fontes
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-xl font-bold text-sm hover:bg-purple-500/25 transition-all">
            {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Fechar' : 'Novo evento'}
          </button>
        </div>
      </header>

      {cacaMsg && (
        <div className="glass-panel rounded-xl px-4 py-3 border border-emerald-500/20 text-emerald-300 text-sm font-semibold flex items-center gap-2">
          <Bot size={15} /> {cacaMsg}
        </div>
      )}

      <section className="glass-panel rounded-2xl p-5 border border-purple-500/20 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-100 flex items-center gap-2"><Bot size={18} className="text-purple-300" /> Caça Eventos v5</h2>
            <p className="text-xs text-slate-400 mt-1">Praia Grande · descoberta 2× ao dia · preços/lotes a cada 4 horas · aprovação administrativa</p>
          </div>
          <button onClick={() => void carregar()} className="text-xs font-bold text-slate-300 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/60"><RefreshCw size={13} /> Atualizar painel</button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {([
            ['todos', 'Eventos', eventos.length],
            ['pendentes', 'Aguardando aprovação', pendentes],
            ['preco', 'Preço a confirmar', semPreco],
            ['repetidos', 'Possíveis repetidos', possiveisRepetidos.length],
          ] as const).map(([id, label, count]) => (
            <button key={id} onClick={() => setFiltro(id)} className={`rounded-xl border p-3 text-left transition-all ${filtro === id ? 'bg-purple-500/15 border-purple-500/45' : 'bg-slate-950/35 border-slate-800/70 hover:border-slate-600'}`}>
              <span className="block text-xl font-black text-slate-100">{count}</span><span className="text-[11px] text-slate-400 font-semibold">{label}</span>
            </button>
          ))}
        </div>
        {runs[0] && <div className="rounded-xl border border-slate-800/70 bg-slate-950/35 p-3 text-xs text-slate-300 space-y-1">
          <div className="font-bold flex flex-wrap items-center gap-2">
            <span className={runs[0].status === 'falhou' ? 'text-red-400' : runs[0].status === 'rodando' ? 'text-amber-300' : 'text-emerald-300'}>
              Última rodada: {runs[0].status} · {runs[0].version} · {runs[0].stats?.modo === 'precos' ? 'preços/lotes' : 'descoberta'}
            </span>
            <span className="text-slate-500">{new Date(runs[0].started_at).toLocaleString('pt-BR')}</span>
          </div>
          <div>{runs[0].stats?.inseridos ?? 0} eventos novos · {runs[0].stats?.ingressos_salvos ?? 0} lotes conferidos · {runs[0].stats?.revalidacao?.revalidados ?? 0} eventos revalidados</div>
          {(runs[0].stats?.fontes_resultado || []).map(fonte => <div key={fonte.fonte} className={fonte.ok ? 'text-slate-400' : 'text-red-300'}>{fonte.ok ? '✓' : '!'} {fonte.fonte}: {fonte.eventos} candidatos · {(fonte.tempo_ms / 1000).toFixed(1)}s</div>)}
          {(runs[0].errors || []).map((erro, index) => <div key={index} className="text-red-300">{erro.fonte || 'Robô'}: {erro.erro}</div>)}
        </div>}
        {fontesTeste.length > 0 && <div className="grid sm:grid-cols-3 gap-2">{fontesTeste.map(fonte => <div key={fonte.fonte} className={`rounded-lg border px-3 py-2 text-xs ${fonte.ok ? 'border-emerald-500/25 text-emerald-300 bg-emerald-500/5' : 'border-red-500/25 text-red-300 bg-red-500/5'}`}>
          <div className="font-bold">{fonte.ok ? 'Conectada' : 'Falha'} · {fonte.fonte}</div><div className="opacity-80">{fonte.http ? `HTTP ${fonte.http} · ` : ''}{(fonte.tempo_ms / 1000).toFixed(1)}s{fonte.erro ? ` · ${fonte.erro}` : ''}</div>
        </div>)}</div>}
      </section>

      {pedidosPendentes.length > 0 && (
        <section className="glass-panel rounded-2xl p-5 border border-emerald-500/20">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                <ShoppingCart size={18} className="text-emerald-400" /> Ingressos para entregar
              </h2>
              <p className="text-xs text-slate-500 font-semibold">Pagamentos aprovados aguardando envio do ingresso.</p>
            </div>
            <span className="text-xs font-black text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1">
              {pedidosPendentes.length} pendente(s)
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {pedidosPendentes.map(order => {
              const evento = firstRelation(order.eventos)
              const lote = firstRelation(order.event_ticket_lots)
              return (
                <div key={order.id} className="rounded-xl border border-slate-800/70 bg-slate-950/35 p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 text-emerald-300 flex items-center justify-center shrink-0">
                    <Ticket size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-slate-100 truncate">{evento?.titulo || 'Evento'}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {order.quantidade}x {lote?.nome || 'Ingresso'} · {fmtMoney(order.total)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {order.cliente_nome} {order.cliente_email ? `· ${order.cliente_email}` : ''} {order.cliente_telefone ? `· ${order.cliente_telefone}` : ''}
                    </div>
                  </div>
                  <button onClick={() => marcarEntregue(order.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-all shrink-0">
                    <Send size={13} /> Entregue
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {reembolsosPendentes.length > 0 && (
        <section className="glass-panel rounded-2xl p-5 border border-amber-500/20">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
                <Clock3 size={18} className="text-amber-300" /> Reembolsos de ingressos
              </h2>
              <p className="text-xs text-slate-500 font-semibold">Somente admin ou bot autorizado aprova e processa reembolso.</p>
            </div>
            <span className="text-xs font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1">
              {reembolsosPendentes.length} em análise
            </span>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {reembolsosPendentes.map(refund => {
              const order = firstRelation(refund.event_ticket_orders)
              const evento = firstRelation(order?.eventos)
              const lote = firstRelation(order?.event_ticket_lots)
              return (
                <div key={refund.id} className="rounded-xl border border-slate-800/70 bg-slate-950/35 p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-300 flex items-center justify-center shrink-0">
                    <Ticket size={17} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-black text-slate-100 truncate">{evento?.titulo || 'Evento'}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {order?.cliente_nome || 'Cliente'} · {lote?.nome || 'Ingresso'} · {fmtMoney(refund.valor || order?.total || 0)}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {refund.motivo || 'Sem motivo detalhado.'}
                    </div>
                    <div className="text-[10px] font-black text-amber-300 mt-2 uppercase">{refund.status}</div>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    {refund.status === 'pendente_admin' && (
                      <>
                        <button onClick={() => aprovarReembolso(refund.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-all">
                          <CheckCircle2 size={13} /> Aprovar
                        </button>
                        <button onClick={() => negarReembolso(refund.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
                          <X size={13} /> Negar
                        </button>
                      </>
                    )}
                    {refund.status === 'aprovado' && (
                      <button onClick={() => processarReembolso(refund.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 transition-all">
                        <Send size={13} /> Processar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Formulário */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="glass-panel rounded-2xl p-6 border-slate-800 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Título" full><input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex: Luau na Praia" className={inp} /></Field>
                <Field label="Período">
                  <select value={form.periodo} onChange={e => set('periodo', e.target.value)} className={inp}>
                    {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Data"><input type="date" value={form.data} onChange={e => set('data', e.target.value)} className={inp} /></Field>
                <Field label="Hora"><input value={form.hora} onChange={e => set('hora', e.target.value)} placeholder="20:00" className={inp} /></Field>
                <Field label="Emoji"><input value={form.emoji} onChange={e => set('emoji', e.target.value)} placeholder="🎉" className={inp} /></Field>
                <Field label="Categoria"><input value={form.categoria} onChange={e => set('categoria', e.target.value)} placeholder="Festa / Música / Esporte" className={inp} /></Field>
                <Field label="Local (nome)" full><input value={form.local_nome} onChange={e => set('local_nome', e.target.value)} placeholder="Nome do local" className={inp} /></Field>
                <Field label="Endereço" full><input value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Av. da Praia, 100" className={inp} /></Field>
                <Field label="Latitude"><input value={form.lat} onChange={e => set('lat', e.target.value)} placeholder="-24.0060" className={inp} /></Field>
                <Field label="Longitude"><input value={form.lng} onChange={e => set('lng', e.target.value)} placeholder="-46.4140" className={inp} /></Field>
                <Field label="Situação do preço">
                  <select value={form.preco_situacao} onChange={e => set('preco_situacao', e.target.value)} className={inp}>
                    <option value="a_confirmar">A confirmar</option><option value="gratuito">Gratuito confirmado</option><option value="pago">Pago</option>
                  </select>
                </Field>
                <Field label="Preço (R$) · apenas se pago"><input type="number" min="0" step="0.01" value={form.preco} onChange={e => set('preco', e.target.value)} className={inp} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={form.destaque} onChange={e => set('destaque', e.target.checked)} className="accent-purple-500" /> Marcar como destaque
              </label>
              {erro && <p className="text-red-400 text-sm font-semibold">{erro}</p>}
              <button onClick={criar} disabled={salvando} className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Publicar evento
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="text-purple-400 animate-spin" /></div>
      ) : eventosFiltrados.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border-slate-800">
          <CalendarDays size={36} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-bold">Nenhum evento neste filtro</p>
          <p className="text-slate-600 text-sm">Selecione outro filtro ou aguarde a próxima rodada do robô.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {eventosFiltrados.map(ev => {
            const per = PERIODOS.find(p => p.id === ev.periodo)
            const PerIcon = per?.icon ?? Moon
            const lotes = [...(ev.event_ticket_lots || [])].sort((a, b) => Number(a.preco_venda) - Number(b.preco_venda))
            return (
              <motion.div key={ev.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`glass-panel rounded-2xl p-5 border ${
                  ev.status === 'pendente'
                    ? 'border-amber-500/35'
                    : ev.status === 'ativo'
                      ? 'border-slate-800'
                      : 'border-slate-800/50 opacity-60'
                }`}>
                <div className="flex items-start gap-4">
                  <div className="text-4xl">{ev.emoji ?? '🎉'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-slate-100 truncate">{ev.titulo}</h3>
                      {ev.destaque && <Star size={14} className="text-amber-400 fill-amber-400" />}
                      {ev.fonte === 'robo' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded px-1.5 py-0.5 uppercase tracking-wide shrink-0">
                          <Bot size={10} /> Robô
                        </span>
                      )}
                      {ev.status === 'pendente' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5 uppercase tracking-wide shrink-0">
                          <Clock3 size={10} /> Pendente
                        </span>
                      )}
                      {ev.fonte_url && (
                        <a href={ev.fonte_url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300 shrink-0" title="Ver fonte original">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-medium flex-wrap">
                      <span className="flex items-center gap-1"><PerIcon size={12} />{per?.label}</span>
                      {ev.data && <span>{format(new Date(ev.data + 'T00:00:00'), 'dd/MM', { locale: ptBR })}{ev.hora ? ` · ${ev.hora}` : ''}</span>}
                      {ev.local_nome && <span className="flex items-center gap-1 truncate"><MapPin size={12} />{ev.local_nome}</span>}
                      <span className={`flex items-center gap-1 ${ev.preco_situacao === 'a_confirmar' || !ev.preco_situacao ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {ev.preco_situacao === 'a_confirmar' || !ev.preco_situacao ? <AlertTriangle size={12} /> : <Ticket size={12} />}
                        {ev.preco_situacao === 'gratuito' ? 'Gratuito confirmado' : ev.preco_situacao === 'pago' ? ev.preco > 0 ? fmtMoney(ev.preco) : 'Pago · valor na fonte' : 'Preço a confirmar'}
                      </span>
                    </div>
                    {(ev.descricao_curta || ev.descricao) && (
                      <p className="text-xs text-slate-500 mt-3 line-clamp-2">
                        {ev.descricao_curta || ev.descricao}
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>{ev.preco_verificado_em ? `Preço verificado em ${new Date(ev.preco_verificado_em).toLocaleString('pt-BR')}` : 'Preço ainda sem comprovação'}</span>
                  <button onClick={() => void revisarPreco(ev)} className="font-bold text-amber-300 hover:text-amber-200">Revisar preço</button>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-800/50 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Ingressos e margem PraiaGo</div>
                    <button onClick={() => adicionarIngresso(ev)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition-all">
                      <Plus size={12} /> Ingresso
                    </button>
                  </div>
                  {lotes.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-slate-500">
                      Nenhum lote cadastrado ainda. Cadastre manualmente ou rode o robô.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lotes.map(lote => (
                        <div key={lote.id} className="rounded-xl bg-slate-950/35 border border-slate-800/70 px-3 py-2 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-black text-slate-200 truncate">
                              {lote.nome}
                              {lote.lote_ordem != null && (
                                <span className="ml-1.5 text-[10px] font-bold text-sky-300">
                              {lote.lote_ordem === 0 ? 'promocional' : `${lote.lote_ordem}º lote`}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Origem {fmtMoney(lote.preco_origem)} · pix/débito {fmtMoney(lote.preco_venda)} (+{Number(lote.markup_percent)}%) · crédito {fmtMoney(lote.preco_venda_credito)} (+{Number(lote.markup_percent_credito)}%)
                              {lote.estoque_disponivel != null ? ` · ${lote.estoque_disponivel} disp.` : ''}
                            </div>
                          </div>
                          <span className={`text-[10px] font-black rounded px-2 py-1 uppercase ${
                            lote.status === 'disponivel'
                              ? 'bg-emerald-500/10 text-emerald-300'
                              : lote.status === 'pendente_aprovacao'
                                ? 'bg-amber-500/10 text-amber-300'
                                : 'bg-slate-800/70 text-slate-400'
                          }`}>
                            {lote.pausado_admin ? 'Pausa admin' : lote.status === 'pendente_aprovacao' ? 'Pendente' : lote.status}
                          </span>
                           {lote.status !== 'esgotado' && <button onClick={() => alternarLote(ev, lote)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800/70 text-slate-300 hover:bg-slate-700 transition-all">
                             {lote.status === 'disponivel' ? <><PauseCircle size={12} /> Pausar</> : <><CheckCircle2 size={12} /> Liberar/fila</>}
                           </button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800/50">
                  {ev.status === 'pendente' && (
                    <button onClick={() => aprovar(ev.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 transition-all">
                      <CheckCircle2 size={13} /> Aprovar
                    </button>
                  )}
                  {ev.status !== 'pendente' && <button onClick={() => toggle(ev.id, 'status', ev.status)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all">
                    {ev.status === 'ativo' ? <><Eye size={13} /> Ativo</> : <><EyeOff size={13} /> Oculto</>}
                  </button>}
                  <button onClick={() => toggle(ev.id, 'destaque', ev.destaque)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${ev.destaque ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700/50'}`}>
                    <Star size={13} /> Destaque
                  </button>
                  <button onClick={() => excluir(ev.id)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
                    <Trash2 size={13} /> Excluir
                  </button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inp = "w-full bg-slate-950/50 border border-slate-800/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500/40 transition-colors"

function fmtMoney(value: number) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null
}

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2 md:col-span-3' : ''}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}
