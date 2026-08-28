import { useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { motion } from 'framer-motion'
import { MapPin, Navigation, Phone, Radio, Store, UserRound, X } from 'lucide-react'
import { PRAIA_GRANDE_CENTER } from '../lib/praiagoZones'
import { useLocalizacaoCliente } from '../hooks/useLocalizacaoCliente'
import type { Pedido } from '../store/useOrders'
import { MAPA_TILES, MAPA_ATRIBUICAO, MAPA_ZOOM_MAX } from '../lib/mapa'

// Onde o cliente esta, para quem vai levar o pedido.
//
// Duas fontes, nesta ordem:
//   1. A posicao ao vivo, se o cliente ligou o compartilhamento no app dele.
//   2. O ponto congelado no momento do pedido.
//
// A tela SEMPRE diz qual das duas esta mostrando. Um ponto de meia hora atras
// apresentado como se fosse agora e pior do que nao ter ponto nenhum: manda o
// entregador com confianca para o lugar errado.

function mkIcon(icon: React.ReactNode, background: string, size = 40) {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${background};color:#fff;display:flex;align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 8px 20px rgba(15,23,42,0.24)">${renderToStaticMarkup(icon)}</div>`,
  })
}

const ICONE_CLIENTE = mkIcon(<UserRound size={20} strokeWidth={2.6} />, 'linear-gradient(135deg,#38bdf8,#0284c7)')
const ICONE_LOJA = mkIcon(<Store size={20} strokeWidth={2.6} />, 'linear-gradient(135deg,#f97316,#ea580c)')

function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (pontos.length === 1) { map.setView(pontos[0], 16); return }
    if (pontos.length > 1) map.fitBounds(L.latLngBounds(pontos), { padding: [56, 56], animate: true })
  }, [map, pontos])
  return null
}

