import { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, MapPin, X, WifiOff, Star, Check, Zap, Send, Heart, Shield, Navigation, CreditCard, Banknote, QrCode, Trash2, Clock, Search, UtensilsCrossed, Umbrella, Store, TicketPercent, SlidersHorizontal, Sparkles, FileText } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { motion, AnimatePresence } from 'framer-motion'
import { useRoute } from '../hooks/useRoute'
import { useGPS, type GPSFonte, type GPSStatus } from '../hooks/useGPS'
import { criarMonitorSentido, type SentidoStatus } from '../lib/trafego'
import { broadcastOrder } from '../hooks/useOrderBroadcast'
import { type Vendedor } from '../lib/catalogo'
import { criarPixMercadoPago, isMercadoPagoMethod, pagarComCartao, mensagemRecusaCartao, type PixCobranca } from '../lib/mercadopago'
import { tokenizarCartao } from '../lib/mpsdk'
import { labelHorario } from '../lib/horario'
import { useCatalogo } from '../store/useCatalogo'
import { useStore, type Entrega } from '../store/useStore'
import { confirmDialog, alertDialog } from '../lib/dialog'
import { supabase } from '../lib/supabase'
import { apenasDigitosCpf, formatarCpf as formatarCpfCliente, validarCpf } from '../lib/cpf'

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

