import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, ShoppingBag, MapPin, X, WifiOff, Star, Check, Zap, Send, Heart, Shield, Navigation, Umbrella } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useRoute } from '../hooks/useRoute'
import { useGPS } from '../hooks/useGPS'
import { broadcastOrder } from '../hooks/useOrderBroadcast'
import { getVendedor, VENDEDORES, type Vendedor } from '../lib/catalogo'
import { useStore, type Entrega } from '../store/useStore'
import { channel, TOPICS } from '../lib/realtime'

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function makeIcon(html: string) {
  return L.divIcon({ className: '', html, iconSize: [44, 44], iconAnchor: [22, 22] })
}
const vendorIcon = makeIcon(`<div style="width:44px;height:44px;border-radius:15px;background:linear-gradient(135deg,#0ea5e9,#22c55e);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 8px 20px rgba(14,165,233,0.4);font-size:22px">🥥</div>`)
const clienteIcon = makeIcon(`<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#f43f5e,#fb7185);display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 8px 20px rgba(244,63,94,0.4);font-size:22px">📍</div>`)

type GPSMsg = { lat: number; lng: number; accuracy: number; ts: number }

function calcDist(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const dLat = (b[0] - a[0]) * Math.PI / 180
  const dLng = (b[1] - a[1]) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function RecenterMap({ a, b }: { a: [number, number]; b: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(L.latLngBounds([a, b]), { padding: [80, 80], animate: true })
  }, [a[0], a[1], b[0], b[1]])
  return null
}

/* ─── CHAT ──────────────────────────────────────────────── */
function ChatModal({ vendedor, onClose }: { vendedor: Vendedor; onClose: () => void }) {
  const [msgs, setMsgs] = useState([
    { de: 'vendedor', texto: `Oi! Aqui é o ${vendedor.nome} 🌊 Já estou preparando seu pedido!` },
  ])
  const [texto, setTexto] = useState('')
  function enviar() {
    const t = texto.trim()
    if (!t) return
    setMsgs(m => [...m, { de: 'cliente', texto: t }])
    setTexto('')
    setTimeout(() => setMsgs(m => [...m, { de: 'vendedor', texto: 'Combinado! Tô chegando 👍' }]), 900)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ width: '100%', background: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, height: '70vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 20px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: vendedor.gradiente, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{vendedor.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{vendedor.nome}</div>
            <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>● Online agora</div>
          </div>
          <button aria-label="Fechar chat" onClick={onClose} style={{ background: '#f8fafc', border: 'none', borderRadius: 12, padding: 8, cursor: 'pointer' }}><X size={20} color="#64748b" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ alignSelf: m.de === 'cliente' ? 'flex-end' : 'flex-start', maxWidth: '75%', background: m.de === 'cliente' ? 'linear-gradient(135deg,#0ea5e9,#22c55e)' : '#f1f5f9', color: m.de === 'cliente' ? '#fff' : '#0f172a', padding: '10px 14px', borderRadius: 16, fontSize: 14, lineHeight: 1.4 }}>
              {m.texto}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '14px 16px', borderTop: '1px solid #f1f5f9' }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Escreva uma mensagem…" aria-label="Mensagem" style={{ flex: 1, border: '1.5px solid #e2e8f0', borderRadius: 14, padding: '12px 16px', fontSize: 14, outline: 'none' }} />
          <button aria-label="Enviar" onClick={enviar} style={{ width: 48, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', border: 'none', borderRadius: 14, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={18} /></button>
        </div>
      </div>
    </div>
  )
}

