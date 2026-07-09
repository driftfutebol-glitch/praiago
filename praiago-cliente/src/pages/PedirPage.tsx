import { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, MapPin, X, WifiOff, Star, Check, Zap, Send, Heart, Shield, Navigation, CreditCard, Banknote, QrCode, Trash2 } from 'lucide-react'
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
import { criarCheckoutMercadoPago, isMercadoPagoMethod } from '../lib/mercadopago'
import { useCatalogo } from '../store/useCatalogo'
import { useStore, type Entrega } from '../store/useStore'
import { confirmDialog, alertDialog } from '../lib/dialog'
import { supabase } from '../lib/supabase'

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

/* ─── CHECKOUT MODAL ────────────────────────────────────── */
function CheckoutModal({ vendedor, onConfirm, onClose, clientePos, gpsStatus, gpsFonte }: { vendedor: Vendedor; onConfirm: (e: Entrega, pedidoId: string) => void; onClose: () => void; clientePos: [number, number]; gpsStatus: GPSStatus; gpsFonte: GPSFonte }) {
  const [confirming, setConfirming] = useState(false)
  const [reta, setReta] = useState('')
  const [barraca, setBarraca] = useState('')
  const [modo, setModo] = useState<'fixa' | 'tempo_real'>('fixa')
  const [pagamento, setPagamento] = useState<Entrega['pagamento']>('pix')
  const [erro, setErro] = useState('')
  const carrinho = useStore(s => s.carrinho)
  const criarPedido = useStore(s => s.criarPedido)
  const setQtd = useStore(s => s.setQtd)
  const limparCarrinho = useStore(s => s.limparCarrinho)
  const addNotif = useStore(s => s.addNotif)
  const sessao = useStore(s => s.sessao)

  const itensList = vendedor.produtos.filter(p => (carrinho[p.id] ?? 0) > 0)
  const total = itensList.reduce((acc, p) => acc + p.preco * carrinho[p.id], 0)
  const radarReal = gpsFonte === 'gps' || gpsFonte === 'manual' || gpsFonte === 'memoria'

  function removerItem(produtoId: string) {
    setQtd(produtoId, 0)
    if (itensList.length <= 1) setTimeout(onClose, 0)
  }

  function excluirPedido() {
    limparCarrinho()
    onClose()
  }

  async function handleConfirm() {
    if (itensList.length === 0) { setErro('Seu pedido esta vazio.'); return }
    if (modo === 'fixa' && !reta.trim() && !barraca.trim()) { setErro('Informe a reta ou barraca para te acharmos.'); return }
    if (modo === 'tempo_real' && !radarReal) { setErro('Ative a localizacao do celular para usar o Radar GPS real.'); return }
    setErro('')
    setConfirming(true)
    const entrega: Entrega = { reta: reta.trim(), barraca: barraca.trim(), modo, pagamento, lat: clientePos[0], lng: clientePos[1] }
    const usaMercadoPago = isMercadoPagoMethod(pagamento)
    const pedido = await criarPedido(entrega, { limparCarrinho: !usaMercadoPago })
    if (!pedido) {
      setErro('Erro ao criar pedido. Tente novamente.')
      setConfirming(false)
      return
    }
    if (usaMercadoPago) {
      // Pagamento online: o vendedor SÓ recebe o pedido depois que o Mercado
      // Pago confirmar — nada de broadcast nem "pedido enviado" antes de pagar.
      addNotif({ titulo: 'Falta só o pagamento 💳', texto: 'Finalize no Mercado Pago para o pedido ser enviado ao vendedor.' })
      try {
        const checkout = await criarCheckoutMercadoPago(pedido.id)
        limparCarrinho()
        window.location.assign(checkout.checkout_url)
        return
      } catch (err) {
        setErro(err instanceof Error ? err.message : 'Nao foi possivel abrir o Mercado Pago.')
        setConfirming(false)
        return
      }
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'flex-end' }}>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} style={{ width: '100%', background: '#ffffff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: '24px 24px 36px', maxHeight: '92vh', overflowY: 'auto', border: '1px solid rgba(0,0,0,0.08)' }}>
        <div style={{ width: 48, height: 6, background: '#e2e8f0', borderRadius: 10, margin: '0 auto 24px' }} />
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Checkout</h2>
          <button aria-label="Fechar" onClick={onClose} style={{ background: '#f8fafc', border: 'none', borderRadius: 14, padding: 10, cursor: 'pointer' }}><X size={20} color="#94a3b8" /></button>
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
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 16, marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#64748b' }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#22c55e', textShadow: '0 0 10px rgba(34,197,94,0.4)' }}>R$ {total.toFixed(2)}</span>
          </div>
        </div>

        {/* Pagamento */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={18} color="#0ea5e9" /> Forma de Pagamento
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {([
              ['pix', QrCode, 'PIX MP'],
              ['credito_online', CreditCard, 'Credito MP'],
              ['debito_online', CreditCard, 'Debito MP'],
              ['mercadopago', CreditCard, 'Saldo MP'],
              ['dinheiro', Banknote, 'Dinheiro'],
              ['cartao_fisico', CreditCard, 'Maquininha'],
            ] as const).map(([key, Icon, label]) => {
              const sel = pagamento === key
              return (
                <button key={key} onClick={() => setPagamento(key)} style={{
                  background: sel ? 'rgba(14,165,233,0.15)' : '#f1f5f9',
                  border: `1.5px solid ${sel ? '#0ea5e9' : 'rgba(0,0,0,0.06)'}`,
                  borderRadius: 16, padding: '16px 8px', color: sel ? '#0ea5e9' : '#64748b',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'all 0.2s'
                }}>
                  <Icon size={24} />
                  <span style={{ fontSize: 12, fontWeight: 800 }}>{label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Localização */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={18} color="#f43f5e" /> Onde te encontrar
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
            {([['fixa', '📍 Ponto Fixo'], ['tempo_real', '🛰️ Radar GPS']] as const).map(([key, titulo]) => {
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
          {confirming ? <><Check size={24} /> {isMercadoPagoMethod(pagamento) ? 'Abrindo Mercado Pago...' : 'Pedido Enviado!'}</> : <><Send size={20} /> Fechar Pedido</>}
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

export default function PedirPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { pos: clientePos, status: gpsStatus, fonte: gpsFonte } = useGPS()

  const vendedores = useCatalogo(s => s.vendedores)
  const vendedor = useMemo<Vendedor | undefined>(() => {
    const id = params.get('v')
    const tipo = params.get('tipo')
    return vendedores.find(v => v.id === id) ??
      (tipo === 'restaurante' || tipo === 'ambulante'
        ? vendedores.find(v => v.tipo === tipo)
        : undefined) ??
      vendedores[0]
  }, [params, vendedores])

  const carrinho = useStore(s => s.carrinho)
  const carrinhoVendedor = useStore(s => s.carrinhoVendedor)
  const addItem = useStore(s => s.addItem)
  const isFav = useStore(s => (vendedor ? s.favoritos.includes(vendedor.id) : false))
  const toggleFavorito = useStore(s => s.toggleFavorito)

  const [step, setStep] = useState<Step>('menu')
  const [entrega, setEntrega] = useState<Entrega | null>(null)
  const [pedidoId, setPedidoId] = useState<string | null>(null)

  // Sem nenhuma loja disponível: mostra estado vazio em vez de quebrar (tela branca).
  if (!vendedor) {
    return (
      <div style={{ minHeight: '100vh', background: '#ffffff', color: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🏖️</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>Nenhuma loja por aqui ainda</h2>
        <p style={{ fontSize: 14, color: '#64748b', marginTop: 8, maxWidth: 280 }}>Assim que um ambulante ou restaurante ficar online na sua área, ele aparece aqui.</p>
        <button onClick={() => navigate('/')} style={{ marginTop: 24, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 16, padding: '14px 28px', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>Voltar ao início</button>
      </div>
    )
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
        <button aria-label="Voltar" onClick={() => navigate('/')} style={{ position: 'absolute', top: 20, left: 20, width: 44, height: 44, borderRadius: 16, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(10px)', border: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
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
            <div style={{ background: vendedor.aberto ? 'rgba(34,197,94,0.15)' : 'rgba(244,63,94,0.15)', color: vendedor.aberto ? '#4ade80' : '#fb7185', padding: '6px 16px', borderRadius: 14, fontSize: 12, fontWeight: 800, border: `1px solid ${vendedor.aberto ? 'rgba(34,197,94,0.3)' : 'rgba(244,63,94,0.3)'}`, boxShadow: vendedor.aberto ? '0 0 10px rgba(34,197,94,0.2)' : 'none' }}>
              {vendedor.aberto ? 'ONLINE' : 'OFFLINE'}
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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 16, background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: 14, padding: '8px 16px' }}>
            <Zap size={14} color="#c084fc" className="animate-pulse-neon" style={{ boxShadow: 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 800, color: '#d8b4fe', textShadow: '0 0 8px rgba(168,85,247,0.5)' }}>Zona {vendedor.zona} · Alta Demanda</span>
          </div>
        </div>
      </div>

      <div style={{ padding: '32px 24px 140px' }}>
        <h3 style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}>Cardápio <span style={{ fontSize: 24 }}>🔥</span></h3>
        {vendedor.produtos.map(p => {
          const qtd = meuCarrinho[p.id] ?? 0
          return (
            <div key={p.id} style={{ display: 'flex', gap: 20, marginBottom: 32, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{p.nome}</h4>
                <p style={{ fontSize: 14, color: '#64748b', marginTop: 6, lineHeight: 1.5 }}>{p.desc}</p>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#4ade80', marginTop: 10, textShadow: '0 0 10px rgba(74,222,128,0.2)' }}>R$ {p.preco.toFixed(2).replace('.', ',')}</div>
              </div>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 100, height: 100, borderRadius: 24, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, border: '1px solid rgba(0,0,0,0.05)', boxShadow: 'inset 0 4px 20px rgba(0,0,0,0.2)', overflow: 'hidden' }}>{p.foto ? <img src={p.foto} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : p.emoji}</div>
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
            <motion.button whileTap={{ scale: 0.98 }} onClick={() => setStep('checkout')} style={{ width: '100%', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: '#fff', border: 'none', borderRadius: 28, padding: '22px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 20px 40px rgba(34,197,94,0.4)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 14, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 900 }}>{totalItens}</div>
                <span style={{ fontSize: 16, fontWeight: 900 }}>Finalizar Pedido</span>
              </div>
              <span style={{ fontSize: 20, fontWeight: 900 }}>R$ {totalPreco.toFixed(2)}</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
