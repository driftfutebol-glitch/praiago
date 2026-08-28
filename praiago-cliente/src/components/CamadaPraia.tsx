import { useEffect, useState } from 'react'
import { Polygon, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import { BEACH_ZONES } from '../lib/praiagoZones'

// Faixa de areia amarela + coqueiros desenhados POR CIMA do mapa.
//
// Por que desenhar em vez de trocar de mapa: nenhum provedor de tiles gratuito
// mostra a praia em amarelo forte com árvore visível — o CARTO Voyager pinta a
// areia num bege discreto e não desenha coqueiro nenhum. Os que chegam perto
// (Stadia Outdoors, Thunderforest) exigem conta e chave de API, o que
// transformaria o mapa do app numa dependência de terceiro com cota.
//
// Como isso é possível aqui: o app JÁ conhece a geografia da orla —
// `praiagoZones.ts` tem a linha d'água real (encadeada do coastline do OSM,
// de Canto do Forte a Caiçara) em `BEACH_ZONES[].poligono`. Então a areia não é
// inventada: é a praia de verdade, só pintada.

// Cada zona vem como [terraNorte, marNorte, marSul, terraSul] cobrindo ~490m:
// a borda "mar" fica 60m DENTRO da água e a borda "terra" 430m adentro. Pintar
// o polígono inteiro deixaria amarelo tanto o mar quanto quatro quarteirões.
// Então a areia é recortada como uma fatia: começa logo depois da linha d'água
// e vai ~145m pra dentro, que é a largura de praia de verdade em Praia Grande.
const AREIA_INICIO = 0.12 // ~ linha d'água (sai de dentro do mar)
const AREIA_FIM = 0.42 // ~145m de areia

function entre(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function faixaDeAreia(poligono: [number, number][]): [number, number][] | null {
  if (poligono.length < 4) return null
  const [terraN, marN, marS, terraS] = poligono
  return [
    entre(marN, terraN, AREIA_FIM),
    entre(marN, terraN, AREIA_INICIO),
    entre(marS, terraS, AREIA_INICIO),
    entre(marS, terraS, AREIA_FIM),
  ]
}

/** Coqueiro em SVG. Fica no divIcon pra escalar junto com o zoom. */
function coqueiroIcon(tamanho: number) {
  const a = tamanho
  return L.divIcon({
    className: '',
    iconSize: [a, a],
    iconAnchor: [a / 2, a * 0.92],
    html: `<svg width="${a}" height="${a}" viewBox="0 0 40 40" fill="none" style="display:block;overflow:visible">
      <ellipse cx="20" cy="37" rx="7" ry="2" fill="#d97706" opacity="0.28"/>
      <path d="M20,37 C18,26 20,18 23,10" stroke="#a16207" stroke-width="2.6" stroke-linecap="round"/>
      <g fill="#15803d">
        <path d="M23,10 C15,4 7,5 3,10 C10,7 16,7 23,10 Z"/>
        <path d="M23,10 C31,3 39,4 37,10 C31,7 29,7 23,10 Z"/>
        <path d="M23,10 C18,2 21,-2 27,-4 C24,2 23,5 23,10 Z"/>
        <path d="M23,10 C29,6 33,1 32,-3 C28,2 25,6 23,10 Z"/>
        <path d="M23,10 C17,7 11,3 9,-1 C15,3 20,7 23,10 Z"/>
      </g>
      <circle cx="23" cy="10" r="2" fill="#a16207"/>
    </svg>`,
  })
}

/** Distribui pontos ao longo da borda de terra da faixa, pra plantar os coqueiros. */
function pontosDosCoqueiros(areia: [number, number][], quantos: number): [number, number][] {
  const [terraN, , , terraS] = areia
  const pontos: [number, number][] = []
  for (let i = 0; i < quantos; i++) {
    // evita plantar exatamente na divisa entre dois bairros
    const t = (i + 0.5) / quantos
    pontos.push(entre(terraN, terraS, t))
  }
  return pontos
}

export default function CamadaPraia() {
  const map = useMap()
  const [zoom, setZoom] = useState(map.getZoom())

  useEffect(() => {
    const aoMudar = () => setZoom(map.getZoom())
    map.on('zoomend', aoMudar)
    return () => { map.off('zoomend', aoMudar) }
  }, [map])

  // Coqueiro só a partir do zoom 14: mais longe que isso viram sujeira em cima
  // das ruas e não dá pra ler mais nada.
  const mostrarCoqueiros = zoom >= 14
  const tamanhoCoqueiro = zoom >= 16 ? 34 : zoom >= 15 ? 26 : 20
  // Quanto mais perto, mais coqueiro por bairro — mantém a densidade parecida
  // na tela em vez de espalhar 3 palmeiras num quarteirão inteiro.
  const porZona = zoom >= 16 ? 7 : zoom >= 15 ? 4 : 2

  return (
    <>
      {BEACH_ZONES.map(zona => {
        const areia = faixaDeAreia(zona.poligono)
        if (!areia) return null
        return (
          <Polygon
            key={`areia-${zona.id}`}
            positions={areia}
            pathOptions={{
              // Amarelo de areia. `fillOpacity` baixo de propósito: a faixa
              // tem que colorir a praia sem apagar as ruas por baixo.
              color: '#fbbf24',
              fillColor: '#fcd34d',
              fillOpacity: 0.42,
              weight: 1,
              opacity: 0.5,
              interactive: false,
            }}
          />
        )
      })}

      {mostrarCoqueiros && BEACH_ZONES.map(zona => {
        const areia = faixaDeAreia(zona.poligono)
        if (!areia) return null
        return pontosDosCoqueiros(areia, porZona).map((p, i) => (
          <Marker
            key={`coqueiro-${zona.id}-${i}`}
            position={p}
            icon={coqueiroIcon(tamanhoCoqueiro)}
            // Enfeite: não pode roubar o clique do ambulante nem abrir popup.
            interactive={false}
            keyboard={false}
          />
        ))
      })}
    </>
  )
}
