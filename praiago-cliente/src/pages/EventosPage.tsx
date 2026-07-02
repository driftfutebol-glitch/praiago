import { useState, useEffect, useCallback } from 'react'
import { Calendar, MapPin, Clock, Ticket, Navigation, Share2, Loader2, CalendarX } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'

type Periodo = 'manha' | 'tarde' | 'noite'

type Evento = {
  id: string
  titulo: string
  descricao: string | null
  periodo: Periodo
  data: string | null
  hora: string | null
  local_nome: string | null
  endereco: string | null
  lat: number | null
  lng: number | null
  preco: number
  categoria: string | null
  emoji: string | null
  imagem_url: string | null
  destaque: boolean
  status: string
}

const PERIODOS: { id: Periodo | 'todos'; label: string; emoji: string }[] = [
  { id: 'todos', label: 'Todos',  emoji: '✨' },
  { id: 'manha', label: 'Manhã',  emoji: '🌅' },
  { id: 'tarde', label: 'Tarde',  emoji: '☀️' },
  { id: 'noite', label: 'Noite',  emoji: '🌙' },
]

function fmtData(d: string | null) {
  if (!d) return ''
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return d }
}

function abrirNoMapa(ev: Evento) {
  const q = ev.lat != null && ev.lng != null
    ? `${ev.lat},${ev.lng}`
    : encodeURIComponent(`${ev.local_nome ?? ''} ${ev.endereco ?? ''} Praia Grande SP`)
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank')
}

async function compartilhar(ev: Evento) {
  const texto = `${ev.emoji ?? '🎉'} ${ev.titulo} — ${ev.local_nome ?? 'Praia Grande'} ${ev.data ? `· ${fmtData(ev.data)}` : ''} ${ev.hora ? `às ${ev.hora}` : ''}`
  const url = ev.lat != null && ev.lng != null ? `https://www.google.com/maps/search/?api=1&query=${ev.lat},${ev.lng}` : ''
  try {
    if (navigator.share) await navigator.share({ title: ev.titulo, text: texto, url })
    else { await navigator.clipboard.writeText(`${texto} ${url}`); alert('Link do evento copiado!') }
  } catch { /* cancelado */ }
}

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Periodo | 'todos'>('todos')

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('eventos')
      .select('*')
      .eq('status', 'ativo')
      .order('data', { ascending: true, nullsFirst: false })
    setEventos((data as Evento[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    carregar()
    const ch = supabase.channel('cliente_eventos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eventos' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  const lista = filtro === 'todos' ? eventos : eventos.filter(e => e.periodo === filtro)
  const destaques = lista.filter(e => e.destaque)
  const outros = lista.filter(e => !e.destaque)

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', paddingBottom: 100 }}>
      <div style={{ padding: '20px 20px 12px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>Eventos na Praia 🎉</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>Praia Grande, SP · o que rola de manhã, à tarde e à noite</p>
      </div>

      {/* Filtros por período */}
      <div style={{ padding: '0 20px 18px', display: 'flex', gap: 8, overflowX: 'auto' }} className="hide-scrollbar">
        {PERIODOS.map(p => {
          const sel = filtro === p.id
          return (
            <button key={p.id} onClick={() => setFiltro(p.id)} style={{
              background: sel ? 'linear-gradient(135deg, #0ea5e9, #22c55e)' : 'rgba(0,0,0,0.05)',
              border: `1px solid ${sel ? 'transparent' : 'rgba(0,0,0,0.08)'}`,
              borderRadius: 20, padding: '8px 16px', color: sel ? '#fff' : '#94a3b8',
              fontSize: 13, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
              boxShadow: sel ? '0 4px 15px rgba(34,197,94,0.3)' : 'none',
            }}>{p.emoji} {p.label}</button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={30} color="#22c55e" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : lista.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 32px', color: '#64748b' }}>
          <div style={{ width: 72, height: 72, borderRadius: 24, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CalendarX size={32} color="#475569" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#334155' }}>Nenhum evento {filtro !== 'todos' ? `de ${PERIODOS.find(p => p.id === filtro)?.label.toLowerCase()}` : ''} por enquanto</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Novos eventos aparecem aqui automaticamente.</div>
        </div>
      ) : (
        <>
          {destaques.length > 0 && (
            <div style={{ padding: '0 20px 22px' }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>★ Em destaque</h2>
              <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 4 }} className="hide-scrollbar">
                {destaques.map(ev => (
                  <motion.div key={ev.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={{
                    background: 'linear-gradient(135deg, #f8fafc, #ffffff)', border: '1px solid #e2e8f0',
                    borderRadius: 22, padding: 20, minWidth: 250, flexShrink: 0,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ fontSize: 38, marginBottom: 12 }}>{ev.emoji ?? '🎉'}</div>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase' }}>
                        {PERIODOS.find(p => p.id === ev.periodo)?.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>{ev.titulo}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <MapPin size={12} color="#64748b" /><span style={{ fontSize: 12, color: '#64748b' }}>{ev.local_nome ?? 'Praia Grande'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                      <Calendar size={12} color="#64748b" /><span style={{ fontSize: 12, color: '#64748b' }}>{fmtData(ev.data)}{ev.hora ? ` · ${ev.hora}` : ''}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => abrirNoMapa(ev)} style={{ flex: 1, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 12, padding: '10px 0', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Navigation size={14} /> Ver local
                      </button>
                      <button aria-label="Compartilhar" onClick={() => compartilhar(ev)} style={{ width: 42, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Share2 size={15} />
                      </button>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, color: ev.preco > 0 ? '#fbbf24' : '#4ade80', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Ticket size={14} /> {ev.preco > 0 ? `R$ ${ev.preco.toFixed(2).replace('.', ',')}` : 'Entrada gratuita'}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '0 20px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 14 }}>Próximos eventos</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <AnimatePresence>
                {outros.map(ev => (
                  <motion.div key={ev.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{
                    background: '#f8fafc', borderRadius: 18, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #e2e8f0',
                  }}>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>{ev.emoji ?? '🎉'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{ev.titulo}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        <Clock size={11} color="#64748b" /><span style={{ fontSize: 12, color: '#64748b' }}>{fmtData(ev.data)}{ev.hora ? ` · ${ev.hora}` : ''}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        <MapPin size={11} color="#64748b" /><span style={{ fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.local_nome ?? 'Praia Grande'}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 800, color: ev.preco > 0 ? '#fbbf24' : '#4ade80', background: ev.preco > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.1)', borderRadius: 20, padding: '4px 10px' }}>
                        {ev.preco > 0 ? `R$ ${ev.preco}` : 'Grátis'}
                      </span>
                      <button aria-label="Ver no mapa" onClick={() => abrirNoMapa(ev)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#38bdf8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        <Navigation size={12} /> Local
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
