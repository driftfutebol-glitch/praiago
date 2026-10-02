// ==========================================================
//  AmbulantesPage — "Na Praia"
//  Mapa em tempo real + lista de ambulantes próximos do cliente.
//  Core feature do PraiaGo: conecta cliente com vendedores
//  ambulantes na areia via GPS ao vivo.
// ==========================================================

import { useState, useMemo, useEffect, useRef, useCallback, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L, { type Map as LeafletMap } from 'leaflet'
import { ArrowLeft, MapPin, List, Map as MapIcon, ChevronRight, LocateFixed, Search, X, Maximize2, Minimize2, Plus, Minus, Waves, Building2 } from 'lucide-react'
import { useReducedMotion } from 'framer-motion'
import { CLIENTE_FALLBACK, useGPS } from '../hooks/useGPS'
import { useNearbyAmbulantes } from '../hooks/useNearbyAmbulantes'
import { getZone, BEACH_ZONES } from '../lib/praiagoZones'
import { BEACH_MAP_BOUNDS, BEACH_SHAPES, beachAtPoint, beachNearCamera, initialBeach } from '../lib/beachMap'
import CamadaPraia from '../components/CamadaPraia'
import { alertDialog } from '../lib/dialog'
import { TEXTO_AREA_ATENDIDA, RAIO_PEDIDO_KM } from '../lib/serviceArea'

import 'leaflet/dist/leaflet.css'
import { useCatalogoRegiao } from '../hooks/useCatalogoRegiao'
import { MAPA_TILES, MAPA_ATRIBUICAO, MAPA_ZOOM_MAX } from '../lib/mapa'
import { usePreferences } from '../store/usePreferences'
import CatalogFeedback from '../components/CatalogFeedback'
import MapResults from '../components/MapResults'
import { useCatalogo } from '../store/useCatalogo'
import { selectMapSellers, mapResults, formatMapDistance, type MapResult, type MapSellerType } from '../lib/mapDiscovery'
import { customerMarkup, cartMarkup } from '../lib/mapMarkerArtwork'

// ── Custom Marker Icons ──────────────────────────────────────

// Os marcadores antigos eram bolas com borda preta (#0f172a) e brilho neon —
// sobra do tema escuro. No mapa claro ficavam pesados. Agora seguem o visual
// novo: pessoa azul com halo para o cliente e carrinho verde para os
// ambulantes.

function clienteIcon() {
  return L.divIcon({
    className: 'pg-customer-marker',
    iconSize: [64, 64],
    iconAnchor: [32, 32],
    html: `<div class="pg-customer-halo"><span>${customerMarkup}</span></div>`,
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
        border-right:5px solid transparent; border-top:9px solid var(--pg-map-pin-outline);
        filter: drop-shadow(0 3px 3px rgba(15,23,42,0.28));
      "></div>
      <div style="
        position:absolute; left:50%; top:0; margin-left:-19px;
        width:38px; height:38px; border-radius:12px;
        background:${cor}; border:3px solid var(--pg-map-pin-outline);
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
        border-right:6px solid transparent; border-top:11px solid var(--pg-map-pin-outline);
        filter: drop-shadow(0 3px 3px rgba(15,23,42,0.28));
      "></div>
      <div style="
        position:absolute; left:50%; top:0; margin-left:-21px;
        width:42px; height:42px; border-radius:50%;
        background:${cor}; border:3px solid var(--pg-map-pin-outline);
        box-shadow: 0 6px 16px rgba(15,23,42,0.3);
        display:flex; align-items:center; justify-content:center;
        overflow:hidden;
      ">
        ${miolo}
      </div>
      <!-- bolinha de "online" -->
      <div style="
        position:absolute; right:1px; top:1px; width:12px; height:12px;
        border-radius:50%; background:${corClara}; border:2.5px solid var(--pg-map-pin-outline);
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
function FlyToCliente({ pos, alvos, animate }: { pos: [number, number]; alvos: [number, number][]; animate: boolean }) {
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
        map.fitBounds([pos, ...perto], { padding: [42, 42], maxZoom: 16, animate: animate && delta <= 0.05 })
      } else if (delta > 0.05 || !animate) {
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
  }, [map, pos, alvos, animate])
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
    let frame = 0
    const ro = new ResizeObserver(entries => {
      if (!entries[0]?.contentRect.width || !entries[0]?.contentRect.height) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => map.invalidateSize({ animate: false, debounceMoveend: true }))
    })
    ro.observe(map.getContainer())
    return () => { ro.disconnect(); cancelAnimationFrame(frame) }
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
  if (alvos.some(([lat, lng]) => Math.abs(lat - pos[0]) <= RAIO_ENQUADRAMENTO && Math.abs(lng - pos[1]) <= RAIO_ENQUADRAMENTO)) return null
  const nearest = alvos.reduce((best, point) => kmEntre(pos, point) < kmEntre(pos, best) ? point : best)
  return <div className="pg-map-distance-note"><MapPin size={16}/><span>A loja mais próxima deste ponto está a {formatMapDistance(kmEntre(pos, nearest) * 1000)}.</span><button onClick={() => mapa.fitBounds([pos, nearest], { padding: [42, 42], maxZoom: 16, animate: false })}>Mostrar</button></div>
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
    <div className="pg-map-scale">
      <div style={{ fontSize: 11, fontWeight: 800 }}>
        {escala.texto}
      </div>
      <div style={{ width: escala.px, height: 3, marginTop: 3, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'currentColor', borderRadius: 1 }} />
        <div style={{ position: 'absolute', left: 0, bottom: 0, width: 2, height: 8, background: 'currentColor' }} />
        <div style={{ position: 'absolute', right: 0, bottom: 0, width: 2, height: 8, background: 'currentColor' }} />
      </div>
    </div>
  )
}

