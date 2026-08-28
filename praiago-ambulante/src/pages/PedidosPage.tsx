import { useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  AlertTriangle,
  Banknote,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  MapPin,
  MessageCircle,
  Navigation,
  PackageCheck,
  Phone,
  QrCode,
  Radio,
  RouteOff,
  ShoppingBag,
  ShoppingCart,
  Timer,
  UserRound,
  X,
} from 'lucide-react'
import { Circle, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import { AnimatePresence, motion } from 'framer-motion'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useRoute } from '../hooks/useRoute'
import { useOrderNotifications, type IncomingOrder } from '../hooks/useOrderNotifications'
import { useLocalizacaoCliente } from '../hooks/useLocalizacaoCliente'
import ChatPedidoModal from '../components/ChatPedidoModal'
import { criarMonitorSentido, type SentidoStatus } from '../lib/trafego'
import { getSessao } from '../lib/auth'
import { alertDialog, promptDialog } from '../lib/dialog'
import { PRAIA_GRANDE_CENTER } from '../lib/praiagoZones'
import { supabase } from '../lib/supabase'
import { clampNumber, parseCoordinate, sanitizePhone, sanitizeText } from '../lib/validation'
import { MAPA_TILES, MAPA_ATRIBUICAO, MAPA_ZOOM_MAX } from '../lib/mapa'

type Status = 'novo' | 'preparando' | 'saiu_entrega' | 'entregue'

type Pedido = {
  id: string
  cliente: string
  clienteTelefone: string
  itens: string[]
  total: number
  status: Status
  hora: string
  clienteLat: number | null
  clienteLng: number | null
  pagamento: string
  zona: string
  reta: string
  barraca: string
  isLive?: boolean
}

const tabs = ['Todos', 'Novos', 'Preparando', 'Em rota', 'Entregues'] as const
type Tab = typeof tabs[number]

const statusConfig: Record<Status, { label: string; color: string; background: string; icon: typeof Clock3 }> = {
  novo: { label: 'Novo', color: '#9a6700', background: '#fff6d8', icon: Clock3 },
  preparando: { label: 'Preparando', color: '#007fa6', background: '#eaf6fa', icon: Timer },
  saiu_entrega: { label: 'Em rota', color: '#b54708', background: '#fff4e5', icon: Navigation },
  entregue: { label: 'Entregue', color: '#148447', background: '#eaf8ef', icon: CheckCircle2 },
}

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function shortOrderId(id: string) {
  return `#${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`
}

function rowToPedido(row: Record<string, unknown>): Pedido {
  const rawStatus = sanitizeText(row.status, 24) || 'novo'
  const status = ['novo', 'preparando', 'saiu_entrega', 'entregue'].includes(rawStatus)
    ? rawStatus as Status
    : 'novo'
  const createdAt = new Date(String(row.created_at || Date.now()))

  return {
    id: sanitizeText(row.id, 64),
    cliente: sanitizeText(row.cliente_nome, 60) || 'Cliente PraiaGo',
    clienteTelefone: sanitizePhone(row.cliente_telefone),
    itens: Array.isArray(row.itens)
      ? row.itens.slice(0, 30).map(item => sanitizeText(item, 80)).filter(Boolean)
      : [],
    total: clampNumber(row.total, 0, 100_000, 0),
    status,
    hora: Number.isNaN(createdAt.getTime())
      ? ''
      : createdAt.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
    clienteLat: parseCoordinate(row.lat, -90, 90),
    clienteLng: parseCoordinate(row.lng, -180, 180),
    pagamento: sanitizeText(row.pagamento, 20) || 'pix',
    zona: sanitizeText(row.zona, 60),
    reta: sanitizeText(row.reta, 30),
    barraca: sanitizeText(row.barraca, 60),
  }
}

function liveToPedido(order: IncomingOrder): Pedido {
  return {
    id: order.id,
    cliente: order.clienteNome,
    clienteTelefone: order.clienteTel,
    itens: order.itens,
    total: order.total,
    status: 'novo',
    hora: 'Agora',
    clienteLat: order.clienteLat,
    clienteLng: order.clienteLng,
    pagamento: order.pagamento,
    zona: order.zona,
    reta: order.reta,
    barraca: order.barraca,
    isLive: true,
  }
}

