import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { menuCategoryKey, validateMenuCategory } from '../../../mobile/menuCategoryPolicy'

export function useMenuCategories(sellerId?: string) {
  const [categories, setCategories] = useState<string[]>([])
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const currentSeller = useRef(sellerId)
  currentSeller.current = sellerId
  const load = useCallback(async () => {
    if (!sellerId) return
    const { data, error: cause } = await supabase.from('vendedor_categorias_cardapio').select('nome').eq('vendedor_id', sellerId).order('created_at')
    if (currentSeller.current !== sellerId) return
    setReady(!cause)
    setError(cause ? 'Não conseguimos carregar suas categorias. Tente novamente.' : '')
    if (!cause) setCategories((data || []).map(row => row.nome as string))
  }, [sellerId])
  useEffect(() => {
    setCategories([]); setReady(false); setError('')
    if (!sellerId) return
    void load()
    const channel = supabase.channel(`menu_categories_${sellerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vendedor_categorias_cardapio', filter: `vendedor_id=eq.${sellerId}` }, () => void load())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [sellerId, load])

  async function createCategory(value: string) {
    if (!sellerId || !ready) throw new Error('Conecte-se para salvar uma categoria.')
    const valid = validateMenuCategory(value)
    if (valid.error) throw new Error(valid.error)
    const { data, error: cause } = await supabase.from('vendedor_categorias_cardapio').insert({ vendedor_id: sellerId, nome: valid.name }).select('nome').single()
    if (cause?.code === '23505') throw new Error('Você já tem uma categoria com esse nome.')
    if (cause) throw new Error(cause.code === '23514' ? cause.message : 'Não foi possível criar a categoria. Tente novamente.')
    if (currentSeller.current === sellerId) setCategories(current => current.some(name => menuCategoryKey(name) === menuCategoryKey(data.nome)) ? current : [...current, data.nome])
    return data.nome as string
  }
  return { categories, createCategory, error, ready, reload: load }
}
