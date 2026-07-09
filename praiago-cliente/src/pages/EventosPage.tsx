import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { Calendar, MapPin, Clock, Ticket, Navigation, Share2, Loader2, CalendarX, ShoppingCart, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { criarCheckoutIngresso } from '../lib/eventTickets'
import { useStore, type Sessao } from '../store/useStore'
import { alertDialog } from '../lib/dialog'

type Periodo = 'manha' | 'tarde' | 'noite' | 'madrugada'

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
  ingressos_enabled?: boolean
  event_ticket_lots?: TicketLot[]
}

type TicketLot = {
  id: string
  nome: string
  preco_origem: number
  preco_venda: number
  estoque_disponivel: number | null
  status: string
  fonte_url: string | null
}

const PERIODOS: { id: Periodo | 'todos'; label: string; emoji: string }[] = [
  { id: 'todos',     label: 'Todos',     emoji: '✨' },
  { id: 'manha',     label: 'Manhã',     emoji: '🌅' },
  { id: 'tarde',     label: 'Tarde',     emoji: '☀️' },
  { id: 'noite',     label: 'Noite',     emoji: '🌙' },
  { id: 'madrugada', label: 'Madrugada', emoji: '🌌' },
]

function fmtData(d: string | null) {
  if (!d) return ''
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })
  } catch { return d }
}

function fmtMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function lotesDisponiveis(ev: Evento) {
  return [...(ev.event_ticket_lots || [])]
    .filter(l => l.status === 'disponivel')
    .sort((a, b) => Number(a.preco_venda) - Number(b.preco_venda))
}

function menorPrecoIngresso(ev: Evento) {
  const lotes = lotesDisponiveis(ev)
  return lotes.length ? Number(lotes[0].preco_venda) : Number(ev.preco || 0)
}

function abrirNoMapa(ev: Evento) {
  const q = ev.lat != null && ev.lng != null
    ? `${ev.lat},${ev.lng}`
    : encodeURIComponent(`${ev.local_nome ?? ''} ${ev.endereco ?? ''} Praia Grande SP`)
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank')
}

function linkDoEvento(ev: Evento) {
  return `${window.location.origin}/eventos?evento=${encodeURIComponent(ev.id)}`
}

async function copiarParaClipboard(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch { /* tenta o fallback abaixo */ }
  // WebView antigo/sem permissão: fallback via textarea temporário + execCommand
  try {
    const el = document.createElement('textarea')
    el.value = texto
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

// Compartilhar evento: no app instalado (Android/iOS) usa o menu nativo de
// compartilhamento do celular (@capacitor/share) — navigator.share do
// navegador não funciona dentro do WebView do Capacitor sem esse plugin, por
// isso o botão parecia "não fazer nada". Na web usa Web Share API, e por
// último cai pra copiar o link — sempre avisando o usuário do resultado.
async function compartilhar(ev: Evento) {
  return compartilharEvento(ev)
}

async function compartilharEvento(ev: Evento) {
  const dataHora = [ev.data ? fmtData(ev.data) : '', ev.hora ? `as ${ev.hora}` : ''].filter(Boolean).join(' ')
  const local = ev.local_nome ?? ev.endereco ?? 'Praia Grande'
  const url = linkDoEvento(ev)
  const texto = `${ev.titulo}\n${local}${dataHora ? ` - ${dataHora}` : ''}\nPraiaGo Eventos`
  const textoComLink = `${texto}\n${url}`

  async function copiarFallback() {
    const copiou = await copiarParaClipboard(textoComLink)
    await alertDialog(copiou
      ? { title: 'Evento copiado!', message: 'Agora e so colar no WhatsApp, Instagram ou onde quiser.', tone: 'success' }
      : { title: 'Nao deu pra copiar', message: 'Copie manualmente: ' + textoComLink, tone: 'danger' })
  }

  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (capacitor?.isNativePlatform?.()) {
    try {
      const { Share } = await import('@capacitor/share')
      await Share.share({ title: ev.titulo, text: texto, url, dialogTitle: 'Compartilhar evento' })
      return
    } catch (err) {
      if (err instanceof Error && /cancell?ed/i.test(err.message)) return
      await copiarFallback()
      return
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: ev.titulo, text: texto, url })
      return
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
    }
  }

  await copiarFallback()
}

