import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Calendar, ChevronLeft, Download, Loader2, MapPin, RefreshCw, ShieldCheck, Ticket, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { canPresentTicket, parseOwnedTickets, ticketCpf, ticketDate, ticketQrPayload, ticketStatus, type OwnedTicket } from '../lib/ownedTickets'
import './owned-tickets.css'

function TicketQr({ ticket }: { ticket: OwnedTicket }) {
  const [image, setImage] = useState('')
  const [error, setError] = useState(false)
  const payload = ticketQrPayload(ticket)
  useEffect(() => {
    let disposed = false
    setImage(''); setError(false)
    void import('qrcode').then(({ toDataURL }) => toDataURL(payload, { errorCorrectionLevel: 'M', margin: 4, width: 300, color: { dark: '#000000', light: '#ffffff' } }))
      .then(url => { if (!disposed) setImage(url) })
      .catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true }
  }, [payload])
  return <div className="pg-ticket-qr" aria-busy={!image && !error}>
    {image ? <img src={image} width="300" height="300" alt="QR de entrada deste ingresso. Apresente na portaria." />
      : error ? <p role="alert">Não foi possível montar o QR. Atualize a carteira.</p> : <Loader2 className="pg-ticket-spin" aria-label="Preparando QR de entrada" />}
  </div>
}

function TicketDetails({ ticket }: { ticket: OwnedTicket }) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [showCpf, setShowCpf] = useState(false)
  const presentation = ticketStatus(ticket)
  async function exportPdf() {
    if (exporting) return
    setExporting(true); setError('')
    try {
      const { exportTicketPdf } = await import('../lib/ticketPdf')
      await exportTicketPdf(ticket)
    } catch (failure) {
      if (failure instanceof Error && failure.name === 'AbortError') return
      setError(failure instanceof Error ? failure.message : 'Não foi possível exportar o PDF. Tente novamente.')
    } finally { setExporting(false) }
  }
  return <article className="pg-ticket-detail">
    {ticket.event.imagem_url?.startsWith('https://') ? <img className="pg-ticket-cover" src={ticket.event.imagem_url} alt="" /> : null}
    <div className="pg-ticket-detail-content">
      <span className={`pg-ticket-status ${presentation.active ? 'is-active' : ''}`}><ShieldCheck size={15} /> {presentation.label}</span>
      <h3>{ticket.event.titulo}</h3>
      <p className="pg-ticket-meta"><Calendar size={16} /> {ticketDate(ticket)}</p>
      <p className="pg-ticket-meta"><MapPin size={16} /> <span>{ticket.event.local_nome || 'Local do evento'}{ticket.event.endereco ? <small>{ticket.event.endereco}</small> : null}</span></p>
      <div className="pg-ticket-lot"><strong>{ticket.lot.ordem ? `${ticket.lot.ordem}º lote · ` : ''}{ticket.lot.nome}</strong><span>{ticket.lot.grupo ? `${ticket.lot.grupo} · ` : ''}Ingresso {ticket.ordinal} de {ticket.order.quantidade || ticket.ordinal}</span></div>
      <div className="pg-ticket-identity"><strong>{ticket.order.cliente_nome || 'Titular da compra'}</strong>
        {ticketCpf(ticket.order.cliente_cpf) && <span>CPF: {showCpf ? ticketCpf(ticket.order.cliente_cpf) : '***.***.***-**'} <button type="button" className="pg-ticket-secondary" aria-pressed={showCpf} onClick={() => setShowCpf(current => !current)}>{showCpf ? 'Ocultar CPF' : 'Mostrar CPF'}</button></span>}
        <small>Nº do ingresso: PG-{ticket.id.toUpperCase()}</small>
      </div>
      {presentation.active ? <>
        <TicketQr ticket={ticket} />
        <p className="pg-ticket-warning">Entrada única. Não compartilhe o QR nem o PDF: outra pessoa pode usar seu ingresso.</p>
        <button className="pg-ticket-primary" type="button" onClick={() => void exportPdf()} disabled={exporting}>
          {exporting ? <Loader2 size={18} className="pg-ticket-spin" /> : <Download size={18} />} {exporting ? 'Preparando PDF…' : 'Exportar ingresso em PDF'}
        </button>
      </> : <div className="pg-ticket-unavailable"><ShieldCheck size={25} /><p>{presentation.detail}</p>{ticket.used_at ? <small>Entrada: {new Date(ticket.used_at).toLocaleString('pt-BR')}</small> : null}</div>}
      {error ? <p className="pg-ticket-error" role="alert">{error}</p> : null}
      <p className="pg-ticket-receipt">Pedido {ticket.order_id.toUpperCase()} · pagamento {ticket.order.payment_status === 'aprovado' ? 'confirmado' : 'em revisão'}</p>
      <p className="pg-ticket-footnote">A portaria verifica o status atualizado. Cancelamento ou reembolso invalida também PDFs já salvos.</p>
    </div>
  </article>
}