// ── Descoberta: mapa compacto e lojas no fluxo da página ───────

export default function AmbulantesPage() {
  const navigate = useNavigate()
  const { pos, data: gpsData, status: gpsStatus, fonte, cidadeAproximada, foraDaArea, modoRevisao, definirPosicaoManual, limparPosicaoManual } = useGPS()
  const { ambulantes: todosAmbulantes } = useNearbyAmbulantes(pos)
  const { vendedores, loading } = useCatalogoRegiao()
  const failed = useCatalogo(s => !!s.error)
  const mapStyle = usePreferences(s => s.mapStyle)
  const setMapStyle = usePreferences(s => s.setMapStyle)
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map')
  const [expanded, setExpanded] = useState(false)
  const [tipo, setTipo] = useState<MapSellerType>('todos')
  const [soAbertos, setSoAbertos] = useState(false)
  const [busca, setBusca] = useState('')
  const { ambulantes, restaurantes } = useMemo(() => selectMapSellers(todosAmbulantes, vendedores, tipo, soAbertos, busca), [todosAmbulantes, vendedores, tipo, soAbertos, busca])
  const items = useMemo(() => mapResults(ambulantes, restaurantes, pos), [ambulantes, restaurantes, pos])
  const zonaCliente = useMemo(() => getZone(pos[0], pos[1]), [pos])
  const filtered = !!busca.trim() || tipo !== 'todos' || soAbertos
  const resetFilters = () => { setBusca(''); setTipo('todos'); setSoAbertos(false) }
  const openSeller = useCallback((item: MapResult) => {
    if (item.tipo === 'restaurante' || vendedores.some(v => v.id === item.id)) {
      navigate(`/pedir?v=${encodeURIComponent(item.id)}`)
    } else {
      alertDialog({ title: 'Cardápio a caminho', message: 'Esse vendedor ainda não publicou o cardápio dele. Volte já já!' })
    }
  }, [navigate, vendedores])
  const back = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx
    if (typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate('/')
  }
  const locationAction = mapStyle === 'praia' && zonaCliente?.tipo !== 'praia' ? 'Veja seu ponto no estilo Cidade.' : 'Arraste o pino para ajustar.'
  const locationText = fonte === 'manual' ? `Ponto escolhido por você. ${locationAction}`
    : gpsStatus === 'active' ? `GPS ativo. ${locationAction}`
    : gpsStatus === 'requesting' ? 'Buscando sua localização…'
    : fonte === 'ip' ? `Localização aproximada${cidadeAproximada ? ` · ${cidadeAproximada}` : ''}. ${locationAction}`
    : fonte === 'memoria' ? `Última localização conhecida. ${locationAction}`
    : `Sem GPS. ${locationAction}`

  return <div className="pg-map-page">
    <div className="pg-map-heading">
      <button className="pg-icon-button" aria-label="Voltar" onClick={back}><ArrowLeft size={19}/></button>
      <div><span className="pg-eyebrow">SEU DIA TEM MAIS SABOR</span><h1>Na praia</h1><p>{zonaCliente ? 'Seu ponto · ' + zonaCliente.nome : 'Ambulantes e restaurantes por perto'}</p></div>
    </div>
    <div className="pg-map-search"><Search size={19}/><input aria-label="Buscar no mapa" placeholder="Busque uma loja ou um sabor" value={busca} onChange={e => setBusca(e.target.value)} type="search"/>{busca && <button aria-label="Limpar busca" onClick={() => setBusca('')}><X size={17}/></button>}</div>
    <div className="pg-map-filters" aria-label="Filtrar vendedores no mapa">
      {([{ id: 'todos', label: 'Todos' }, { id: 'ambulante', label: 'Ambulantes' }, { id: 'restaurante', label: 'Restaurantes' }] as const).map(item => <button key={item.id} className="pg-chip" aria-pressed={tipo === item.id} onClick={() => setTipo(item.id)}>{item.label}</button>)}
      <button className="pg-chip" aria-pressed={soAbertos} onClick={() => setSoAbertos(v => !v)}>Abertos agora</button>
    </div>
    <div className="pg-map-toolbar">
      <div className="pg-map-segment" aria-label="Modo de visualização"><button aria-pressed={viewMode === 'map'} onClick={() => setViewMode('map')}><MapIcon size={15}/>Mapa</button><button aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><List size={15}/>Lista</button></div>
      {viewMode === 'map' && <button className="pg-map-expand" aria-controls="map-region" aria-expanded={expanded} onClick={() => setExpanded(v => !v)}>{expanded ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}<span>{expanded ? 'Reduzir mapa' : 'Ampliar mapa'}</span></button>}
    </div>
    {/* Continua montado ao alternar a lista: preserva zoom, pinos e tiles já carregados. */}
    <section id="map-region" className="pg-map-stage" aria-label="Mapa da região" hidden={viewMode !== 'map'} data-expanded={expanded}>
      <MapView clientePos={pos} accuracy={fonte === 'gps' ? gpsData?.accuracy : undefined} items={items} onOpen={openSeller} onAjustarPos={definirPosicaoManual}/>
      <div className="pg-map-style-switch" role="group" aria-label="Estilo do mapa">
        <button aria-label="Estilo Praia" aria-pressed={mapStyle === 'praia'} onClick={() => setMapStyle('praia')}><Waves size={17}/><span>Praia<small>Areia e zonas</small></span></button>
        <button aria-label="Estilo Cidade" aria-pressed={mapStyle === 'ruas'} onClick={() => setMapStyle('ruas')}><Building2 size={17}/><span>Cidade<small>Ruas e endereços</small></span></button>
      </div>
    </section>
    <div className="pg-map-location" role="status" aria-label="Status da localização"><LocateFixed size={15}/><span>{locationText}</span>{fonte === 'manual' && <button onClick={limparPosicaoManual}>Voltar ao GPS</button>}</div>
    {(foraDaArea || modoRevisao) && <div className="pg-map-area-note"><span>{modoRevisao ? 'Cenário de revisão em Praia Grande. Esta conta não aparece para usuários reais.' : `Exploração livre. Pedidos a até ${RAIO_PEDIDO_KM} km da loja em ${TEXTO_AREA_ATENDIDA}.`}</span>{foraDaArea && fonte !== 'manual' && <button onClick={() => definirPosicaoManual(CLIENTE_FALLBACK[0], CLIENTE_FALLBACK[1])}>Explorar Praia Grande</button>}</div>}
    <CatalogFeedback/>
    <MapResults items={items} loading={loading} failed={failed} onOpen={openSeller} onExplore={() => navigate('/pedir')} onReset={resetFilters} filtered={filtered}/>
  </div>
}