/* ─── RASTREAMENTO (privacidade: sem mapa até atrasar) ───── */
function RastreamentoModal({ vendedor, clientePos, entrega, onClose }: { vendedor: Vendedor; clientePos: [number, number]; entrega: Entrega | null; onClose: () => void }) {
  const [pos, setPos] = useState<[number, number]>(vendedor.pos)
  const [accuracy, setAccuracy] = useState(999)
  const [isRealGPS, setIsRealGPS] = useState(false)
  const [status, setStatus] = useState<'preparando' | 'a_caminho' | 'chegou'>('preparando')
  const [segundos, setSegundos] = useState(0)
  const [atrasado, setAtrasado] = useState(false)   // só revela o trajeto quando atrasa
  const [chatOpen, setChatOpen] = useState(false)
  const route = useRoute(pos, clientePos)

  useEffect(() => {
    const timer = setInterval(() => setSegundos(s => s + 1), 1000)
    const chans = [channel<GPSMsg>(TOPICS.ambulanteGPS), channel<GPSMsg>(TOPICS.entregadorGPS)]
    const unsubs = chans.map(ch => ch.subscribe((d) => {
      if (!d || typeof d.lat !== 'number' || typeof d.lng !== 'number' ||
          d.lat < -90 || d.lat > 90 || d.lng < -180 || d.lng > 180) return
      const acc = typeof d.accuracy === 'number' && d.accuracy >= 0 ? d.accuracy : 999
      setPos([d.lat, d.lng]); setAccuracy(acc); setIsRealGPS(true)
      setStatus(prev => prev === 'preparando' ? 'a_caminho' : prev)
    }))
    return () => { clearInterval(timer); unsubs.forEach(u => u()); chans.forEach(c => c.close()) }
  }, [])

  // Simula o ambulante saindo (demo) + detecta chegada
  useEffect(() => {
    if (segundos === 5) setStatus(prev => prev === 'preparando' ? 'a_caminho' : prev)
  }, [segundos])

  useEffect(() => {
    if (calcDist(pos, clientePos) < 35 && status !== 'chegou') setStatus('chegou')
  }, [pos])

  const distRaw = calcDist(pos, clientePos)
  const distLabel = route?.distancia ?? (distRaw < 1000 ? `${Math.round(distRaw)}m` : `${(distRaw / 1000).toFixed(1)}km`)
  const etaMin = route ? Math.max(1, parseInt(route.tempo, 10) || 1) : Math.max(1, Math.ceil(distRaw / 80))
  const tempoLabel = route?.tempo ?? `${etaMin} min`
  const elapsed = `${Math.floor(segundos / 60).toString().padStart(2, '0')}:${(segundos % 60).toString().padStart(2, '0')}`

  // "Atraso": passou do tempo estimado (+1 min de tolerância) e ainda não chegou
  const limiteSeg = (etaMin + 1) * 60
  useEffect(() => {
    if (segundos > limiteSeg && status !== 'chegou') setAtrasado(true)
  }, [segundos, limiteSeg, status])

  const statusColors = {
    preparando: { bg: '#fef3c7', text: '#d97706', label: 'PREPARANDO' },
    a_caminho: { bg: '#dbeafe', text: '#2563eb', label: 'A CAMINHO' },
    chegou: { bg: '#dcfce7', text: '#16a34a', label: 'CHEGOU! 🎉' },
  }
  const sc = statusColors[status]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#fff', display: 'flex', flexDirection: 'column', animation: 'slideUp 0.4s cubic-bezier(0,0,0.2,1)' }}>
      {chatOpen && <ChatModal vendedor={vendedor} onClose={() => setChatOpen(false)} />}
      <div style={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 1000, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button aria-label="Voltar" onClick={onClose} style={{ width: 44, height: 44, background: '#fff', border: 'none', borderRadius: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', cursor: 'pointer' }}>
          <X size={20} color="#0f172a" />
        </button>
        {atrasado && (
          <div style={{ background: '#0f172a', color: '#fff', padding: '10px 18px', borderRadius: 22, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }}>
            {isRealGPS ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', animation: 'gpsPulse 1.2s infinite' }} /> : <WifiOff size={14} color="#f97316" />}
            {isRealGPS ? 'Trajeto ao vivo' : 'Buscando trajeto…'}
          </div>
        )}
        <div style={{ background: sc.bg, color: sc.text, padding: '10px 16px', borderRadius: 22, fontSize: 12, fontWeight: 800 }}>{sc.label}</div>
      </div>

      {/* Área superior: MAPA só quando atrasado; senão painel de privacidade */}
      <div style={{ flex: 1, position: 'relative' }}>
        {atrasado ? (
          <MapContainer center={pos} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer attribution='&copy; CARTO &copy; OSM' url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            <RecenterMap a={pos} b={clientePos} />
            <Marker position={pos} icon={vendorIcon} />
            <Marker position={clientePos} icon={clienteIcon} />
            {isRealGPS && <Circle center={pos} radius={accuracy} pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.1, weight: 1 }} />}
            {route
              ? <Polyline positions={route.coords} pathOptions={{ color: '#0ea5e9', weight: 6, opacity: 0.85, lineCap: 'round' }} />
              : <Polyline positions={[pos, clientePos]} pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '8 6', opacity: 0.45 }} />}
          </MapContainer>
        ) : (
          <div style={{ height: '100%', background: 'linear-gradient(160deg,#0ea5e9,#22c55e)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', padding: '0 32px' }}>
            <div style={{ fontSize: 64, marginBottom: 12 }}>{status === 'chegou' ? '🎉' : status === 'a_caminho' ? '🛵' : '👨‍🍳'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: '7px 16px', marginBottom: 14 }}>
              <Shield size={15} /> <span style={{ fontSize: 12, fontWeight: 700 }}>Mapa oculto para sua privacidade</span>
            </div>
            <div style={{ fontSize: 14, opacity: 0.92, lineHeight: 1.5, maxWidth: 300 }}>
              Você não precisa ficar olhando o mapa. Avisaremos quando o pedido chegar — e se houver atraso, o trajeto aparece aqui automaticamente.
            </div>
          </div>
        )}
      </div>

      {/* Bottom sheet */}
      <div style={{ background: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: '24px 24px 30px', boxShadow: '0 -12px 40px rgba(0,0,0,0.1)', position: 'relative', marginTop: -28, zIndex: 5 }}>
        <div style={{ width: 40, height: 5, background: '#e2e8f0', borderRadius: 10, margin: '-10px auto 20px' }} />

        {atrasado && status !== 'chegou' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 16, padding: '12px 14px', marginBottom: 18 }}>
            <span style={{ fontSize: 20 }}>⏳</span>
            <div style={{ fontSize: 12.5, color: '#9a3412', fontWeight: 600, lineHeight: 1.4 }}>
              Está demorando um pouco — liberamos o trajeto do ambulante pra você acompanhar.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0ea5e9', letterSpacing: 0.5, marginBottom: 4 }}>
              {status === 'preparando' ? 'PEDIDO CONFIRMADO' : status === 'a_caminho' ? 'A CAMINHO DE VOCÊ' : 'PEDIDO ENTREGUE!'}
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>
              {status === 'preparando' ? 'Preparando seu pedido…' : status === 'a_caminho' ? 'Chegando em breve!' : 'Aproveite! 🌊'}
            </h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a' }}>{status === 'chegou' ? '🎉' : tempoLabel}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{status === 'chegou' ? 'Entregue!' : (atrasado ? distLabel : 'tempo estimado')}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>⏱ {elapsed}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {(['preparando', 'a_caminho', 'chegou'] as const).map((s, i) => {
            const active = status === 'preparando' ? i === 0 : status === 'a_caminho' ? i <= 1 : true
            return <div key={s} style={{ flex: 1, height: 6, borderRadius: 10, background: active ? '#0ea5e9' : '#f1f5f9', transition: 'background 0.6s ease' }} />
          })}
        </div>

        {/* Onde entregar */}
        {entrega && (entrega.reta || entrega.barraca) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', borderRadius: 16, padding: '12px 14px', marginBottom: 14, border: '1px solid #f1f5f9' }}>
            <Umbrella size={18} color="#0ea5e9" />
            <div style={{ flex: 1, fontSize: 13, color: '#334155' }}>
              {entrega.reta && <b>Reta {entrega.reta}</b>}{entrega.reta && entrega.barraca ? ' · ' : ''}{entrega.barraca && <>Barraca {entrega.barraca}</>}
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {entrega.modo === 'tempo_real' ? '🛰️ Compartilhando localização em tempo real' : '📍 Localização fixa pela reta'}
              </div>
            </div>
          </div>
        )}

        {/* Botão revelar trajeto (só se ainda não revelou) */}
        {!atrasado && status !== 'chegou' && (
          <button onClick={() => setAtrasado(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#f1f5f9', border: 'none', borderRadius: 16, padding: '13px', color: '#0f172a', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>
            <Navigation size={16} color="#0ea5e9" /> Está demorando? Ver o trajeto
          </button>
        )}

        {/* Card do vendedor + chat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px', background: '#f8fafc', borderRadius: 22, border: '1px solid #f1f5f9' }}>
          <div style={{ width: 50, height: 50, borderRadius: 18, background: vendedor.gradiente, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>{vendedor.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{vendedor.nome}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Ambulante Oficial PraiaGo</div>
          </div>
          <button onClick={() => setChatOpen(true)} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 14, fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
            Chat
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes gpsPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(1.4); } }
      `}</style>
    </div>
  )
}

/* ─── CHECKOUT ──────────────────────────────────────────── */
function CheckoutModal({ vendedor, onConfirm, onClose, clientePos, gpsAtivo }: { vendedor: Vendedor; onConfirm: (e: Entrega) => void; onClose: () => void; clientePos: [number, number]; gpsAtivo: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const [reta, setReta] = useState('')
  const [barraca, setBarraca] = useState('')
  const [modo, setModo] = useState<'fixa' | 'tempo_real'>('fixa')
  const [erro, setErro] = useState('')
  const carrinho = useStore(s => s.carrinho)
  const criarPedido = useStore(s => s.criarPedido)
  const addNotif = useStore(s => s.addNotif)
  const sessao = useStore(s => s.sessao)

  const itensList = vendedor.produtos.filter(p => (carrinho[p.id] ?? 0) > 0)
  const total = itensList.reduce((acc, p) => acc + p.preco * carrinho[p.id], 0)

  function handleConfirm() {
    if (!reta.trim() && !barraca.trim()) { setErro('Informe a reta/rua ou o número da barraca onde te encontrar.'); return }
    setErro('')
    setConfirming(true)
    const entrega: Entrega = { reta: reta.trim(), barraca: barraca.trim(), modo }
    const pedido = criarPedido(entrega)
    broadcastOrder({
      id: pedido?.id ?? `#${Date.now()}`,
      vendedorId: vendedor.id,
      clienteNome: sessao?.nome ?? 'Cliente PraiaGo',
      clienteTel: sessao?.tel ?? '(13) 99999-9999',
      itens: itensList.map(p => `${carrinho[p.id]}x ${p.nome}`),
      total,
      clienteLat: clientePos[0],
      clienteLng: clientePos[1],
      zona: vendedor.zona,
      reta: entrega.reta,
      barraca: entrega.barraca,
      localizacao: modo,
      ts: Date.now(),
    })
    addNotif({ titulo: 'Pedido enviado! 🎉', texto: `${vendedor.nome} recebeu seu pedido de R$ ${total.toFixed(2)}.` })
    setTimeout(() => onConfirm(entrega), 900)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', animation: 'fadeIn 0.2s' }}>
      <div style={{ width: '100%', background: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: '24px 24px 36px', maxHeight: '92vh', overflowY: 'auto', animation: 'slideUp 0.35s cubic-bezier(0,0,0.2,1)' }}>
        <div style={{ width: 40, height: 5, background: '#e2e8f0', borderRadius: 10, margin: '0 auto 22px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>Confirmar Pedido</h2>
          <button aria-label="Fechar" onClick={onClose} style={{ background: '#f8fafc', border: 'none', borderRadius: 12, padding: 8, cursor: 'pointer' }}><X size={20} color="#64748b" /></button>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 20, padding: '16px', marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', letterSpacing: 0.6, marginBottom: 12 }}>SEU PEDIDO · {vendedor.nome}</div>
          {itensList.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 22 }}>{p.emoji}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{p.nome}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{carrinho[p.id]}x · R$ {p.preco.toFixed(2)}</div>
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>R$ {(p.preco * carrinho[p.id]).toFixed(2)}</div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Total</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#16a34a' }}>R$ {total.toFixed(2)}</span>
          </div>
        </div>

        {/* Onde te encontrar na praia */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Umbrella size={16} color="#0ea5e9" /> Onde te encontrar na praia
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="ck-reta" style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 5 }}>RETA / RUA</label>
              <input id="ck-reta" value={reta} onChange={e => setReta(e.target.value)} placeholder="Ex: 10" style={ckInput} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="ck-barraca" style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', display: 'block', marginBottom: 5 }}>BARRACA / GUARDA-SOL</label>
              <input id="ck-barraca" value={barraca} onChange={e => setBarraca(e.target.value)} placeholder="Ex: 42" style={ckInput} />
            </div>
          </div>

          {/* Modo de localização */}
          <div style={{ display: 'flex', gap: 10 }}>
            {([['fixa', '📍 Fixa', 'pela reta'], ['tempo_real', '🛰️ Tempo real', 'pelo GPS']] as const).map(([key, titulo, sub]) => {
              const sel = modo === key
              const disabled = key === 'tempo_real' && !gpsAtivo
              return (
                <button key={key} onClick={() => !disabled && setModo(key)} disabled={disabled} style={{
                  flex: 1, textAlign: 'left', padding: '12px 14px', borderRadius: 16, cursor: disabled ? 'not-allowed' : 'pointer',
                  border: sel ? '2px solid #0ea5e9' : '1.5px solid #e2e8f0',
                  background: sel ? '#f0f9ff' : '#fff', opacity: disabled ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{titulo}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>{disabled ? 'GPS indisponível' : sub}</div>
                </button>
              )
            })}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.4 }}>
            🔒 Sua localização não fica visível no mapa o tempo todo — só aparece o trajeto se houver atraso.
          </div>
        </div>

        {erro && <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 600, marginBottom: 14 }}>{erro}</div>}

        <button onClick={handleConfirm} disabled={confirming} style={{ width: '100%', background: confirming ? '#22c55e' : 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 22, padding: '18px', color: '#fff', fontSize: 17, fontWeight: 900, cursor: confirming ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: '0 16px 40px rgba(14,165,233,0.35)' }}>
          {confirming ? <><Check size={22} /> Pedido enviado!</> : <><ShoppingBag size={20} /> Confirmar · R$ {total.toFixed(2)}</>}
        </button>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } @keyframes slideUp { from { transform: translateY(60px); } to { transform: translateY(0); } }`}</style>
    </div>
  )
}

const ckInput: React.CSSProperties = {
  width: '100%', padding: '11px 14px', borderRadius: 12,
  border: '1.5px solid #e2e8f0', fontSize: 15, outline: 'none',
  color: '#0f172a', background: '#f8fafc', boxSizing: 'border-box',
}

/* ─── PÁGINA ────────────────────────────────────────────── */
type Step = 'menu' | 'checkout' | 'rastreando'

export default function PedirPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { pos: clientePos, status: gpsStatus } = useGPS()

  const vendedor = useMemo<Vendedor>(() => getVendedor(params.get('v')) ?? VENDEDORES[0], [params])

  const carrinho = useStore(s => s.carrinho)
  const carrinhoVendedor = useStore(s => s.carrinhoVendedor)
  const addItem = useStore(s => s.addItem)
  const isFav = useStore(s => s.favoritos.includes(vendedor.id))
  const toggleFavorito = useStore(s => s.toggleFavorito)

  const [step, setStep] = useState<Step>('menu')
  const [entrega, setEntrega] = useState<Entrega | null>(null)

  const meuCarrinho = carrinhoVendedor === vendedor.id ? carrinho : {}
  const totalItens = vendedor.produtos.reduce((a, p) => a + (meuCarrinho[p.id] ?? 0), 0)
  const totalPreco = vendedor.produtos.reduce((a, p) => a + (meuCarrinho[p.id] ?? 0) * p.preco, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {step === 'checkout' && <CheckoutModal vendedor={vendedor} clientePos={clientePos} gpsAtivo={gpsStatus === 'active'} onConfirm={(e) => { setEntrega(e); setStep('rastreando') }} onClose={() => setStep('menu')} />}
      {step === 'rastreando' && <RastreamentoModal vendedor={vendedor} clientePos={clientePos} entrega={entrega} onClose={() => { setStep('menu'); navigate('/') }} />}

      <div style={{ position: 'relative', height: 240 }}>
        <img src={vendedor.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={vendedor.nome} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.4), transparent 40%, rgba(255,255,255,1) 95%)' }} />
        <button aria-label="Voltar" onClick={() => navigate('/')} style={{ position: 'absolute', top: 20, left: 20, width: 44, height: 44, borderRadius: 15, background: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', cursor: 'pointer' }}>
          <ArrowLeft size={20} color="#0f172a" />
        </button>
        <button aria-label={isFav ? 'Remover favorito' : 'Favoritar'} onClick={() => toggleFavorito(vendedor.id)} style={{ position: 'absolute', top: 20, right: 20, width: 44, height: 44, borderRadius: 15, background: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', cursor: 'pointer' }}>
          <Heart size={20} color={isFav ? '#ef4444' : '#0f172a'} fill={isFav ? '#ef4444' : 'none'} />
        </button>
      </div>

      <div style={{ padding: '0 24px', marginTop: -60, position: 'relative', zIndex: 10 }}>
        <div style={{ background: '#fff', borderRadius: 28, padding: '24px', boxShadow: '0 12px 40px rgba(0,0,0,0.08)', border: '1px solid #f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>{vendedor.nome}</h1>
            <div style={{ background: vendedor.aberto ? '#f0fdf4' : '#fef2f2', color: vendedor.aberto ? '#16a34a' : '#ef4444', padding: '5px 14px', borderRadius: 12, fontSize: 12, fontWeight: 800, border: `1px solid ${vendedor.aberto ? '#bbf7d0' : '#fecaca'}` }}>{vendedor.aberto ? 'ABERTO' : 'FECHADO'}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 14, fontWeight: 700 }}>
              <Star size={15} fill="#fbbf24" color="#fbbf24" /> {vendedor.avaliacao}
            </div>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#e2e8f0' }} />
            <div style={{ fontSize: 13, color: '#64748b' }}>{vendedor.categoria}</div>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#e2e8f0' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#64748b' }}>
              <MapPin size={12} color="#0ea5e9" /> {vendedor.distancia}
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.18)', borderRadius: 12, padding: '6px 14px' }}>
            <Zap size={12} color="#a855f7" />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed' }}>Zona {vendedor.zona} · 🔥 Explosiva agora</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '28px 24px 120px' }}>
        <h3 style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginBottom: 20 }}>Cardápio 🔥</h3>
        {vendedor.produtos.map(p => {
          const qtd = meuCarrinho[p.id] ?? 0
          return (
            <div key={p.id} style={{ display: 'flex', gap: 16, marginBottom: 28, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{p.nome}</h4>
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>{p.desc}</p>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#16a34a', marginTop: 8 }}>R$ {p.preco.toFixed(2).replace('.', ',')}</div>
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 90, height: 90, borderRadius: 22, background: 'linear-gradient(135deg,#f0fdf4,#f8fafc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, border: '1px solid #e8f5e9' }}>{p.emoji}</div>
                <div style={{ position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  {qtd > 0 ? (
                    <>
                      <button aria-label={`Remover ${p.nome}`} onClick={() => addItem(vendedor.id, p.id, -1)} style={{ padding: '4px 10px', border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 900, fontSize: 18, lineHeight: 1 }}>−</button>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', minWidth: 20, textAlign: 'center' }}>{qtd}</span>
                      <button aria-label={`Adicionar ${p.nome}`} onClick={() => addItem(vendedor.id, p.id, 1)} style={{ padding: '4px 10px', border: 'none', background: 'none', cursor: 'pointer', color: '#0ea5e9', fontWeight: 900, fontSize: 18, lineHeight: 1 }}>+</button>
                    </>
                  ) : (
                    <button onClick={() => addItem(vendedor.id, p.id, 1)} style={{ padding: '5px 14px', border: 'none', background: 'none', cursor: 'pointer', color: '#0ea5e9', fontWeight: 800, fontSize: 14 }}>Adicionar</button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {totalItens > 0 && (
        <div style={{ position: 'fixed', bottom: 28, left: 24, right: 24, maxWidth: 382, margin: '0 auto', zIndex: 100, animation: 'cartAppear 0.3s cubic-bezier(0,0,0.2,1)' }}>
          <button onClick={() => setStep('checkout')} style={{ width: '100%', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: '#fff', border: 'none', borderRadius: 24, padding: '20px 24px', fontSize: 16, fontWeight: 900, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 50px rgba(14,165,233,0.4)', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: '4px 10px', fontSize: 14, fontWeight: 900 }}>{totalItens}</div>
              Ver Pedido
            </div>
            <span style={{ fontSize: 17, fontWeight: 900 }}>R$ {totalPreco.toFixed(2)}</span>
          </button>
        </div>
      )}
      <style>{`@keyframes cartAppear { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  )
}
