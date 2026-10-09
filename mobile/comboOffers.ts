/** Shared, display-only combo math. The database remains the price/stock authority. */
export type ComboEntry = { produto_id: string; qtd: number }
export type ComboProduct = {
  id: string
  nome: string
  preco: number
  estoque: number | null
  ativo?: boolean | null
  vendedor_id?: string | null
  tipo_produto?: string | null
  categoria?: string | null
}

export function parseComboEntries(value: unknown): ComboEntry[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 10) return []
  const entries: ComboEntry[] = []
  const ids = new Set<string>()
  for (const item of value) {
    if (!item || typeof item !== 'object') return []
    const entry = item as Record<string, unknown>
    if (typeof entry.produto_id !== 'string' || !Number.isInteger(entry.qtd)
      || Number(entry.qtd) < 1 || Number(entry.qtd) > 99 || ids.has(entry.produto_id)) return []
    ids.add(entry.produto_id)
    entries.push({ produto_id: entry.produto_id, qtd: Number(entry.qtd) })
  }
  return entries
}

export function comboSummary(entries: ComboEntry[], products: ComboProduct[], sellerId?: string | null) {
  const byId = new Map(products.map(product => [product.id, product]))
  let separatePrice = 0
  let availableStock: number | null = null
  const items: { produto_id: string; qtd: number; nome: string; categoria?: string | null }[] = []
  if (entries.length < 2 || entries.length > 10) return null
  for (const entry of entries) {
    const product = byId.get(entry.produto_id)
    if (!product || product.ativo === false || product.tipo_produto === 'combo'
      || (sellerId && product.vendedor_id && product.vendedor_id !== sellerId)) return null
    separatePrice += product.preco * entry.qtd
    if (product.estoque !== null) {
      const capacity = Math.floor(product.estoque / entry.qtd)
      availableStock = availableStock === null ? capacity : Math.min(availableStock, capacity)
    }
    items.push({ produto_id: entry.produto_id, qtd: entry.qtd, nome: product.nome, categoria: product.categoria })
  }
  return { items, separatePrice: Math.round(separatePrice * 100) / 100, availableStock }
}
