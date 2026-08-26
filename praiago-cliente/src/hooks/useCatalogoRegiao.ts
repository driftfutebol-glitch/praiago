import { useMemo } from 'react'
import { useCatalogo } from '../store/useCatalogo'
import { useGPS } from './useGPS'
import { encontrarCidadeAtendida } from '../lib/serviceArea'
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

  const vendedores = useMemo(() => (
    cidadeAtendida
      ? todos.filter(v => v.pos && encontrarCidadeAtendida(v.pos[0], v.pos[1]) === cidadeAtendida)
      : todos
  ), [todos, cidadeAtendida])

  return {
    vendedores,
    todos,
    loading,
    cidade: cidadeAtendida ?? null,
    regiaoSemVendedor: Boolean(cidadeAtendida) && vendedores.length === 0 && todos.length > 0,
  }
}
