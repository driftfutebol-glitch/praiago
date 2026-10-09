import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { CreditCard, Loader2, ShieldCheck, ShoppingCart, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { comprarIngressoCartao, comprarIngressoPix, cotarIngresso, parcelasIngresso, type EventBillingAddress, type EventTicketQuote, type IngressoPix } from '../lib/eventTickets'
import { tokenizarCartao } from '../lib/pagamentosdk'
import { validarCpf } from '../lib/cpf'
import { mensagemRecusaCartao } from '../lib/pagamento'
import type { Sessao } from '../store/useStore'
import './event-ticket-checkout.css'
import { cardValid, installmentSummary, ticketMoney as money } from '../lib/eventTicketUi'
import { consultarPagamentoIngresso } from '../lib/eventPaymentStatus'
import type { EventTicketCheckoutError } from '../lib/eventTickets'

type Lot = { id: string; nome: string; status: string; preco_venda: number; estoque_disponivel: number | null }
type Event = { id: string; titulo: string; local_nome: string | null; event_ticket_lots?: Lot[] }
export default function EventTicketCheckout({ evento, sessao, onClose, onWallet }: { evento: Event; sessao: Sessao; onClose: () => void; onWallet: () => void }) {
  const lots = (evento.event_ticket_lots || []).filter(lot => lot.status === 'disponivel' && (lot.estoque_disponivel == null || lot.estoque_disponivel > 0))
  const [lotId, setLotId] = useState(lots[0]?.id || '')
  const [quantity, setQuantity] = useState(1)
  const [method, setMethod] = useState<'pix' | 'credito'>('pix')
  const [installments, setInstallments] = useState(1)
  const [options, setOptions] = useState<number[]>([1])
  const [quote, setQuote] = useState<EventTicketQuote | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')
  const [name, setName] = useState(sessao?.nome || '')
  const [phone, setPhone] = useState(sessao?.telefone || '')
  const [cpf, setCpf] = useState('')
  const [billingAddress, setBillingAddress] = useState<EventBillingAddress>({ zip_code: '', street: '', number: '', neighborhood: '', city: '', state: '', complement: '' })
  const [cardName, setCardName] = useState('')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [processing, setProcessing] = useState(false)
  const [pix, setPix] = useState<IngressoPix | null>(null)
  const [result, setResult] = useState<'paid' | 'pending' | 'closed' | null>(null)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [checkWarning, setCheckWarning] = useState('')
  const [copied, setCopied] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const inFlight = useRef(false)
  const clientRequestId = useRef<string | null>(null)
  if (!clientRequestId.current) clientRequestId.current = crypto.randomUUID()
  const mounted = useRef(true)
  const lot = lots.find(item => item.id === lotId)
  const userId = sessao?.id
  const maxQuantity = Math.min(20, lot?.estoque_disponivel ?? 20)
  function billingField(field: keyof EventBillingAddress, value: string) { setBillingAddress(current => ({ ...current, [field]: value })) }

  useEffect(() => {
    mounted.current = true
    const previous = document.activeElement as HTMLElement | null, overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'; dialog.current?.focus()
    return () => { mounted.current = false; document.body.style.overflow = overflow; previous?.focus() }
  }, [])

  useEffect(() => {
    if (!userId) return
    let disposed = false
    void supabase.from('profiles').select('cpf,telefone').eq('id', userId).maybeSingle().then(({ data }) => {
      if (!disposed && data) { setCpf(data.cpf || ''); setPhone(current => current || data.telefone || '') }
    })
    return () => { disposed = true }
  }, [userId])

  useEffect(() => {
    let disposed = false
    if (pix || result) { setQuote(null); return }
    setQuote(null); setError('')
    if (!userId || !lotId) return
    setQuoting(true)
    void parcelasIngresso(lotId, quantity).then(async available => {
      const chosen = method === 'pix' ? 1 : installments
      const option = available.find(item => item.installments === chosen)
      if (!option) throw new Error('Este parcelamento não está disponível. Escolha pagamento à vista.')
      // One-shot PIX/credit uses the server's preview. Only installments need
      // a persisted quote, avoiding unused quote records for every PIX view.
      const price: EventTicketQuote = chosen > 1 ? await cotarIngresso(lotId, quantity, chosen) : { quote_id: '', installments: 1, total: option.total, interest: option.interest, base: 0, platform: 0, expires_at: null, installment_floor: option.total, remainder_cents: 0 }
      if (!disposed) { setQuote(price); setOptions(available.map(item => item.installments)) }
    })
      .catch(failure => { if (!disposed) setError(failure instanceof Error ? failure.message : 'Não foi possível conferir o preço. Não houve cobrança.') })
      .finally(() => { if (!disposed) setQuoting(false) })
    return () => { disposed = true }
  }, [userId, lotId, quantity, method, installments, retry, pix, result])

  useEffect(() => {
    if (!pendingOrderId || !userId || (result !== 'pending' && !pix)) return
    let disposed = false, busy = false, attempts = 0, timer: number | undefined
    const until = Date.now() + 15 * 60_000
    async function check() {
      if (disposed || busy) return
      if (Date.now() >= until) { setCheckWarning('A confirmação está demorando. Consulte Meus ingressos antes de iniciar outra compra.'); return }
      if (document.visibilityState !== 'visible') { timer = window.setTimeout(check, 30_000); return }
      busy = true
      const state = await consultarPagamentoIngresso(pendingOrderId!, userId!)
      busy = false
      if (disposed) return
      if (state === 'approved') { setPix(null); setResult('paid'); setCheckWarning(''); setError(''); return }
      if (state === 'closed') { setPix(null); setResult('closed'); setCheckWarning(''); setError(''); return }
      setCheckWarning(state === 'unavailable' ? 'Não foi possível consultar o pagamento neste momento. Não faça outra cobrança; vamos conferir novamente.' : '')
      attempts++
      timer = window.setTimeout(check, Math.min(30_000, 5_000 + attempts * 2_000))
    }
    function resume() { if (document.visibilityState === 'visible') { window.clearTimeout(timer); void check() } }
    void check()
    document.addEventListener('visibilitychange', resume)
    return () => { disposed = true; window.clearTimeout(timer); document.removeEventListener('visibilitychange', resume) }
  }, [pendingOrderId, userId, pix, result])

  function close() { if (!inFlight.current) onClose() }
  function keys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')
    if (!items?.length) { event.preventDefault(); return }
    if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialog.current)) { event.preventDefault(); items[items.length - 1].focus() }
    else if (!event.shiftKey && (document.activeElement === items[items.length - 1] || document.activeElement === dialog.current)) { event.preventDefault(); items[0].focus() }
  }

  async function pay() {
    if (inFlight.current || !quote || !lot || !sessao) return
    if (quote.expires_at && Date.parse(quote.expires_at) <= Date.now()) { setError('A cotação expirou. Confira o preço novamente antes de pagar.'); setQuote(null); return }
    if (name.trim().length < 2) { setError('Informe seu nome completo.'); return }
    if (cpf.replace(/\D/g, '').length !== 11 || !validarCpf(cpf)) { setError('Confira seu CPF para continuar com segurança.'); return }
    const digitsPhone = phone.replace(/\D/g, '')
    if (!/^\d{10,11}$/.test(digitsPhone)) { setError('Informe um telefone com DDD (10 ou 11 números).'); return }
    if (!/^\d{8}$/.test(billingAddress.zip_code.replace(/\D/g, '')) || billingAddress.street.trim().length < 3
      || !billingAddress.number.trim() || billingAddress.neighborhood.trim().length < 2
      || billingAddress.city.trim().length < 2 || !/^[A-Za-z]{2}$/.test(billingAddress.state.trim())) {
      setError('Preencha CEP, rua, número, bairro, cidade e UF do endereço de cobrança.'); return
    }
    if (method === 'credito') { const problem = cardValid(number, expiry, cvv, cardName); if (problem) { setError(problem); return } }
    inFlight.current = true; setProcessing(true); setAttempted(true); setError('')
    try {
      const common = { client_request_id: clientRequestId.current!, ticket_lot_id: lot.id, quantidade: quantity, cliente_nome: name.trim(), cliente_telefone: digitsPhone, cpf: cpf.replace(/\D/g, ''), billing_address: { ...billingAddress, zip_code: billingAddress.zip_code.replace(/\D/g, ''), state: billingAddress.state.trim().toUpperCase() } }
      if (method === 'pix') {
        const response = await comprarIngressoPix(common)
        if (mounted.current) {
          setPendingOrderId(response.order_id)
          if (response.status === 'paid') setResult('paid')
          else if (response.status === 'refused') setResult('closed')
          else if (response.qr_code) setPix(response)
          else setResult('pending')
        }
      } else {
        // PAN/CVV go only to the gateway. Only its short-lived token is passed
        // to our Edge Function; neither card fields nor token are persisted.
        const { token } = await tokenizarCartao({ numero: number.replace(/\D/g, ''), nome: cardName, validade: expiry, cvv, cpf: common.cpf })
        setNumber(''); setExpiry(''); setCvv(''); setCardName('')
        const response = await comprarIngressoCartao({ ...common, ...(quote.quote_id ? { quote_id: quote.quote_id } : {}), metodo: 'credito', token, installments })
        if (!mounted.current) return
        setPendingOrderId(response.order_id)
        if (response.status === 'paid') setResult('paid')
        else if (response.status === 'pending') setResult('pending')
        else { setError(mensagemRecusaCartao(response.status_detail || '')); setQuote(null) }
      }
    } catch (failure) {
      if (mounted.current) {
        const existing = failure instanceof Error ? failure as EventTicketCheckoutError : null
        if (existing?.code === 'existing_pending_purchase' && existing.orderId) { setPendingOrderId(existing.orderId); setResult('pending'); setError('Você já tem uma compra deste lote aguardando confirmação. Nenhuma nova cobrança foi criada.') }
        else { setError(failure instanceof Error ? failure.message : 'Não foi possível processar o pagamento. Consulte Meus ingressos antes de tentar de novo.'); setQuote(null) }
      }
    } finally { inFlight.current = false; if (mounted.current) setProcessing(false) }
  }

  async function copyPix() {
    try { if (!pix?.qr_code) return; await navigator.clipboard.writeText(pix.qr_code); setCopied(true) }
    catch { setError('Selecione o código abaixo e copie para o app do banco.') }
  }

  return <div className="pg-event-checkout-backdrop"><div ref={dialog} className="pg-event-checkout" role="dialog" aria-modal="true" aria-labelledby="pg-event-checkout-title" tabIndex={-1} onKeyDown={keys}>
    <header><div><span>INGRESSOS PRAIAGO</span><h2 id="pg-event-checkout-title">{evento.titulo}</h2><p>{evento.local_nome || 'Evento na Baixada Santista'}</p></div><button type="button" aria-label="Fechar compra de ingresso" onClick={close} disabled={processing}><X size={20} /></button></header>
    {!sessao ? <div className="pg-event-checkout-message"><h3>Entre na sua conta para comprar</h3><p>Seus ingressos serão vinculados a esta conta e aparecerão em Meus ingressos.</p><Link to="/perfil" onClick={onClose}>Acessar minha conta</Link></div> : pix ? <div className="pg-event-checkout-fields">
      <div className="pg-event-checkout-message"><h3>PIX gerado · {money(pix.total)}</h3><p>Pague no seu banco usando este código. O QR de entrada é diferente e será liberado em Meus ingressos somente após a confirmação. Esta tela acompanha o pagamento automaticamente.</p>{pix.expires_at ? <small>Validade do PIX: {new Date(pix.expires_at).toLocaleString('pt-BR')}</small> : null}</div>
      {pix.qr_code_url?.startsWith('https://') ? <img className="pg-event-pix-qr" src={pix.qr_code_url} alt="QR do pagamento PIX; não é o ingresso" /> : null}
      <label>Código PIX copia e cola<textarea readOnly value={pix.qr_code || ''} rows={4} /></label>
      <button className="pg-event-checkout-primary" type="button" onClick={() => void copyPix()}>{copied ? 'Código copiado' : 'Copiar código PIX'}</button>
      <button className="pg-event-checkout-secondary" type="button" onClick={onWallet}>Conferir Meus ingressos</button>
    </div> : result ? <div className="pg-event-checkout-message"><ShieldCheck size={38} /><h3>{result === 'paid' ? 'Pagamento aprovado' : result === 'closed' ? 'Tentativa encerrada' : 'Pagamento em análise'}</h3><p>{result === 'paid' ? 'Consulte Meus ingressos para apresentar seu QR na portaria.' : result === 'closed' ? 'Esta tentativa foi encerrada, cancelada ou reembolsada. Confira o histórico antes de iniciar uma nova compra.' : 'O QR será liberado somente após a confirmação. Esta tela confere o pagamento automaticamente. Não faça outra compra enquanto este pagamento está em análise.'}</p><button className="pg-event-checkout-primary" type="button" onClick={onWallet}>Abrir Meus ingressos</button></div> : <form className="pg-event-checkout-fields" onSubmit={event => { event.preventDefault(); void pay() }}>
      <fieldset disabled={processing}>
        <label>Tipo de ingresso<select disabled={attempted} value={lotId} onChange={event => { setLotId(event.target.value); setQuantity(1); setInstallments(1) }}>{lots.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        <div className="pg-event-checkout-columns"><label>Nome completo<input value={name} maxLength={100} onChange={event => setName(event.target.value)} autoComplete="name" /></label><label>Quantidade<input disabled={attempted} type="number" min={1} max={maxQuantity} value={quantity} onChange={event => { setQuantity(Math.max(1, Math.min(maxQuantity, Math.trunc(Number(event.target.value)) || 1))); setInstallments(1) }} /></label></div>
        <label>CPF do comprador<input inputMode="numeric" autoComplete="off" value={cpf} maxLength={14} onChange={event => setCpf(event.target.value.replace(/[^\d.-]/g, ''))} /></label>
        <label>Telefone com DDD<input inputMode="tel" autoComplete="tel" value={phone} maxLength={20} onChange={event => setPhone(event.target.value)} /></label>
        <div className="pg-event-billing"><h3>Endereço de cobrança</h3><p>Exigido pelo Pagar.me para validar o pagamento. Não é o endereço do evento.</p>
          <div className="pg-event-billing-columns"><label>CEP<input inputMode="numeric" autoComplete="postal-code" value={billingAddress.zip_code} maxLength={9} onChange={event => billingField('zip_code', event.target.value.replace(/[^\d-]/g, ''))} /></label><label>UF<input autoComplete="address-level1" value={billingAddress.state} maxLength={2} onChange={event => billingField('state', event.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} /></label></div>
          <label>Rua ou avenida<input autoComplete="address-line1" value={billingAddress.street} maxLength={120} onChange={event => billingField('street', event.target.value)} /></label>
          <div className="pg-event-billing-columns"><label>Número<input value={billingAddress.number} maxLength={20} onChange={event => billingField('number', event.target.value)} /></label><label>Bairro<input value={billingAddress.neighborhood} maxLength={80} onChange={event => billingField('neighborhood', event.target.value)} /></label></div>
          <div className="pg-event-billing-columns"><label>Cidade<input autoComplete="address-level2" value={billingAddress.city} maxLength={64} onChange={event => billingField('city', event.target.value)} /></label><label>Complemento (opcional)<input autoComplete="address-line2" value={billingAddress.complement} maxLength={128} onChange={event => billingField('complement', event.target.value)} /></label></div>
        </div>
        <p className="pg-event-checkout-account">Conta da compra: {sessao.email}. O ingresso fica disponível somente nesta conta.</p>
        <div className="pg-event-checkout-methods"><button type="button" disabled={attempted} aria-pressed={method === 'pix'} onClick={() => { setMethod('pix'); setInstallments(1) }}>PIX</button><button type="button" disabled={attempted} aria-pressed={method === 'credito'} onClick={() => setMethod('credito')}><CreditCard size={15} /> Crédito</button><button type="button" disabled>Débito</button></div>
        <p className="pg-event-checkout-note">Débito online está em ativação de segurança com o provedor. Use PIX ou crédito enquanto isso.</p>
        {method === 'credito' ? <div className="pg-event-card-fields"><label>Nome no cartão<input value={cardName} maxLength={100} autoComplete="cc-name" onChange={event => setCardName(event.target.value)} /></label><label>Número do cartão<input inputMode="numeric" autoComplete="cc-number" value={number} maxLength={23} onChange={event => setNumber(event.target.value.replace(/[^\d ]/g, ''))} /></label><div className="pg-event-checkout-columns"><label>Validade (MM/AA)<input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" maxLength={5} value={expiry} onChange={event => { const digits = event.target.value.replace(/\D/g, '').slice(0, 4); setExpiry(digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits) }} /></label><label>CVV<input type="password" inputMode="numeric" autoComplete="cc-csc" maxLength={4} value={cvv} onChange={event => setCvv(event.target.value.replace(/\D/g, ''))} /></label></div><label>Parcelas<select disabled={attempted} value={installments} onChange={event => setInstallments(Number(event.target.value))}>{options.map(item => <option key={item} value={item}>{item === 1 ? 'À vista (1x), sem juros' : `${item} parcelas - confira os juros abaixo`}</option>)}</select></label><p className="pg-event-checkout-note">As tarifas das parcelas são definidas pelo Pagar.me. O total mostrado antes de pagar é a cotação do PraiaGo com as condições vigentes; não há taxa adicional oculta.</p><p className="pg-event-checkout-note">Ao pagar, o cartão tokenizado é registrado com segurança no Pagar.me para gerar esta cobrança. O PraiaGo não armazena número ou CVV.</p></div> : null}
      </fieldset>
      <div className="pg-event-checkout-total" aria-live="polite">{quoting ? <p><Loader2 className="pg-ticket-spin" size={17} /> Conferindo preço e disponibilidade…</p> : quote ? <><div><span>{quantity} ingresso(s)</span><strong>{money(quote.total - quote.interest)}</strong></div><div><span>Juros do parcelamento</span><strong>{money(quote.interest)}</strong></div><div className="is-total"><span>Total a pagar</span><strong>{money(quote.total)}</strong></div><p>{installmentSummary(quote)}</p></> : <p>Confira a cotação antes de confirmar. Nenhuma cobrança é feita sem sua confirmação.</p>}</div>
      {error ? <p className="pg-event-checkout-error" role="alert">{error}</p> : null}
      {!quote && !quoting ? <button className="pg-event-checkout-secondary" type="button" onClick={() => setRetry(current => current + 1)}>Conferir preço novamente</button> : null}
      {attempted ? <p className="pg-event-checkout-note">Esta tentativa mantém o mesmo identificador para impedir cobrança duplicada. Se o resultado ficar incerto, consulte seus ingressos antes de iniciar outra compra.</p> : null}
      <button className="pg-event-checkout-primary" type="submit" disabled={processing || quoting || !quote || !lot}>{processing ? <Loader2 className="pg-ticket-spin" size={18} /> : <ShoppingCart size={18} />} {processing ? 'Processando com segurança…' : quote ? `Pagar ${money(quote.total)}` : 'Aguardando cotação'}</button>
      <p className="pg-event-checkout-note">Cartão enviado diretamente ao provedor para tokenização. Não armazenamos o número nem o CVV.</p>
    </form>}
    {error && (pix || result) ? <p className="pg-event-checkout-error" role="alert">{error}</p> : null}
    {checkWarning && (pix || result === 'pending') ? <p className="pg-event-checkout-note" role="status" style={{ marginTop: 13 }}>{checkWarning}</p> : null}
  </div></div>
}
