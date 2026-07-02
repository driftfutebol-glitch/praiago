import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarDays, Plus, Trash2, Star, Eye, EyeOff, Loader2, MapPin, Ticket, Sun, Sunset, Moon, X,
} from 'lucide-react'

interface Evento {
  id: string
  titulo: string
  descricao: string | null
  periodo: 'manha' | 'tarde' | 'noite'
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
  status: string
  fonte?: string | null
  created_at: string
}

const PERIODOS = [
  { id: 'manha', label: 'Manhã', icon: Sun },
  { id: 'tarde', label: 'Tarde', icon: Sunset },
  { id: 'noite', label: 'Noite', icon: Moon },
] as const

const vazio = {
  titulo: '', periodo: 'noite' as const, data: '', hora: '', local_nome: '',
  endereco: '', lat: '', lng: '', preco: '0', categoria: 'Festa', emoji: '🎉', destaque: false,
}

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ ...vazio })
  const [salvando, setSalvando] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('eventos').select('*').order('created_at', { ascending: false })
    setEventos((data as Evento[]) ?? [])
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

  async function toggle(id: string, campo: 'status' | 'destaque', atual: string | boolean) {
    const novo = campo === 'status' ? (atual === 'ativo' ? 'inativo' : 'ativo') : !atual
    await supabase.from('eventos').update({ [campo]: novo }).eq('id', id)
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este evento?')) return
    await supabase.from('eventos').delete().eq('id', id)
  }

  const set = (k: keyof typeof vazio, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/15 rounded-lg flex items-center justify-center border border-purple-500/20">
            <CalendarDays size={22} className="text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-100 tracking-tight">Eventos <span className="neon-text-purple">PraiaGo</span></h1>
            <p className="text-slate-400 text-sm font-medium">{eventos.length} evento(s) · gerencie o que aparece no app do cliente</p>
          </div>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/15 text-purple-300 border border-purple-500/30 rounded-xl font-bold text-sm hover:bg-purple-500/25 transition-all">
          {showForm ? <X size={16} /> : <Plus size={16} />} {showForm ? 'Fechar' : 'Novo evento'}
        </button>
      </header>

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
            return (
              <motion.div key={ev.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`glass-panel rounded-2xl p-5 border ${ev.status === 'ativo' ? 'border-slate-800' : 'border-slate-800/50 opacity-60'}`}>
                <div className="flex items-start gap-4">
                  <div className="text-4xl">{ev.emoji ?? '🎉'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-slate-100 truncate">{ev.titulo}</h3>
                      {ev.destaque && <Star size={14} className="text-amber-400 fill-amber-400" />}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 font-medium flex-wrap">
                      <span className="flex items-center gap-1"><PerIcon size={12} />{per?.label}</span>
                      {ev.data && <span>{format(new Date(ev.data + 'T00:00:00'), 'dd/MM', { locale: ptBR })}{ev.hora ? ` · ${ev.hora}` : ''}</span>}
                      {ev.local_nome && <span className="flex items-center gap-1 truncate"><MapPin size={12} />{ev.local_nome}</span>}
                      <span className="flex items-center gap-1 text-amber-400"><Ticket size={12} />{ev.preco > 0 ? `R$ ${ev.preco}` : 'Grátis'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800/50">
                  <button onClick={() => toggle(ev.id, 'status', ev.status)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition-all">
                    {ev.status === 'ativo' ? <><Eye size={13} /> Ativo</> : <><EyeOff size={13} /> Inativo</>}
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

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2 md:col-span-3' : ''}>
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  )
}
