import { useState, useEffect, useCallback, lazy, Suspense, type CSSProperties } from 'react'
import { Calendar, MapPin, Navigation, Share2, Loader2, CalendarX, ShoppingCart, Ticket } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'
import { alertDialog } from '../lib/dialog'
import { CIDADES_ATENDIDAS, estaNaAreaAtendida } from '../lib/serviceArea'

const OwnedTicketsWallet = lazy(() => import('../components/OwnedTicketsWallet'))
const EventTicketCheckout = lazy(() => import('../components/EventTicketCheckout'))

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
  preco_situacao?: 'a_confirmar' | 'gratuito' | 'pago'
  fonte_url?: string | null
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

const CIDADES = [...CIDADES_ATENDIDAS]

function normalizarLocal(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function eventoNaAreaAtendida(evento: Evento) {
  if (evento.lat != null && evento.lng != null) return estaNaAreaAtendida(evento.lat, evento.lng)
  const local = normalizarLocal(`${evento.titulo} ${evento.local_nome ?? ''} ${evento.endereco ?? ''}`)
  return local.includes('santos')
    || local.includes('sao vicente')
    || local.includes('praia grande')
    || local.includes('rocket sea club')
    || local.includes('rocket beach club')
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
    .filter(l => l.status === 'disponivel' && (l.estoque_disponivel == null || l.estoque_disponivel > 0))
    .sort((a, b) => Number(a.preco_venda) - Number(b.preco_venda))
}

function menorPrecoIngresso(ev: Evento) {
  const lotes = lotesDisponiveis(ev)
  return lotes.length ? Number(lotes[0].preco_venda) : Number(ev.preco || 0)
}

function abrirNoMapa(ev: Evento) {
  const q = ev.lat != null && ev.lng != null
    ? `${ev.lat},${ev.lng}`
    : encodeURIComponent(`${ev.local_nome ?? ''} ${ev.endereco ?? ''} SP`)
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

export default function EventosPage() {
  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [erroLista, setErroLista] = useState(false)
  const [filtro, setFiltro] = useState<Periodo | 'todos'>('todos')
  const [comprando, setComprando] = useState<Evento | null>(null)
  const [carteiraAberta, setCarteiraAberta] = useState(false)
  const sessao = useStore(s => s.sessao)

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('eventos')
      .select('*, event_ticket_lots(id,nome,preco_origem,preco_venda,preco_venda_credito,estoque_disponivel,status,fonte_url)')
      .eq('status', 'ativo')
      .order('data', { ascending: true, nullsFirst: false })
    setErroLista(Boolean(error))
    if (!error) setEventos(((data as Evento[]) ?? []).filter(eventoNaAreaAtendida))
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
    <div className="pg-events" style={{ minHeight: '100%', background: 'var(--pg-sand)', paddingBottom: 28 }}>
      <AnimatePresence>
        {comprando ? <Suspense fallback={<div role="status" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'var(--pg-surface)', display: 'grid', placeItems: 'center' }}>Abrindo compra de ingresso…</div>}><EventTicketCheckout key={sessao?.id || 'anon'} evento={comprando} sessao={sessao} onClose={() => setComprando(null)} onWallet={() => { setComprando(null); setCarteiraAberta(true) }} /></Suspense> : null}
      </AnimatePresence>
      {carteiraAberta ? <Suspense fallback={<div role="status" style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'var(--pg-surface)', display: 'grid', placeItems: 'center' }}>Abrindo seus ingressos…</div>}><OwnedTicketsWallet userId={sessao?.id || null} onClose={() => setCarteiraAberta(false)} /></Suspense> : null}

      {/* Cabeçalho com a cena de praia atrás, igual ao da Home — é o que
          amarra as duas telas como sendo do mesmo app. */}
      <header style={{ position: 'relative', overflow: 'hidden', padding: '24px 20px', margin: '12px 16px 20px', border: '1px solid var(--pg-line)', borderRadius: 24, background: 'var(--pg-surface)' }}>
        <img src="/images/home-beach-v2.webp" alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', opacity: 0.62, pointerEvents: 'none' }} />
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, var(--pg-surface) 0%, rgba(var(--pg-surface-rgb), 0.94) 44%, rgba(var(--pg-surface-rgb), 0.18) 100%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span className="pg-eyebrow">ALÉM DA AREIA</span>
          <h1 style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 850, color: 'var(--pg-ink)', letterSpacing: -.8, lineHeight: 1.1, maxWidth: '90%' }}>
            Viva a
            <br />
            Baixada Santista.
          </h1>
          <p style={{ margin: '7px 0 0', maxWidth: '76%', fontSize: 12.5, color: 'var(--pg-muted)', fontWeight: 700, lineHeight: 1.45 }}>
            {CIDADES.join(' · ')}
          </p>
        </div>
      </header>

      <button type="button" onClick={() => setCarteiraAberta(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, width: 'calc(100% - 40px)', margin: '0 20px 20px', padding: '16px 17px', border: '1px solid var(--pg-line)', borderRadius: 18, background: 'var(--pg-surface)', color: 'var(--pg-ink)', textAlign: 'left' }}>
        <Ticket size={25} color="var(--pg-ocean-dark)" /><span style={{ flex: 1 }}><strong style={{ display: 'block', fontSize: 15 }}>Meus ingressos</strong><span style={{ display: 'block', marginTop: 4, color: 'var(--pg-muted)', fontSize: 12 }}>Confira seus QRs de entrada e o histórico.</span></span><span aria-hidden="true" style={{ color: 'var(--pg-ocean-dark)', fontSize: 22 }}>›</span>
      </button>

      {/* Filtros por período */}
      <div style={{ padding: '0 20px 18px', display: 'flex', gap: 8, overflowX: 'auto' }} className="hide-scrollbar">
        {PERIODOS.map(p => {
          const sel = filtro === p.id
          return (
            <button key={p.id} onClick={() => setFiltro(p.id)} className="pg-chip" aria-pressed={sel}>{p.emoji} {p.label}</button>
          )
        })}
      </div>

      {erroLista && <div role="status" className="pg-catalog-error"><div>Não foi possível atualizar os eventos. Confira sua conexão.</div><button onClick={() => void carregar()}>Tentar de novo</button></div>}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={30} color="var(--pg-success)" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : lista.length === 0 && !erroLista ? (
        <div style={{ textAlign: 'center', padding: '64px 32px', color: 'var(--pg-muted)' }}>
          <div style={{ width: 72, height: 72, borderRadius: 24, background: 'var(--pg-surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <CalendarX size={32} color="var(--pg-muted)" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--pg-ink)' }}>Nenhum evento {filtro !== 'todos' ? `de ${PERIODOS.find(p => p.id === filtro)?.label.toLowerCase()}` : ''} por enquanto</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Novos eventos aparecem aqui automaticamente.</div>
        </div>
      ) : (
        <>
          <div style={{ padding: '0 20px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: 19, fontWeight: 950, color: 'var(--pg-ink)', margin: 0, letterSpacing: 0 }}>Próximos eventos</h2>
              <span style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--pg-success)' }}>{lista.length} {lista.length === 1 ? 'evento' : 'eventos'}</span>
            </div>

            {/* Um layout de cartão só. Antes destaque e "outros" tinham
                desenhos diferentes (carrossel horizontal vs. linha compacta),
                o que fazia a mesma informação aparecer de dois jeitos na mesma
                tela. Agora muda só o selo EM DESTAQUE. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AnimatePresence>
                {[...destaques, ...outros].map(ev => {
                  const preco = menorPrecoIngresso(ev)
                  const temIngresso = ev.ingressos_enabled === true && lotesDisponiveis(ev).length > 0
                  return (
                    <motion.article
                      className="pg-event-card"
                      key={ev.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      style={{
                        display: 'flex',
                        background: 'var(--pg-surface)',
                        border: '1px solid var(--pg-line)',
                        borderRadius: 20,
                        overflow: 'hidden',
                        boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -18px rgba(15,23,42,0.28)',
                      }}
                    >
                      {/* Capa: usa a imagem do evento quando existe; senão um
                          azulejo com o emoji — nada de foto genérica. */}
                      <div className="pg-event-cover" style={{ position: 'relative', flexShrink: 0, background: 'linear-gradient(150deg,var(--pg-brand-soft),var(--pg-success-bg))' }}>
                        {ev.imagem_url ? (
                          <img
                            src={ev.imagem_url}
                            loading="lazy"
                            decoding="async"
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
                            color: 'var(--pg-success)', background: 'var(--pg-success-bg)',
                            boxShadow: 'var(--pg-shadow)',
                          }}>
                            EM DESTAQUE
                          </span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0, padding: '13px 14px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <h3 style={{ flex: 1, minWidth: 0, margin: 0, fontSize: 17, fontWeight: 950, color: 'var(--pg-ink)', letterSpacing: 0, lineHeight: 1.2 }}>
                            {ev.titulo}
                          </h3>
                          <span style={{
                            flexShrink: 0, padding: '4px 9px', borderRadius: 999,
                            fontSize: 11.5, fontWeight: 900,
                            color: ev.preco_situacao === 'a_confirmar' || !ev.preco_situacao ? 'var(--pg-muted)' : preco > 0 ? 'var(--pg-success)' : 'var(--pg-ocean-dark)',
                            background: ev.preco_situacao === 'a_confirmar' || !ev.preco_situacao ? 'var(--pg-surface-alt)' : preco > 0 ? 'var(--pg-success-bg)' : 'var(--pg-brand-soft)',
                          }}>
                            {preco > 0 ? fmtMoney(preco) : ev.preco_situacao === 'gratuito' ? 'Grátis' : ev.preco_situacao === 'pago' ? 'Pago · confira valor' : 'Preço a confirmar'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 7 }}>
                          <MapPin size={13} color="var(--pg-success)" strokeWidth={2.5} />
                          <span style={{ fontSize: 12.5, color: 'var(--pg-muted)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.local_nome ?? 'Baixada Santista'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <Calendar size={13} color="var(--pg-success)" strokeWidth={2.5} />
                          <span style={{ fontSize: 12.5, color: 'var(--pg-muted)', fontWeight: 700 }}>
                            {fmtData(ev.data)}{ev.hora ? ` · ${ev.hora.slice(0, 5)}` : ''}
                          </span>
                        </div>
                        {ev.categoria && (
                          <div style={{ fontSize: 12, color: 'var(--pg-faint)', fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {ev.categoria}
                          </div>
                        )}

                        {temIngresso && (
                          <button
                            onClick={() => setComprando(ev)}
                            style={{
                              width: '100%', marginTop: 11, padding: '11px 0', border: 'none', borderRadius: 13,
                              background: 'var(--pg-action)', color: 'var(--pg-action-ink)',
                              fontSize: 14, fontWeight: 900, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                              boxShadow: 'var(--pg-shadow)',
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
                            <Share2 size={14} strokeWidth={2.4} color="var(--pg-muted)" /> Compartilhar
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirNoMapa(ev)}
                            style={{ ...ACAO_SECUNDARIA, color: 'var(--pg-ocean-dark)' }}
                          >
                            <Navigation size={14} strokeWidth={2.4} color="var(--pg-ocean-dark)" /> Local
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
  border: '1px solid var(--pg-line)',
  background: 'var(--pg-surface)',
  color: 'var(--pg-muted)',
  fontSize: 12.5,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
}
