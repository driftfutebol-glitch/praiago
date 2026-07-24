import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { confirmDialog, alertDialog, promptDialog } from '../lib/dialog'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarDays, Plus, Trash2, Star, Eye, EyeOff, Loader2, MapPin, Ticket, Sun, Sunset, Moon, MoonStar, X, Bot, ExternalLink,
  CheckCircle2, Clock3, ShoppingCart, Send, PauseCircle,
} from 'lucide-react'

type EventoStatus = 'pendente' | 'ativo' | 'inativo'

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

const PERIODOS = [
  { id: 'manha', label: 'Manhã', icon: Sun },
  { id: 'tarde', label: 'Tarde', icon: Sunset },
  { id: 'noite', label: 'Noite', icon: Moon },
  { id: 'madrugada', label: 'Madrugada', icon: MoonStar },
] as const

const vazio = {
  titulo: '', periodo: 'noite' as const, data: '', hora: '', local_nome: '',
  endereco: '', lat: '', lng: '', preco: '0', categoria: 'Festa', emoji: '🎉', destaque: false,
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
  const [cacaMsg, setCacaMsg] = useState('')

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
    setTimeout(() => { void carregar() }, 75000)
    setTimeout(() => setCacaMsg(''), 90000)
  }

  const carregar = useCallback(async () => {
    const hoje = hojeSpIso()
    // (removido) NAO chamar a edge function a cada load — virava tempestade de
    // chamadas com o realtime. A limpeza/ciclo de vida roda no cron horario.
    const [{ data }, { data: pedidos }, { data: reembolsos }] = await Promise.all([
      supabase
        .from('eventos')
        .select('*, event_ticket_lots(id,nome,preco_origem,markup_percent,preco_venda,estoque_disponivel,status,fonte_url)')
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
    ])
    setEventos((data as Evento[]) ?? [])
    setOrders((pedidos as TicketOrder[]) ?? [])
    setRefunds((reembolsos as TicketRefund[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    carregar()
    const ch = supabase.channel('admin_eventos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  async function criar() {
    if (!form.titulo.trim()) { setErro('Informe o título do evento.'); return }
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
      categoria: form.categoria || null,
      emoji: form.emoji || '🎉',
      destaque: form.destaque,
      status: 'ativo',
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
    const { error } = await supabase.from('eventos').update({ status: 'ativo' }).eq('id', id)
    if (!error) {
      await supabase
        .from('event_ticket_lots')
        .update({ status: 'disponivel' })
        .eq('evento_id', id)
        .eq('status', 'pendente_aprovacao')
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
      fonte_url: ev.fonte_url || null,
      criado_por: 'admin',
      metadata: { criado_no_admin: true },
    })
    if (error) alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else carregar()
  }

  async function alternarLote(lote: TicketLot) {
    const novo = lote.status === 'disponivel' ? 'pausado' : 'disponivel'
    const { error } = await supabase.from('event_ticket_lots').update({ status: novo }).eq('id', lote.id)
    if (error) alertDialog({ title: 'Erro', message: error.message, tone: 'danger' })
    else carregar()
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
  const pedidosPendentes = orders.filter(o => o.status === 'entrega_pendente')
  const reembolsosPendentes = refunds.filter(r => ['pendente_admin', 'aprovado', 'processando'].includes(r.status))

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
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
        <div className="flex items-center gap-2">
          <button onClick={cacarEventos} disabled={cacando} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-xl font-bold text-sm hover:bg-emerald-500/25 transition-all disabled:opacity-50">
            {cacando ? <Loader2 size={16} className="animate-spin" /> : <Bot size={16} />} {cacando ? 'Caçando...' : 'Caçar eventos'}
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
                <Field label="Preço (R$) · 0 = grátis"><input type="number" value={form.preco} onChange={e => set('preco', e.target.value)} className={inp} /></Field>
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
      ) : eventos.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border-slate-800">
          <CalendarDays size={36} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-bold">Nenhum evento cadastrado</p>
          <p className="text-slate-600 text-sm">Crie o primeiro evento — ele aparece na hora no app dos clientes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {eventos.map(ev => {
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
                      <span className="flex items-center gap-1 text-amber-400"><Ticket size={12} />{ev.preco > 0 ? fmtMoney(ev.preco) : 'Grátis'}</span>
                    </div>
                    {(ev.descricao_curta || ev.descricao) && (
                      <p className="text-xs text-slate-500 mt-3 line-clamp-2">
                        {ev.descricao_curta || ev.descricao}
                      </p>
                    )}
                  </div>
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
                            <div className="text-xs font-black text-slate-200 truncate">{lote.nome}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Origem {fmtMoney(lote.preco_origem)} · venda {fmtMoney(lote.preco_venda)} · +{Number(lote.markup_percent || 10)}%
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
                            {lote.status === 'pendente_aprovacao' ? 'Pendente' : lote.status}
                          </span>
                          <button onClick={() => alternarLote(lote)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800/70 text-slate-300 hover:bg-slate-700 transition-all">
                            {lote.status === 'disponivel' ? <><PauseCircle size={12} /> Pausar</> : <><CheckCircle2 size={12} /> Liberar</>}
                          </button>
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
                  <button onClick={() => toggle(ev.id, 'status', ev.status)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all">
                    {ev.status === 'ativo' ? <><Eye size={13} /> Ativo</> : <><EyeOff size={13} /> Oculto</>}
                  </button>
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
