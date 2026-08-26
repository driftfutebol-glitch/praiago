import { useCatalogo } from '../store/useCatalogo'
import { useGPS } from './useGPS'
import type { Vendedor } from '../lib/catalogo'

// Fonte unica de vendedores visiveis.
//
// Toda tela que lista vendedor deve usar este hook, nunca
// `useCatalogo(s => s.vendedores)` direto. O filtro por regiao vivia espalhado
// e uma tela sempre esquecia: a Home zerava certo enquanto Explorar e as listas
// de Restaurantes/Ambulantes continuavam mostrando lojas de Praia Grande para
// quem tinha escolhido Santos.
//
// A regiao vem da posicao efetiva (GPS ou escolha manual no seletor da Home).
// Sem regiao definida — GPS negado e nada escolhido — mostramos tudo, porque
// esconder o catalogo inteiro seria pior do que mostrar de mais.

export type CatalogoRegiao = {
  /** Vendedores da regiao atual. Use este, nao o catalogo cru. */
  vendedores: Vendedor[]
  /** Catalogo completo, para contagem por cidade no seletor. */
  todos: Vendedor[]
  loading: boolean
  cidade: string | null
  /** Regiao definida, catalogo tem lojas, mas nenhuma aqui. */
  regiaoSemVendedor: boolean
}

export function useCatalogoRegiao(): CatalogoRegiao {
  const todos = useCatalogo(s => s.vendedores)
  const loading = useCatalogo(s => s.loading)
  const { cidadeAtendida } = useGPS()

  // Vendedor NUNCA some da lista. Quem esta em Santos ve as lojas de Praia
  // Grande, abre o cardapio e o mapa. O que a regiao controla e o PEDIDO, nao
  // a visibilidade — mesmo modelo do iFood.
  const vendedores = todos

  return {
    vendedores,
    todos,
    loading,
    cidade: cidadeAtendida ?? null,
    // Mantido para as telas que avisam sobre area de entrega; nunca esconde.
    regiaoSemVendedor: false,
  }
}
