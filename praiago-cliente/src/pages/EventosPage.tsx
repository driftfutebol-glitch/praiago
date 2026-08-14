import { useState, useEffect, useCallback, type CSSProperties } from 'react'
import { Calendar, MapPin, Navigation, Share2, Loader2, CalendarX, ShoppingCart, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { comprarIngressoPix, type IngressoPix } from '../lib/eventTickets'
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
  preco_venda_credito: number
  estoque_disponivel: number | null
  status: string
  fonte_url: string | null
}

/** Cidades atendidas hoje. Só rótulo de cabeçalho — não filtra nada. */
const CIDADES = ['Santos', 'São Vicente', 'Praia Grande', 'Guarujá', 'Cubatão']

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
  const [metodo, setMetodo] = useState<'pix' | 'credito'>('pix')
  const [pix, setPix] = useState<IngressoPix | null>(null)
  const [copiado, setCopiado] = useState(false)
  const lote = lotes.find(l => l.id === lotId) || lotes[0]
  // O credito ja vem com o preco maior do banco; o cliente ve so o total.
  const precoUnit = lote ? Number(metodo === 'credito' ? lote.preco_venda_credito : lote.preco_venda) : 0
  const total = precoUnit * quantidade

  async function comprar() {
    if (!lote) return
    if (!nome.trim()) { setErro('Informe seu nome para entrega do ingresso.'); return }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErro('Informe um e-mail valido para entrega.'); return }
    if (metodo === 'credito') { setErro('Pagamento com cartao chega em breve. Use o PIX por enquanto.'); return }
    setErro('')
    setLoading(true)
    try {
      const cobranca = await comprarIngressoPix({
        ticket_lot_id: lote.id,
        quantidade,
        cliente_nome: nome.trim(),
        cliente_telefone: telefone.trim(),
      })
      setPix(cobranca)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Nao foi possivel iniciar a compra.')
    } finally {
      setLoading(false)
    }
  }

  async function copiarPix() {
    if (!pix) return
    try {
      await navigator.clipboard.writeText(pix.qr_code)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setErro('Nao foi possivel copiar. Selecione o codigo e copie na mao.')
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

        {pix ? (
          <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#15803d' }}>PIX gerado · {fmtMoney(pix.total)}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#166534', lineHeight: 1.4 }}>
                Pague no app do seu banco. Assim que cair, o ingresso vai pro seu e-mail.
              </div>
            </div>
            {pix.qr_code_url && (
              <img src={pix.qr_code_url} alt="QR Code do PIX" style={{ width: 200, height: 200, alignSelf: 'center', borderRadius: 12 }} />
            )}
            <div>
              <label style={modalLabel}>Codigo copia e cola</label>
              <div style={{ ...modalInput, fontSize: 11, wordBreak: 'break-all', height: 'auto', minHeight: 64, padding: 10, color: '#334155' }}>
                {pix.qr_code}
              </div>
            </div>
            {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 800 }}>{erro}</div>}
            <button onClick={copiarPix} style={{ border: 0, borderRadius: 16, padding: '14px 16px', background: copiado ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: '#fff', fontSize: 15, fontWeight: 900 }}>
              {copiado ? 'Codigo copiado!' : 'Copiar codigo PIX'}
            </button>
          </div>
        ) : (
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <label style={modalLabel}>Tipo de ingresso</label>
          <select value={lotId} onChange={e => setLotId(e.target.value)} style={modalInput}>
            {lotes.map(l => (
              <option key={l.id} value={l.id}>{l.nome} · {fmtMoney(Number(metodo === 'credito' ? l.preco_venda_credito : l.preco_venda))}</option>
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

          <div>
            <label style={modalLabel}>Forma de pagamento</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {(['pix', 'credito'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMetodo(m)}
                  style={{
                    border: metodo === m ? '2px solid #0ea5e9' : '1px solid #e2e8f0',
                    background: metodo === m ? '#f0f9ff' : '#fff',
                    borderRadius: 14, padding: '11px 10px', fontSize: 13, fontWeight: 900,
                    color: metodo === m ? '#0369a1' : '#64748b',
                  }}
                >
                  {m === 'pix' ? 'PIX' : 'Cartao de credito'}
                </button>
              ))}
            </div>
          </div>

          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: 13, fontWeight: 700 }}>
              <span>{quantidade}x {lote?.nome}</span>
              <span>{fmtMoney(total)}</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#94a3b8', lineHeight: 1.35 }}>
              Entrega do ingresso e conferida por admin apos o pagamento.
            </div>
          </div>

          {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 800 }}>{erro}</div>}

          <button disabled={loading || !lote} onClick={comprar} style={{ border: 0, borderRadius: 16, padding: '14px 16px', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: '#fff', fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: loading ? 0.6 : 1 }}>
            {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <ShoppingCart size={18} />}
            Comprar ingresso
          </button>
        </div>
        )}
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
      .select('*, event_ticket_lots(id,nome,preco_origem,preco_venda,preco_venda_credito,estoque_disponivel,status,fonte_url)')
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

      {/* Cabeçalho com a cena de praia atrás, igual ao da Home — é o que
          amarra as duas telas como sendo do mesmo app. */}
      <header style={{ position: 'relative', overflow: 'hidden', padding: '20px 20px 14px', background: '#fff' }}>
        <img src="/images/home-beach-v2.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: 0.62, pointerEvents: 'none' }} />
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.94) 44%, rgba(255,255,255,0.18) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 27, fontWeight: 950, color: '#0f172a', letterSpacing: 0, lineHeight: 1.1, maxWidth: '78%' }}>
            Eventos na
            <br />
            Baixada Santista 🎉
          </h1>
          <p style={{ margin: '7px 0 0', maxWidth: '76%', fontSize: 12.5, color: '#64748b', fontWeight: 700, lineHeight: 1.45 }}>
            {CIDADES.join(' · ')}
          </p>
        </div>
      </header>

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
          <div style={{ padding: '0 20px 90px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 19, fontWeight: 950, color: '#0f172a', margin: 0, letterSpacing: 0 }}>Próximos eventos</h2>
              <span style={{ fontSize: 12.5, fontWeight: 900, color: '#16a34a' }}>{lista.length} {lista.length === 1 ? 'evento' : 'eventos'}</span>
            </div>

            {/* Um layout de cartão só. Antes destaque e "outros" tinham
                desenhos diferentes (carrossel horizontal vs. linha compacta),
                o que fazia a mesma informação aparecer de dois jeitos na mesma
                tela. Agora muda só o selo EM DESTAQUE. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AnimatePresence>
                {[...destaques, ...outros].map(ev => {
                  const preco = menorPrecoIngresso(ev)
                  const temIngresso = lotesDisponiveis(ev).length > 0
                  return (
                    <motion.article
                      key={ev.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{
                        display: 'flex',
                        background: '#ffffff',
                        border: '1px solid #eef2f7',
                        borderRadius: 20,
                        overflow: 'hidden',
                        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -18px rgba(15,23,42,0.28)',
                      }}
                    >
                      {/* Capa: usa a imagem do evento quando existe; senão um
                          azulejo com o emoji — nada de foto genérica. */}
                      <div style={{ position: 'relative', width: 124, flexShrink: 0, background: 'linear-gradient(150deg,#e0f2fe,#dcfce7)' }}>
                        {ev.imagem_url ? (
                          <img
                            src={ev.imagem_url}
                            alt=""
                            aria-hidden
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        ) : (
                          <div style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: 40 }}>{ev.emoji ?? '🎉'}</div>
                        )}
                        {ev.destaque && (
                          <span style={{
                            position: 'absolute', top: 8, left: 8,
                            padding: '3px 8px', borderRadius: 999,
                            fontSize: 8.5, fontWeight: 900, letterSpacing: 0.4,
                            color: '#fff', background: '#16a34a',
                            boxShadow: '0 3px 8px rgba(22,163,74,0.5)',
                          }}>
                            EM DESTAQUE
                          </span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0, padding: '13px 14px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <h3 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 17, fontWeight: 950, color: '#0f172a', letterSpacing: 0, lineHeight: 1.2 }}>
                            {ev.titulo}
                          </h3>
                          <span style={{
                            flexShrink: 0, padding: '4px 9px', borderRadius: 999,
                            fontSize: 11.5, fontWeight: 900,
                            color: preco > 0 ? '#15803d' : '#0369a1',
                            background: preco > 0 ? '#dcfce7' : '#e0f2fe',
                          }}>
                            {preco > 0 ? fmtMoney(preco) : 'Grátis'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
                          <MapPin size={13} color="#16a34a" strokeWidth={2.5} />
                          <span style={{ fontSize: 12.5, color: '#475569', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.local_nome ?? 'Baixada Santista'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <Calendar size={13} color="#16a34a" strokeWidth={2.5} />
                          <span style={{ fontSize: 12.5, color: '#475569', fontWeight: 700 }}>
                            {fmtData(ev.data)}{ev.hora ? ` · ${ev.hora.slice(0, 5)}` : ''}
                          </span>
                        </div>
                        {ev.categoria && (
                          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.categoria}
                          </div>
                        )}

                        {temIngresso && (
                          <button
                            onClick={() => setComprando(ev)}
                            style={{
                              width: '100%', marginTop: 11, padding: '11px 0', border: 'none', borderRadius: 13,
                              background: 'linear-gradient(100deg,#16a34a,#22c55e)', color: '#fff',
                              fontSize: 14, fontWeight: 900, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                              boxShadow: '0 10px 22px -12px rgba(22,163,74,0.95)',
                            }}
                          >
                            <ShoppingCart size={16} strokeWidth={2.5} /> Comprar
                          </button>
                        )}

                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                          <button
                            type="button"
                            onClick={() => compartilhar(ev)}
                            style={ACAO_SECUNDARIA}
                          >
                            <Share2 size={14} strokeWidth={2.4} color="#64748b" /> Compartilhar
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirNoMapa(ev)}
                            style={{ ...ACAO_SECUNDARIA, color: '#0284c7' }}
                          >
                            <Navigation size={14} strokeWidth={2.4} color="#0284c7" /> Local
                          </button>
                        </div>
                      </div>
                    </motion.article>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

const ACAO_SECUNDARIA: CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '9px 0',
  borderRadius: 12,
  border: '1px solid #e8eef5',
  background: '#ffffff',
  color: '#64748b',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
}