export default function LocalizacaoClienteModal({
  pedido,
  posicaoLoja,
  onClose,
}: {
  pedido: Pedido
  posicaoLoja: [number, number] | null
  onClose: () => void
}) {
  const { posicao: aoVivo, ativo } = useLocalizacaoCliente(pedido.id)
  const [agoraTexto, setAgoraTexto] = useState('')

  const pontoDoPedido: [number, number] | null =
    pedido.lat !== null && pedido.lng !== null ? [pedido.lat, pedido.lng] : null

  const posicaoCliente: [number, number] | null = aoVivo ? [aoVivo.lat, aoVivo.lng] : pontoDoPedido

  useEffect(() => {
    if (!aoVivo) { setAgoraTexto(''); return }
    const atualizar = () => {
      const s = Math.max(0, Math.round((Date.now() - aoVivo.ts) / 1000))
      setAgoraTexto(s < 5 ? 'agora mesmo' : `há ${s}s`)
    }
    atualizar()
    const t = window.setInterval(atualizar, 3000)
    return () => window.clearInterval(t)
  }, [aoVivo])

  const pontos: [number, number][] = [posicaoCliente, posicaoLoja].filter(Boolean) as [number, number][]
  const centro = posicaoCliente || posicaoLoja || PRAIA_GRANDE_CENTER

  const pontoDeEncontro = [
    pedido.reta ? `Reta ${pedido.reta}` : '',
    pedido.barraca ? `Barraca ${pedido.barraca}` : '',
  ].filter(Boolean).join(' · ') || pedido.zona || 'Ponto de encontro não informado'

  function abrirNavegacao() {
    if (!posicaoCliente) return
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${posicaoCliente[0]},${posicaoCliente[1]}&travelmode=driving`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 24 }}
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 720, maxHeight: '86vh', display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 24, overflow: 'hidden', boxShadow: '0 30px 80px rgba(15,23,42,0.35)' }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid #e2e8f0' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{pedido.cliente}</span>
              {ativo && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: '#dcfce7', border: '1px solid #86efac', color: '#15803d', fontSize: 10, fontWeight: 900, letterSpacing: 0.4 }}>
                  <Radio size={11} /> AO VIVO
                </span>
              )}
            </div>
            <div style={{ marginTop: 3, color: '#64748b', fontSize: 12.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {pontoDeEncontro}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" style={{ border: 0, background: '#f1f5f9', borderRadius: 999, width: 34, height: 34, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
            <X size={17} color="#475569" />
          </button>
        </header>

        <div style={{ flex: 1, minHeight: 320, position: 'relative' }}>
          {posicaoCliente ? (
            <MapContainer center={centro} zoom={15} style={{ height: '100%', width: '100%', minHeight: 320 }} zoomControl={false}>
              <TileLayer
                attribution={MAPA_ATRIBUICAO} url={MAPA_TILES} maxZoom={MAPA_ZOOM_MAX} />
              <Enquadrar pontos={pontos} />
              <Marker position={posicaoCliente} icon={ICONE_CLIENTE}>
                <Popup>{ativo ? `Cliente agora (${agoraTexto})` : 'Ponto do momento do pedido'}</Popup>
              </Marker>
              {aoVivo && aoVivo.precisao > 0 && (
                <Circle
                  center={posicaoCliente}
                  radius={Math.min(aoVivo.precisao, 120)}
                  pathOptions={{ color: '#0284c7', fillColor: '#0284c7', fillOpacity: 0.12, weight: 1 }}
                />
              )}
              {posicaoLoja && <Marker position={posicaoLoja} icon={ICONE_LOJA}><Popup>Sua loja</Popup></Marker>}
              {posicaoLoja && (
                <Polyline
                  positions={[posicaoLoja, posicaoCliente]}
                  pathOptions={{ color: '#0284c7', weight: 3, dashArray: '8 8', opacity: 0.8 }}
                />
              )}
            </MapContainer>
          ) : (
            <div style={{ height: '100%', minHeight: 320, display: 'grid', placeItems: 'center', padding: 28, textAlign: 'center' }}>
              <div>
                <MapPin size={38} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
                <div style={{ color: '#0f172a', fontSize: 15, fontWeight: 900 }}>Sem localização enviada</div>
                <p style={{ maxWidth: 320, margin: '8px auto 0', color: '#64748b', fontSize: 13, lineHeight: 1.5, fontWeight: 600 }}>
                  Use a reta e a barraca informadas no pedido, ou peça ao cliente
                  para ligar a localização em tempo real no app dele.
                </p>
              </div>
            </div>
          )}
        </div>

        <footer style={{ padding: 14, borderTop: '1px solid #e2e8f0' }}>
          <div style={{ marginBottom: 10, fontSize: 11.5, fontWeight: 750, color: ativo ? '#15803d' : '#64748b' }}>
            {ativo
              ? `Posição ao vivo, atualizada ${agoraTexto} (±${aoVivo?.precisao} m).`
              : 'Ponto congelado no momento do pedido. Peça ao cliente para ligar a localização em tempo real.'}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {pedido.clienteTelefone && (
              <a
                href={`tel:${pedido.clienteTelefone.replace(/\D/g, '')}`}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 14, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontSize: 13.5, fontWeight: 800, textDecoration: 'none' }}
              >
                <Phone size={16} /> Ligar
              </a>
            )}
            <button
              type="button"
              onClick={abrirNavegacao}
              disabled={!posicaoCliente}
              style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 0', borderRadius: 14, border: 'none', background: posicaoCliente ? 'linear-gradient(135deg,#0ea5e9,#0284c7)' : '#e2e8f0', color: posicaoCliente ? '#fff' : '#94a3b8', fontSize: 13.5, fontWeight: 900, cursor: posicaoCliente ? 'pointer' : 'default' }}
            >
              <Navigation size={17} /> Abrir navegação
            </button>
          </div>
        </footer>
      </motion.div>
    </motion.div>
  )
}