function ComprarIngressoModal({ evento, onClose, sessao }: { evento: Evento; onClose: () => void; sessao: Sessao }) {
  const lotes = lotesDisponiveis(evento)
  const [lotId, setLotId] = useState(lotes[0]?.id || '')
  const [quantidade, setQuantidade] = useState(1)
  const [nome, setNome] = useState(sessao?.nome || '')
  const [email, setEmail] = useState(sessao?.email || '')
  const [telefone, setTelefone] = useState(sessao?.telefone || '')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')
  const lote = lotes.find(l => l.id === lotId) || lotes[0]
  const total = lote ? Number(lote.preco_venda) * quantidade : 0

  async function comprar() {
    if (!lote) return
    if (!nome.trim()) { setErro('Informe seu nome para entrega do ingresso.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErro('Informe um e-mail valido para entrega.'); return }
    setErro('')
    setLoading(true)
    try {
      const checkout = await criarCheckoutIngresso({
        ticket_lot_id: lote.id,
        quantidade,
        cliente_nome: nome.trim(),
        cliente_email: email.trim().toLowerCase(),
        cliente_telefone: telefone.trim(),
      })
      window.location.href = checkout.checkout_url
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Nao foi possivel iniciar a compra.')
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2500, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} style={{ width: '100%', maxWidth: 460, background: '#ffffff', borderRadius: '24px 24px 0 0', padding: 20, boxShadow: '0 -20px 60px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: '#0ea5e9', fontWeight: 900, textTransform: 'uppercase' }}>Ingressos PraiaGo</div>
            <h3 style={{ margin: '4px 0 0', fontSize: 20, lineHeight: 1.15, color: '#0f172a', fontWeight: 900 }}>{evento.titulo}</h3>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13, fontWeight: 600 }}>{evento.local_nome || 'Praia Grande'} {evento.data ? `· ${fmtData(evento.data)}` : ''}</p>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, border: 0, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} color="#475569" />
          </button>
        </div>

        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <label style={modalLabel}>Tipo de ingresso</label>
          <select value={lotId} onChange={e => setLotId(e.target.value)} style={modalInput}>
            {lotes.map(l => (
              <option key={l.id} value={l.id}>{l.nome} · {fmtMoney(Number(l.preco_venda))}</option>
            ))}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 112px', gap: 10 }}>
            <div>
              <label style={modalLabel}>Nome</label>
              <input value={nome} onChange={e => setNome(e.target.value)} style={modalInput} placeholder="Nome completo" />
            </div>
            <div>
              <label style={modalLabel}>Qtd</label>
              <input type="number" min={1} max={20} value={quantidade} onChange={e => setQuantidade(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} style={modalInput} />
            </div>
          </div>

          <div>
            <label style={modalLabel}>E-mail para entrega</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={modalInput} placeholder="voce@email.com" />
          </div>
          <div>
            <label style={modalLabel}>Telefone/WhatsApp</label>
            <input value={telefone} onChange={e => setTelefone(e.target.value)} style={modalInput} placeholder="(13) 99999-9999" />
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 13, fontWeight: 700 }}>
              <span>{quantidade}x {lote?.nome}</span>
              <span>{fmtMoney(total)}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>
              Valor ja inclui a margem PraiaGo. Entrega do ingresso e conferida por admin apos pagamento.
            </div>
          </div>

          {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 800 }}>{erro}</div>}

          <button disabled={loading || !lote} onClick={comprar} style={{ border: 0, borderRadius: 16, padding: '14px 16px', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: '#fff', fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <ShoppingCart size={18} />}
            Pagar no Mercado Pago
          </button>
        </div>
      </motion.div>
    </div>
  )
}

const modalLabel: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 900,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 0.4,
  marginBottom: 6,
}

const modalInput: CSSProperties = {
  width: '100%',
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  borderRadius: 12,
  padding: '11px 12px',
  color: '#0f172a',
  fontSize: 14,
  fontWeight: 700,
  outline: 'none',
}

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState<Periodo | 'todos'>('todos')
  const [comprando, setComprando] = useState<Evento | null>(null)
  const sessao = useStore(s => s.sessao)

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('eventos')
      .select('*, event_ticket_lots(id,nome,preco_origem,preco_venda,estoque_disponivel,status,fonte_url)')
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
      <AnimatePresence>
        {comprando && <ComprarIngressoModal evento={comprando} sessao={sessao} onClose={() => setComprando(null)} />}
      </AnimatePresence>

      <div style={{ padding: '20px 20px 12px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>Eventos na Praia 🎉</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>Praia Grande, SP · manhã, tarde, noite e madrugada</p>
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
                      {lotesDisponiveis(ev).length > 0 && (
                        <button onClick={() => setComprando(ev)} style={{ flex: 1, background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none', borderRadius: 12, padding: '10px 0', color: '#fff', fontSize: 13, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <ShoppingCart size={14} /> Comprar
                        </button>
                      )}
                      <button onClick={() => abrirNoMapa(ev)} style={{ flex: 1, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 12, padding: '10px 0', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Navigation size={14} /> Ver local
                      </button>
                      <button type="button" aria-label="Compartilhar evento" onClick={() => compartilhar(ev)} style={{ width: 42, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, color: '#334155', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Share2 size={15} />
                      </button>
                    </div>
                    <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, color: menorPrecoIngresso(ev) > 0 ? '#f59e0b' : '#16a34a', display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Ticket size={14} /> {menorPrecoIngresso(ev) > 0 ? `A partir de ${fmtMoney(menorPrecoIngresso(ev))}` : 'Entrada gratuita'}
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
                      <span style={{ fontSize: 12, fontWeight: 800, color: menorPrecoIngresso(ev) > 0 ? '#f59e0b' : '#16a34a', background: menorPrecoIngresso(ev) > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)', borderRadius: 20, padding: '4px 10px' }}>
                        {menorPrecoIngresso(ev) > 0 ? fmtMoney(menorPrecoIngresso(ev)) : 'Grátis'}
                      </span>
                      {lotesDisponiveis(ev).length > 0 && (
                        <button aria-label="Comprar ingresso" onClick={() => setComprando(ev)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#16a34a', borderRadius: 10, padding: '5px 8px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                          <ShoppingCart size={12} /> Comprar
                        </button>
                      )}
                      <button type="button" aria-label="Compartilhar evento" onClick={() => compartilhar(ev)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(15,23,42,0.06)', border: '1px solid rgba(15,23,42,0.08)', color: '#334155', borderRadius: 10, padding: '5px 8px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                        <Share2 size={12} /> Compartilhar
                      </button>
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