// Ícone/posição estáveis: uma atualização do catálogo não reconstrói cada pino.
const StoreMarker = memo(function StoreMarker({ item, onOpen }: { item: MapResult; onOpen: (item: MapResult) => void }) {
  const lat = item.tipo === 'ambulante' ? item.source.lat : item.source.pos[0]
  const lng = item.tipo === 'ambulante' ? item.source.lng : item.source.pos[1]
  const position = useMemo<[number, number]>(() => [lat, lng], [lat, lng])
  const icon = useMemo(() => item.tipo === 'restaurante' ? restauranteIcon(item.aberto) : ambulanteIcon('', item.aberto, item.foto), [item.tipo, item.aberto, item.foto])
  return <Marker position={position} icon={icon} title={`${item.nome} · ${item.tipo === 'restaurante' ? 'Restaurante' : 'Ambulante'} · ${item.aberto ? 'Aberto' : 'Fechado'}`}>
    <Popup><div className="pg-map-popup"><strong>{item.nome}</strong><p>{item.categoria}</p><span className={item.aberto ? 'pg-store-open' : 'pg-store-closed'}>{item.aberto ? 'Aberto agora' : 'Fechado'}</span><p>{formatMapDistance(item.distancia)} do pino</p><button className="pg-button pg-button-primary" onClick={() => onOpen(item)}>Ver cardápio<ChevronRight size={15}/></button></div></Popup>
  </Marker>
})

