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
