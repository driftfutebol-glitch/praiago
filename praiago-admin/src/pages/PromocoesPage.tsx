// Central de Notificações/Promoções — envia avisos que aparecem na hora
// no app dos clientes (tabela `avisos` + realtime), estilo iFood.
import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Megaphone, Send, Ticket, Bell, Trash2, Loader2 } from 'lucide-react'
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

const TIPOS = [
  { id: 'promo', label: '🔥 Promoção', cor: 'text-orange-400', bg: 'bg-orange-500/10' },
  { id: 'cupom', label: '🎟️ Cupom', cor: 'text-purple-400', bg: 'bg-purple-500/10' },
  { id: 'aviso', label: '📣 Aviso', cor: 'text-sky-400', bg: 'bg-sky-500/10' },
] as const

const PUBLICOS = [
  { id: 'clientes', label: 'Clientes' },
  { id: 'ambulantes', label: 'Ambulantes' },
  { id: 'restaurantes', label: 'Restaurantes' },
  { id: 'todos', label: 'Todos' },
] as const

export default function PromocoesPage() {
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [titulo, setTitulo] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [tipo, setTipo] = useState<'promo' | 'aviso' | 'cupom'>('promo')
  const [publico, setPublico] = useState('clientes')
  const [cupom, setCupom] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [ok, setOk] = useState(false)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('avisos').select('*').order('created_at', { ascending: false }).limit(30)
    if (data) setAvisos(data as Aviso[])
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function enviar() {
    if (!titulo.trim() || !mensagem.trim()) return
    setEnviando(true)
    const { error } = await supabase.from('avisos').insert({
      titulo: titulo.trim(), mensagem: mensagem.trim(), tipo, publico,
      cupom_codigo: tipo === 'cupom' && cupom.trim() ? cupom.trim().toUpperCase() : null,
    })
    setEnviando(false)
    if (!error) {
      setTitulo(''); setMensagem(''); setCupom('')
      setOk(true); setTimeout(() => setOk(false), 2500)
      carregar()
    }
  }

  async function excluir(id: string) {
    await supabase.from('avisos').delete().eq('id', id)
    setAvisos(prev => prev.filter(a => a.id !== id))
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-500/15 rounded-lg flex items-center justify-center border border-orange-500/20">
          <Megaphone size={22} className="text-orange-400" />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Promoções & Notificações</h1>
          <p className="text-slate-400 text-sm font-medium">Envie avisos que chegam na hora no app — promoções, cupons e novidades.</p>
        </div>
      </header>

      {/* Composer */}
      <div className="glass-panel rounded-2xl p-6 border-slate-800 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {TIPOS.map(t => (
            <button key={t.id} onClick={() => setTipo(t.id)}
              className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${tipo === t.id ? `${t.bg} ${t.cor} border-current` : 'text-slate-500 border-transparent hover:text-slate-300 bg-slate-800/40'}`}>
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex gap-2">
            {PUBLICOS.map(p => (
              <button key={p.id} onClick={() => setPublico(p.id)}
                className={`px-3 py-2 rounded-lg text-[11px] font-bold border transition-all ${publico === p.id ? 'bg-sky-500/15 text-sky-400 border-sky-500/30' : 'text-slate-500 border-transparent hover:text-slate-300 bg-slate-800/40'}`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <input value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="Título — ex.: Água de coco em dobro! 🥥"
          className="w-full bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-orange-500/40" />
        <textarea value={mensagem} onChange={e => setMensagem(e.target.value)} placeholder="Mensagem que o usuário vai receber…"
          className="w-full h-24 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-orange-500/40 resize-none" />
        {tipo === 'cupom' && (
          <div className="flex items-center gap-2">
            <Ticket size={16} className="text-purple-400" />
            <input value={cupom} onChange={e => setCupom(e.target.value)} placeholder="CÓDIGO DO CUPOM (ex.: PRAIA10)"
              className="flex-1 bg-slate-900/60 border border-purple-500/30 rounded-xl px-4 py-2.5 text-sm text-purple-300 outline-none font-mono uppercase" />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button onClick={enviar} disabled={enviando || !titulo.trim() || !mensagem.trim()}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-black bg-gradient-to-r from-orange-500 to-red-500 text-white disabled:opacity-40 shadow-lg shadow-orange-500/20">
            {enviando ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            ENVIAR AGORA
          </button>
          <AnimatePresence>
            {ok && <motion.span initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-green-400 text-sm font-bold">✓ Enviado! Já está no app.</motion.span>}
          </AnimatePresence>
        </div>
      </div>

      {/* Histórico */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2"><Bell size={14} /> Enviados recentemente</h2>
        <AnimatePresence mode="popLayout">
          {avisos.map(a => {
            const t = TIPOS.find(x => x.id === a.tipo) ?? TIPOS[2]
            return (
              <motion.div key={a.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
                className="glass-panel rounded-xl p-4 border-slate-800 flex items-start gap-4">
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${t.bg} ${t.cor} shrink-0`}>{t.label}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-100">{a.titulo}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{a.mensagem}</div>
                  <div className="text-[10px] text-slate-600 font-mono mt-1.5">
                    para {a.publico} · {new Date(a.created_at).toLocaleString('pt-BR')}
                    {a.cupom_codigo && <span className="text-purple-400 ml-2">cupom {a.cupom_codigo}</span>}
                  </div>
                </div>
                <button onClick={() => excluir(a.id)} className="p-2 text-slate-600 hover:text-red-400 transition-colors shrink-0"><Trash2 size={15} /></button>
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