function makeIcon(html: string) {
  return L.divIcon({ className: '', html, iconSize: [44, 44], iconAnchor: [22, 22] })
}
const vendorIcon = makeIcon(`<div style="width:44px;height:44px;border-radius:15px;background:linear-gradient(135deg,#0ea5e9,#22c55e);display:flex;align-items:center;justify-content:center;border:2px solid #0f172a;box-shadow:0 0 15px rgba(34,197,94,0.6);font-size:22px">🥥</div>`)
const clienteIcon = makeIcon(`<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#f43f5e,#fb7185);display:flex;align-items:center;justify-content:center;border:2px solid #0f172a;box-shadow:0 0 15px rgba(244,63,94,0.6);font-size:22px">📍</div>`)


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
    <div style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end' }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} style={{ width: '100%', background: '#ffffff', borderTopLeftRadius: 32, borderTopRightRadius: 32, height: '75vh', display: 'flex', flexDirection: 'column', border: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 16, background: vendedor.gradiente, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{vendedor.emoji}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{vendedor.nome}</div>
            <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} /> Online agora
            </div>
          </div>
          <button aria-label="Fechar chat" onClick={onClose} style={{ background: '#f8fafc', border: 'none', borderRadius: 14, padding: 10, cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {msgs.map((m, i) => (
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} key={i} style={{ alignSelf: m.de === 'cliente' ? 'flex-end' : 'flex-start', maxWidth: '75%', background: m.de === 'cliente' ? 'linear-gradient(135deg,#0ea5e9,#22c55e)' : '#1e293b', color: '#fff', padding: '12px 16px', borderRadius: 20, borderBottomRightRadius: m.de === 'cliente' ? 4 : 20, borderBottomLeftRadius: m.de === 'vendedor' ? 4 : 20, fontSize: 14, lineHeight: 1.4, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {m.texto}
            </motion.div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderTop: '1px solid rgba(0,0,0,0.05)', background: '#ffffff' }}>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="Escreva uma mensagem…" aria-label="Mensagem" style={{ flex: 1, background: '#f8fafc', color: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, padding: '14px 18px', fontSize: 15, outline: 'none' }} />
          <button aria-label="Enviar" onClick={enviar} style={{ width: 50, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', border: 'none', borderRadius: 16, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}><Send size={20} /></button>
        </div>
      </motion.div>
    </div>
  )
}

/* ─── RASTREAMENTO (TÁTICO / GLOW) ──────────────────────── */
type StatusPedido = 'aguardando' | 'enviado' | 'preparando' | 'a_caminho' | 'chegou'
// status na tabela `pedidos` → etapa da linha do tempo
const DB_STATUS: Record<string, StatusPedido> = {
  aguardando_pagamento: 'aguardando',
  novo: 'enviado', preparando: 'preparando', pronto: 'preparando', saiu_entrega: 'a_caminho', entregando: 'a_caminho', entregue: 'chegou',
}

function RastreamentoModal({ vendedor, clientePos, pedidoId, onClose }: { vendedor: Vendedor; clientePos: [number, number]; entrega: Entrega | null; pedidoId: string | null; onClose: () => void }) {
  const [pos, setPos] = useState<[number, number]>(vendedor.pos)
  const [accuracy, setAccuracy] = useState(999)
  const [isRealGPS, setIsRealGPS] = useState(false)
  const [status, setStatus] = useState<StatusPedido>('enviado')
  const [segundos, setSegundos] = useState(0)
  const [atrasado, setAtrasado] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [codigoEntrega, setCodigoEntrega] = useState<string | null>(null)
  const [denunciado, setDenunciado] = useState(false)
  const route = useRoute(pos, clientePos)

  // Status REAL: acompanha a linha do pedido no banco (o vendedor atualiza
  // pelo app dele e a etapa muda aqui na hora).
  useEffect(() => {
    if (!pedidoId) return
    supabase.from('pedidos').select('status, codigo_entrega').eq('id', pedidoId).single()
      .then(({ data }) => { if (data?.status && DB_STATUS[data.status]) setStatus(DB_STATUS[data.status]); if (data?.codigo_entrega) setCodigoEntrega(data.codigo_entrega) })
    const ch = supabase.channel(`pedido_${pedidoId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` }, (payload) => {
        const row = payload.new as { status?: string; codigo_entrega?: string | null }
        const st = row.status
        if (st && DB_STATUS[st]) setStatus(DB_STATUS[st])
        if (row.codigo_entrega) setCodigoEntrega(row.codigo_entrega)
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [pedidoId])

  // ANTI-MÁ-FÉ: cliente denuncia quem pede pra pagar por fora do app.
  async function denunciar() {
    if (!vendedor?.id) return
    const ok = await confirmDialog({
      title: 'Denunciar vendedor?',
      message: 'Use isto se o vendedor pediu pra você pagar POR FORA do app (pra fugir da taxa). Denúncias repetidas suspendem o vendedor automaticamente.',
      confirmText: 'Denunciar', cancelText: 'Voltar', tone: 'danger',
    })
    if (!ok) return
    const sessao = useStore.getState().sessao
    await supabase.from('fraude_flags').insert({
      vendedor_id: vendedor.id,
      cliente_id: sessao?.id ?? null,
      cliente_nome: sessao?.nome ?? null,
      pedido_id: pedidoId,
      motivo: 'Cliente relatou pedido de pagamento por fora do app',
    })
    setDenunciado(true)
    await alertDialog({ title: 'Denúncia registrada', message: 'Obrigado por avisar! Nosso time e o sistema anti-fraude vão analisar. 💙', tone: 'success' })
  }

  // Avaliação ao final
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [avaliado, setAvaliado] = useState(false)
  const sessaoNome = useStore(s => s.sessao?.nome)
  async function enviarAvaliacao() {
    if (nota === 0) return
    await supabase.from('avaliacoes').insert({
      pedido_id: pedidoId, vendedor_id: vendedor.id, vendedor_nome: vendedor.nome,
      cliente_nome: sessaoNome || 'Cliente', tipo: 'loja', nota, comentario: comentario.trim() || null,
    })
    setAvaliado(true)
    setTimeout(onClose, 1600)
  }

  // Verificação de sentido: a rota OSRM já respeita a mão das vias; aqui
  // detectamos se o entregador está se movendo CONTRA o sentido planejado.
  const [sentido, setSentido] = useState<SentidoStatus>('indefinido')
  const monitorSentido = useRef(criarMonitorSentido())
  useEffect(() => {
    if (!isRealGPS) return // só avalia com GPS real do vendedor
    setSentido(monitorSentido.current.atualizar(route?.coords, pos))
  }, [pos[0], pos[1]]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => setSegundos(s => s + 1), 1000)
    
    const chan = supabase.channel('radar_ambulante')
      .on('broadcast', { event: 'location' }, (payload) => {
        const d = payload.payload
        if (!d || typeof d.lat !== 'number' || typeof d.lng !== 'number') return
        setPos([d.lat, d.lng])
        setAccuracy(typeof d.accuracy === 'number' ? d.accuracy : 999)
        setIsRealGPS(true)
      })
      .subscribe()

    return () => { clearInterval(timer); supabase.removeChannel(chan) }
  }, [])

  const distRaw = calcDist(pos, clientePos)
  const distLabel = route?.distancia ?? (distRaw < 1000 ? `${Math.round(distRaw)}m` : `${(distRaw / 1000).toFixed(1)}km`)
  const etaMin = route ? Math.max(1, parseInt(route.tempo, 10) || 1) : Math.max(1, Math.ceil(distRaw / 80))
  const tempoLabel = route?.tempo ?? `${etaMin} min`
  const limiteSeg = (etaMin + 1) * 60
  useEffect(() => { if (segundos > limiteSeg && status !== 'chegou') setAtrasado(true) }, [segundos, limiteSeg, status])

  const statusColors: Record<StatusPedido, { bg: string; text: string; border: string; label: string }> = {
    aguardando: { bg: 'rgba(251,191,36,0.15)', text: '#b45309', border: '#d97706', label: 'AGUARDANDO PAGAMENTO' },
    enviado:    { bg: 'rgba(148,163,184,0.15)', text: '#64748b', border: '#94a3b8', label: 'PEDIDO ENVIADO' },
    preparando: { bg: 'rgba(251,191,36,0.15)', text: '#d97706', border: '#b45309', label: 'PREPARANDO' },
    a_caminho:  { bg: 'rgba(14,165,233,0.15)', text: '#0284c7', border: '#0284c7', label: 'SAIU PRA ENTREGA' },
    chegou:     { bg: 'rgba(34,197,94,0.15)',  text: '#16a34a', border: '#15803d', label: 'ENTREGUE! 🎉' },
  }
  const sc = statusColors[status]
  const ETAPAS: StatusPedido[] = ['enviado', 'preparando', 'a_caminho', 'chegou']
  const etapaAtual = ETAPAS.indexOf(status)

  return (
    <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 20 }} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
      <AnimatePresence>{chatOpen && <ChatModal vendedor={vendedor} onClose={() => setChatOpen(false)} />}</AnimatePresence>
      
      <div style={{ position: 'absolute', top: 20, left: 20, right: 20, zIndex: 1000, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button aria-label="Voltar" onClick={onClose} style={{ width: 46, height: 46, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff' }}>
          <X size={22} />
        </button>
        {atrasado && (
          <div className="glass-panel" style={{ padding: '10px 18px', borderRadius: 24, fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
            {isRealGPS ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 10px #22c55e' }} className="animate-pulse-neon" /> : <WifiOff size={14} color="#f97316" />}
            {isRealGPS ? 'Radar Ativo' : 'Buscando sinal…'}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {sentido === 'contramao' && (
            <div className="animate-pulse-neon" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.4)', padding: '10px 14px', borderRadius: 24, fontSize: 12, fontWeight: 900 }}>
              ⚠️ CONTRAMÃO
            </div>
          )}
          {sentido === 'fora_da_rota' && (
            <div style={{ background: 'rgba(245,158,11,0.15)', color: '#d97706', border: '1px solid rgba(245,158,11,0.4)', padding: '10px 14px', borderRadius: 24, fontSize: 12, fontWeight: 900 }}>
              🧭 Fora da rota
            </div>
          )}
          <div style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}`, padding: '10px 16px', borderRadius: 24, fontSize: 12, fontWeight: 800 }}>{sc.label}</div>
        </div>
      </div>

      {/* Código de entrega + denúncia (anti-má-fé) */}
      {codigoEntrega && status !== 'chegou' && (
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,rgba(14,165,233,0.08),rgba(34,197,94,0.06))', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 0.6 }}>Código de entrega</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Passe pro vendedor só na hora que receber. Pague sempre pelo app.</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 950, letterSpacing: 4, color: '#0f172a', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '6px 14px' }}>{codigoEntrega}</div>
        </div>
      )}
      {!denunciado ? (
        <button onClick={denunciar} style={{ width: '100%', border: 0, borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#fff', color: '#dc2626', fontSize: 12.5, fontWeight: 800, padding: '10px', cursor: 'pointer' }}>
          🚩 O vendedor pediu pra pagar por fora do app? Denuncie
        </button>
      ) : (
        <div style={{ width: '100%', background: 'rgba(34,197,94,0.08)', color: '#16a34a', fontSize: 12.5, fontWeight: 800, padding: '10px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
          ✓ Denúncia registrada — obrigado por proteger a comunidade
        </div>
      )}

      {/* Área superior: MAPA DARK MODE */}
      <div style={{ flex: 1, position: 'relative', background: '#eef2f7' }}>
        {atrasado ? (
          <MapContainer center={pos} zoom={16} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            {/* Mapa estilo Dark/Tático */}
            <TileLayer attribution='&copy; CARTO' url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" subdomains="abcd" />
            <RecenterMap a={pos} b={clientePos} />
            <Marker position={pos} icon={vendorIcon} />
            <Marker position={clientePos} icon={clienteIcon} />
            {isRealGPS && <Circle center={pos} radius={accuracy} pathOptions={{ color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.1, weight: 1, className: 'animate-pulse-neon' }} />}
            {route
              ? <Polyline positions={route.coords} pathOptions={{ color: '#0ea5e9', weight: 6, opacity: 0.8, lineCap: 'round', className: 'neon-polyline' }} />
              : <Polyline positions={[pos, clientePos]} pathOptions={{ color: '#0ea5e9', weight: 3, dashArray: '8 6', opacity: 0.4 }} />}
          </MapContainer>
        ) : (
          <div style={{ height: '100%', background: 'linear-gradient(160deg,#0ea5e9,#22c55e)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center', padding: '0 32px' }}>
            <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ fontSize: 72, marginBottom: 16, filter: 'drop-shadow(0 10px 15px rgba(0,0,0,0.2))' }}>
              {status === 'chegou' ? '🎉' : status === 'a_caminho' ? '🛵' : status === 'preparando' ? '👨‍🍳' : '📨'}
            </motion.div>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 20, padding: '8px 18px', marginBottom: 16 }}>
              <Shield size={16} color="#fbbf24" /> <span style={{ fontSize: 13, fontWeight: 700 }}>Radar Privado</span>
            </div>
            <div style={{ fontSize: 15, opacity: 0.9, lineHeight: 1.5, maxWidth: 320, fontWeight: 500 }}>
              O mapa está oculto para sua privacidade. Avisaremos quando chegar! Se houver atraso, o radar é ativado automaticamente.
            </div>
          </div>
        )}
      </div>

      {/* Bottom sheet - Dark Premium */}
      <div style={{ background: '#f8fafc', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: '24px 24px 36px', position: 'relative', marginTop: -30, zIndex: 5, boxShadow: '0 -15px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ width: 48, height: 6, background: '#e2e8f0', borderRadius: 10, margin: '-8px auto 24px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#0284c7', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' }}>
              {status === 'enviado' ? 'Aguardando a loja' : status === 'preparando' ? 'Confirmado' : status === 'a_caminho' ? 'Em rota' : 'Entregue'}
            </div>
            <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>
              {status === 'enviado' ? 'Pedido enviado!' : status === 'preparando' ? 'Preparando pedido…' : status === 'a_caminho' ? 'Saiu pra entrega! 🛵' : 'Aproveite! 🌊'}
            </h2>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{status === 'chegou' ? '🎉' : tempoLabel}</div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{status === 'chegou' ? 'Finalizado' : (atrasado ? distLabel : 'Estimativa')}</div>
          </div>
        </div>

        {/* Linha do tempo (4 etapas, estilo iFood) */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {ETAPAS.map((s, i) => (
            <div key={s} style={{ flex: 1, height: 6, borderRadius: 10, background: i <= etapaAtual ? '#22c55e' : '#e2e8f0', transition: 'background 0.5s ease', boxShadow: i <= etapaAtual ? '0 0 10px rgba(34,197,94,0.4)' : 'none' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {['Enviado', 'Preparando', 'Em rota', 'Entregue'].map((lbl, i) => (
            <div key={lbl} style={{ flex: 1, fontSize: 9, fontWeight: 800, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3, color: i <= etapaAtual ? '#16a34a' : '#94a3b8', transition: 'color 0.5s ease' }}>{lbl}</div>
          ))}
        </div>

        {!atrasado && status !== 'chegou' && (
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => setAtrasado(true)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 16, padding: '16px', color: '#38bdf8', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 20 }}>
            <Navigation size={18} /> Ativar Radar Tático
          </motion.button>
        )}

        {/* Entregue → avaliação · senão → card do vendedor + chat */}
        {status === 'chegou' ? (
          <div style={{ padding: '18px', background: '#ffffff', borderRadius: 24, border: '1px solid rgba(0,0,0,0.05)', textAlign: 'center' }}>
            {avaliado ? (
              <div className="animate-pop" style={{ padding: '10px 0' }}>
                <div style={{ fontSize: 34 }}>💚</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#16a34a', marginTop: 6 }}>Avaliação enviada. Valeu!</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a', marginBottom: 4 }}>Como foi com {vendedor.nome}?</div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>Sua avaliação ajuda a praia inteira 🏖️</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <motion.button key={n} whileTap={{ scale: 0.85 }} onClick={() => setNota(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
                      <Star size={32} color="#fbbf24" fill={n <= nota ? '#fbbf24' : 'none'} />
                    </motion.button>
                  ))}
                </div>
                <input value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Deixe um comentário (opcional)" style={{ width: '100%', padding: '12px 14px', borderRadius: 14, border: '1px solid rgba(0,0,0,0.1)', background: '#f8fafc', color: '#0f172a', fontSize: 14, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }} />
                <motion.button whileTap={{ scale: 0.97 }} onClick={enviarAvaliacao} disabled={nota === 0} style={{ width: '100%', background: nota === 0 ? '#e2e8f0' : 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: nota === 0 ? '#94a3b8' : '#fff', border: 'none', padding: '14px 0', borderRadius: 16, fontWeight: 900, fontSize: 15, cursor: nota === 0 ? 'default' : 'pointer' }}>
                  ENVIAR AVALIAÇÃO
                </motion.button>
              </>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px', background: '#ffffff', borderRadius: 24, border: '1px solid rgba(0,0,0,0.05)' }}>
            <div style={{ width: 54, height: 54, borderRadius: 18, background: vendedor.gradiente, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>{vendedor.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{vendedor.nome}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Vendedor oficial PraiaGo</div>
            </div>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setChatOpen(true)} style={{ background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: 16, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}>
              Chat
            </motion.button>
          </div>
        )}
      </div>
      <style>{`.neon-polyline { filter: drop-shadow(0 0 8px rgba(14,165,233,0.8)); }`}</style>
    </motion.div>
  )
}

/* ─── PIX DENTRO DO APP ─────────────────────────────────── */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
  } catch { /* tenta fallback abaixo */ }
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

function PixPagamentoModal({ cobranca, pedidoId, total, onPago, onClose }: {
  cobranca: PixCobranca
  pedidoId: string
  total: number
  onPago: () => void
  onClose: () => void
}) {
  const [copiado, setCopiado] = useState(false)
  const [pago, setPago] = useState(false)
  const [restante, setRestante] = useState('30:00')
  const pagoRef = useRef(false)

  // Confirmação ao vivo: realtime na linha do pedido + poll de segurança.
  // Quando o webhook aprovar o pagamento, o app comemora e segue sozinho.
  useEffect(() => {
    function confirmar(novo: { payment_status?: string | null }) {
      if (pagoRef.current) return
      if (novo?.payment_status === 'aprovado') {
        pagoRef.current = true
        setPago(true)
        setTimeout(onPago, 2000)
      }
    }

    const ch = supabase
      .channel(`pix_${pedidoId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` }, payload => {
        confirmar(payload.new as { payment_status?: string | null })
      })
      .subscribe()

    const poll = setInterval(async () => {
      if (pagoRef.current) return
      const { data } = await supabase.from('pedidos').select('payment_status').eq('id', pedidoId).maybeSingle()
      if (data) confirmar(data)
    }, 5000)

    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [pedidoId, onPago])

  // Contagem regressiva até o PIX expirar
  useEffect(() => {
    const fim = new Date(cobranca.expires_at).getTime()
    const t = setInterval(() => {
      const diff = Math.max(0, fim - Date.now())
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRestante(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(t)
  }, [cobranca.expires_at])

  async function copiar() {
    const ok = await copiarTexto(cobranca.qr_code)
    setCopiado(ok)
    if (ok) setTimeout(() => setCopiado(false), 2500)
  }

  async function fechar() {
    if (pagoRef.current) return
    const sair = await confirmDialog({
      title: 'Sair sem pagar?',
      message: 'O pedido só é enviado ao vendedor depois do pagamento. Você pode pagar depois em Meus Pedidos.',
      confirmText: 'Sair mesmo assim',
      tone: 'danger',
    })
    if (sair) onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end' }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 240 }} style={{ width: '100%', background: '#ffffff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: '22px 24px 34px', maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={{ width: 48, height: 6, background: '#e2e8f0', borderRadius: 10, margin: '0 auto 18px' }} />

        <AnimatePresence mode="wait">
          {pago ? (
            <motion.div key="pago" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '34px 10px 40px' }}>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }} style={{ width: 92, height: 92, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 18px 44px rgba(34,197,94,0.45)' }}>
                <Check size={46} color="#fff" strokeWidth={3.5} />
              </motion.div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Pagamento aprovado! 🎉</div>
              <p style={{ fontSize: 14.5, color: '#64748b', fontWeight: 600, marginTop: 8 }}>Enviando seu pedido pro vendedor…</p>
            </motion.div>
          ) : (
            <motion.div key="aguardando" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}><QrCode size={22} color="#0ea5e9" /> Pague com PIX</h2>
                <button aria-label="Fechar" onClick={fechar} style={{ background: '#f8fafc', border: 'none', borderRadius: 14, padding: 10, cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
              </div>
              <p style={{ fontSize: 13.5, color: '#64748b', fontWeight: 600, margin: '0 0 18px' }}>Escaneia o QR ou copia o código pra pagar 👇</p>

              <div style={{ textAlign: 'center', background: '#f8fafc', borderRadius: 24, border: '1px solid rgba(0,0,0,0.06)', padding: '18px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Total a pagar</div>
                <div style={{ fontSize: 32, fontWeight: 900, color: '#16a34a', margin: '2px 0 12px' }}>R$ {total.toFixed(2).replace('.', ',')}</div>
                {cobranca.qr_code_base64 ? (
                  <motion.img initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} src={`data:image/png;base64,${cobranca.qr_code_base64}`} alt="QR Code PIX" style={{ width: 210, height: 210, borderRadius: 20, border: '1px solid rgba(0,0,0,0.08)', background: '#fff', padding: 8 }} />
                ) : (
                  <div style={{ fontSize: 13, color: '#64748b', padding: 20 }}>Use o código copia-e-cola abaixo 👇</div>
                )}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#b45309', borderRadius: 999, padding: '6px 14px', fontSize: 12, fontWeight: 900 }}>
                  <Clock size={13} /> Expira em {restante}
                </div>
              </div>

              <motion.button whileTap={{ scale: 0.97 }} onClick={copiar} style={{ width: '100%', border: 'none', borderRadius: 20, padding: '17px 20px', fontSize: 15, fontWeight: 900, cursor: 'pointer', color: '#fff', background: copiado ? 'linear-gradient(135deg, #16a34a, #15803d)' : 'linear-gradient(135deg, #0ea5e9, #22c55e)', boxShadow: '0 14px 30px rgba(14,165,233,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                {copiado ? <><Check size={19} /> Código copiado! Cola no app do banco</> : <>📋 Copiar código PIX</>}
              </motion.button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 18 }}>
                <motion.div animate={{ scale: [1, 1.25, 1], opacity: [1, 0.55, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ width: 10, height: 10, borderRadius: '50%', background: '#0ea5e9' }} />
                <span style={{ fontSize: 13.5, fontWeight: 800, color: '#0284c7' }}>Aguardando pagamento… confirmamos na hora ⚡</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/* ─── CARTÃO DENTRO DO APP ──────────────────────────────── */
function formatarNumeroCartao(v: string) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}
function formatarValidade(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}
function formatarCpf(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
}

function CartaoPagamentoModal({ tipo, pedidoId, total, emailCliente, onPago, onClose }: {
  tipo: 'credit' | 'debit'
  pedidoId: string
  total: number
  emailCliente?: string | null
  onPago: () => void
  onClose: () => void
}) {
  const [numero, setNumero] = useState('')
  const [nome, setNome] = useState('')
  const [validade, setValidade] = useState('')
  const [cvv, setCvv] = useState('')
  const [cpf, setCpf] = useState('')
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [aprovado, setAprovado] = useState(false)
  const [emAnalise, setEmAnalise] = useState(false)
  const aprovadoRef = useRef(false)

  // Segurança extra: se cair em "em análise", o realtime avisa quando aprovar.
  useEffect(() => {
    if (!emAnalise) return
    const ch = supabase
      .channel(`card_${pedidoId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` }, payload => {
        const novo = payload.new as { payment_status?: string | null }
        if (novo?.payment_status === 'aprovado' && !aprovadoRef.current) {
          aprovadoRef.current = true
          setAprovado(true)
          setTimeout(onPago, 2000)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [emAnalise, pedidoId, onPago])

  async function pagar() {
    const digitosNumero = numero.replace(/\D/g, '')
    const digitosCpf = cpf.replace(/\D/g, '')
    if (digitosNumero.length < 13) { setErro('Número do cartão incompleto.'); return }
    if (!nome.trim()) { setErro('Digite o nome como está no cartão.'); return }
    if (validade.length < 5) { setErro('Validade incompleta (MM/AA).'); return }
    if (cvv.length < 3) { setErro('CVV incompleto.'); return }
    if (digitosCpf.length !== 11) { setErro('CPF incompleto.'); return }

    setErro('')
    setProcessando(true)
    try {
      const { token, paymentMethodId } = await tokenizarCartao({
        numero: digitosNumero, nome, validade, cvv, cpf: digitosCpf,
      }, tipo)
      const resultado = await pagarComCartao(pedidoId, { token, paymentMethodId, cpf: digitosCpf, email: emailCliente || undefined })
      if (resultado.status === 'approved') {
        aprovadoRef.current = true
        setAprovado(true)
        setTimeout(onPago, 2000)
      } else if (resultado.status === 'in_process' || resultado.status === 'pending') {
        setEmAnalise(true)
      } else {
        setErro(mensagemRecusaCartao(resultado.status_detail))
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível processar o cartão.')
    }
    setProcessando(false)
  }

  async function fechar() {
    if (aprovadoRef.current) return
    const sair = await confirmDialog({
      title: 'Sair sem pagar?',
      message: 'O pedido só é enviado ao vendedor depois do pagamento.',
      confirmText: 'Sair mesmo assim',
      tone: 'danger',
    })
    if (sair) onClose()
  }

  const inputCartao: React.CSSProperties = { width: '100%', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '14px 14px', fontSize: 16, fontWeight: 700, color: '#0f172a', background: '#f8fafc', outline: 'none' }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end' }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 26, stiffness: 240 }} style={{ width: '100%', background: '#ffffff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: '22px 24px 34px', maxHeight: '94vh', overflowY: 'auto' }}>
        <div style={{ width: 48, height: 6, background: '#e2e8f0', borderRadius: 10, margin: '0 auto 18px' }} />

        {aprovado ? (
          <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '34px 10px 40px' }}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.1 }} style={{ width: 92, height: 92, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 18px 44px rgba(34,197,94,0.45)' }}>
              <Check size={46} color="#fff" strokeWidth={3.5} />
            </motion.div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Pagamento aprovado! 🎉</div>
            <p style={{ fontSize: 14.5, color: '#64748b', fontWeight: 600, marginTop: 8 }}>Enviando seu pedido pro vendedor…</p>
          </motion.div>
        ) : emAnalise ? (
          <div style={{ textAlign: 'center', padding: '30px 10px 36px' }}>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.6, ease: 'linear' }} style={{ width: 64, height: 64, borderRadius: '50%', border: '5px solid rgba(14,165,233,0.15)', borderTopColor: '#0ea5e9', margin: '0 auto 18px' }} />
            <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a' }}>Pagamento em análise ⏳</div>
            <p style={{ fontSize: 14, color: '#64748b', fontWeight: 600, marginTop: 8 }}>O banco tá conferindo. Assim que aprovar, seu pedido vai sozinho pro vendedor — pode deixar essa tela aberta.</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={22} color="#0ea5e9" /> {tipo === 'debit' ? 'Cartão de Débito' : 'Cartão de Crédito'}
              </h2>
              <button aria-label="Fechar" onClick={fechar} style={{ background: '#f8fafc', border: 'none', borderRadius: 14, padding: 10, cursor: 'pointer' }}><X size={18} color="#94a3b8" /></button>
            </div>
            <p style={{ fontSize: 13, color: '#64748b', fontWeight: 600, margin: '0 0 16px' }}>
              Pagamento 100% seguro e criptografado 🔒 · Total <strong style={{ color: '#16a34a' }}>R$ {total.toFixed(2).replace('.', ',')}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6 }}>NÚMERO DO CARTÃO</label>
                <input inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" value={numero} onChange={e => setNumero(formatarNumeroCartao(e.target.value))} style={inputCartao} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6 }}>NOME (como está no cartão)</label>
                <input autoComplete="cc-name" placeholder="MARIA A SILVA" value={nome} onChange={e => setNome(e.target.value.toUpperCase())} style={inputCartao} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6 }}>VALIDADE</label>
                  <input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" value={validade} onChange={e => setValidade(formatarValidade(e.target.value))} style={inputCartao} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6 }}>CVV</label>
                  <input inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={cvv} onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} style={inputCartao} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6 }}>CPF DO TITULAR</label>
                <input inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={e => setCpf(formatarCpf(e.target.value))} style={inputCartao} />
              </div>
            </div>

            {erro && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 14, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#dc2626', borderRadius: 14, padding: '12px 14px', fontSize: 13.5, fontWeight: 800, textAlign: 'center' }}>
                {erro}
              </motion.div>
            )}

            <motion.button whileTap={{ scale: processando ? 1 : 0.97 }} disabled={processando} onClick={pagar} style={{ width: '100%', marginTop: 16, border: 'none', borderRadius: 20, padding: '17px 20px', fontSize: 15.5, fontWeight: 900, cursor: processando ? 'wait' : 'pointer', color: '#fff', background: processando ? '#94a3b8' : 'linear-gradient(135deg, #0ea5e9, #22c55e)', boxShadow: processando ? 'none' : '0 14px 30px rgba(14,165,233,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              {processando ? 'Processando…' : `Pagar R$ ${total.toFixed(2).replace('.', ',')} 🔒`}
            </motion.button>
            <p style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 600, textAlign: 'center', marginTop: 10 }}>
              🔒 Seus dados são criptografados e protegidos. Não guardamos o número do seu cartão.
            </p>
          </>
        )}
      </motion.div>
    </div>
  )
}

/* ─── CHECKOUT MODAL ────────────────────────────────────── */
type PromoCheckout = {
  codigo: string
  titulo: string
  valor: number
  motivo: string
  automatico?: boolean
}

type CupomCheckout = {
  codigo: string
  titulo: string
  descricao?: string | null
  tipo: 'percentual' | 'valor_fixo' | 'frete_gratis'
  valor: number
  valor_minimo?: number | null
  limite_uso?: number | null
  usos?: number | null
  vendedor_id?: string | null
  vendedor_tipo?: string | null
  data_inicio?: string | null
  validade?: string | null
}

type PerfilClienteCheckout = {
  cpf?: string | null
  cpf_check_status?: string | null
  email_verificado?: boolean | null
}

function dinheiro(v: number) {
  return v.toFixed(2).replace('.', ',')
}

function CheckoutModal({ vendedor, onConfirm, onClose, clientePos, gpsStatus, gpsFonte }: { vendedor: Vendedor; onConfirm: (e: Entrega, pedidoId: string) => void; onClose: () => void; clientePos: [number, number]; gpsStatus: GPSStatus; gpsFonte: GPSFonte }) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [reta, setReta] = useState('')
  const [barraca, setBarraca] = useState('')
  const [modo, setModo] = useState<'fixa' | 'tempo_real'>('fixa')
  const [pagamento, setPagamento] = useState<Entrega['pagamento']>('pix')
  const [erro, setErro] = useState('')
  const [cpfCliente, setCpfCliente] = useState('')
  const [salvandoCpf, setSalvandoCpf] = useState(false)
  const [perfilCliente, setPerfilCliente] = useState<PerfilClienteCheckout | null>(null)
  const [emailConfirmado, setEmailConfirmado] = useState(false)
  const [primeiraCompra, setPrimeiraCompra] = useState(false)
  const [carregandoBeneficio, setCarregandoBeneficio] = useState(false)
  const [cupomTexto, setCupomTexto] = useState('')
  const [mostrarCodigoManual, setMostrarCodigoManual] = useState(false)
  const [cuponsDisponiveis, setCuponsDisponiveis] = useState<CupomCheckout[]>([])
  const [cuponsUsados, setCuponsUsados] = useState<Set<string>>(new Set())
  const [carregandoCupons, setCarregandoCupons] = useState(false)
  const [cupomAplicado, setCupomAplicado] = useState<PromoCheckout | null>(null)
  const [cupomErro, setCupomErro] = useState('')
  const [pix, setPix] = useState<{ cobranca: PixCobranca; pedidoId: string; entrega: Entrega; valor: number } | null>(null)
  const [cartao, setCartao] = useState<{ tipo: 'credit' | 'debit'; pedidoId: string; entrega: Entrega; valor: number } | null>(null)
  const [querCpfNota, setQuerCpfNota] = useState(false)
  const [cpfNota, setCpfNota] = useState('')
  const carrinho = useStore(s => s.carrinho)
  const criarPedido = useStore(s => s.criarPedido)
  const setQtd = useStore(s => s.setQtd)
  const limparCarrinho = useStore(s => s.limparCarrinho)
  const addNotif = useStore(s => s.addNotif)
  const sessao = useStore(s => s.sessao)

  const itensList = vendedor.produtos.filter(p => (carrinho[p.id] ?? 0) > 0)
  const subtotal = itensList.reduce((acc, p) => acc + p.preco * carrinho[p.id], 0)
  const desconto = Math.max(0, Math.min(subtotal, cupomAplicado?.valor ?? 0))
  const total = Math.max(0, Math.round((subtotal - desconto) * 100) / 100)
  const radarReal = gpsFonte === 'gps' || gpsFonte === 'manual' || gpsFonte === 'memoria'
  const cpfOk = perfilCliente?.cpf_check_status === 'aprovado'
  const beneficioElegivel = Boolean(sessao?.id && emailConfirmado && cpfOk && primeiraCompra)
  const cuponsParaMostrar = useMemo(() => cuponsDisponiveis
    .map(c => {
      const usado = cuponsUsados.has(c.codigo)
      const minimo = Number(c.valor_minimo || 0)
      const limiteEsgotado = c.limite_uso != null && Number(c.usos || 0) >= Number(c.limite_uso)
      const naoIniciado = c.data_inicio ? new Date(c.data_inicio).getTime() > Date.now() : false
      const expirado = c.validade ? new Date(c.validade).getTime() < Date.now() : false
      const lojaOk = !c.vendedor_id || c.vendedor_id === vendedor.id
      const tipoOk = !c.vendedor_tipo || c.vendedor_tipo === vendedor.tipo
      const bemVindoBloqueado = c.codigo === 'BEMVINDO20' && !beneficioElegivel
      const minimoBloqueado = subtotal < minimo
      const bloqueado = usado || limiteEsgotado || naoIniciado || expirado || !lojaOk || !tipoOk || bemVindoBloqueado || minimoBloqueado
      const motivo = usado
        ? 'Ja usado nessa conta'
        : limiteEsgotado
          ? 'Cupom esgotado'
          : expirado
            ? 'Cupom expirado'
            : naoIniciado
              ? 'Cupom ainda nao liberado'
              : bemVindoBloqueado
                ? 'Exige primeira compra, CPF e e-mail'
                : minimoBloqueado
                  ? `Minimo R$ ${dinheiro(minimo)}`
                  : 'Pronto para usar'
      return { ...c, bloqueado, motivo }
    })
    .sort((a, b) => Number(a.bloqueado) - Number(b.bloqueado) || a.codigo.localeCompare(b.codigo)), [cuponsDisponiveis, cuponsUsados, subtotal, beneficioElegivel, vendedor.id, vendedor.tipo])

  useEffect(() => {
    let alive = true
    async function carregarBeneficio() {
      if (!sessao?.id) {
        setPerfilCliente(null)
        setCpfCliente('')
        setEmailConfirmado(false)
        setPrimeiraCompra(false)
        setCupomAplicado(null)
        return
      }
      setCarregandoBeneficio(true)
      const [{ data: userData }, { data: profile }, { data: pedidos }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('cpf,cpf_check_status,email_verificado').eq('id', sessao.id).maybeSingle(),
        supabase.from('pedidos').select('id,status').eq('cliente_id', sessao.id).neq('status', 'cancelado').limit(1),
      ])
      if (!alive) return
      const perfil = (profile || {}) as PerfilClienteCheckout
      setPerfilCliente(perfil)
      setCpfCliente(formatarCpfCliente(perfil.cpf || ''))
      setEmailConfirmado(Boolean(userData.user?.email_confirmed_at || perfil.email_verificado))
      setPrimeiraCompra(!pedidos || pedidos.length === 0)
      setCarregandoBeneficio(false)
    }
    carregarBeneficio()
    return () => { alive = false }
  }, [sessao?.id])

  useEffect(() => {
    if (beneficioElegivel && subtotal > 0 && (!cupomAplicado || cupomAplicado.automatico)) {
      setCupomAplicado({
        codigo: 'BEMVINDO20',
        titulo: 'Boas-vindas PraiaGo',
        valor: Math.round(subtotal * 0.2 * 100) / 100,
        motivo: 'Primeira compra: e-mail confirmado + CPF valido',
        automatico: true,
      })
    }
    if (!beneficioElegivel && cupomAplicado?.automatico) setCupomAplicado(null)
  }, [beneficioElegivel, subtotal])

  useEffect(() => {
    let alive = true
    async function carregarCuponsCheckout() {
      setCarregandoCupons(true)
      const { data } = await supabase
        .from('cupons')
        .select('codigo,titulo,descricao,tipo,valor,valor_minimo,limite_uso,usos,vendedor_id,vendedor_tipo,data_inicio,validade')
        .eq('ativo', true)
        .eq('publico', true)
        .or(`vendedor_id.is.null,vendedor_id.eq.${vendedor.id}`)
        .or(`vendedor_tipo.is.null,vendedor_tipo.eq.${vendedor.tipo}`)
        .order('created_at', { ascending: false })

      let usados = new Set<string>()
      if (sessao?.id) {
        const { data: usos } = await supabase
          .from('cupom_usos')
          .select('cupom_codigo')
          .eq('cliente_id', sessao.id)
        usados = new Set((usos || []).map(u => String((u as { cupom_codigo?: string }).cupom_codigo || '').toUpperCase()).filter(Boolean))
      }

      if (!alive) return
      setCuponsDisponiveis(((data as CupomCheckout[] | null) || []).map(c => ({ ...c, codigo: c.codigo.toUpperCase() })))
      setCuponsUsados(usados)
      setCarregandoCupons(false)
    }
    carregarCuponsCheckout()
    return () => { alive = false }
  }, [sessao?.id, vendedor.id, vendedor.tipo])

  async function salvarCpfCliente() {
    if (!sessao?.id) return
    if (!validarCpf(cpfCliente)) { setErro('CPF invalido. Confira os numeros para liberar o pedido.'); return }
    setSalvandoCpf(true)
    const { data, error } = await supabase
      .from('profiles')
      .update({ cpf: apenasDigitosCpf(cpfCliente) })
      .eq('id', sessao.id)
      .select('cpf,cpf_check_status,email_verificado')
      .maybeSingle()
    setSalvandoCpf(false)
    if (error || !data) {
      // 23505 = unique violation → CPF já cadastrado em outra conta
      if ((error as { code?: string } | null)?.code === '23505') {
        setErro('Esse CPF já está cadastrado em outra conta. Cada CPF vale para uma conta só.')
      } else {
        setErro('Nao foi possivel confirmar o CPF agora.')
      }
      return
    }
    setPerfilCliente(data as PerfilClienteCheckout)
    setCpfCliente(formatarCpfCliente(String(data.cpf || '')))
    setErro('')
  }

  async function aplicarCupom(codigoSelecionado?: string) {
    const codigo = (codigoSelecionado || cupomTexto).trim().toUpperCase()
    setCupomErro('')
    if (!codigo) return
    if (!sessao?.id) {
      setCupomErro('Entre na sua conta para usar cupom.')
      return
    }
    const { data: usoExistente } = await supabase
      .from('cupom_usos')
      .select('id')
      .eq('cliente_id', sessao.id)
      .eq('cupom_codigo', codigo)
      .maybeSingle()
    if (usoExistente) {
      setCupomErro('Esse cupom ja foi usado nessa conta.')
      return
    }
    if (codigo === 'BEMVINDO20') {
      if (!beneficioElegivel) {
        setCupomErro('Esse cupom libera com e-mail confirmado, CPF valido e primeira compra.')
        return
      }
      setCupomAplicado({
        codigo,
        titulo: 'Boas-vindas PraiaGo',
        valor: Math.round(subtotal * 0.2 * 100) / 100,
        motivo: 'Primeira compra: e-mail confirmado + CPF valido',
      })
      return
    }

    const { data, error } = await supabase
      .from('cupons')
      .select('codigo,titulo,tipo,valor,valor_minimo,vendedor_id,vendedor_tipo,ativo,publico,data_inicio,validade,limite_uso,usos')
      .eq('codigo', codigo)
      .maybeSingle()
    if (error || !data) {
      setCupomErro('Cupom nao encontrado ou expirado.')
      return
    }
    const cupom = data as { codigo: string; titulo?: string | null; tipo: string; valor: number; valor_minimo?: number | null; vendedor_id?: string | null; vendedor_tipo?: string | null; ativo?: boolean | null; publico?: boolean | null; data_inicio?: string | null; validade?: string | null; limite_uso?: number | null; usos?: number | null }
    if (!cupom.ativo || cupom.publico === false) { setCupomErro('Cupom indisponivel.'); return }
    if (cupom.data_inicio && new Date(cupom.data_inicio).getTime() > Date.now()) { setCupomErro('Cupom ainda nao liberado.'); return }
    if (cupom.validade && new Date(cupom.validade).getTime() < Date.now()) { setCupomErro('Cupom expirado.'); return }
    if (cupom.limite_uso != null && Number(cupom.usos || 0) >= Number(cupom.limite_uso)) { setCupomErro('Cupom esgotado.'); return }
    if (cupom.vendedor_id && cupom.vendedor_id !== vendedor.id) { setCupomErro('Esse cupom nao vale para esta loja.'); return }
    if (cupom.vendedor_tipo && cupom.vendedor_tipo !== vendedor.tipo) { setCupomErro('Esse cupom nao vale para este tipo de loja.'); return }
    if (subtotal < Number(cupom.valor_minimo || 0)) { setCupomErro(`Pedido minimo R$ ${dinheiro(Number(cupom.valor_minimo || 0))}.`); return }
    const valor = cupom.tipo === 'valor_fixo'
      ? Number(cupom.valor || 0)
      : cupom.tipo === 'percentual'
        ? subtotal * Number(cupom.valor || 0) / 100
        : 0
    if (valor <= 0) { setCupomErro('Cupom sem desconto aplicado para este pedido.'); return }
    setCupomAplicado({ codigo, titulo: cupom.titulo || codigo, valor: Math.round(valor * 100) / 100, motivo: `Cupom ${codigo}` })
  }

  function removerItem(produtoId: string) {
    setQtd(produtoId, 0)
    if (itensList.length <= 1) setTimeout(onClose, 0)
  }

  function excluirPedido() {
    limparCarrinho()
    onClose()
  }

  async function handleConfirm() {
    if (!sessao?.id) {
      setErro('Entre ou crie sua conta para fechar pedido no PraiaGo.')
      await alertDialog({ title: 'Login necessario', message: 'Para sua seguranca, pedido agora so com conta cadastrada.', tone: 'default' })
      navigate('/perfil')
      return
    }
    if (itensList.length === 0) { setErro('Seu pedido esta vazio.'); return }
    if (!cpfOk) { setErro('Confirme um CPF valido antes de fechar o pedido.'); return }
    if (!emailConfirmado) { setErro('Confirme seu e-mail antes de usar o checkout. Reenvie a verificacao em Perfil.'); return }
    if (modo === 'fixa' && !reta.trim() && !barraca.trim()) { setErro('Informe a reta ou barraca para te acharmos.'); return }
    if (modo === 'tempo_real' && !radarReal) { setErro('Ative a localizacao do celular para usar o Radar GPS real.'); return }
    if (querCpfNota && !validarCpf(cpfNota)) { setErro('CPF da nota invalido. Confira os numeros ou desmarque a opcao.'); return }
    setErro('')
    setConfirming(true)
    const entrega: Entrega = { reta: reta.trim(), barraca: barraca.trim(), modo, pagamento, lat: clientePos[0], lng: clientePos[1], cpfNota: querCpfNota ? cpfNota.replace(/\D/g, '') : undefined }
    const usaMercadoPago = isMercadoPagoMethod(pagamento)
    let pedido: Awaited<ReturnType<typeof criarPedido>>
    try {
      pedido = await criarPedido(entrega, {
        limparCarrinho: !usaMercadoPago,
        desconto: cupomAplicado ? { codigo: cupomAplicado.codigo, valor: desconto, motivo: cupomAplicado.motivo } : undefined,
      })
    } catch {
      pedido = null
    }
    if (!pedido) {
      setErro('Não deu pra criar o pedido. Confira os itens do carrinho e tente de novo.')
      setConfirming(false)
      return
    }
    if (usaMercadoPago) {
      // Pagamento online: o vendedor SÓ recebe o pedido depois que o Mercado
      // Pago confirmar — nada de broadcast nem "pedido enviado" antes de pagar.
      if (pagamento === 'pix') {
        // PIX transparente: QR + copia-e-cola DENTRO do app, sem redirect.
        try {
          const cobranca = await criarPixMercadoPago(pedido.id)
          const valor = total
          limparCarrinho()
          setConfirming(false)
          setPix({ cobranca, pedidoId: pedido.id, entrega, valor })
        } catch (err) {
          setErro(err instanceof Error ? err.message : 'Nao foi possivel gerar o PIX.')
          setConfirming(false)
        }
        return
      }
      // Cartão transparente: formulário DENTRO do app (token via SDK do MP).
      const valor = total
      limparCarrinho()
      setConfirming(false)
      setCartao({ tipo: pagamento === 'debito_online' ? 'debit' : 'credit', pedidoId: pedido.id, entrega, valor })
      return
    }
    broadcastOrder({
      id: pedido.id,
      vendedorId: vendedor.id,
      clienteNome: sessao?.nome ?? 'Cliente PraiaGo',
      clienteTel: sessao?.telefone ?? '(13) 99999-9999',
      itens: itensList.map(p => `${carrinho[p.id]}x ${p.nome}`),
      total,
      clienteLat: clientePos[0],
      clienteLng: clientePos[1],
      zona: vendedor.zona,
      reta: entrega.reta,
      barraca: entrega.barraca,
      localizacao: modo,
      pagamento,
      ts: Date.now(),
    })
    addNotif({ titulo: 'Pedido enviado! 🎉', texto: `Pagamento via ${pagamento.toUpperCase()} na entrega.` })
    setTimeout(() => onConfirm(entrega, pedido.id), 900)
  }

  // PIX gerado: mostra só o modal de pagamento (o pedido já existe no banco,
  // aguardando o webhook aprovar).
  if (pix) {
    return (
      <PixPagamentoModal
        cobranca={pix.cobranca}
        pedidoId={pix.pedidoId}
        total={pix.valor}
        onPago={() => onConfirm(pix.entrega, pix.pedidoId)}
        onClose={onClose}
      />
    )
  }

  // Cartão: formulário dentro do app.
  if (cartao) {
    return (
      <CartaoPagamentoModal
        tipo={cartao.tipo}
        pedidoId={cartao.pedidoId}
        total={cartao.valor}
        emailCliente={sessao?.email}
        onPago={() => onConfirm(cartao.entrega, cartao.pedidoId)}
        onClose={onClose}
      />
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end' }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} style={{ width: '100%', background: '#ffffff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: '24px 24px 36px', maxHeight: '92vh', overflowY: 'auto', border: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ width: 48, height: 6, background: '#e2e8f0', borderRadius: 10, margin: '0 auto 24px' }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Checkout</h2>
          <button aria-label="Fechar" onClick={onClose} style={{ background: '#f8fafc', border: 'none', borderRadius: 14, padding: 10, cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
        </div>

        {/* Conta e CPF */}
        <div style={{ background: sessao ? '#f8fafc' : '#fff7ed', border: `1px solid ${sessao ? 'rgba(0,0,0,0.06)' : '#fed7aa'}`, borderRadius: 22, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 900, color: '#0f172a' }}>
                <Shield size={16} color={sessao ? '#16a34a' : '#ea580c'} /> Pedido seguro PraiaGo
              </div>
              <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 700, marginTop: 4 }}>
                {sessao ? `${sessao.nome || 'Cliente'} · ${emailConfirmado ? 'e-mail confirmado' : 'confirme seu e-mail'}` : 'Entre ou crie sua conta para fechar pedido.'}
              </div>
            </div>
            {!sessao && (
              <button type="button" onClick={() => navigate('/perfil')} style={{ border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', color: '#fff', borderRadius: 14, padding: '10px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Entrar
              </button>
            )}
          </div>
          {sessao && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
              <div>
                <label style={{ fontSize: 10.5, fontWeight: 900, color: '#64748b', display: 'block', marginBottom: 6, letterSpacing: 0.6 }}>CPF DO CLIENTE</label>
                <input inputMode="numeric" value={cpfCliente} onChange={e => setCpfCliente(formatarCpfCliente(e.target.value))} placeholder="000.000.000-00" style={darkInput} />
              </div>
              <button type="button" disabled={salvandoCpf || cpfOk} onClick={salvarCpfCliente} style={{ height: 48, border: 'none', background: cpfOk ? '#dcfce7' : '#0ea5e9', color: cpfOk ? '#15803d' : '#fff', borderRadius: 15, padding: '0 14px', fontSize: 12, fontWeight: 900, cursor: cpfOk ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                {cpfOk ? 'Validado' : salvandoCpf ? 'Salvando' : 'Validar'}
              </button>
            </div>
          )}
          {sessao && (
            <div style={{ marginTop: 10, fontSize: 11.5, color: beneficioElegivel ? '#15803d' : '#64748b', fontWeight: 800 }}>
              {carregandoBeneficio ? 'Conferindo beneficio...' : beneficioElegivel ? '20% de boas-vindas liberado para este pedido.' : 'Primeira compra tem 20% com e-mail confirmado e CPF valido.'}
            </div>
          )}
        </div>

        {/* Resumo */}
        <div style={{ background: '#f8fafc', borderRadius: 24, padding: '20px', marginBottom: 20, border: '1px solid rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase' }}>Resumo · {vendedor.nome}</div>
            <button type="button" onClick={excluirPedido} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(239,68,68,0.18)', background: '#fff1f2', color: '#e11d48', borderRadius: 999, padding: '8px 11px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
              <Trash2 size={14} /> Excluir pedido
            </button>
          </div>
          {itensList.map(p => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 24, background: '#ffffff', padding: p.foto ? 0 : 8, borderRadius: 12, width: p.foto ? 40 : undefined, height: p.foto ? 40 : undefined, overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{p.foto ? <img src={p.foto} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.emoji}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{p.nome}</div>
                  <div style={{ fontSize: 13, color: '#64748b' }}>{carrinho[p.id]}x · R$ {p.preco.toFixed(2)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>R$ {(p.preco * carrinho[p.id]).toFixed(2)}</div>
                <button type="button" aria-label={`Remover ${p.nome}`} onClick={() => removerItem(p.id)} style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(239,68,68,0.16)', background: '#ffffff', color: '#ef4444', borderRadius: 12, cursor: 'pointer' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 16, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#64748b' }}>Subtotal</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>R$ {dinheiro(subtotal)}</span>
            </div>
            {desconto > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#16a34a' }}>
                <span style={{ fontSize: 13, fontWeight: 900 }}>{cupomAplicado?.codigo}</span>
                <span style={{ fontSize: 14, fontWeight: 900 }}>- R$ {dinheiro(desconto)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#64748b' }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 900, color: '#22c55e', textShadow: '0 0 10px rgba(34,197,94,0.4)' }}>R$ {dinheiro(total)}</span>
            </div>
          </div>
        </div>

        {/* Cupom */}
        <div style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.08), rgba(34,197,94,0.08))', border: '1px solid rgba(14,165,233,0.14)', borderRadius: 22, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>Cupom PraiaGo</div>
              <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 700 }}>{cupomAplicado ? `${cupomAplicado.titulo} aplicado.` : 'Escolha um cupom disponivel ou digite codigo de sorteio.'}</div>
            </div>
            {cupomAplicado && (
              <button type="button" onClick={() => setCupomAplicado(null)} style={{ border: 'none', background: '#ffffff', color: '#ef4444', borderRadius: 12, padding: '8px 10px', fontSize: 11.5, fontWeight: 900, cursor: 'pointer' }}>
                Remover
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            {carregandoCupons ? (
              <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 16, padding: 14, fontSize: 12.5, fontWeight: 800, color: '#64748b' }}>
                Buscando cupons pra voce...
              </div>
            ) : cuponsParaMostrar.length === 0 ? (
              <div style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 16, padding: 14, fontSize: 12.5, fontWeight: 800, color: '#64748b' }}>
                Nenhum cupom automatico disponivel agora.
              </div>
            ) : cuponsParaMostrar.map(c => {
              const selecionado = cupomAplicado?.codigo === c.codigo
              const valorTexto = c.tipo === 'percentual' ? `${Number(c.valor || 0)}% OFF` : c.tipo === 'valor_fixo' ? `R$ ${dinheiro(Number(c.valor || 0))} OFF` : 'Beneficio'
              return (
                <button
                  key={c.codigo}
                  type="button"
                  disabled={c.bloqueado}
                  onClick={() => aplicarCupom(c.codigo)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    border: `1.5px solid ${selecionado ? '#16a34a' : c.bloqueado ? 'rgba(100,116,139,0.16)' : 'rgba(14,165,233,0.24)'}`,
                    background: selecionado ? '#ecfdf5' : c.bloqueado ? '#f8fafc' : '#ffffff',
                    opacity: c.bloqueado ? 0.68 : 1,
                    borderRadius: 18,
                    padding: 13,
                    cursor: c.bloqueado ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 15, background: c.bloqueado ? '#e2e8f0' : 'linear-gradient(135deg,#0ea5e9,#22c55e)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {selecionado ? <Check size={18} /> : <TicketPercent size={18} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13.5, fontWeight: 950, color: '#0f172a' }}>{c.codigo}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 950, color: c.bloqueado ? '#64748b' : '#15803d', background: c.bloqueado ? '#e2e8f0' : '#dcfce7', borderRadius: 999, padding: '3px 7px' }}>{valorTexto}</span>
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#475569', marginTop: 3 }}>{c.titulo}</div>
                    <div style={{ fontSize: 11, fontWeight: 750, color: c.bloqueado ? '#94a3b8' : '#0ea5e9', marginTop: 3 }}>{selecionado ? `Aplicado: economia de R$ ${dinheiro(desconto)}` : c.motivo}</div>
                  </div>
                </button>
              )
            })}

            <button type="button" onClick={() => setMostrarCodigoManual(v => !v)} style={{ border: '1px dashed rgba(14,165,233,0.35)', background: '#ffffff', color: '#0284c7', borderRadius: 15, padding: '12px 14px', fontSize: 12.5, fontWeight: 900, cursor: 'pointer' }}>
              {mostrarCodigoManual ? 'Ocultar codigo manual' : 'Tenho um codigo de cupom'}
            </button>

            {mostrarCodigoManual && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                <input value={cupomTexto} onChange={e => setCupomTexto(e.target.value.toUpperCase())} placeholder="Digite seu codigo" style={darkInput} />
                <button type="button" onClick={() => aplicarCupom()} style={{ border: 'none', background: '#0ea5e9', color: '#fff', borderRadius: 15, padding: '0 14px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}>
                  Aplicar
                </button>
              </div>
            )}
          </div>
          {(cupomErro || cupomAplicado) && (
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: cupomErro ? '#dc2626' : '#15803d' }}>
              {cupomErro || `${cupomAplicado?.codigo}: economia de R$ ${dinheiro(desconto)}.`}
            </div>
          )}
        </div>

        {/* Pagamento */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={18} color="#0ea5e9" /> Forma de Pagamento
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {([
              ['pix', QrCode, 'PIX', 'na hora'],
              ['credito_online', CreditCard, 'Crédito', 'na hora'],
              ['debito_online', CreditCard, 'Débito', 'na hora'],
              ['dinheiro', Banknote, 'Dinheiro', 'na entrega'],
              ['cartao_fisico', CreditCard, 'Maquininha', 'na entrega'],
            ] as const).map(([key, Icon, label, hint]) => {
              const sel = pagamento === key
              return (
                <button key={key} onClick={() => setPagamento(key)} style={{
                  background: sel ? 'rgba(14,165,233,0.15)' : '#f1f5f9',
                  border: `1.5px solid ${sel ? '#0ea5e9' : 'rgba(0,0,0,0.06)'}`,
                  borderRadius: 16, padding: '14px 8px', color: sel ? '#0ea5e9' : '#64748b',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', transition: 'all 0.2s'
                }}>
                  <Icon size={22} />
                  <span style={{ fontSize: 12.5, fontWeight: 800 }}>{label}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, opacity: 0.75 }}>{hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* CPF na nota (opcional) */}
        <div style={{ marginBottom: 24 }}>
          <button
            type="button"
            onClick={() => {
              const abrindo = !querCpfNota
              setQuerCpfNota(abrindo)
              // Pré-preenche com o CPF do perfil, se já tiver
              if (abrindo && !cpfNota && perfilCliente?.cpf) setCpfNota(formatarCpf(perfilCliente.cpf))
            }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: querCpfNota ? 'rgba(14,165,233,0.08)' : '#f8fafc', border: `1.5px solid ${querCpfNota ? '#0ea5e9' : 'rgba(0,0,0,0.06)'}`, borderRadius: 16, padding: '14px 16px', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 7, border: `2px solid ${querCpfNota ? '#0ea5e9' : '#cbd5e1'}`, background: querCpfNota ? '#0ea5e9' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {querCpfNota && <Check size={14} color="#fff" strokeWidth={3.5} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Adicionar CPF na nota</div>
              <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Quer o CPF no comprovante do pedido? (opcional)</div>
            </div>
            <FileText size={20} color={querCpfNota ? '#0ea5e9' : '#94a3b8'} />
          </button>
          <AnimatePresence>
            {querCpfNota && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <input
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={cpfNota}
                  onChange={e => setCpfNota(formatarCpf(e.target.value))}
                  style={{ width: '100%', marginTop: 10, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '14px', fontSize: 16, fontWeight: 700, color: '#0f172a', background: '#f8fafc', outline: 'none' }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Localização */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} color="#f43f5e" /> Onde te encontrar
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 18, padding: '12px 14px', marginBottom: 14 }}>
            <Navigation size={18} color="#ea580c" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#9a3412' }}>Entrega na praia</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b' }}>Use reta/barraca ou Radar GPS para o vendedor te achar rapido.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6 }}>RETA / RUA</label>
              <input value={reta} onChange={e => setReta(e.target.value)} placeholder="Ex: 10" style={darkInput} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 6 }}>BARRACA</label>
              <input value={barraca} onChange={e => setBarraca(e.target.value)} placeholder="Ex: 42" style={darkInput} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {([['fixa', 'Ponto fixo'], ['tempo_real', 'Radar GPS']] as const).map(([key, titulo]) => {
              const sel = modo === key
              return (
                <button key={key} onClick={() => setModo(key)} style={{
                  flex: 1, padding: '14px', borderRadius: 16, cursor: 'pointer',
                  border: `1.5px solid ${sel ? '#22c55e' : 'rgba(0,0,0,0.06)'}`,
                  background: sel ? 'rgba(34,197,94,0.1)' : '#f1f5f9', opacity: 1,
                  color: sel ? '#22c55e' : '#64748b', fontSize: 13, fontWeight: 800, transition: 'all 0.2s'
                }}>
                  {titulo}
                </button>
              )
            })}
          </div>
          {modo === 'tempo_real' && (
            <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.45, color: radarReal ? '#15803d' : '#b45309', background: radarReal ? '#ecfdf5' : '#fffbeb', border: `1px solid ${radarReal ? '#bbf7d0' : '#fde68a'}`, borderRadius: 14, padding: '10px 12px', fontWeight: 700 }}>
              {radarReal
                ? `Radar pronto: vamos enviar sua posicao ${gpsFonte === 'gps' ? 'GPS' : 'salva'} para o vendedor.`
                : `Buscando permissao de localizacao (${gpsStatus}). Ative o GPS do celular para fechar pelo Radar.`}
            </div>
          )}
        </div>

        {erro && <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 800, marginBottom: 16, textAlign: 'center', background: 'rgba(239,68,68,0.1)', padding: 12, borderRadius: 12 }}>{erro}</div>}

        <motion.button whileTap={{ scale: 0.96 }} onClick={handleConfirm} disabled={confirming} style={{ width: '100%', background: confirming ? '#22c55e' : 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 20, padding: '20px', color: '#fff', fontSize: 18, fontWeight: 900, cursor: confirming ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, boxShadow: confirming ? '0 0 20px rgba(34,197,94,0.6)' : '0 10px 30px rgba(14,165,233,0.4)', transition: 'all 0.3s' }}>
          {confirming ? <><Check size={24} /> {isMercadoPagoMethod(pagamento) ? 'Preparando pagamento...' : 'Pedido Enviado!'}</> : <><Send size={20} /> Fechar Pedido · R$ {dinheiro(total)}</>}
        </motion.button>
      </motion.div>
    </div>
  )
}

const darkInput: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 16,
  border: '1px solid rgba(0,0,0,0.08)', fontSize: 16, outline: 'none',
  color: '#0f172a', background: '#ffffff', boxSizing: 'border-box',
}

/* ─── PÁGINA PRINCIPAL ──────────────────────────────────── */
type Step = 'menu' | 'checkout' | 'rastreando'

/* ─── LISTA DE LOJAS (estilo iFood) ─────────────────────── */
function tempoMinutos(tempo: string) {
  const n = Number(String(tempo).match(/\d+/)?.[0] ?? 999)
  return Number.isFinite(n) ? n : 999
}

function LojaCard({ v, index, onOpen }: { v: Vendedor; index: number; onOpen: () => void }) {
  const rapido = tempoMinutos(v.tempo) <= 30
  const temPromocao = v.produtos.some(p => p.promocao || (p.precoOriginal && p.precoOriginal > p.preco))
  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.06, 0.4), type: 'spring', damping: 22, stiffness: 260 }}
      whileTap={{ scale: 0.97 }}
      onClick={onOpen}
      style={{ width: '100%', textAlign: 'left', background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 26, overflow: 'hidden', cursor: 'pointer', padding: 0, boxShadow: '0 10px 30px rgba(15,23,42,0.07)' }}
    >
      <div style={{ position: 'relative', height: 132 }}>
        <img src={v.image} alt={v.nome} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: v.aberto ? 'none' : 'grayscale(0.9) brightness(0.9)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(255,255,255,0.95), transparent 55%)' }} />
        {/* Badge aberto/fechado com horário */}
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', alignItems: 'center', gap: 6, background: v.aberto ? 'rgba(34,197,94,0.95)' : 'rgba(100,116,139,0.95)', color: '#fff', borderRadius: 999, padding: '6px 12px', fontSize: 11, fontWeight: 900, boxShadow: '0 6px 16px rgba(0,0,0,0.18)' }}>
          <Clock size={12} /> {labelHorario(v.aberto, v.horarioAbre, v.horarioFecha)}
        </div>
        {(temPromocao || rapido) && (
          <div style={{ position: 'absolute', top: 12, left: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.96)', color: temPromocao ? '#16a34a' : '#0284c7', borderRadius: 999, padding: '6px 11px', fontSize: 11, fontWeight: 900, boxShadow: '0 6px 16px rgba(0,0,0,0.12)' }}>
            {temPromocao ? <TicketPercent size={12} /> : <Zap size={12} />} {temPromocao ? 'Promo ativa' : 'Rapida'}
          </div>
        )}
        <div style={{ position: 'absolute', left: 16, bottom: -22, width: 56, height: 56, borderRadius: 18, background: v.gradiente, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, border: '3px solid #ffffff', boxShadow: '0 8px 20px rgba(14,165,233,0.35)' }}>
          {v.emoji}
        </div>
      </div>
      <div style={{ padding: '30px 16px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a', letterSpacing: -0.3 }}>{v.nome}</div>
          {v.tipo === 'restaurante'
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 900, color: '#ea580c', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.25)', borderRadius: 999, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}><UtensilsCrossed size={11} /> Restaurante</span>
            : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 900, color: '#16a34a', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 999, padding: '4px 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}><Umbrella size={11} /> Ambulante</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5, color: '#64748b', fontWeight: 600 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#b45309', fontWeight: 800 }}>
            <Star size={13} fill="#fbbf24" color="#fbbf24" /> {v.avaliacao > 0 ? v.avaliacao.toFixed(1) : 'Novo'}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }} />
          <span>{v.categoria}</span>
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#cbd5e1' }} />
          <span>{v.tempo}</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ecfdf5', color: '#15803d', border: '1px solid #bbf7d0', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 900 }}>
            <CreditCard size={11} /> Pix/cartao no app
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#eff6ff', color: '#0284c7', border: '1px solid #bfdbfe', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 900 }}>
            <TicketPercent size={11} /> BEMVINDO20
          </span>
        </div>
        <div style={{ marginTop: 10, fontSize: 12, fontWeight: 800, color: v.aberto ? '#0ea5e9' : '#94a3b8' }}>
          {v.aberto ? `Ver cardápio · ${v.produtos.length} ite${v.produtos.length === 1 ? 'm' : 'ns'} →` : 'Loja fechada — toque pra espiar o cardápio'}
        </div>
      </div>
    </motion.button>
  )
}

function LojasList({ vendedores, loading, tipoInicial }: { vendedores: Vendedor[]; loading: boolean; tipoInicial: string | null }) {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState<'todos' | 'restaurante' | 'ambulante'>(
    tipoInicial === 'restaurante' || tipoInicial === 'ambulante' ? tipoInicial : 'todos'
  )
  const [atalho, setAtalho] = useState<'todos' | 'abertas' | 'cupom' | 'rapidas' | 'avaliadas'>('todos')
  const [busca, setBusca] = useState('')

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = vendedores
      .filter(v => filtro === 'todos' || v.tipo === filtro)
      .filter(v => !q || v.nome.toLowerCase().includes(q) || v.categoria.toLowerCase().includes(q) || v.produtos.some(p => p.nome.toLowerCase().includes(q)))
      .filter(v => atalho !== 'abertas' || v.aberto)
      .filter(v => atalho !== 'rapidas' || tempoMinutos(v.tempo) <= 35)
    return base.sort((a, b) => {
      if (atalho === 'avaliadas') return b.avaliacao - a.avaliacao || Number(b.aberto) - Number(a.aberto)
      if (atalho === 'rapidas') return tempoMinutos(a.tempo) - tempoMinutos(b.tempo) || Number(b.aberto) - Number(a.aberto)
      return Number(b.aberto) - Number(a.aberto) || b.avaliacao - a.avaliacao
    })
  }, [vendedores, filtro, busca, atalho])

  const abertas = filtrados.filter(v => v.aberto).length
  const chips: Array<{ key: 'todos' | 'restaurante' | 'ambulante'; label: string; icon: React.ReactNode }> = [
    { key: 'todos', label: 'Todas', icon: <Store size={13} /> },
    { key: 'restaurante', label: 'Restaurantes', icon: <UtensilsCrossed size={13} /> },
    { key: 'ambulante', label: 'Ambulantes', icon: <Umbrella size={13} /> },
  ]
  const atalhos: Array<{ key: typeof atalho; label: string; icon: React.ReactNode }> = [
    { key: 'todos', label: 'Relevancia', icon: <SlidersHorizontal size={13} /> },
    { key: 'abertas', label: 'Aberto agora', icon: <Clock size={13} /> },
    { key: 'cupom', label: 'Com cupom', icon: <TicketPercent size={13} /> },
    { key: 'rapidas', label: 'Mais rapidas', icon: <Zap size={13} /> },
    { key: 'avaliadas', label: 'Melhor nota', icon: <Star size={13} /> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', padding: '26px 20px 56px', borderBottomLeftRadius: 34, borderBottomRightRadius: 34, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -60, right: -40, width: 190, height: 190, borderRadius: '50%', background: 'rgba(255,255,255,0.14)', filter: 'blur(2px)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Voltar" onClick={() => navigate('/')} style={{ width: 42, height: 42, borderRadius: 14, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={19} color="#fff" />
          </button>
          <div>
            <motion.h1 initial={{ opacity: 0, x: -14 }} animate={{ opacity: 1, x: 0 }} style={{ fontSize: 24, fontWeight: 900, color: '#fff', letterSpacing: -0.5, margin: 0 }}>Onde vamos pedir? 🏖️</motion.h1>
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 600, margin: '4px 0 0' }}>
              {loading ? 'Procurando lojas na areia…' : `${abertas} loja${abertas === 1 ? '' : 's'} aberta${abertas === 1 ? '' : 's'} agora`}
            </motion.p>
          </div>
        </div>
      </div>

      {/* Busca flutuante */}
      <div style={{ padding: '0 20px', marginTop: -26, position: 'relative', zIndex: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ffffff', borderRadius: 18, padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 14px 34px rgba(15,23,42,0.12)' }}>
          <Search size={18} color="#94a3b8" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar loja, comida, bebida…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, fontWeight: 600, color: '#0f172a', background: 'transparent' }}
          />
          {busca && <button aria-label="Limpar" onClick={() => setBusca('')} style={{ border: 'none', background: '#f1f5f9', borderRadius: 10, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} color="#64748b" /></button>}
        </div>
      </div>

      {/* Beneficio PraiaGo */}
      <div style={{ padding: '14px 20px 0' }}>
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setAtalho('cupom')}
          style={{ width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 24, padding: 0, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', overflow: 'hidden', boxShadow: '0 14px 34px rgba(14,165,233,0.22)' }}
        >
          <div style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14, color: '#fff', position: 'relative' }}>
            <div style={{ width: 46, height: 46, borderRadius: 16, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.26)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TicketPercent size={23} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 950, letterSpacing: -0.2 }}>20% na primeira compra</div>
              <div style={{ marginTop: 3, fontSize: 12.5, fontWeight: 700, opacity: 0.92 }}>Use BEMVINDO20 uma vez por conta com CPF e e-mail confirmados.</div>
            </div>
            <Sparkles size={21} />
          </div>
        </motion.button>
      </div>

      {/* Chips de filtro */}
      <div style={{ display: 'flex', gap: 8, padding: '16px 20px 6px', overflowX: 'auto' }}>
        {chips.map(c => (
          <motion.button key={c.key} whileTap={{ scale: 0.94 }} onClick={() => setFiltro(c.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 999, fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', cursor: 'pointer', border: filtro === c.key ? '1px solid rgba(14,165,233,0.4)' : '1px solid rgba(0,0,0,0.08)', background: filtro === c.key ? 'linear-gradient(135deg, rgba(14,165,233,0.14), rgba(34,197,94,0.14))' : '#ffffff', color: filtro === c.key ? '#0284c7' : '#64748b' }}>
            {c.icon} {c.label}
          </motion.button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '6px 20px 4px', overflowX: 'auto' }}>
        {atalhos.map(c => (
          <motion.button key={c.key} whileTap={{ scale: 0.94 }} onClick={() => setAtalho(c.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 850, whiteSpace: 'nowrap', cursor: 'pointer', border: atalho === c.key ? '1px solid rgba(14,165,233,0.42)' : '1px solid rgba(0,0,0,0.08)', background: atalho === c.key ? '#e0f2fe' : '#ffffff', color: atalho === c.key ? '#0284c7' : '#64748b' }}>
            {c.icon} {c.label}
          </motion.button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ padding: '12px 20px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading && vendedores.length === 0 && [0, 1, 2].map(i => (
          <div key={i} style={{ height: 210, borderRadius: 26, background: 'linear-gradient(100deg, #f1f5f9 40%, #ffffff 50%, #f1f5f9 60%)', backgroundSize: '200% 100%', animation: 'shimmer 1.4s linear infinite' }} />
        ))}
        {!loading && filtrados.length === 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} style={{ textAlign: 'center', padding: '56px 24px', background: '#ffffff', borderRadius: 26, border: '1px dashed rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🏖️</div>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#0f172a' }}>{busca ? 'Nada com esse nome por aqui' : 'Nenhuma loja disponível agora'}</div>
            <p style={{ fontSize: 13.5, color: '#64748b', marginTop: 8, fontWeight: 500 }}>
              {busca ? 'Tenta buscar outra coisa gostosa 😋' : 'Assim que um ambulante ou restaurante abrir, ele aparece aqui.'}
            </p>
          </motion.div>
        )}
        {filtrados.map((v, i) => (
          <LojaCard key={v.id} v={v} index={i} onOpen={() => navigate(`/pedir?v=${v.id}`)} />
        ))}
      </div>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  )
}

export default function PedirPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { pos: clientePos, status: gpsStatus, fonte: gpsFonte } = useGPS()

  const vendedores = useCatalogo(s => s.vendedores)
  const catalogoLoading = useCatalogo(s => s.loading)
  // Loja específica SÓ quando escolhida (?v=id). Sem isso, mostra a LISTA de
  // lojas disponíveis (antes caía direto na primeira loja — feio e confuso).
  const vendedor = useMemo<Vendedor | undefined>(() => {
    const id = params.get('v')
    return id ? vendedores.find(v => v.id === id) : undefined
  }, [params, vendedores])

  const carrinho = useStore(s => s.carrinho)
  const carrinhoVendedor = useStore(s => s.carrinhoVendedor)
  const addItem = useStore(s => s.addItem)
  const isFav = useStore(s => (vendedor ? s.favoritos.includes(vendedor.id) : false))
  const toggleFavorito = useStore(s => s.toggleFavorito)

  const [step, setStep] = useState<Step>('menu')
  const [entrega, setEntrega] = useState<Entrega | null>(null)
  const [pedidoId, setPedidoId] = useState<string | null>(null)

  // Sem loja escolhida → lista de lojas disponíveis (estilo iFood).
  if (!vendedor) {
    return <LojasList vendedores={vendedores} loading={catalogoLoading} tipoInicial={params.get('tipo')} />
  }

  const meuCarrinho = carrinhoVendedor === vendedor.id ? carrinho : {}
  const totalItens = vendedor.produtos.reduce((a, p) => a + (meuCarrinho[p.id] ?? 0), 0)
  const totalPreco = vendedor.produtos.reduce((a, p) => a + (meuCarrinho[p.id] ?? 0) * p.preco, 0)

  return (
    <div style={{ minHeight: '100vh', background: '#ffffff', color: '#0f172a' }}>
      <AnimatePresence>
        {step === 'checkout' && <CheckoutModal vendedor={vendedor} clientePos={clientePos} gpsStatus={gpsStatus} gpsFonte={gpsFonte} onConfirm={(e, pid) => { setEntrega(e); setPedidoId(pid); setStep('rastreando') }} onClose={() => setStep('menu')} />}
        {step === 'rastreando' && <RastreamentoModal vendedor={vendedor} clientePos={clientePos} entrega={entrega} pedidoId={pedidoId} onClose={() => { setStep('menu'); navigate('/') }} />}
      </AnimatePresence>

      <div style={{ position: 'relative', height: 260 }}>
        <img src={vendedor.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={vendedor.nome} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(255,255,255,0.4), transparent 40%, rgba(255,255,255,1) 98%)' }} />
        <button aria-label="Voltar" onClick={() => navigate('/pedir')} style={{ position: 'absolute', top: 20, left: 20, width: 44, height: 44, borderRadius: 16, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ArrowLeft size={20} color="#0f172a" />
        </button>
        <button aria-label="Favoritar" onClick={() => toggleFavorito(vendedor.id)} style={{ position: 'absolute', top: 20, right: 20, width: 44, height: 44, borderRadius: 16, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <Heart size={20} color={isFav ? '#f43f5e' : '#94a3b8'} fill={isFav ? '#f43f5e' : 'none'} />
        </button>
      </div>

      <div style={{ padding: '0 24px', marginTop: -80, position: 'relative', zIndex: 10 }}>
        <div style={{ background: '#f8fafc', borderRadius: 32, padding: '24px', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', letterSpacing: -0.5 }}>{vendedor.nome}</h1>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: vendedor.aberto ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.14)', color: vendedor.aberto ? '#16a34a' : '#64748b', padding: '6px 14px', borderRadius: 14, fontSize: 11.5, fontWeight: 900, border: `1px solid ${vendedor.aberto ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.25)'}`, whiteSpace: 'nowrap' }}>
              <Clock size={13} /> {labelHorario(vendedor.aberto, vendedor.horarioAbre, vendedor.horarioFecha)}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800 }}>
              <Star size={16} fill="#fbbf24" color="#fbbf24" style={{ filter: 'drop-shadow(0 0 4px rgba(251,191,36,0.6))' }} /> {vendedor.avaliacao}
            </div>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#475569' }} />
            <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>{vendedor.categoria}</div>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#475569' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#38bdf8', fontWeight: 700 }}>
              <MapPin size={14} /> {vendedor.distancia}
            </div>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.24)', borderRadius: 14, padding: '8px 16px' }}>
            <Zap size={14} color="#0ea5e9" className="animate-pulse-neon" style={{ boxShadow: 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#0284c7' }}>Cupom BEMVINDO20 · 1 uso por conta</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
            {[
              { icon: <Navigation size={16} color="#0ea5e9" />, title: 'Radar PraiaGo', text: 'GPS, reta ou barraca' },
              { icon: <Shield size={16} color="#16a34a" />, title: 'Pagamento seguro', text: 'Pix e cartao no app' },
            ].map(item => (
              <div key={item.title} style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 18, padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 12, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: '#0f172a' }}>{item.title}</div>
                  <div style={{ fontSize: 11, fontWeight: 650, color: '#64748b', marginTop: 2, lineHeight: 1.25 }}>{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '32px 24px 140px' }}>
        <h3 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>Cardápio <span style={{ fontSize: 24 }}>🔥</span></h3>
        {vendedor.produtos.map(p => {
          const qtd = meuCarrinho[p.id] ?? 0
          const precoOriginal = p.precoOriginal && p.precoOriginal > p.preco ? p.precoOriginal : null
          const promocaoLabel = p.promocao?.selo || (precoOriginal ? 'Oferta PraiaGo' : null)
          return (
            <div key={p.id} style={{ display: 'flex', gap: 20, marginBottom: 32, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                {promocaoLabel && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa', borderRadius: 999, padding: '4px 9px', fontSize: 10.5, fontWeight: 950, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.35 }}>
                    <TicketPercent size={11} /> {promocaoLabel}
                  </div>
                )}
                <h4 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{p.nome}</h4>
                <p style={{ fontSize: 14, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>{p.desc}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#16a34a', textShadow: '0 0 10px rgba(74,222,128,0.16)' }}>R$ {p.preco.toFixed(2).replace('.', ',')}</div>
                  {precoOriginal && <div style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', textDecoration: 'line-through' }}>R$ {precoOriginal.toFixed(2).replace('.', ',')}</div>}
                </div>
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 100, height: 100, borderRadius: 24, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.2)', overflow: 'hidden' }}>{p.foto ? <img src={p.foto} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.emoji}</div>
                {promocaoLabel && <div style={{ position: 'absolute', top: -8, right: -8, background: '#ea580c', color: '#fff', borderRadius: 999, padding: '5px 8px', fontSize: 10, fontWeight: 950, boxShadow: '0 8px 18px rgba(234,88,12,0.35)' }}>OFF</div>}
                <div style={{ position: 'absolute', bottom: -14, left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', background: '#0ea5e9', borderRadius: 16, boxShadow: '0 8px 20px rgba(14,165,233,0.4)' }}>
                  {qtd > 0 ? (
                    <>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => addItem(vendedor.id, p.id, -1)} style={{ padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', color: '#fff', fontWeight: 900, fontSize: 20, lineHeight: 1 }}>−</motion.button>
                      <span style={{ fontSize: 15, fontWeight: 900, color: '#fff', minWidth: 24, textAlign: 'center' }}>{qtd}</span>
                      <motion.button whileTap={{ scale: 0.9 }} onClick={() => addItem(vendedor.id, p.id, 1)} style={{ padding: '6px 12px', border: 'none', background: 'none', cursor: 'pointer', color: '#fff', fontWeight: 900, fontSize: 20, lineHeight: 1 }}>+</motion.button>
                    </>
                  ) : (
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => addItem(vendedor.id, p.id, 1)} style={{ padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer', color: '#fff', fontWeight: 800, fontSize: 14 }}>Add</motion.button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {totalItens > 0 && (
          <motion.div initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }} style={{ position: 'fixed', bottom: 100, left: 24, right: 24, maxWidth: 400, margin: '0 auto', zIndex: 100 }}>
            <motion.button whileTap={{ scale: vendedor.aberto ? 0.98 : 1 }} disabled={!vendedor.aberto} onClick={() => { if (vendedor.aberto) setStep('checkout') }} style={{ width: '100%', background: vendedor.aberto ? 'linear-gradient(135deg, #0ea5e9, #22c55e)' : '#94a3b8', color: '#fff', border: 'none', borderRadius: 28, padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: vendedor.aberto ? '0 20px 40px rgba(34,197,94,0.4)' : 'none', cursor: vendedor.aberto ? 'pointer' : 'not-allowed' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 14, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900 }}>{totalItens}</div>
                <span style={{ fontSize: 16, fontWeight: 900 }}>{vendedor.aberto ? 'Finalizar Pedido' : 'Loja fechada agora 😴'}</span>
              </div>
              <span style={{ fontSize: 20, fontWeight: 900 }}>R$ {totalPreco.toFixed(2)}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
