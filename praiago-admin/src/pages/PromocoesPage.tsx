import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BadgePercent, Bell, CalendarClock, Eye, EyeOff, Loader2, Megaphone,
  Percent, Plus, Send, Store, Ticket, Trash2, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'

type Aviso = {
  id: string
  titulo: string
  mensagem: string
  tipo: 'promo' | 'aviso' | 'cupom'
  publico: string
  cupom_codigo: string | null
  ativo: boolean
  created_at: string
}

type Produto = {
  id: string
  vendedor_id: string | null
  vendedor_nome: string | null
  nome: string
  preco: number
  emoji: string | null
  categoria: string | null
  ativo: boolean | null
}

type Perfil = {
  id: string
  nome: string | null
  role: string | null
}

type Promocao = {
  id: string
  titulo: string
  descricao: string | null
  produto_id: string
  vendedor_id: string
  desconto_tipo: 'preco_promocional' | 'percentual' | 'valor_fixo'
  desconto_valor: number | null
  preco_original: number
  preco_promocional: number | null
  selo: string
  ativo: boolean
  publico: boolean
  prioridade: number
  data_inicio: string
  data_fim: string | null
  created_at: string
}

const TIPOS = [
  { id: 'promo', label: 'Promocao', cor: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'cupom', label: 'Cupom', cor: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'aviso', label: 'Aviso', cor: 'text-sky-400', bg: 'bg-sky-500/10' },
] as const

const PUBLICOS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'ambulantes', label: 'Ambulantes' },
  { id: 'restaurantes', label: 'Restaurantes' },
  { id: 'todos', label: 'Todos' },
] as const

const vazioCampanha = {
  titulo: '',
  descricao: '',
  produtoId: '',
  descontoTipo: 'preco_promocional' as Promocao['desconto_tipo'],
  descontoValor: '10',
  precoPromocional: '',
  selo: 'Oferta',
  prioridade: '10',
  dataInicio: '',
  dataFim: '',
  publico: true,
  ativo: true,
}

const inputClass = 'w-full bg-slate-950/50 border border-slate-800/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-500/40 transition-colors'

function moeda(v: number) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
}

function precoFinal(p: Promocao) {
  if (p.desconto_tipo === 'preco_promocional') return Number(p.preco_promocional || p.preco_original)
  if (p.desconto_tipo === 'percentual') return Math.max(0, Number(p.preco_original) * (1 - Number(p.desconto_valor || 0) / 100))
  return Math.max(0, Number(p.preco_original) - Number(p.desconto_valor || 0))
}

function descontoLabel(p: Promocao) {
  if (p.desconto_tipo === 'preco_promocional') return `${moeda(p.preco_original)} -> ${moeda(precoFinal(p))}`
  if (p.desconto_tipo === 'percentual') return `${Number(p.desconto_valor || 0)}% OFF`
  return `${moeda(Number(p.desconto_valor || 0))} OFF`
}

