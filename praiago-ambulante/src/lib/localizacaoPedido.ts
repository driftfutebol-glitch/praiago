// Contrato da localizacao ao vivo de um pedido.
//
// Este arquivo e COPIADO identico nos tres apps (cliente, ambulante,
// restaurante). Eles sao builds separados, sem pacote compartilhado; se o
// nome do topico ou o formato do payload mudar aqui, tem que mudar nos
// outros dois no mesmo commit — senao o vendedor para de ver o cliente sem
// nenhum erro na tela, que e o pior tipo de quebra.
//
// Nada disso passa pelo banco: e broadcast puro do Realtime, some quando a
// entrega acaba.

export const TOPICO_LOCAL_PEDIDO = (pedidoId: string) => `praiago:pedido:${pedidoId}:local`

/** Evento usado pelo helper `channel()` do app do cliente. */
export const EVENTO_LOCAL = 'msg'

export type PosicaoAoVivo = {
  lat: number
  lng: number
  /** Raio de erro em metros, como o aparelho reportou. */
  precisao: number
  ts: number
}

/** Depois disso a posicao nao vale mais: o cliente desligou ou perdeu sinal. */
export const POSICAO_VELHA_MS = 45_000

/** So aceita o que veio da rede se for coordenada de verdade e recente. */
export function posicaoValida(p: unknown): p is PosicaoAoVivo {
  if (!p || typeof p !== 'object') return false
  const c = p as Partial<PosicaoAoVivo>
  return (
    typeof c.lat === 'number' && Number.isFinite(c.lat) && c.lat >= -90 && c.lat <= 90 &&
    typeof c.lng === 'number' && Number.isFinite(c.lng) && c.lng >= -180 && c.lng <= 180 &&
    typeof c.ts === 'number' && Number.isFinite(c.ts)
  )
}
