import { useCallback, useEffect, useRef, useState } from 'react'
import { getSessao } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { loadSalesReport } from '../lib/loadSalesReport'
import type { Sale } from '../lib/salesReport'
import { useOrders } from '../store/useOrders'

export function useSalesReport() {
  const sellerId = getSessao()?.id
  const orders = useOrders(state => state.pedidos)
  const [report, setReport] = useState<Sale[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const request = useRef(0)
  const loadedSeller = useRef<string | undefined>(undefined)
  const refresh = useCallback(async () => {
    const current = ++request.current
    if (loadedSeller.current !== sellerId) { loadedSeller.current = sellerId; setReport(null); setUpdatedAt(null) }
    if (!sellerId) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const sales = await loadSalesReport(sellerId)
      if (request.current !== current) return
      setReport(sales)
      setUpdatedAt(new Date())
    } catch {
      if (request.current === current) setError('Não foi possível atualizar as vendas. Confira sua conexão e tente novamente.')
    } finally { if (request.current === current) setLoading(false) }
  }, [sellerId])
  useEffect(() => { void refresh(); return () => { request.current++ } }, [refresh, orders])
  useEffect(() => {
    if (!sellerId) return
    const visible = () => { if (document.visibilityState === 'visible') void refresh() }
    const online = () => { void refresh() }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('online', online)
    const channel = supabase.channel(`sales-ledger-${sellerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_ledger', filter: `vendedor_id=eq.${sellerId}` }, online).subscribe()
    return () => {
      document.removeEventListener('visibilitychange', visible)
      window.removeEventListener('online', online)
      void supabase.removeChannel(channel)
      request.current++
    }
  }, [sellerId, refresh])
  return { report, loading, error, updatedAt, refresh }
}
