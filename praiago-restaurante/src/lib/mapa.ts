// Fonte dos ladrilhos do mapa, em UM lugar so.
//
// Este arquivo e copiado identico nos tres apps (cliente, ambulante,
// restaurante), que sao builds separados sem pacote comum.
//
// Por que existe: ate 26/08/2026 cada tela montava a URL do CARTO na mao,
// espalhada em sete lugares. O CARTO passou a exigir chave de API e comecou a
// devolver o ladrilho com "API KEY REQUIRED" carimbado por cima — respondendo
// HTTP 200, entao nada quebrava no console e nenhum erro aparecia: o mapa
// simplesmente ficava sujo, em todos os apps ao mesmo tempo, e ninguem
// percebeu ate um testador mandar print.
//
// Trocamos para os ladrilhos padrao do OpenStreetMap: sem chave, sem cadastro
// e sem carimbo. Se um dia for preciso trocar de novo, muda AQUI e pronto.
//
// A atribuicao e obrigatoria pela licenca do OpenStreetMap (ODbL). Nao tire.

export const MAPA_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

export const MAPA_ATRIBUICAO =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Alem deste zoom o OSM nao tem ladrilho: o mapa fica cinza. */
export const MAPA_ZOOM_MAX = 19

// ── Ícones padrão do Leaflet, servidos de dentro do app ─────────────────
//
// O Leaflet monta a URL dos ícones a partir do caminho do próprio CSS. Com
// bundler isso quebra, e a correção que todo mundo copia da internet aponta
// para o unpkg.com — foi o que estava aqui até 27/08/2026, em quatro telas.
//
// Num app de loja isso é ruim por dois motivos:
//
//   1. Privacidade: cada vez que um mapa abria, o aparelho do usuário fazia
//      uma requisição a um CDN de terceiro que não está na nossa política.
//   2. Confiabilidade: se o unpkg demora ou está bloqueado, o pino não
//      aparece — e o app roda na praia, em 4G ruim.
//
// Importando do pacote, o Vite copia as imagens para o bundle e serve do
// próprio app: offline funciona e ninguém de fora vê o IP do usuário.

import L from 'leaflet'
import iconeRetina from 'leaflet/dist/images/marker-icon-2x.png'
import icone from 'leaflet/dist/images/marker-icon.png'
import sombra from 'leaflet/dist/images/marker-shadow.png'

delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconeRetina,
  iconUrl: icone,
  shadowUrl: sombra,
})
