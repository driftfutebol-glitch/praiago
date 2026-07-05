import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BadgePercent, CalendarClock, Copy, Eye, EyeOff, Loader2, Plus,
  Store, Trash2, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { confirmDialog } from '../lib/dialog'

type CupomTipo = 'percentual' | 'valor_fixo' | 'frete_gratis'

type Cupom = {
  id: string
  codigo: string
  titulo: string
  descricao: string | null
  tipo: CupomTipo
  valor: number
  valor_minimo: number
  limite_uso: number | null
  usos: number
  ativo: boolean
  publico: boolean
  vendedor_tipo: 'restaurante' | 'ambulante' | null
  data_inicio: string
  validade: string | null
  created_at: string
}

const vazio = {
  codigo: '',
  titulo: '',
  descricao: '',
  tipo: 'percentual' as CupomTipo,
  valor: '10',
  valor_minimo: '0',
  limite_uso: '',
  validade: '',
  publico: true,
  vendedor_tipo: '',
}

const inputClass = 'w-full bg-slate-950/50 border border-slate-800/50 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-purple-500/40 transition-colors'

function formatDesconto(c: Pick<Cupom, 'tipo' | 'valor'>) {
  if (c.tipo === 'frete_gratis') return 'Frete gratis'
  if (c.tipo === 'percentual') return `${Number(c.valor || 0)}% OFF`
  return `R$ ${Number(c.valor || 0).toFixed(2).replace('.', ',')} OFF`
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2 md:col-span-3' : ''}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export default function CuponsPage() {
  const [cupons, setCupons] = useState<Cupom[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ...vazio })
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('cupons')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) setCupons((data as Cupom[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    carregar()
    const ch = supabase.channel('admin_cupons')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cupons' }, () => carregar())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  const ativos = useMemo(() => cupons.filter(c => c.ativo).length, [cupons])
  const expirados = useMemo(() => cupons.filter(c => c.validade && new Date(c.validade) < new Date()).length, [cupons])

  const set = (k: keyof typeof vazio, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }))

  async function criar() {
    const codigo = form.codigo.trim().toUpperCase().replace(/\s+/g, '')
    if (!codigo) { setErro('Informe o codigo do cupom.'); return }
    if (!form.titulo.trim()) { setErro('Informe o titulo do cupom.'); return }
    if (form.tipo !== 'frete_gratis' && Number(form.valor) <= 0) { setErro('Informe um desconto maior que zero.'); return }

    setErro('')
    setSalvando(true)
    const { error } = await supabase.from('cupons').insert({
      codigo,
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      tipo: form.tipo,
      valor: form.tipo === 'frete_gratis' ? 0 : Number(form.valor) || 0,
      valor_minimo: Number(form.valor_minimo) || 0,
      limite_uso: form.limite_uso ? Number(form.limite_uso) : null,
      validade: form.validade ? new Date(`${form.validade}T23:59:59`).toISOString() : null,
      publico: form.publico,
      vendedor_tipo: form.vendedor_tipo || null,
      ativo: true,
    })
    setSalvando(false)

    if (error) {
      setErro(error.message.includes('duplicate') ? 'Ja existe um cupom com esse codigo.' : error.message)
      return
    }

    setForm({ ...vazio })
    setShowForm(false)
  }

  async function toggle(id: string, campo: 'ativo' | 'publico', atual: boolean) {
    await supabase.from('cupons').update({ [campo]: !atual }).eq('id', id)
  }

  async function excluir(id: string) {
    if (!await confirmDialog({ title: 'Excluir cupom?', message: 'Essa ação não pode ser desfeita.', confirmText: 'Excluir', tone: 'danger' })) return
    await supabase.from('cupons').delete().eq('id', id)
  }

  async function copiar(codigo: string) {
    try {
      await navigator.clipboard.writeText(codigo)
    } catch {
      // Clipboard pode estar indisponivel no WebView.
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/15 rounded-lg flex items-center justify-center border border-purple-500/20">
            <BadgePercent size={22} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">Cupons <span className="neon-text-purple">PraiaGo</span></h1>
            <p className="text-slate-400 text-sm font-medium">Crie descontos reais para aparecer no app do cliente.</p>
          </div>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-xl font-bold text-sm hover:bg-purple-500/25 transition-all">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Fechar' : 'Novo cupom'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-5 border-slate-800">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total</p>
          <p className="text-3xl font-black text-slate-100 mt-2">{cupons.length}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border-slate-800">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Ativos</p>
          <p className="text-3xl font-black text-green-400 mt-2">{ativos}</p>
        </div>
        <div className="glass-panel rounded-2xl p-5 border-slate-800">
          <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Expirados</p>
          <p className="text-3xl font-black text-amber-400 mt-2">{expirados}</p>
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="glass-panel rounded-2xl p-6 border-slate-800 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Field label="Codigo"><input value={form.codigo} onChange={e => set('codigo', e.target.value.toUpperCase())} placeholder="PRAIA10" className={inputClass} /></Field>
                <Field label="Titulo" full><input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Desconto de abertura" className={inputClass} /></Field>
                <Field label="Descricao" full><input value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Opcional: aparece para o cliente" className={inputClass} /></Field>
                <Field label="Tipo">
                  <select value={form.tipo} onChange={e => set('tipo', e.target.value as CupomTipo)} className={inputClass}>
                    <option value="percentual">Percentual</option>
                    <option value="valor_fixo">Valor fixo</option>
                    <option value="frete_gratis">Frete gratis</option>
                  </select>
                </Field>
                <Field label={form.tipo === 'percentual' ? 'Desconto (%)' : 'Valor (R$)'}>
                  <input type="number" min="0" disabled={form.tipo === 'frete_gratis'} value={form.valor} onChange={e => set('valor', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Pedido minimo (R$)"><input type="number" min="0" value={form.valor_minimo} onChange={e => set('valor_minimo', e.target.value)} className={inputClass} /></Field>
                <Field label="Limite de uso"><input type="number" min="1" value={form.limite_uso} onChange={e => set('limite_uso', e.target.value)} placeholder="Ilimitado" className={inputClass} /></Field>
                <Field label="Validade"><input type="date" value={form.validade} onChange={e => set('validade', e.target.value)} className={inputClass} /></Field>
                <Field label="Destino">
                  <select value={form.vendedor_tipo} onChange={e => set('vendedor_tipo', e.target.value)} className={inputClass}>
                    <option value="">Todos</option>
                    <option value="restaurante">Restaurantes</option>
                    <option value="ambulante">Ambulantes</option>
                  </select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={form.publico} onChange={e => set('publico', e.target.checked)} className="accent-purple-500" /> Mostrar no app do cliente
              </label>
              {erro && <p className="text-red-400 text-sm font-semibold">{erro}</p>}
              <button onClick={criar} disabled={salvando} className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50">
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Criar cupom
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="text-purple-400 animate-spin" /></div>
      ) : cupons.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border-slate-800">
          <BadgePercent size={36} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-bold">Nenhum cupom cadastrado</p>
          <p className="text-slate-600 text-sm">Crie o primeiro cupom para aparecer no app cliente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {cupons.map(c => {
            const expired = !!c.validade && new Date(c.validade) < new Date()
            const limitReached = c.limite_uso !== null && c.usos >= c.limite_uso
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`glass-panel rounded-2xl p-5 border ${c.ativo ? 'border-slate-800' : 'border-slate-800/50 opacity-60'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2.5 py-1 tracking-wider">{c.codigo}</span>
                      <button onClick={() => copiar(c.codigo)} title="Copiar codigo" className="p-1.5 rounded-lg bg-slate-800/50 text-slate-400 hover:text-slate-100">
                        <Copy size={13} />
                      </button>
                    </div>
                    <h3 className="text-lg font-black text-slate-100 truncate">{c.titulo}</h3>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{c.descricao || 'Sem descricao'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-black text-green-400">{formatDesconto(c)}</div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">min. R$ {Number(c.valor_minimo).toFixed(2).replace('.', ',')}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-4 text-xs font-bold">
                  <span className={`px-2.5 py-1 rounded-lg ${c.ativo ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span>
                  <span className={`px-2.5 py-1 rounded-lg ${c.publico ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>{c.publico ? 'Visivel no app' : 'Oculto'}</span>
                  {expired && <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400">Expirado</span>}
                  {limitReached && <span className="px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400">Limite atingido</span>}
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-400 flex items-center gap-1"><Store size={12} />{c.vendedor_tipo || 'todos'}</span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-800/60 text-slate-400 flex items-center gap-1"><CalendarClock size={12} />{c.validade ? new Date(c.validade).toLocaleDateString('pt-BR') : 'sem validade'}</span>
                </div>

                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800/50">
                  <button onClick={() => toggle(c.id, 'ativo', c.ativo)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all">
                    {c.ativo ? <><EyeOff size={13} /> Desativar</> : <><Eye size={13} /> Ativar</>}
                  </button>
                  <button onClick={() => toggle(c.id, 'publico', c.publico)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all">
                    {c.publico ? 'Ocultar no app' : 'Mostrar no app'}
                  </button>
                  <div className="ml-auto text-xs text-slate-500 font-mono">{c.usos}{c.limite_uso ? `/${c.limite_uso}` : ''} usos</div>
                  <button onClick={() => excluir(c.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
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