export default function OwnedTicketsWallet({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [tickets, setTickets] = useState<OwnedTicket[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  const [error, setError] = useState('')
  const [selection, setSelection] = useState<string | null>(null)
  const [tab, setTab] = useState<'ativos' | 'historico'>('ativos')
  const [updated, setUpdated] = useState<Date | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const request = useRef(0)
  const mounted = useRef(false)
  const currentUser = useRef(userId)
  currentUser.current = userId

  const refresh = useCallback(async () => {
    if (!userId) return
    const serial = ++request.current
    setLoading(true); setError('')
    try {
      const { data, error: failure } = await supabase.rpc('event_my_tickets')
      if (failure) throw new Error(failure.code === '42501' ? 'Entre novamente na sua conta para consultar os ingressos.' : 'Não foi possível atualizar seus ingressos. Confira sua conexão e tente novamente.')
      const parsed = parseOwnedTickets(data)
      if (!mounted.current || serial !== request.current || currentUser.current !== userId) return
      setTickets(parsed); setLoadedFor(userId); setUpdated(new Date())
    } catch (failure) {
      if (mounted.current && serial === request.current && currentUser.current === userId) {
        // Never keep showing a possibly revoked QR after a failed refresh.
        setTickets([])
        setError(failure instanceof Error ? failure.message : 'Não foi possível consultar a carteira.')
      }
    } finally { if (mounted.current && serial === request.current && currentUser.current === userId) setLoading(false) }
  }, [userId])

  useEffect(() => {
    mounted.current = true
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    const requestCounter = request
    document.body.style.overflow = 'hidden'
    dialog.current?.focus()
    return () => { mounted.current = false; requestCounter.current++; document.body.style.overflow = overflow; previous?.focus() }
  }, [])

  useEffect(() => {
    setTickets([]); setSelection(null); setUpdated(null); setLoadedFor(null); setError('')
    if (!userId) { setLoading(false); return }
    void refresh()
    function resume() { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    const timer = window.setInterval(resume, 30_000)
    const requestCounter = request
    return () => { requestCounter.current++; window.clearInterval(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('focus', resume) }
  }, [refresh, userId])

  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')
    if (!items?.length) { event.preventDefault(); return }
    const first = items[0], last = items[items.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus() }
  }

  // Also gate the first render after a user switch, before effects run.
  const ownTickets = loadedFor === userId ? tickets : []
  const selected = ownTickets.find(ticket => ticket.id === selection)
  const visible = ownTickets.filter(ticket => tab === 'ativos' ? canPresentTicket(ticket) : !canPresentTicket(ticket))
  return <div className="pg-ticket-backdrop">
    <div className="pg-ticket-wallet" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="pg-ticket-wallet-title" tabIndex={-1} onKeyDown={keys}>
      <header className="pg-ticket-wallet-head">
        <div><span className="pg-ticket-eyebrow">PRAIAGO EVENTOS</span><h2 id="pg-ticket-wallet-title">Meus ingressos</h2><p>Seu acesso ao evento, direto no app.</p></div>
        <button className="pg-ticket-icon-button" aria-label="Fechar meus ingressos" onClick={onClose}><X size={21} /></button>
      </header>
      {!userId ? <div className="pg-ticket-empty"><Ticket size={38} /><h3>Seus ingressos ficam na sua conta</h3><p>Entre na mesma conta usada na compra para apresentar o QR na portaria.</p><Link className="pg-ticket-primary" to="/perfil" onClick={onClose}>Acessar minha conta</Link></div> : <>
        <div className="pg-ticket-toolbar"><span>{updated ? `Atualizado às ${updated.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Consultando sua carteira'}</span><button className="pg-ticket-secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw size={16} className={loading ? 'pg-ticket-spin' : ''} /> Atualizar</button></div>
        {loading ? <div className="pg-ticket-loading" role="status"><Loader2 className="pg-ticket-spin" /><span>Conferindo seus ingressos…</span></div> : error ? <div className="pg-ticket-empty"><p className="pg-ticket-error" role="alert">{error}</p><button className="pg-ticket-primary" onClick={() => void refresh()}>Tentar novamente</button></div> : selected ? <><button className="pg-ticket-back" onClick={() => setSelection(null)}><ChevronLeft size={19} /> Todos os ingressos</button><TicketDetails key={`${selected.id}:${selected.status}`} ticket={selected} /></> : <>
          <div className="pg-ticket-tabs" aria-label="Filtrar ingressos"><button aria-pressed={tab === 'ativos'} onClick={() => setTab('ativos')}>Para entrar ({ownTickets.filter(canPresentTicket).length})</button><button aria-pressed={tab === 'historico'} onClick={() => setTab('historico')}>Histórico ({ownTickets.filter(ticket => !canPresentTicket(ticket)).length})</button></div>
          {visible.length ? <div className="pg-ticket-list">{visible.map(ticket => {
            const status = ticketStatus(ticket)
            return <button className="pg-ticket-list-item" key={ticket.id} onClick={() => setSelection(ticket.id)}>
              <div className="pg-ticket-list-icon"><Ticket size={23} /></div>
              <div><span className={`pg-ticket-status ${status.active ? 'is-active' : ''}`}>{status.label}</span><h3>{ticket.event.titulo}</h3><p>{ticketDate(ticket)}</p><small>{ticket.lot.nome} · ingresso {ticket.ordinal}</small></div>
              <ChevronLeft className="pg-ticket-forward" size={18} />
            </button>
          })}</div> : <div className="pg-ticket-empty"><Ticket size={38} /><h3>{tab === 'ativos' ? 'Nenhum ingresso para apresentar' : 'Nenhum ingresso no histórico'}</h3><p>{tab === 'ativos' ? 'Após a confirmação do pagamento, os ingressos desta conta aparecem aqui. Um PIX ainda pendente não libera entrada.' : 'Entradas utilizadas, canceladas ou em revisão aparecem nesta aba.'}</p></div>}
          <p className="pg-ticket-footnote">Não encontrou uma compra? Confira se está na mesma conta e se o pagamento foi confirmado. Use a área de ajuda no perfil para falar com o PraiaGo.</p>
        </>}
      </>}
    </div>
  </div>
}
