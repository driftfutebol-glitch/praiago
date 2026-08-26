// ==========================================================
//  AmbulantesPage — "Na Praia"
//  Mapa em tempo real + lista de ambulantes próximos do cliente.
//  Core feature do PraiaGo: conecta cliente com vendedores
//  ambulantes na areia via GPS ao vivo.
// ==========================================================

import { useState, useMemo, useEffect, useRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L, { type Map as LeafletMap } from 'leaflet'
import { MapPin, List, Map as MapIcon, Navigation, ChevronRight, ChevronDown, Wifi, Eye, Clock, RefreshCw, ShoppingCart, LocateFixed, UserRound } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { CLIENTE_FALLBACK, useGPS } from '../hooks/useGPS'
import { useNearbyAmbulantes, type AmbulanteLive } from '../hooks/useNearbyAmbulantes'
import { useCatalogo } from '../store/useCatalogo'
import type { Vendedor } from '../lib/catalogo'
import { getZone, BEACH_ZONES } from '../lib/praiagoZones'
import CamadaPraia from '../components/CamadaPraia'
import { alertDialog } from '../lib/dialog'
import { TEXTO_AREA_ATENDIDA } from '../lib/serviceArea'

import 'leaflet/dist/leaflet.css'

// ── Fix Leaflet default icons in Vite ────────────────────────
// @ts-expect-error leaflet icon fix
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── Custom Marker Icons ──────────────────────────────────────

// Os marcadores antigos eram bolas com borda preta (#0f172a) e brilho neon —
// sobra do tema escuro. No mapa claro ficavam pesados. Agora seguem o visual
// novo: pessoa azul com halo para o cliente e carrinho verde para os
// ambulantes.

const customerMarkup = renderToStaticMarkup(<UserRound size={22} strokeWidth={2.6} />)
const cartMarkup = renderToStaticMarkup(<ShoppingCart size={20} strokeWidth={2.5} />)

function clienteIcon() {
  return L.divIcon({
    className: '',
    // Alto o bastante pro halo caber sem ser cortado pelo Leaflet.
    iconSize: [86, 86],
    iconAnchor: [43, 62],
    html: `<div style="position:relative;width:86px;height:86px;">
      <div style="
        position:absolute; left:50%; top:50%; width:76px; height:76px;
        margin:-38px 0 0 -38px; border-radius:50%;
        background: rgba(56,189,248,0.22); border:1px solid rgba(56,189,248,0.4);
        animation: clientePulse 2.4s ease-in-out infinite;
      "></div>
      <div style="
        position:absolute; left:50%; top:50%; margin:-21px 0 0 -21px;
        width:42px; height:42px; border-radius:50%;
        background: linear-gradient(140deg,#38bdf8,#0284c7);
        box-shadow: 0 6px 14px rgba(2,132,199,0.5);
        border: 3px solid #ffffff; color:#ffffff;
        display:flex; align-items:center; justify-content:center;
      ">
        ${customerMarkup}
      </div>
    </div>`,
  })
}

/**
 * Loja de ponto FIXO (restaurante/quiosque).
 *
 * Desenho de propósito diferente do ambulante: quadrado arredondado com garfo
 * e faca, contra o círculo com carrinho. No mapa a pessoa precisa distinguir
 * num relance "isso anda até mim" de "isso fica parado aqui" — se os dois
 * fossem pinos iguais em cores diferentes, ninguém leria a diferença.
 */
function restauranteIcon(aberto: boolean) {
  const cor = aberto ? '#f97316' : '#94a3b8'
  return L.divIcon({
    className: '',
    iconSize: [42, 52],
    iconAnchor: [21, 48],
    html: `<div style="position:relative;width:42px;height:52px;">
      <div style="
        position:absolute; left:50%; bottom:4px; margin-left:-5px;
        width:0; height:0; border-left:5px solid transparent;
        border-right:5px solid transparent; border-top:9px solid #ffffff;
        filter: drop-shadow(0 3px 3px rgba(15,23,42,0.28));
      "></div>
      <div style="
        position:absolute; left:50%; top:0; margin-left:-19px;
        width:38px; height:38px; border-radius:12px;
        background:${cor}; border:3px solid #ffffff;
        box-shadow: 0 6px 16px rgba(15,23,42,0.3);
        display:flex; align-items:center; justify-content:center;
      ">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
             stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/>
          <path d="M5 2v20"/>
          <path d="M19 15V2a4 4 0 0 0-3 3.87V11a2 2 0 0 0 2 2h1Z"/>
          <path d="M19 13v9"/>
        </svg>
      </div>
    </div>`,
  })
}

/** Escapa texto que vai virar ATRIBUTO dentro de HTML cru.
 *  O `divIcon` do Leaflet recebe string de HTML, nao JSX — entao nada aqui e
 *  escapado por voce. A URL da foto sai de `foto_perfil_path`, que o proprio
 *  vendedor controla: sem isto, um nome de arquivo com aspas fecharia o
 *  atributo e injetaria marcacao no mapa de todo mundo. */
function escaparAtributo(valor: string) {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function ambulanteIcon(_emoji: string, aberto: boolean, fotoUrl?: string | null) {
  const cor = aberto ? '#16a34a' : '#94a3b8'
  const corClara = aberto ? '#22c55e' : '#cbd5e1'
  // A foto da banca vale mais que um icone generico: na praia o cliente
  // reconhece o carrinho de vista, nao o nome. Sem foto, cai no carrinho.
  // Fechado fica em cinza pra "fechado" continuar legivel de longe, que era o
  // que a cor sozinha resolvia antes.
  const miolo = fotoUrl
    ? `<img src="${escaparAtributo(fotoUrl)}" alt="" style="
         width:100%; height:100%; object-fit:cover; border-radius:50%;
         filter:${aberto ? 'none' : 'grayscale(1) opacity(0.85)'};
       " />`
    : cartMarkup
  return L.divIcon({
    className: '',
    iconSize: [46, 58],
    iconAnchor: [23, 54],
    html: `<div style="position:relative;width:46px;height:58px;">
      <!-- rabinho do alfinete -->
      <div style="
        position:absolute; left:50%; bottom:6px; margin-left:-6px;
        width:0; height:0; border-left:6px solid transparent;
        border-right:6px solid transparent; border-top:11px solid #ffffff;
        filter: drop-shadow(0 3px 3px rgba(15,23,42,0.28));
      "></div>
      <div style="
        position:absolute; left:50%; top:0; margin-left:-21px;
        width:42px; height:42px; border-radius:50%;
        background:${cor}; border:3px solid #ffffff;
        box-shadow: 0 6px 16px rgba(15,23,42,0.3);
        display:flex; align-items:center; justify-content:center;
        overflow:hidden;
      ">
        ${miolo}
      </div>
      <!-- bolinha de "online" -->
      <div style="
        position:absolute; right:1px; top:1px; width:12px; height:12px;
        border-radius:50%; background:${corClara}; border:2.5px solid #ffffff;
      "></div>
    </div>`,
  })
}

// ── Recenter helper ──────────────────────────────────────────

/** Raio, em graus, dentro do qual uma loja entra no enquadramento inicial.
 *  ~0,045° ≈ 5 km. Loja mais longe que isso fica de fora de propósito: incluir
 *  uma banca a 30 km obrigaria o mapa a abrir na Baixada inteira, e aí NADA
 *  fica legível — nem o cliente, nem a loja. */
const RAIO_ENQUADRAMENTO = 0.045

// Voa até a posição do cliente quando ela muda de verdade (chegou GPS/IP/ajuste)
// e ENQUADRA as lojas perto dela.
//
// Só centralizar no cliente não bastava: com o cliente em Santos e a loja em
// Praia Grande, o app anunciava "1,9 km" no cartão e o mapa não mostrava loja
// nenhuma — os pinos caíam a ~2000px fora de uma tela de 341px. Um radar que
// esconde justamente o que ele diz estar perto não serve pra nada.
function FlyToCliente({ pos, alvos }: { pos: [number, number]; alvos: [number, number][] }) {
  const map = useMap()
  // Comeca vazio de proposito: o mapa nasce centrado no CLIENTE_FALLBACK e a
  // posicao de verdade (GPS/IP) chega depois, entao o primeiro enquadramento
  // TEM que acontecer.
  const last = useRef<[number, number] | null>(null)
  // Quantas lojas já entraram num enquadramento. As lojas chegam DEPOIS da
  // posição; sem isto o guard de `delta` cortaria o efeito ("o cliente não se
  // moveu") e o mapa nunca enquadraria as lojas que acabaram de aparecer.
  const alvosEnquadrados = useRef(-1)
  useEffect(() => {
    const anterior = last.current
    const delta = anterior ? Math.abs(anterior[0] - pos[0]) + Math.abs(anterior[1] - pos[1]) : Infinity
    const chegaramLojas = alvos.length !== alvosEnquadrados.current
    if (delta <= 0.0005 && !chegaramLojas) return
    // `whenReady` porque a posicao por IP costuma chegar antes de o Leaflet
    // terminar de montar; um flyTo disparado nessa janela era engolido, o
    // `last` era marcado como aplicado mesmo assim e o mapa ficava preso no
    // fallback com o pino do cliente FORA da tela (mapa vazio, sem pino nenhum).
    map.whenReady(() => {
      // Salto grande (fallback -> cidade real, quilometros) nao rende animacao:
      // vai direto, senao o usuario ve o mapa deslizando por 1s a toa.
      // Só entra no enquadramento quem está perto: o resto distorce o zoom.
      const perto = alvos.filter(([la, ln]) =>
        Math.abs(la - pos[0]) <= RAIO_ENQUADRAMENTO && Math.abs(ln - pos[1]) <= RAIO_ENQUADRAMENTO)

      if (perto.length) {
        // maxZoom 16 evita o oposto do bug: com a loja a 20 m, o `fitBounds`
        // aproximaria tanto que sumiria a rua e o cliente perderia a referência.
        map.fitBounds([pos, ...perto], { padding: [42, 42], maxZoom: 16, animate: delta <= 0.05 })
      } else if (delta > 0.05) {
        // Salto grande (fallback -> cidade real, quilômetros) não rende
        // animação: vai direto, senão o mapa desliza por 1s à toa.
        map.setView(pos, Math.max(map.getZoom(), 14))
      } else {
        map.flyTo(pos, Math.max(map.getZoom(), 14), { duration: 0.8 })
      }
      last.current = pos
      alvosEnquadrados.current = alvos.length
    })
    // `alvos` entra na dependência porque as lojas costumam chegar DEPOIS da
    // posição: sem isso o enquadramento rodaria com a lista ainda vazia e nunca
    // mais seria refeito.
  }, [map, pos, alvos])
  return null
}

// O cartao do "ambulante mais proximo" aparece e some por cima do layout, e
// isso muda a ALTURA do container do mapa em tempo de execucao. O Leaflet so
// escuta resize da JANELA: quando muda so o container ele mantem a origem
// antiga e o centro escorrega -- o pino do cliente ia parar colado na borda de
// baixo, meio cortado. `invalidateSize` remede o container preservando o centro.
function AjustaAoRedimensionar() {
  const map = useMap()
  useEffect(() => {
    // Sem pular a 1a notificacao de proposito: quando este efeito roda, o
    // cartao do "mais proximo" JA encolheu o container, mas o Leaflet ainda
    // guarda a altura de antes (medido: cache 411px x container real 208px).
    // Essa primeira medida e justamente a que corrige o desalinhamento; o
    // proprio `invalidateSize` nao faz nada quando os tamanhos ja batem.
    const ro = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  return null
}

/** Distância em km entre dois pontos. */
function kmEntre(a: [number, number], b: [number, number]) {
  const R = 6371, rad = (x: number) => x * Math.PI / 180
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Aviso pra quando existem lojas, mas nenhuma perto.
 *
 *  Sem isto o mapa fica com o pino do cliente sozinho e mais nada — e "vazio"
 *  é indistinguível de "quebrado". Medido num caso real: cliente em Santos,
 *  loja em Praia Grande a 10,2 km; o mapa não mostrava nada e não explicava
 *  por quê. Aqui a distância aparece escrita, e o botão leva até lá. */
//  ⚠️ Fica FORA do <MapContainer> de propósito. Dentro, o elemento nasce
//  dentro do painel do Leaflet, que engole o clique antes de ele subir até o
//  React — o botão parecia funcionar e não fazia nada (medido: zoom seguia 15
//  depois do clique). Por isso recebe a instância do mapa por prop, em vez de
//  pegar com `useMap()`.
function AvisoLojaLonge({ mapa, pos, alvos }: { mapa: LeafletMap | null; pos: [number, number]; alvos: [number, number][] }) {
  if (!mapa || !alvos.length) return null
  const perto = alvos.some(([la, ln]) =>
    Math.abs(la - pos[0]) <= RAIO_ENQUADRAMENTO && Math.abs(ln - pos[1]) <= RAIO_ENQUADRAMENTO)
  if (perto) return null

  const maisProxima = alvos.reduce((melhor, atual) =>
    kmEntre(pos, atual) < kmEntre(pos, melhor) ? atual : melhor)
  const km = kmEntre(pos, maisProxima)

  return (
    <div style={{
      position: 'absolute', left: 10, right: 10, top: 10, zIndex: 1000,
      display: 'flex', alignItems: 'center', gap: 9,
      padding: '9px 11px', borderRadius: 14,
      background: 'rgba(255,255,255,0.97)', border: '1px solid #fde68a',
      boxShadow: '0 8px 22px -12px rgba(15,23,42,0.45)',
    }}>
      <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#92400e', lineHeight: 1.35 }}>
        Nada aberto pertinho de você. A loja mais próxima está a{' '}
        {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`}.
      </span>
      <button
        type="button"
        onClick={() => mapa.fitBounds([pos, maisProxima], { padding: [42, 42], maxZoom: 16 })}
        style={{
          flexShrink: 0, border: 'none', borderRadius: 999, cursor: 'pointer',
          padding: '7px 12px', background: '#0f172a', color: '#fff',
          fontSize: 11.5, fontWeight: 900,
        }}
      >
        Mostrar
      </button>
    </div>
  )
}

function RecenterMap({ pos }: { pos: [number, number] }) {
  const map = useMap()
  const handleRecenter = () => {
    map.flyTo(pos, 15, { duration: 0.8 })
  }
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={handleRecenter}
      aria-label="Centralizar no meu local"
      style={{
        // Botão branco com a mira, como no visual novo — antes era um círculo
        // com gradiente da marca, que competia com o botão do chat logo abaixo.
        // Sobe pra 76px porque o chat flutuante ocupa o canto.
        position: 'absolute', bottom: 76, right: 14, zIndex: 1000,
        width: 44, height: 44, borderRadius: '50%',
        background: '#ffffff', border: '1px solid #e8eef5', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 4px rgba(15,23,42,0.08), 0 10px 22px -10px rgba(15,23,42,0.4)',
      }}
    >
      <LocateFixed size={21} color="#0284c7" strokeWidth={2.4} />
    </motion.button>
  )
}

/** Barra de escala do canto inferior esquerdo — recalcula ao dar zoom. */
function EscalaMapa() {
  const map = useMap()
  const [escala, setEscala] = useState<{ px: number; texto: string }>({ px: 70, texto: '' })

  useEffect(() => {
    const medir = () => {
      // Quantos metros cabem em 80px na latitude atual
      const centro = map.getCenter()
      const pontoA = map.containerPointToLatLng([0, 0])
      const pontoB = map.containerPointToLatLng([80, 0])
      const metros = pontoA.distanceTo(pontoB)
      // Arredonda pra um número "redondo" (1/2/5 × 10^n), como todo mapa faz
      const potencia = Math.pow(10, Math.floor(Math.log10(metros)))
      const bonito = [1, 2, 5, 10].find(m => m * potencia >= metros) ?? 10
      const alvo = bonito * potencia
      const px = Math.round((alvo / metros) * 80)
      setEscala({
        px,
        texto: alvo >= 1000 ? `${alvo / 1000} km` : `${alvo} m`,
      })
      void centro
    }
    medir()
    map.on('zoomend moveend', medir)
    return () => { map.off('zoomend moveend', medir) }
  }, [map])

  if (!escala.texto) return null

  return (
    <div style={{ position: 'absolute', bottom: 14, left: 14, zIndex: 1000, pointerEvents: 'none' }}>
      <div style={{ fontSize: 11, fontWeight: 900, color: '#475569', textShadow: '0 1px 2px rgba(255,255,255,0.9)' }}>
        {escala.texto}
      </div>
      <div style={{ width: escala.px, height: 3, marginTop: 3, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: '#475569', borderRadius: 1 }} />
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: 2, height: 8, background: '#475569' }} />
        <div style={{ position: 'absolute', right: 0, bottom: 0, width: 2, height: 8, background: '#475569' }} />
      </div>
    </div>
  )
}

// ── Formatar distância ───────────────────────────────────────

function formatDist(m: number): string {
  if (m < 1000) return `${m}m`
  return `${(m / 1000).toFixed(1)}km`
}

// ── Componente principal ─────────────────────────────────────

export default function AmbulantesPage() {
  const navigate = useNavigate()
  const {
    pos,
    status: gpsStatus,
    fonte,
    cidadeAproximada,
    foraDaArea,
    modoRevisao,
    definirPosicaoManual,
    limparPosicaoManual,
  } = useGPS()
  const { ambulantes, total } = useNearbyAmbulantes(pos)
  const vendedores = useCatalogo(s => s.vendedores)
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')

  // Lojas de ponto fixo pro mapa.
  //
  // O Radar sempre desenhou só os ambulantes, que vêm do GPS ao vivo — o
  // restaurante tinha coordenada no cadastro e nunca era desenhado, então o
  // cliente não via onde a loja fica. Aqui entram os que têm ponto confirmado;
  // sem `localizacaoConfirmada` o `pos` cai no centro de Praia Grande (padrão
  // do catálogo) e o pino apontaria pra um lugar onde não existe loja nenhuma.
  const restaurantesNoMapa = useMemo(
    () => vendedores.filter(v => v.tipo === 'restaurante' && v.localizacaoConfirmada),
    [vendedores],
  )

  // Zona atual do cliente
  const zonaCliente = useMemo(() => getZone(pos[0], pos[1]), [pos])

  // Ambulante MAIS PRÓXIMO (a lista já vem ordenada por distância)
  const nearest = ambulantes[0]
  const walkMin = nearest ? Math.max(1, Math.round(nearest.distancia / 75)) : 0

  // Navegar para pedir de um ambulante (vincula ao catálogo se existir)
  const handlePedir = (amb: AmbulanteLive) => {
    // Casa SÓ por id exato — casar por primeiro nome abria a loja errada (ex: "Ana Silva" -> "Ana Coco").
    const vendedor = vendedores.find(v => v.id === amb.id)
    if (vendedor) {
      navigate(`/pedir?v=${vendedor.id}`)
    } else {
      alertDialog({ title: 'Cardápio a caminho', message: 'Esse vendedor ainda não publicou o cardápio dele. Volte já já! 🏖️' })
    }
  }

  return (
    // Esta tela cabe SEMPRE numa tela só, sem rolagem: cabeçalho, aviso de GPS
    // e cartão do mais próximo têm altura própria, e o mapa engole a sobra.
    // Antes o mapa tinha altura mínima fixa, a soma passava da tela e o cartão
    // só aparecia se a pessoa rolasse.
    <div style={{ height: '100%', overflow: 'hidden', background: '#ffffff', color: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="glass-panel" style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
        position: 'sticky', top: 0, zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: 24, fontWeight: 900,
              display: 'flex', alignItems: 'center', gap: 8,
            }} className="beach-gradient-text">
              <MapPin size={24} style={{ color: '#22c55e' }} />
              Radar PraiaGo
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              Ambulantes ao vivo perto de você
              {zonaCliente && <span style={{ color: '#38bdf8' }}> · {zonaCliente.emoji} {zonaCliente.nome}</span>}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Badge ao vivo */}
            <motion.div animate={total > 0 ? { opacity: [0.7, 1, 0.7] } : {}} transition={{ repeat: Infinity, duration: 2 }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 20,
              background: total > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
              border: `1px solid ${total > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: total > 0 ? '#22c55e' : '#64748b',
                boxShadow: total > 0 ? '0 0 10px #22c55e' : 'none',
              }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: total > 0 ? '#22c55e' : '#94a3b8' }}>
                {total} online
              </span>
            </motion.div>

            {/* Toggle mapa/lista */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setViewMode(v => v === 'map' ? 'list' : 'map')}
              aria-label={viewMode === 'map' ? 'Ver em lista' : 'Ver no mapa'}
              title={viewMode === 'map' ? 'Ver em lista' : 'Ver no mapa'}
              style={{
                width: 42, height: 42, borderRadius: 14,
                background: '#f8fafc', border: '1px solid rgba(0,0,0,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                // O icone herda `color`: com #fff em cima do fundo #f8fafc ele
                // sumia e o botao parecia morto/vazio.
                cursor: 'pointer', color: '#0f172a',
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div key={viewMode} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
                  {viewMode === 'map' ? <List size={20} /> : <MapIcon size={20} />}
                </motion.div>
              </AnimatePresence>
            </motion.button>
          </div>
        </div>

        {/* GPS status / fonte da posição */}
        {fonte === 'manual' ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{
            marginTop: 12, padding: '8px 14px', borderRadius: 12,
            background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)',
            fontSize: 12, fontWeight: 600, color: '#0284c7', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
          }}>
            <MapPin size={14} />
            <span style={{ flex: 1, minWidth: 180 }}>Posição ajustada por você — arraste o pino azul para mudar.</span>
            <button onClick={limparPosicaoManual} style={{
              border: '1px solid rgba(14,165,233,0.35)', background: '#fff', color: '#0284c7',
              borderRadius: 10, padding: '4px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer',
            }}>
              Voltar pro GPS
            </button>
          </motion.div>
        ) : gpsStatus !== 'active' && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} style={{
            marginTop: 12, padding: '8px 14px', borderRadius: 12,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)',
            fontSize: 12, fontWeight: 600, color: '#d97706', display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />
            {gpsStatus === 'requesting'
              ? 'Obtendo radar...'
              : fonte === 'ip'
                ? `Sem GPS — posição aproximada pela internet${cidadeAproximada ? ` (${cidadeAproximada})` : ''}. Arraste o pino azul até onde você está.`
                : fonte === 'memoria'
                  ? 'Sem GPS — usando sua última posição conhecida. Arraste o pino azul para ajustar.'
                  : 'GPS indisponível — arraste o pino azul no mapa até onde você está.'}
          </motion.div>
        )}

        {(foraDaArea || modoRevisao) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            role="status"
            style={{
              marginTop: 10, padding: '9px 12px', borderRadius: 12,
              background: modoRevisao ? '#f5f3ff' : '#fffbeb',
              border: `1px solid ${modoRevisao ? '#c4b5fd' : '#fde68a'}`,
              color: modoRevisao ? '#6d28d9' : '#92400e',
              fontSize: 12, fontWeight: 650, lineHeight: 1.4,
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            }}
          >
            <LocateFixed size={15} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 190 }}>
              {modoRevisao
                ? 'Cenário de revisão ativo em Praia Grande. Esta conta não aparece para usuários reais.'
                : `Você está fora da área atendida (${TEXTO_AREA_ATENDIDA}). É possível explorar o radar, mas pedidos permanecem bloqueados.`}
            </span>
            {foraDaArea && fonte !== 'manual' && (
              <button
                type="button"
                onClick={() => definirPosicaoManual(CLIENTE_FALLBACK[0], CLIENTE_FALLBACK[1])}
                style={{ border: 0, borderRadius: 10, padding: '6px 10px', background: '#0ea5e9', color: '#fff', fontSize: 11, fontWeight: 850, cursor: 'pointer' }}
              >
                Explorar Praia Grande
              </button>
            )}
          </motion.div>
        )}
      </div>

      {/* ── Destaque: ambulante mais próximo ────────────── */}
      <AnimatePresence>
        {nearest && (
          <motion.div
            key={nearest.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{
              // Cartão claro, como no visual novo. Antes o fundo era um
              // gradiente verde/azul forte e o rótulo verde-claro (#4ade80)
              // ficava quase ilegível em cima dele.
              margin: '12px 16px 0', borderRadius: 20, padding: 14,
              background: 'linear-gradient(150deg, #f0fdf4 0%, #ffffff 55%)',
              border: '1px solid #bbf7d0',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 12px 28px -16px rgba(22,163,74,0.5)',
              position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 11 }}>
              <motion.span animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.6 }} style={{ fontSize: 13, lineHeight: 1 }}>⚡</motion.span>
              <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.9, color: '#15803d', textTransform: 'uppercase' }}>
                Ambulante mais próximo de você
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 66, height: 66, borderRadius: 18, background: 'linear-gradient(150deg, #e0f2fe, #dcfce7)', display: 'grid', placeItems: 'center', overflow: 'hidden', fontSize: 33, border: '1px solid #d1fae5', flexShrink: 0 }}>
                {nearest.fotoPerfil
                  ? <img src={nearest.fotoPerfil} alt={nearest.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : nearest.emoji}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 950, color: '#0f172a', letterSpacing: -0.4, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {nearest.nome}
                  </div>
                  <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 900, color: nearest.aberto ? '#15803d' : '#64748b', background: nearest.aberto ? '#dcfce7' : '#f1f5f9', padding: '4px 9px', borderRadius: 999 }}>
                    <span style={{ width: 5, height: 5, borderRadius: 999, background: nearest.aberto ? '#22c55e' : '#94a3b8' }} />
                    {nearest.aberto ? 'Aberto' : 'Fechado'}
                  </span>
                </div>

                <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 700, marginTop: 1 }}>
                  {['Ambulante', nearest.categoria, nearest.zona].filter(Boolean).join(' · ')}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 7, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 17, fontWeight: 950, color: '#0284c7', letterSpacing: -0.3 }}>{formatDist(nearest.distancia)}</span>
                  <span style={{ width: 1, height: 13, background: '#e2e8f0' }} />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                    🚶 ~{walkMin} min a pé
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: '#16a34a', fontWeight: 800 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: '#22c55e' }} />
                    Ao vivo
                  </span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => setViewMode('map')} style={{ flex: 1, padding: '12px 10px', borderRadius: 14, border: '1px solid #e2e8f0', background: '#ffffff', color: '#0f172a', fontWeight: 800, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <MapPin size={15} strokeWidth={2.4} /> No mapa
              </motion.button>
              <motion.button whileTap={{ scale: 0.97 }} onClick={() => handlePedir(nearest)} disabled={!nearest.aberto} style={{ flex: 1.6, padding: '12px 10px', borderRadius: 14, border: 'none', background: nearest.aberto ? 'linear-gradient(100deg,#0284c7,#16a34a)' : '#94a3b8', color: '#fff', fontWeight: 900, fontSize: 14, cursor: nearest.aberto ? 'pointer' : 'not-allowed', boxShadow: nearest.aberto ? '0 10px 22px -10px rgba(22,163,74,0.9)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
                <ShoppingCart size={16} strokeWidth={2.5} /> {nearest.aberto ? 'Pedir agora' : 'Fechado'}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Conteúdo ── o mapa ocupa exatamente o que sobrou da tela.
          `minHeight: 0` é obrigatório: sem ele o item flex se recusa a encolher
          abaixo do conteúdo e volta a empurrar o cartão pra fora da dobra. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <AnimatePresence mode="wait">
          {viewMode === 'map' ? (
            <motion.div key="map" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} style={{ height: '100%', width: '100%', position: 'absolute', inset: 0 }}>
              <MapView
                clientePos={pos}
                ambulantes={ambulantes}
                restaurantes={restaurantesNoMapa}
                onPedir={handlePedir}
                onAbrirVendedor={v => navigate(`/pedir?v=${v.id}`)}
                onAjustarPos={definirPosicaoManual}
                totalOnline={total}
                onTrocarVisao={() => setViewMode('list')}
              />
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -20, opacity: 0 }} transition={{ duration: 0.2 }} style={{ height: '100%', width: '100%', position: 'absolute', inset: 0, overflowY: 'auto' }}>
              <ListView
                ambulantes={ambulantes}
                onPedir={handlePedir}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Inline styles (keyframes) ───────────────────── */}
      <style>{`
        /* O halo agora é um círculo de verdade (não box-shadow), então pulsa
           por escala — mais barato de animar e não estoura o tile ao lado. */
        @keyframes clientePulse {
          0%, 100% { transform: scale(1);    opacity: 0.85; }
          50%      { transform: scale(1.18); opacity: 0.5;  }
        }
        /* Aquece os tiles: a faixa de areia do Voyager é bege e com isso puxa
           pro amarelo do visual novo. Vai leve de propósito — passar disso
           deixa as ruas creme e o texto do mapa some. */
        .prg-tiles-praia {
          filter: saturate(1.18) contrast(1.02) sepia(0.06) hue-rotate(-4deg) brightness(1.02);
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  MapView — Leaflet com ambulantes + cliente
// ══════════════════════════════════════════════════════════════

function MapView({
  clientePos,
  ambulantes,
  restaurantes,
  onPedir,
  onAbrirVendedor,
  onAjustarPos,
  totalOnline,
  onTrocarVisao,
}: {
  clientePos: [number, number]
  ambulantes: AmbulanteLive[]
  /** Lojas de ponto FIXO. O ambulante anda e vem por GPS ao vivo; o
   *  restaurante fica parado, então entra no mapa pela coordenada do cadastro. */
  restaurantes: Vendedor[]
  onPedir: (a: AmbulanteLive) => void
  onAbrirVendedor: (v: Vendedor) => void
  onAjustarPos: (lat: number, lng: number) => void
  totalOnline: number
  onTrocarVisao: () => void
}) {
  // Lista única de "quem está perto" pro enquadramento inicial. `useMemo` com
  // dependência nas COORDENADAS, não nos arrays: o GPS do ambulante republica
  // de segundo em segundo criando array novo com os mesmos números, e sem isto
  // o mapa se reenquadraria sozinho o tempo todo, brigando com o usuário.
  // Instância do Leaflet guardada aqui pra o aviso, que mora fora do mapa,
  // conseguir mandar o mapa enquadrar.
  const [mapa, setMapa] = useState<LeafletMap | null>(null)
  const alvosDoMapa = useMemo<[number, number][]>(
    () => [
      ...ambulantes.map(a => [a.lat, a.lng] as [number, number]),
      ...restaurantes.filter(r => r.pos).map(r => r.pos as [number, number]),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      ambulantes.map(a => `${a.lat},${a.lng}`).join('|'),
      restaurantes.map(r => r.pos?.join(',')).join('|'),
    ],
  )
  return (
    <div style={{
      position: 'relative', height: '100%',
      // Cartão arredondado como no visual novo, em vez do mapa sangrando de
      // ponta a ponta.
      margin: '0 16px 12px', width: 'calc(100% - 32px)',
      borderRadius: 20, overflow: 'hidden', background: '#eef2f7',
      border: '1px solid #e8eef5',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 14px 30px -18px rgba(15,23,42,0.28)',
    }}>
      <MapContainer
        center={clientePos}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        ref={setMapa}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          // O Voyager já traz areia bege e parque verde (mesmos dados do OSM).
          // Este filtro só aquece e satura um pouco pra faixa de praia puxar
          // mais pro amarelo do visual novo, sem trocar de provedor nem
          // depender de chave de API.
          className="prg-tiles-praia"
        />

        {/* Areia amarela + coqueiros desenhados sobre os tiles. Vem antes dos
            marcadores pra ficar por baixo deles. */}
        <CamadaPraia />

        {/* Enquadra cliente + lojas: ambulante (GPS ao vivo) e restaurante
            (ponto fixo) entram juntos, porque pro cliente os dois são "quem
            está perto de mim" — a diferença de como a posição chega é problema
            nosso, não dele. */}
        <FlyToCliente pos={clientePos} alvos={alvosDoMapa} />
        <AjustaAoRedimensionar />

        {/* Cliente — pino ARRASTÁVEL: sem GPS, o usuário posiciona onde está */}
        <Marker
          position={clientePos}
          icon={clienteIcon()}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng()
              onAjustarPos(p.lat, p.lng)
            },
          }}
        >
          <Popup>
            <div style={{ textAlign: 'center', fontFamily: 'Inter, sans-serif' }}>
              <strong style={{ color: '#0f172a' }}>📍 Radar Central</strong>
              <br />
              <span style={{ fontSize: 11, color: '#64748b' }}>
                {clientePos[0].toFixed(4)}, {clientePos[1].toFixed(4)}
              </span>
              <br />
              <span style={{ fontSize: 10.5, color: '#0284c7', fontWeight: 700 }}>
                Arraste o pino para ajustar sua posição
              </span>
            </div>
          </Popup>
        </Marker>

        {/* Círculo de área (raio de cobertura — 2km) */}
        <Circle
          center={clientePos}
          radius={2000}
          pathOptions={{
            color: '#0ea5e9',
            fillColor: '#0ea5e9',
            fillOpacity: 0.05,
            weight: 1,
            dashArray: '6,4',
          }}
        />

        {/* Precisão GPS */}
        <Circle
          center={clientePos}
          radius={30}
          pathOptions={{
            color: '#22c55e',
            fillColor: '#22c55e',
            fillOpacity: 0.1,
            weight: 1,
            className: 'animate-pulse-neon'
          }}
        />

        {/* Ambulantes */}
        {/* Lojas de ponto fixo. Ficam ANTES dos ambulantes pra o ambulante, que
            é quem se move e quem a pessoa está caçando, desenhar por cima. */}
        {restaurantes.map((v) => (
          <Marker
            key={`fixo-${v.id}`}
            position={v.pos}
            icon={restauranteIcon(v.aberto)}
          >
            <Popup>
              <div style={{ minWidth: 190, fontFamily: 'Inter, sans-serif' }}>
                <div style={{ fontWeight: 900, fontSize: 15, color: '#0f172a' }}>{v.nome}</div>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 2 }}>
                  {v.categoria}
                </div>
                {v.endereco && (
                  <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, marginTop: 6, lineHeight: 1.35 }}>
                    📍 {v.endereco}
                  </div>
                )}
                <div style={{ marginTop: 8, marginBottom: 10 }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 900,
                    background: v.aberto ? '#dcfce7' : '#f1f5f9',
                    color: v.aberto ? '#15803d' : '#64748b',
                  }}>
                    {v.aberto ? 'Aberto agora' : 'Fechado'}
                  </span>
                </div>
                <button
                  onClick={() => onAbrirVendedor(v)}
                  style={{
                    width: '100%', padding: '10px 0', border: 'none', borderRadius: 12,
                    background: 'linear-gradient(100deg,#0284c7,#16a34a)', color: '#fff',
                    fontWeight: 900, fontSize: 13.5, cursor: 'pointer',
                  }}
                >
                  Ver cardápio
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {ambulantes.map((a) => (
          <Marker
            key={a.id}
            position={[a.lat, a.lng]}
            icon={ambulanteIcon(a.emoji, a.aberto, a.fotoPerfil)}
          >
            <Popup>
              <div style={{ minWidth: 180, fontFamily: 'Inter, sans-serif' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ width: 42, height: 42, display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 12, background: '#f0fdf4', fontSize: 26 }}>
                    {a.fotoPerfil
                      ? <img src={a.fotoPerfil} alt={a.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : a.emoji}
                  </span>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 15, color: '#0f172a' }}>{a.nome}</div>
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{a.categoria}</div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', gap: 8, marginBottom: 12, fontSize: 12,
                }}>
                  <span style={{
                    padding: '4px 10px', borderRadius: 10,
                    background: a.aberto ? '#dcfce7' : '#f1f5f9',
                    color: a.aberto ? '#16a34a' : '#64748b',
                    fontWeight: 800,
                  }}>
                    {a.aberto ? '🟢 Aberto' : '⚫ Fechado'}
                  </span>
                  <span style={{
                    padding: '4px 10px', borderRadius: 10,
                    background: '#f0f9ff', color: '#0ea5e9', fontWeight: 800,
                  }}>
                    📏 {formatDist(a.distancia)}
                  </span>
                </div>
                {a.zona && (
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, fontWeight: 600 }}>
                    📍 {a.zona}
                  </div>
                )}
                <button
                  onClick={() => onPedir(a)}
                  style={{
                    width: '100%', padding: '10px 0', border: 'none', borderRadius: 12,
                    background: a.aberto ? 'linear-gradient(135deg, #0ea5e9, #22c55e)' : '#94a3b8',
                    color: '#fff', fontWeight: 900, fontSize: 14, cursor: a.aberto ? 'pointer' : 'not-allowed',
                    boxShadow: a.aberto ? '0 4px 15px rgba(34,197,94,0.3)' : 'none'
                  }}
                  disabled={!a.aberto}
                >
                  {a.aberto ? '🛒 Ver Cardápio' : 'Fechado agora'}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Zonas da praia (contorno sutil) */}
        {BEACH_ZONES.map(z => {
          const positions = z.poligono as [number, number][]
          return (
            <Circle
              key={z.id}
              center={[
                positions.reduce((s, p) => s + p[0], 0) / positions.length,
                positions.reduce((s, p) => s + p[1], 0) / positions.length,
              ]}
              radius={500}
              pathOptions={{
                color: z.cor,
                fillColor: z.cor,
                fillOpacity: 0.05,
                weight: 1,
                dashArray: '3,6',
              }}
            />
          )
        })}

        <RecenterMap pos={clientePos} />
        <EscalaMapa />
      </MapContainer>

      {/* Irmão do mapa, não filho: dentro do MapContainer o Leaflet come o clique. */}
      <AvisoLojaLonge mapa={mapa} pos={clientePos} alvos={alvosDoMapa} />

      {/* ── Chrome sobre o mapa ──────────────────────────────
          zIndex acima de 400 (padrão dos panes do Leaflet), senão os tiles
          passam por cima. */}
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 1000, display: 'flex', justifyContent: 'space-between', gap: 10, pointerEvents: 'none' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 999,
          background: 'rgba(255,255,255,0.96)', border: '1px solid #e8eef5',
          boxShadow: '0 2px 4px rgba(15,23,42,0.06), 0 8px 20px -10px rgba(15,23,42,0.35)',
          fontSize: 12.5, fontWeight: 900, color: '#0f172a',
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: 999,
            background: totalOnline > 0 ? '#22c55e' : '#94a3b8',
          }} />
          Ao vivo
        </span>

        <button
          type="button"
          onClick={onTrocarVisao}
          aria-label="Ver em lista"
          style={{
            pointerEvents: 'auto',
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '8px 12px 8px 14px', borderRadius: 999, cursor: 'pointer',
            background: 'rgba(255,255,255,0.96)', border: '1px solid #e8eef5',
            boxShadow: '0 2px 4px rgba(15,23,42,0.06), 0 8px 20px -10px rgba(15,23,42,0.35)',
            fontSize: 12.5, fontWeight: 900, color: '#0f172a',
          }}
        >
          <MapIcon size={16} color="#0284c7" strokeWidth={2.4} />
          Mapa
          <ChevronDown size={15} color="#64748b" strokeWidth={2.6} />
        </button>
      </div>

      {/* Mini-lista sobreposta no mapa (3 mais próximos) */}
      {ambulantes.length > 0 && (
        <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{
          position: 'absolute', bottom: 16, left: 16, right: 80, zIndex: 1000,
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
          borderRadius: 20, padding: '12px',
          border: '1px solid rgba(0,0,0,0.08)',
          maxHeight: 180, overflowY: 'auto', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}>
          {ambulantes.slice(0, 3).map((a, i) => (
            <motion.div
              whileTap={{ scale: 0.98 }}
              key={a.id}
              onClick={() => onPedir(a)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 8px',
                borderBottom: i < 2 && ambulantes.length > 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                cursor: 'pointer',
              }}
            >
              <div style={{ width: 36, height: 36, overflow: 'hidden', borderRadius: 12, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {a.fotoPerfil
                  ? <img src={a.fotoPerfil} alt={a.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : a.emoji}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{a.nome}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                  {a.zona} · {a.aberto ? <span style={{ color: '#4ade80' }}>Online</span> : 'Offline'}
                </div>
              </div>
              <div style={{
                fontSize: 13, fontWeight: 900,
                color: '#38bdf8',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {formatDist(a.distancia)}
                <ChevronRight size={16} />
              </div>
            </motion.div>
          ))}
          {ambulantes.length > 3 && (
            <div style={{
              textAlign: 'center', fontSize: 11, color: '#64748b',
              padding: '8px 0 4px', fontWeight: 700,
            }}>
              +{ambulantes.length - 3} mais no radar
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════
//  ListView — Cards de ambulantes (modo lista)
// ══════════════════════════════════════════════════════════════

function ListView({
  ambulantes,
  onPedir,
}: {
  ambulantes: AmbulanteLive[]
  onPedir: (a: AmbulanteLive) => void
}) {
  if (ambulantes.length === 0) {
    return (
      <div style={{
        padding: '80px 32px', textAlign: 'center',
      }}>
        <motion.div animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2 }} style={{ fontSize: 70, marginBottom: 20 }}>🏖️</motion.div>
        <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
          Nenhum ambulante no radar
        </h2>
        <p style={{ margin: '0 0 32px', fontSize: 15, color: '#64748b', lineHeight: 1.5, fontWeight: 500 }}>
          A praia parece tranquila agora.
          <br />Que tal pedir de um restaurante local?
        </p>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => window.location.href = '/'}
          style={{
            padding: '16px 36px', borderRadius: 20, border: 'none',
            background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
            color: '#fff', fontWeight: 900, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(34,197,94,0.4)'
          }}
        >
          Ver Restaurantes →
        </motion.button>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 20px 80px' }}>
      {/* Stats bar */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 24, overflowX: 'auto',
        scrollbarWidth: 'none', paddingBottom: 4
      }}>
        {[
          { label: 'Próximos', value: ambulantes.length, icon: <Eye size={16} />, color: '#0ea5e9' },
          { label: 'Abertos', value: ambulantes.filter(a => a.aberto).length, icon: <Wifi size={16} />, color: '#22c55e' },
          { label: 'Mais perto', value: ambulantes[0] ? formatDist(ambulantes[0].distancia) : '—', icon: <Navigation size={16} />, color: '#fbbf24' },
        ].map((s, i) => (
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} key={i} style={{
            flex: '0 0 auto', padding: '12px 20px', borderRadius: 16,
            background: '#f8fafc', border: '1px solid rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            <div style={{ color: s.color, background: 'rgba(0,0,0,0.05)', padding: 8, borderRadius: 10 }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {ambulantes.map((a, i) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileTap={{ scale: 0.98 }}
            key={a.id}
            onClick={() => onPedir(a)}
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: 16, borderRadius: 20,
              background: '#f8fafc', border: '1px solid rgba(0,0,0,0.05)',
              cursor: 'pointer', boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
            }}
          >
            {/* Foto pública do vendedor, com fallback do cadastro antigo. */}
            <div style={{
              width: 56, height: 56, borderRadius: 18,
              background: a.aberto
                ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(14,165,233,0.15))'
                : 'rgba(71,85,105,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden', fontSize: 28, flexShrink: 0,
              border: `1px solid ${a.aberto ? 'rgba(34,197,94,0.2)' : 'rgba(71,85,105,0.2)'}`,
            }}>
              {a.fotoPerfil
                ? <img src={a.fotoPerfil} alt={a.nome} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : a.emoji}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginBottom: 4,
              }}>
                <span style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{a.nome}</span>
                {a.aberto && (
                  <span style={{
                    fontSize: 9, fontWeight: 900, color: '#4ade80',
                    padding: '3px 8px', borderRadius: 8,
                    background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                    textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    Aberto
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6, fontWeight: 500 }}>
                {a.categoria}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, fontWeight: 600 }}>
                {a.zona && (
                  <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={12} /> {a.zona}
                  </span>
                )}
                <span style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={12} /> Online
                </span>
              </div>
            </div>

            {/* Distância */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{
                fontSize: 20, fontWeight: 900,
                background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {formatDist(a.distancia)}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>Radar</div>
            </div>

            <ChevronRight size={20} color="#475569" style={{ marginLeft: -4 }} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}