function meetingPoint(order: Pedido) {
  const parts = [
    order.reta ? `Reta ${order.reta}` : '',
    order.barraca ? `Barraca ${order.barraca}` : '',
  ].filter(Boolean)
  return parts.join(' · ') || order.zona || 'Ponto de encontro não informado'
}

function paymentLabel(payment: string) {
  const normalized = payment.toLowerCase()
  if (normalized === 'pix') return 'PIX'
  if (normalized.includes('credito')) return 'Crédito'
  if (normalized.includes('debito')) return 'Débito'
  if (normalized === 'cartao') return 'Cartão'
  if (normalized === 'dinheiro') return 'Dinheiro'
  return payment
}

function PaymentIcon({ payment, size = 15 }: { payment: string; size?: number }) {
  const normalized = payment.toLowerCase()
  if (normalized === 'pix') return <QrCode size={size} />
  if (normalized === 'dinheiro') return <Banknote size={size} />
  return <CreditCard size={size} />
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return phone
}

function makeMapIcon(markup: string, className: string) {
  return L.divIcon({
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    html: `<div class="${className}">${markup}</div>`,
  })
}

const customerIcon = makeMapIcon(renderToStaticMarkup(<UserRound size={21} strokeWidth={2.6} />), 'map-customer-marker')
const sellerIcon = makeMapIcon(renderToStaticMarkup(<ShoppingCart size={21} strokeWidth={2.6} />), 'map-user-marker')

function FitBounds({ from, to }: { from: [number, number]; to: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(L.latLngBounds([from, to]), { padding: [48, 48], animate: true })
  }, [from, map, to])
  return null
}