function Field({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'md:col-span-2 xl:col-span-3' : ''}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export default function PromocoesPage() {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [promocoes, setPromocoes] = useState<Promocao[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [perfis, setPerfis] = useState<Record<string, Perfil>>({})
  const [campanha, setCampanha] = useState({ ...vazioCampanha })
  const [erroCampanha, setErroCampanha] = useState('')
  const [salvandoCampanha, setSalvandoCampanha] = useState(false)
  const [showForm, setShowForm] = useState(true)
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [tipo, setTipo] = useState<'promo' | 'aviso' | 'cupom'>('promo')
  const [publico, setPublico] = useState('clientes')
  const [cupom, setCupom] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)

  const produtoMap = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos])
  const campanhaProduto = campanha.produtoId ? produtoMap.get(campanha.produtoId) : undefined
  const ativas = useMemo(() => promocoes.filter(p => p.ativo && p.publico).length, [promocoes])

  const carregar = useCallback(async () => {
    const [{ data: promos }, { data: prods }, { data: avisoData }] = await Promise.all([
      supabase.from('promocoes').select('*').order('prioridade', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('produtos').select('*').order('nome', { ascending: true }),
      supabase.from('avisos').select('*').order('created_at', { ascending: false }).limit(30),
    ])

    const produtoRows = ((prods as Produto[]) ?? [])
    setPromocoes((promos as Promocao[]) ?? [])
    setProdutos(produtoRows)
    setAvisos((avisoData as Aviso[]) ?? [])

    const ids = [...new Set(produtoRows.map(p => p.vendedor_id).filter((id): id is string => !!id))]
    if (ids.length) {
      const { data: perfisData } = await supabase.from('profiles').select('id,nome,role').in('id', ids)
      const next: Record<string, Perfil> = {}
      for (const perfil of (perfisData ?? []) as Perfil[]) next[perfil.id] = perfil
      setPerfis(next)
    }
  }, [])

  useEffect(() => {
    carregar()
    const ch = supabase.channel('admin_promocoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'promocoes' }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos' }, () => carregar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avisos' }, () => carregar())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  function setCampanhaCampo(k: keyof typeof vazioCampanha, v: string | boolean) {
    setCampanha(prev => ({ ...prev, [k]: v }))
  }

  function vendedorNome(p?: Produto) {
    if (!p) return 'Produto nao encontrado'
    return p.vendedor_nome || (p.vendedor_id ? perfis[p.vendedor_id]?.nome : '') || 'Vendedor PraiaGo'
  }

  async function criarCampanha() {
    const produto = campanhaProduto
    if (!produto?.vendedor_id) { setErroCampanha('Escolha um produto com vendedor vinculado.'); return }
    if (!campanha.titulo.trim()) { setErroCampanha('Informe o titulo da campanha.'); return }

    const original = Number(produto.preco) || 0
    const descontoValor = Number(campanha.descontoValor) || 0
    const precoPromocional = Number(campanha.precoPromocional) || 0

    if (original <= 0) { setErroCampanha('O produto precisa ter preco normal maior que zero.'); return }
    if (campanha.descontoTipo === 'preco_promocional' && (precoPromocional <= 0 || precoPromocional >= original)) {
      setErroCampanha('O preco promocional precisa ser menor que o preco normal.')
      return
    }
    if (campanha.descontoTipo === 'percentual' && (descontoValor <= 0 || descontoValor > 95)) {
      setErroCampanha('O percentual deve ficar entre 1 e 95.')
      return
    }
    if (campanha.descontoTipo === 'valor_fixo' && (descontoValor <= 0 || descontoValor >= original)) {
      setErroCampanha('O desconto em reais precisa ser menor que o preco normal.')
      return
    }

    setErroCampanha('')
    setSalvandoCampanha(true)
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await supabase.from('promocoes').insert({
      titulo: campanha.titulo.trim(),
      descricao: campanha.descricao.trim() || null,
      produto_id: produto.id,
      vendedor_id: produto.vendedor_id,
      desconto_tipo: campanha.descontoTipo,
      desconto_valor: campanha.descontoTipo === 'preco_promocional' ? null : descontoValor,
      preco_original: original,
      preco_promocional: campanha.descontoTipo === 'preco_promocional' ? precoPromocional : null,
      selo: campanha.selo.trim() || 'Oferta',
      prioridade: Number(campanha.prioridade) || 0,
      data_inicio: campanha.dataInicio ? new Date(campanha.dataInicio).toISOString() : new Date().toISOString(),
      data_fim: campanha.dataFim ? new Date(campanha.dataFim).toISOString() : null,
      ativo: campanha.ativo,
      publico: campanha.publico,
      created_by: auth.user?.id ?? null,
    })
    setSalvandoCampanha(false)

    if (error) {
      setErroCampanha(error.message)
      return
    }

    setCampanha({ ...vazioCampanha })
    carregar()
  }

  async function togglePromocao(id: string, campo: 'ativo' | 'publico', atual: boolean) {
    await supabase.from('promocoes').update({ [campo]: !atual }).eq('id', id)
  }

  async function excluirPromocao(id: string) {
    if (!confirm('Excluir esta campanha? O produto volta ao preco normal.')) return
    await supabase.from('promocoes').delete().eq('id', id)
  }

  async function enviar() {
    if (!titulo.trim() || !mensagem.trim()) return
    setEnviando(true)
    const { error } = await supabase.from('avisos').insert({
      titulo: titulo.trim(),
      mensagem: mensagem.trim(),
      tipo,
      publico,
      cupom_codigo: tipo === 'cupom' && cupom.trim() ? cupom.trim().toUpperCase() : null,
    })
    setEnviando(false)
    if (!error) {
      setTitulo('')
      setMensagem('')
      setCupom('')
      setOk(true)
      setTimeout(() => setOk(false), 2500)
      carregar()
    }
  }

  async function excluirAviso(id: string) {
    await supabase.from('avisos').delete().eq('id', id)
    setAvisos(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-500/15 rounded-lg flex items-center justify-center border border-orange-500/20">
            <Megaphone size={22} className="text-orange-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">Promocoes e campanhas</h1>
            <p className="text-slate-400 text-sm font-medium">Produto so entra em promocao quando uma campanha ativa for criada aqui.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange-500/15 text-orange-300 border border-orange-500/30 rounded-xl font-bold text-sm hover:bg-orange-500/25 transition-all">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Fechar campanha' : 'Nova campanha'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 border-slate-800"><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Campanhas</p><p className="text-3xl font-black text-slate-100 mt-2">{promocoes.length}</p></div>
        <div className="glass-panel rounded-2xl p-5 border-slate-800"><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Ativas no app</p><p className="text-3xl font-black text-green-400 mt-2">{ativas}</p></div>
        <div className="glass-panel rounded-2xl p-5 border-slate-800"><p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Produtos elegiveis</p><p className="text-3xl font-black text-orange-400 mt-2">{produtos.length}</p></div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="glass-panel rounded-2xl p-6 border-slate-800 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                <Field label="Produto da campanha" full>
                  <select value={campanha.produtoId} onChange={e => setCampanhaCampo('produtoId', e.target.value)} className={inputClass}>
                    <option value="">Escolha manualmente o produto</option>
                    {produtos.map(p => (
                      <option key={p.id} value={p.id}>{p.nome} - {vendedorNome(p)} - {moeda(Number(p.preco || 0))}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Titulo"><input value={campanha.titulo} onChange={e => setCampanhaCampo('titulo', e.target.value)} placeholder="Combo almoco na praia" className={inputClass} /></Field>
                <Field label="Selo"><input value={campanha.selo} onChange={e => setCampanhaCampo('selo', e.target.value)} placeholder="Oferta relampago" className={inputClass} /></Field>
                <Field label="Descricao" full><input value={campanha.descricao} onChange={e => setCampanhaCampo('descricao', e.target.value)} placeholder="Texto curto para campanha" className={inputClass} /></Field>
                <Field label="Tipo de desconto">
                  <select value={campanha.descontoTipo} onChange={e => setCampanhaCampo('descontoTipo', e.target.value as Promocao['desconto_tipo'])} className={inputClass}>
                    <option value="preco_promocional">Preco promocional</option>
                    <option value="percentual">Percentual</option>
                    <option value="valor_fixo">Valor em reais</option>
                  </select>
                </Field>
                {campanha.descontoTipo === 'preco_promocional' ? (
                  <Field label="Preco promocional"><input type="number" min="0" step="0.01" value={campanha.precoPromocional} onChange={e => setCampanhaCampo('precoPromocional', e.target.value)} placeholder={campanhaProduto ? String(Math.max(0, Number(campanhaProduto.preco) - 1)) : '0.00'} className={inputClass} /></Field>
                ) : (
                  <Field label={campanha.descontoTipo === 'percentual' ? 'Desconto (%)' : 'Desconto (R$)'}>
                    <input type="number" min="0" step="0.01" value={campanha.descontoValor} onChange={e => setCampanhaCampo('descontoValor', e.target.value)} className={inputClass} />
                  </Field>
                )}
                <Field label="Prioridade"><input type="number" value={campanha.prioridade} onChange={e => setCampanhaCampo('prioridade', e.target.value)} className={inputClass} /></Field>
                <Field label="Inicio"><input type="datetime-local" value={campanha.dataInicio} onChange={e => setCampanhaCampo('dataInicio', e.target.value)} className={inputClass} /></Field>
                <Field label="Fim"><input type="datetime-local" value={campanha.dataFim} onChange={e => setCampanhaCampo('dataFim', e.target.value)} className={inputClass} /></Field>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={campanha.ativo} onChange={e => setCampanhaCampo('ativo', e.target.checked)} className="accent-orange-500" /> Ativa</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={campanha.publico} onChange={e => setCampanhaCampo('publico', e.target.checked)} className="accent-orange-500" /> Mostrar no app cliente</label>
              </div>
              {campanhaProduto && (
                <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 text-sm text-slate-300 flex flex-wrap gap-3">
                  <span className="font-bold text-slate-100">{campanhaProduto.nome}</span>
                  <span>{vendedorNome(campanhaProduto)}</span>
                  <span>preco normal {moeda(Number(campanhaProduto.preco || 0))}</span>
                </div>
              )}
              {erroCampanha && <p className="text-red-400 text-sm font-semibold">{erroCampanha}</p>}
              <button onClick={criarCampanha} disabled={salvandoCampanha} className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50">
                {salvandoCampanha ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar campanha
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {promocoes.map(p => {
          const produto = produtoMap.get(p.produto_id)
          const expirou = !!p.data_fim && new Date(p.data_fim) < new Date()
          return (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`glass-panel rounded-2xl p-5 border ${p.ativo && p.publico ? 'border-orange-500/20' : 'border-slate-800/60 opacity-70'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-black text-orange-300 bg-orange-500/10 border border-orange-500/20 rounded-lg px-2.5 py-1 uppercase">{p.selo}</span>
                    {expirou && <span className="text-[10px] font-black text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1 uppercase">Expirada</span>}
                  </div>
                  <h3 className="text-lg font-black text-slate-100 truncate">{p.titulo}</h3>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{p.descricao || produto?.nome || 'Campanha sem descricao'}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-2xl font-black text-green-400">{moeda(precoFinal(p))}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase mt-1 line-through">{moeda(Number(p.preco_original || 0))}</div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap mt-4 text-xs font-bold">
                <span className={`px-2.5 py-1 rounded-lg ${p.ativo ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500'}`}>{p.ativo ? 'Ativa' : 'Inativa'}</span>
                <span className={`px-2.5 py-1 rounded-lg ${p.publico ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>{p.publico ? 'Visivel no app' : 'Oculta'}</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-400 flex items-center gap-1"><Percent size={12} />{descontoLabel(p)}</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-400 flex items-center gap-1"><Store size={12} />{produto?.nome || 'produto removido'}</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-400 flex items-center gap-1"><CalendarClock size={12} />{p.data_fim ? new Date(p.data_fim).toLocaleDateString('pt-BR') : 'sem fim'}</span>
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800/50">
                <button onClick={() => togglePromocao(p.id, 'ativo', p.ativo)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all">
                  {p.ativo ? <><EyeOff size={13} /> Desativar</> : <><Eye size={13} /> Ativar</>}
                </button>
                <button onClick={() => togglePromocao(p.id, 'publico', p.publico)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all">
                  {p.publico ? 'Ocultar no app' : 'Mostrar no app'}
                </button>
                <button onClick={() => excluirPromocao(p.id)} className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
                  <Trash2 size={13} /> Excluir
                </button>
              </div>
            </motion.div>
          )
        })}
        {promocoes.length === 0 && (
          <div className="glass-panel rounded-2xl p-12 text-center border-slate-800 xl:col-span-2">
            <BadgePercent size={36} className="text-slate-700 mx-auto mb-3" />
            <p className="text-slate-400 font-bold">Nenhuma campanha criada</p>
            <p className="text-slate-600 text-sm">Produtos nao entram em promocao automaticamente.</p>
          </div>
        )}
      </div>

      <section className="glass-panel rounded-2xl p-6 border-slate-800 space-y-4">
        <div>
          <h2 className="text-xl font-black text-slate-100">Notificacoes promocionais</h2>
          <p className="text-slate-500 text-sm">Envie avisos, cupons e novidades em tempo real.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {TIPOS.map(t => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${tipo === t.id ? `${t.bg} ${t.cor} border-current` : 'text-slate-500 border-transparent hover:text-slate-300 bg-slate-800/40'}`}>
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2 flex-wrap">
            {PUBLICOS.map(p => (
              <button key={p.id} onClick={() => setPublico(p.id)}
                className={`px-3 py-2 rounded-lg text-[11px] font-bold border transition-all ${publico === p.id ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'text-slate-500 border-transparent hover:text-slate-300 bg-slate-800/40'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Titulo do aviso" className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-orange-500/40" />
        <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} placeholder="Mensagem que o usuario vai receber" className="w-full h-24 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-orange-500/40 resize-none" />
        {tipo === 'cupom' && (
          <div className="flex items-center gap-2">
            <Ticket size={16} className="text-purple-400" />
            <input value={cupom} onChange={e => setCupom(e.target.value)} placeholder="CODIGO DO CUPOM" className="flex-1 bg-slate-900/60 border border-purple-500/30 rounded-xl px-4 py-2.5 text-sm text-purple-300 outline-none font-mono uppercase" />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button onClick={enviar} disabled={enviando || !titulo.trim() || !mensagem.trim()} className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black bg-gradient-to-r from-orange-500 to-red-500 text-white disabled:opacity-40 shadow-lg shadow-orange-500/20">
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            ENVIAR AGORA
          </button>
          <AnimatePresence>
            {ok && <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-green-400 text-sm font-bold">Enviado. Ja esta no app.</motion.span>}
          </AnimatePresence>
        </div>
      </section>

      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Bell size={14} /> Enviados recentemente</h2>
        <AnimatePresence mode="popLayout">
          {avisos.map(a => {
            const t = TIPOS.find(x => x.id === a.tipo) ?? TIPOS[2]
            return (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} className="glass-panel rounded-xl p-4 border-slate-800 flex items-start gap-4">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${t.bg} ${t.cor} shrink-0`}>{t.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-100">{a.titulo}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{a.mensagem}</div>
                  <div className="text-[10px] text-slate-600 font-mono mt-1.5">
                    para {a.publico} - {new Date(a.created_at).toLocaleString('pt-BR')}
                    {a.cupom_codigo && <span className="text-purple-400 ml-2">cupom {a.cupom_codigo}</span>}
                  </div>
                </div>
                <button onClick={() => excluirAviso(a.id)} className="p-2 text-slate-600 hover:text-red-400 transition-colors shrink-0"><Trash2 size={15} /></button>
              </motion.div>
            )
          })}
        </AnimatePresence>
        {avisos.length === 0 && (
          <div className="glass-panel rounded-xl p-8 border-slate-800 text-center text-slate-500 text-sm">Nenhum aviso enviado ainda.</div>
        )}
      </div>
    </div>
  )
}
