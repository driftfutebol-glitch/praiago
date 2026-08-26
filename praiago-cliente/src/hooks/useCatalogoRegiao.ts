import { useMemo } from 'react'
import { useCatalogo } from '../store/useCatalogo'
import { useGPS } from './useGPS'
import { encontrarCidadeAtendida, distanciaKm, RAIO_PEDIDO_KM } from '../lib/serviceArea'
import type { Vendedor } from '../lib/catalogo'

// Fonte unica de vendedores visiveis.
//
// Toda tela que lista vendedor usa este hook, nunca `useCatalogo` direto —
// senao uma tela sempre esquece de aplicar a regra, que foi o que aconteceu
// antes com Explorar e o Radar.
//
// A regra depende do TIPO do vendedor:
//
//   RESTAURANTE  aparece fora da regiao dele, desde que dentro de 15 km.
//                Restaurante entrega, entao vale a distancia, nao a fronteira
//                da cidade — mesmo modelo do iFood.
//
//   AMBULANTE    aparece SO na propria regiao. E banca na areia: nao existe
//                ambulante de Praia Grande entregando em Santos.
//
// Sem posicao conhecida (GPS negado e nada escolhido) mostramos tudo, porque
// esconder o catalogo inteiro seria pior do que mostrar de mais.

export type CatalogoRegiao = {
  /** Vendedores visiveis pela regra acima. Use este, nao o catalogo cru. */
  vendedores: Vendedor[]
  /** Catalogo completo, para a contagem por cidade no seletor de regiao. */
  todos: Vendedor[]
  loading: boolean
  cidade: string | null
  /** Ha lojas no catalogo, mas nenhuma alcancavel de onde o cliente esta. */
  regiaoSemVendedor: boolean
}

export function useCatalogoRegiao(): CatalogoRegiao {
  const todos = useCatalogo(s => s.vendedores)
  const loading = useCatalogo(s => s.loading)
  const { cidadeAtendida, pos } = useGPS()

  const vendedores = useMemo(() => {
    if (!cidadeAtendida && !pos) return todos

    return todos.filter(v => {
      if (!v.pos) return true

      if (v.tipo === 'restaurante') {
        if (!pos) return true
        return distanciaKm(pos[0], pos[1], v.pos[0], v.pos[1]) <= RAIO_PEDIDO_KM
      }

      // Ambulante: mesma cidade, ponto final.
      if (!cidadeAtendida) return true
      return encontrarCidadeAtendida(v.pos[0], v.pos[1]) === cidadeAtendida
    })
  }, [todos, cidadeAtendida, pos])

  return {
    vendedores,
    todos,
    loading,
    cidade: cidadeAtendida ?? null,
    regiaoSemVendedor: Boolean(cidadeAtendida) && vendedores.length === 0 && todos.length > 0,
  }
}