function MapView({ clientePos, accuracy, items, onOpen, onAjustarPos }: {
  clientePos: [number, number]; accuracy?: number; items: MapResult[]
  onOpen: (item: MapResult) => void; onAjustarPos: (lat: number, lng: number) => void
}) {
  const [mapa, setMapa] = useState<LeafletMap | null>(null)
  const mapStyle = usePreferences(s => s.mapStyle)
  const setMapStyle = usePreferences(s => s.setMapStyle)
  const [beachRequest, setBeachRequest] = useState(() => ({ id: initialBeach(clientePos).id, revision: 0 }))
  const [viewedBeach, setViewedBeach] = useState(() => initialBeach(clientePos).id)
  const isBeach = mapStyle === 'praia'
  const onBeachViewed = useCallback((id: string) => setViewedBeach(id), [])
  const chooseBeach = (id: string) => { setBeachRequest(value => ({ id, revision: value.revision + 1 })); setViewedBeach(id) }
  const deviceReduced = useReducedMotion()
  const reduceMotion = usePreferences(s => s.reducedMotion) || !!deviceReduced
  const clientIcon = useMemo(clienteIcon, [])
  const alvos = useMemo<[number, number][]>(() => items.map(item => item.tipo === 'ambulante' ? [item.source.lat, item.source.lng] : item.source.pos), [items])
  const dragHandlers = useMemo(() => ({ dragend: (e: L.LeafletEvent) => { const point = (e.target as L.Marker).getLatLng(); onAjustarPos(point.lat, point.lng) } }), [onAjustarPos])
  const recenter = () => {
    const beach = beachAtPoint(clientePos)
    if (isBeach && !beach) { setMapStyle('ruas'); return }
    mapa?.setView(clientePos, isBeach ? 16 : 15, { animate: !reduceMotion })
  }
  return <div className={mapStyle === 'ruas' ? 'pg-map-surface pg-map-standard' : 'pg-map-surface pg-map-beach'}>
    <div className="pg-beach-context">
      {isBeach ? <><Waves size={20}/><label><span>EXPLORANDO A PRAIA</span><select aria-label="Praia em exibição" value={viewedBeach} onChange={e => chooseBeach(e.target.value)}>{BEACH_ZONES.map(zone => <option key={zone.id} value={zone.id}>{zone.nome}</option>)}</select></label><span className="pg-beach-city">Praia Grande</span></> : <><Building2 size={20}/><div><span>ESTILO CIDADE</span><strong>Ruas e endereços</strong></div></>}
    </div>
    <div className="pg-map-canvas">
      <MapContainer center={clientePos} zoom={15} style={{ height: '100%', width: '100%' }} zoomControl={false} scrollWheelZoom={false} zoomAnimation={!reduceMotion} fadeAnimation={!reduceMotion} maxBoundsViscosity={1} ref={setMapa}>
        {isBeach ? <><CamadaPraia activeZone={viewedBeach}/><BeachCamera request={beachRequest} onViewed={onBeachViewed}/></> : <><TileLayer attribution={MAPA_ATRIBUICAO} url={MAPA_TILES} maxZoom={MAPA_ZOOM_MAX} className="prg-tiles-praia" updateWhenIdle updateWhenZooming={false} keepBuffer={1}/><FlyToCliente pos={clientePos} alvos={alvos} animate={!reduceMotion}/></>}
        <AjustaAoRedimensionar/>
        <Marker position={clientePos} title="Ponto explorado · arraste para ajustar" icon={clientIcon} draggable eventHandlers={dragHandlers}><Popup><div className="pg-map-popup"><strong>Seu ponto no mapa</strong><p>Arraste o pino para explorar outra área. Isso não altera o GPS usado na autorização dos pedidos.</p></div></Popup></Marker>
        {typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy > 0 && <Circle center={clientePos} radius={accuracy} pathOptions={{ color: '#087f8c', fillColor: '#087f8c', fillOpacity: .08, weight: 1 }}/>}
        {items.map(item => <StoreMarker key={`${item.tipo}-${item.id}`} item={item} onOpen={onOpen}/>)}
        <EscalaMapa/>
      </MapContainer>
      <div className="pg-map-zoom"><button aria-label="Aproximar mapa" onClick={() => mapa?.zoomIn()}><Plus size={18}/></button><button aria-label="Afastar mapa" onClick={() => mapa?.zoomOut()}><Minus size={18}/></button></div>
      <button className="pg-map-recenter" aria-label={isBeach && !beachAtPoint(clientePos) ? 'Ver meu ponto na cidade' : 'Centralizar no meu local'} onClick={recenter}><LocateFixed size={20}/></button>
    </div>
    {isBeach ? <p className="pg-beach-disclaimer">Zonas aproximadas · palmeiras ilustrativas</p> : <AvisoLojaLonge mapa={mapa} pos={clientePos} alvos={alvos}/>}
  </div>
}

/** Mover a câmera não muda o pino, o GPS nem a autorização de compra. */
function BeachCamera({ request, onViewed }: { request: { id: string; revision: number }; onViewed: (id: string) => void }) {
  const map = useMap()
  useEffect(() => {
    map.setMinZoom(14)
    map.setMaxZoom(MAPA_ZOOM_MAX)
    const update = () => { const center = map.getCenter(); onViewed(beachNearCamera([center.lat, center.lng]).id) }
    map.on('moveend', update)
    return () => { map.off('moveend', update); map.setMaxBounds([]); map.setMinZoom(0) }
  }, [map, onViewed])
  useEffect(() => {
    const shape = BEACH_SHAPES.find(item => item.zone.id === request.id)
    if (shape) map.whenReady(() => {
      // Enquadrar antes de restringir evita um desvio temporário quando o GPS
      // está em outra cidade; trocar de praia não anima quilômetros de costa.
      map.stop()
      map.setMaxBounds([])
      map.setView(shape.center, 16, { animate: false })
      map.setMaxBounds(BEACH_MAP_BOUNDS)
    })
  }, [map, request])
  return null
}