function LocationModal({ order, onClose }: { order: Pedido; onClose: () => void }) {
  const [myPosition, setMyPosition] = useState<[number, number] | null>(null)
  const [gpsUnavailable, setGpsUnavailable] = useState(false)
  const watchId = useRef<number | null>(null)
  const directionMonitor = useRef(criarMonitorSentido())
  const [direction, setDirection] = useState<SentidoStatus>('indefinido')

  // Onde o cliente estava quando pediu. Na praia isso envelhece rapido.
  const pontoDoPedido = order.clienteLat !== null && order.clienteLng !== null
    ? [order.clienteLat, order.clienteLng] as [number, number]
    : null

  // Onde o cliente esta AGORA, se ele ligou o compartilhamento no app dele.
  // Quando existe, manda: e a diferenca entre achar a pessoa e procurar por
  // toda a faixa de areia.
  const { posicao: clienteAoVivo, ativo: clienteAoVivoAtivo } = useLocalizacaoCliente(order.id)

  const customerPosition: [number, number] | null = clienteAoVivo
    ? [clienteAoVivo.lat, clienteAoVivo.lng]
    : pontoDoPedido

  const route = useRoute(myPosition, customerPosition)

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsUnavailable(true)
      return
    }
    watchId.current = navigator.geolocation.watchPosition(
      position => {
        setMyPosition([position.coords.latitude, position.coords.longitude])
        setGpsUnavailable(false)
      },
      () => setGpsUnavailable(true),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    )
    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [])

  useEffect(() => {
    if (!myPosition) return
    setDirection(directionMonitor.current.atualizar(route?.coords, myPosition))
  }, [myPosition, route?.coords])

  const mapCenter = customerPosition || myPosition || PRAIA_GRANDE_CENTER
  const canNavigate = customerPosition !== null

  function openNavigation() {
    if (!customerPosition) return
    const url = `https://www.google.com/maps/dir/?api=1&destination=${customerPosition[0]},${customerPosition[1]}&travelmode=walking`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', background: '#f4f7fa' }}>
      <header style={{ minHeight: 68, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 15px', borderBottom: '1px solid #dfe6ed', background: '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#132238', fontSize: 15, fontWeight: 900 }}>{shortOrderId(order.id)}</span>
            {clienteAoVivoAtivo && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999, background: '#eaf8ef', border: '1px solid #a7dfbd', color: '#148447', fontSize: 10, fontWeight: 900, letterSpacing: 0.4 }}>
                <Radio size={11} /> AO VIVO
              </span>
            )}
          </div>
          <div style={{ marginTop: 3, overflow: 'hidden', color: '#617089', fontSize: 12, fontWeight: 650, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meetingPoint(order)}</div>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar mapa"><X size={19} /></button>
      </header>

      <div style={{ flex: 1, minHeight: 280, position: 'relative' }}>
        {canNavigate ? (
          <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
              attribution={MAPA_ATRIBUICAO} url={MAPA_TILES} maxZoom={MAPA_ZOOM_MAX} />
            {myPosition && customerPosition && <FitBounds from={myPosition} to={customerPosition} />}
            {myPosition && <Marker position={myPosition} icon={sellerIcon}><Popup>Sua posição</Popup></Marker>}
            {customerPosition && (
              <Marker position={customerPosition} icon={customerIcon}>
                <Popup>{clienteAoVivoAtivo ? 'Cliente agora (ao vivo)' : 'Ponto indicado pelo cliente'}</Popup>
              </Marker>
            )}
            {/* Circulo do erro de GPS do cliente: mostra que o ponto e uma
                area, nao um alfinete. Evita o ambulante jurar que o cliente
                nao esta ali quando ele esta 20 m ao lado. */}
            {clienteAoVivo && clienteAoVivo.precisao > 0 && (
              <Circle
                center={[clienteAoVivo.lat, clienteAoVivo.lng]}
                radius={Math.min(clienteAoVivo.precisao, 120)}
                pathOptions={{ color: '#148447', fillColor: '#148447', fillOpacity: 0.12, weight: 1 }}
              />
            )}
            {myPosition && customerPosition && (
              <Polyline
                positions={route?.coords?.length ? route.coords : [myPosition, customerPosition]}
                pathOptions={{ color: '#148447', weight: route ? 5 : 3, dashArray: route ? undefined : '8 8', opacity: 0.82 }}
              />
            )}
          </MapContainer>
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
            <div>
              <MapPin size={36} color="#8793a5" style={{ margin: '0 auto 12px' }} />
              <div style={{ color: '#132238', fontSize: 15, fontWeight: 900 }}>Localização não enviada</div>
              <p style={{ maxWidth: 280, margin: '6px auto 0', color: '#617089', fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>Use a reta e a barraca informadas no pedido para encontrar o cliente.</p>
            </div>
          </div>
        )}

        {direction === 'contramao' && (
          <div style={{ position: 'absolute', zIndex: 1000, top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: '#fff0f2', border: '1px solid #f0b6bd', color: '#b42335', fontSize: 12, fontWeight: 850 }}>
            <AlertTriangle size={18} />
            Confira o sentido antes de continuar.
          </div>
        )}
        {direction === 'fora_da_rota' && (
          <div style={{ position: 'absolute', zIndex: 1000, top: 12, left: 12, right: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: '#fff4e5', border: '1px solid #f4d39f', color: '#b54708', fontSize: 12, fontWeight: 850 }}>
            <RouteOff size={18} />
            Fora da rota. O trajeto será recalculado.
          </div>
        )}

        {route && (
          <div className="surface" style={{ position: 'absolute', zIndex: 1000, left: 12, bottom: 12, display: 'flex', gap: 14, padding: '10px 12px', boxShadow: '0 8px 20px rgba(23,45,74,0.14)' }}>
            <div><div style={{ color: '#132238', fontSize: 15, fontWeight: 900 }}>{route.distancia}</div><div style={{ color: '#718096', fontSize: 10, fontWeight: 700 }}>distância</div></div>
            <div><div style={{ color: '#132238', fontSize: 15, fontWeight: 900 }}>{route.tempo}</div><div style={{ color: '#718096', fontSize: 10, fontWeight: 700 }}>estimativa</div></div>
          </div>
        )}
      </div>

      <footer style={{ padding: 14, borderTop: '1px solid #dfe6ed', background: '#fff' }}>
        {gpsUnavailable && canNavigate && <div style={{ marginBottom: 9, color: '#b54708', fontSize: 11, fontWeight: 700 }}>Seu GPS não está disponível; a localização do cliente continua visível.</div>}
        {canNavigate && (
          clienteAoVivoAtivo
            ? <div style={{ marginBottom: 9, color: '#148447', fontSize: 11, fontWeight: 750 }}>Posição do cliente ao vivo, atualizada agora (±{clienteAoVivo?.precisao} m).</div>
            : <div style={{ marginBottom: 9, color: '#617089', fontSize: 11, fontWeight: 700 }}>Ponto do momento do pedido. Peça ao cliente para ligar a localização em tempo real no app dele.</div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {order.clienteTelefone && (
            <a href={`tel:${order.clienteTelefone.replace(/\D/g, '')}`} className="secondary-button" style={{ flex: 1, color: '#132238', textDecoration: 'none' }}>
              <Phone size={17} />
              Ligar
            </a>
          )}
          <button type="button" className="primary-button" disabled={!canNavigate} onClick={openNavigation} style={{ flex: 2 }}>
            <Navigation size={18} />
            Abrir navegação
          </button>
        </div>
      </footer>
    </motion.div>
  )
}

export default function PedidosPage() {
  const sessao = getSessao()
  const [tab, setTab] = useState<Tab>('Todos')
  const [orders, setOrders] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [locationOrder, setLocationOrder] = useState<Pedido | null>(null)
  const [chatOrder, setChatOrder] = useState<Pedido | null>(null)
  const { orders: liveOrders, latestOrder, dismissLatest } = useOrderNotifications()

  useEffect(() => {
    if (!sessao?.id) return
    let active = true
    const load = async () => {
      const { data } = await supabase
        .from('pedidos')
        .select('id,cliente_nome,cliente_telefone,itens,total,status,created_at,lat,lng,pagamento,zona,reta,barraca')
        .eq('vendedor_id', sessao.id)
        .not('status', 'in', '(aguardando_pagamento,cancelado,pagamento_recusado)')
        .order('created_at', { ascending: false })
        .limit(60)
      if (!active) return
      setOrders((data || []).map(row => rowToPedido(row as Record<string, unknown>)))
      setLoading(false)
    }

    void load()
    const channel = supabase
      .channel(`pedidos_page_${sessao.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${sessao.id}` }, load)
      .subscribe()
    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [sessao?.id])

  useEffect(() => {
    const newest = liveOrders[0]
    if (!newest) return
    const liveOrder = liveToPedido(newest)
    setOrders(current => current.some(order => order.id === liveOrder.id) ? current : [liveOrder, ...current])
  }, [liveOrders])

  const filteredOrders = useMemo(() => orders.filter(order => {
    if (tab === 'Novos') return order.status === 'novo'
    if (tab === 'Preparando') return order.status === 'preparando'
    if (tab === 'Em rota') return order.status === 'saiu_entrega'
    if (tab === 'Entregues') return order.status === 'entregue'
    return true
  }), [orders, tab])

  const newCount = orders.filter(order => order.status === 'novo').length

  async function advance(order: Pedido) {
    if (!sessao?.id || order.status === 'entregue') return
    const nextStatus: Status = order.status === 'novo'
      ? 'preparando'
      : order.status === 'preparando'
        ? 'saiu_entrega'
        : 'entregue'

    if (nextStatus === 'entregue') {
      const code = await promptDialog({
        title: 'Código de entrega',
        message: 'Peça ao cliente o código de 6 dígitos mostrado no app.',
        placeholder: '000000',
      })
      if (code === null) return
      if (!/^\d{6}$/.test(code.trim())) {
        await alertDialog({ title: 'Código inválido', message: 'Digite os 6 números mostrados pelo cliente.', tone: 'danger' })
        return
      }
      const { data, error } = await supabase.rpc('confirmar_entrega_pedido', {
        p_pedido_id: order.id,
        p_codigo: code.trim(),
      })
      const result = data as { ok?: boolean; message?: string } | null
      if (error || !result?.ok) {
        await alertDialog({ title: 'Entrega não confirmada', message: error?.message || result?.message || 'Confira o código e tente novamente.', tone: 'danger' })
        return
      }
      setOrders(current => current.map(item => item.id === order.id ? { ...item, status: 'entregue' } : item))
      return
    }

    setOrders(current => current.map(item => item.id === order.id ? { ...item, status: nextStatus } : item))
    const { error } = await supabase
      .from('pedidos')
      .update({ status: nextStatus })
      .eq('id', order.id)
      .eq('vendedor_id', sessao.id)
    if (error) {
      setOrders(current => current.map(item => item.id === order.id ? { ...item, status: order.status } : item))
      await alertDialog({ title: 'Não foi possível atualizar', message: 'Tente novamente.', tone: 'danger' })
    }
  }

  return (
    <div className="page-shell">
      <AnimatePresence>
        {locationOrder && <LocationModal order={locationOrder} onClose={() => setLocationOrder(null)} />}
        {chatOrder && (
          <ChatPedidoModal
            key={chatOrder.id}
            pedidoId={chatOrder.id}
            clienteNome={chatOrder.cliente}
            onClose={() => setChatOrder(null)}
          />
        )}
      </AnimatePresence>

      <div className="page-heading">
        <div>
          <h1>Pedidos</h1>
          <p>Acompanhe cada atendimento em tempo real.</p>
        </div>
        {newCount > 0 && <span className="status-pill" style={{ color: '#9a6700', background: '#fff6d8' }}>{newCount} {newCount === 1 ? 'novo' : 'novos'}</span>}
      </div>

      <AnimatePresence>
        {latestOrder && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="surface" style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12, padding: 12, borderColor: '#b9e0ed', background: '#f2fbfd', boxShadow: 'none' }}>
            <div style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', flex: '0 0 40px', borderRadius: 8, background: '#e4f5fa', color: '#008fc0' }}><Bell size={19} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#132238', fontSize: 13, fontWeight: 900 }}>Novo pedido recebido</div>
              <div style={{ marginTop: 2, overflow: 'hidden', color: '#617089', fontSize: 11, fontWeight: 650, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{latestOrder.clienteNome} · {money(latestOrder.total)}</div>
            </div>
            <button type="button" className="text-command" onClick={() => { setTab('Novos'); dismissLatest() }}>Ver</button>
            <button type="button" className="icon-button" style={{ width: 34, height: 34, flexBasis: 34 }} onClick={dismissLatest} aria-label="Fechar aviso"><X size={16} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <div role="tablist" aria-label="Filtrar pedidos" style={{ display: 'flex', gap: 7, marginBottom: 14, overflowX: 'auto' }} className="hide-scrollbar">
        {tabs.map(item => (
          <button
            type="button"
            role="tab"
            aria-selected={tab === item}
            key={item}
            onClick={() => setTab(item)}
            style={{ minHeight: 38, flex: '0 0 auto', padding: '0 13px', border: `1px solid ${tab === item ? '#79bfd4' : '#dfe6ed'}`, borderRadius: 999, background: tab === item ? '#eaf6fa' : '#fff', color: tab === item ? '#007fa6' : '#617089', fontSize: 11, fontWeight: 850, cursor: 'pointer' }}
          >
            {item}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="surface shimmer" style={{ height: 180 }} />
      ) : filteredOrders.length === 0 ? (
        <div className="surface" style={{ padding: '34px 20px', textAlign: 'center', boxShadow: 'none' }}>
          <ShoppingBag size={34} color="#8793a5" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: '#132238', fontSize: 15, fontWeight: 900 }}>Nenhum pedido nesta etapa</div>
          <p style={{ margin: '6px 0 0', color: '#617089', fontSize: 12, fontWeight: 600 }}>Os pedidos confirmados aparecerão aqui.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredOrders.map(order => {
            const config = statusConfig[order.status]
            const StatusIcon = config.icon
            const hasLocation = order.clienteLat !== null && order.clienteLng !== null
            const nextLabel = order.status === 'novo'
              ? 'Aceitar pedido'
              : order.status === 'preparando'
                ? 'Iniciar entrega'
                : 'Confirmar entrega'

            return (
              <motion.article layout key={order.id} className="surface" style={{ padding: 14, boxShadow: 'none', borderLeft: order.status === 'novo' ? '4px solid #e2ae22' : '1px solid #dfe6ed' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0, color: '#132238', fontSize: 15, fontWeight: 900 }}>{shortOrderId(order.id)}</h2>
                      <span className="status-pill" style={{ minHeight: 24, color: config.color, background: config.background }}><StatusIcon size={12} />{config.label}</span>
                      {order.isLive && <span style={{ color: '#007fa6', fontSize: 9, fontWeight: 850 }}>Agora</span>}
                    </div>
                    <div style={{ marginTop: 5, color: '#617089', fontSize: 11, fontWeight: 650 }}>{order.hora}</div>
                  </div>
                  <div style={{ color: '#148447', fontSize: 16, fontWeight: 900 }}>{money(order.total)}</div>
                </div>

                <div style={{ display: 'grid', gap: 8, marginTop: 13 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#40506a', fontSize: 12, fontWeight: 700 }}><UserRound size={16} color="#718096" />{order.cliente}</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, color: '#40506a', fontSize: 12, lineHeight: 1.4, fontWeight: 700 }}><MapPin size={16} color="#718096" style={{ flexShrink: 0 }} />{meetingPoint(order)}</div>
                  {order.clienteTelefone && (
                    <a href={`tel:${order.clienteTelefone.replace(/\D/g, '')}`} style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#007fa6', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}><Phone size={16} />{formatPhone(order.clienteTelefone)}</a>
                  )}
                </div>

                <div style={{ marginTop: 12, padding: 11, borderRadius: 8, background: '#f6f8fb' }}>
                  {order.itens.length ? order.itens.map((item, index) => (
                    <div key={`${order.id}-${index}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, paddingTop: index ? 6 : 0, color: '#40506a', fontSize: 12, lineHeight: 1.4, fontWeight: 650 }}>
                      <PackageCheck size={14} color="#8793a5" style={{ marginTop: 1, flexShrink: 0 }} />
                      {item}
                    </div>
                  )) : <div style={{ color: '#718096', fontSize: 12, fontWeight: 650 }}>Itens não informados</div>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, color: '#617089', fontSize: 11, fontWeight: 750 }}>
                  <PaymentIcon payment={order.pagamento} />
                  {paymentLabel(order.pagamento)}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 13, paddingTop: 11, borderTop: '1px solid #e7ecf1' }}>
                  <button type="button" className="secondary-button" disabled={!hasLocation} onClick={() => setLocationOrder(order)} style={{ minHeight: 40, width: 46, padding: 0 }} aria-label={hasLocation ? 'Abrir localização do pedido' : 'Pedido sem coordenadas'}>
                    <MapPin size={17} />
                  </button>
                  {/* Conversa com o cliente. Pedido ao vivo (broadcast) ainda
                      nao esta no banco, e sem linha em `pedidos` a conversa nao
                      tem onde existir — por isso so depois que ele chega. */}
                  {!order.isLive && (
                    <button type="button" className="secondary-button" onClick={() => setChatOrder(order)} style={{ minHeight: 40, width: 46, padding: 0 }} aria-label={`Conversar com ${order.cliente}`}>
                      <MessageCircle size={17} />
                    </button>
                  )}
                  {order.status !== 'entregue' && (
                    <button type="button" className="primary-button" onClick={() => void advance(order)} style={{ minHeight: 40, flex: 1 }}>
                      {nextLabel}
                      <ChevronRight size={17} />
                    </button>
                  )}
                </div>
              </motion.article>
            )
          })}
        </div>
      )}
    </div>
  )
}
