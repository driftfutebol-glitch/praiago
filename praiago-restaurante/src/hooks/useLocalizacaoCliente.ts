import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  TOPICO_LOCAL_PEDIDO,
  EVENTO_LOCAL,
  POSICAO_VELHA_MS,
  posicaoValida,
  type PosicaoAoVivo,
} from '../lib/localizacaoPedido'

// Escuta a posicao que o cliente esta transmitindo durante a entrega.
//
// O par disto e `useLocalizacaoAoVivo` no app do cliente. Enquanto ele deixa
// ligado, chega uma posicao a cada poucos segundos; quando desliga, fecha o
// app ou perde o sinal, o fluxo para e em POSICAO_VELHA_MS a posicao passa a
// contar como velha — a tela volta para o ponto fixo do pedido.
//
// Sem gravacao no banco: se ninguem estiver transmitindo, isto simplesmente
// nao recebe nada. E o motivo de existir `ativo`: a tela precisa dizer se o
// que ela mostra e o cliente agora ou o lugar onde ele estava ao pedir.

export function useLocalizacaoCliente(pedidoId: string | null) {
  const [posicao, setPosicao] = useState<PosicaoAoVivo | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  useEffect(() => {
    setPosicao(null)
    if (!pedidoId) return

    const canal = supabase
      .channel(TOPICO_LOCAL_PEDIDO(pedidoId), { config: { broadcast: { self: false } } })
      .on('broadcast', { event: EVENTO_LOCAL }, ({ payload }) => {
        if (posicaoValida(payload)) setPosicao(payload)
      })
      .subscribe()

    // Relogio proprio: sem ele a posicao ficaria "ao vivo" para sempre na tela
    // depois que o cliente parasse de transmitir, porque nada mais provocaria
    // uma nova renderizacao.
    const tique = window.setInterval(() => setAgora(Date.now()), 5_000)

    return () => {
      window.clearInterval(tique)
      void supabase.removeChannel(canal)
    }
  }, [pedidoId])

  const ativo = posicao !== null && agora - posicao.ts < POSICAO_VELHA_MS

  return { posicao: ativo ? posicao : null, ativo }
}
