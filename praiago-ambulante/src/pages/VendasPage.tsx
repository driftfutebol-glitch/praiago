import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, CalendarDays, ChevronRight, Receipt, ShoppingBag, TrendingUp, Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { getSessao } from '../lib/auth'
import { supabase } from '../lib/supabase'

type OrderRow = {
  id: string
  total: number | string
  status: string
  pagamento: string | null
  created_at: string
}

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const shortId = (id: string) => `#${id.replace(/-/g, '').slice(0, 8).toUpperCase()}`

export default function VendasPage() {
  const navigate = useNavigate()
  const session = getSessao()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session?.id) return
    const start = new Date()
    start.setDate(start.getDate() - 29)
    start.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('pedidos')
      .select('id,total,status,pagamento,created_at')
      .eq('vendedor_id', session.id)
      .eq('status', 'entregue')
      .gte('created_at', start.toISOString())
      .order('created_at', { ascending: false })
    setOrders((data || []) as OrderRow[])
    setLoading(false)
  }, [session?.id])

  useEffect(() => {
    if (!session?.id) return
    void load()
    const channel = supabase
      .channel(`ambulante_vendas_${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${session.id}` }, load)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load, session?.id])

  const metrics = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + (Number(order.total) || 0), 0)
    const today = new Date().toDateString()
    const todayOrders = orders.filter(order => new Date(order.created_at).toDateString() === today)
    return {
      revenue,
      totalOrders: orders.length,
      averageTicket: orders.length ? revenue / orders.length : 0,
      todayRevenue: todayOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    }
  }, [orders])

  const dailyData = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date()
      day.setDate(day.getDate() - (6 - index))
      day.setHours(0, 0, 0, 0)
      const nextDay = new Date(day)
      nextDay.setDate(nextDay.getDate() + 1)
      const revenue = orders
        .filter(order => {
          const createdAt = new Date(order.created_at)
          return createdAt >= day && createdAt < nextDay
        })
        .reduce((sum, order) => sum + (Number(order.total) || 0), 0)
      return {
        date: day,
        label: day.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        revenue,
      }
    })
  }, [orders])

  const chartMaximum = Math.max(...dailyData.map(day => day.revenue), 1)

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button type="button" className="icon-button" onClick={() => navigate('/perfil')} aria-label="Voltar"><ArrowLeft size={19} /></button>
          <div>
            <h1>Vendas</h1>
            <p>Pedidos entregues nos últimos 30 dias.</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div className="surface" style={{ padding: 14, boxShadow: 'none' }}>
          <TrendingUp size={18} color="#148447" />
          <div style={{ marginTop: 10, color: '#132238', fontSize: 20, fontWeight: 900 }}>{loading ? '-' : money(metrics.revenue)}</div>
          <div style={{ marginTop: 3, color: '#617089', fontSize: 11, fontWeight: 700 }}>Vendas brutas</div>
        </div>
        <div className="surface" style={{ padding: 14, boxShadow: 'none' }}>
          <ShoppingBag size={18} color="#008fc0" />
          <div style={{ marginTop: 10, color: '#132238', fontSize: 22, fontWeight: 900 }}>{loading ? '-' : metrics.totalOrders}</div>
          <div style={{ marginTop: 3, color: '#617089', fontSize: 11, fontWeight: 700 }}>Pedidos entregues</div>
        </div>
        <div className="surface" style={{ padding: 14, boxShadow: 'none' }}>
          <Receipt size={18} color="#8b5cf6" />
          <div style={{ marginTop: 10, color: '#132238', fontSize: 18, fontWeight: 900 }}>{loading ? '-' : money(metrics.averageTicket)}</div>
          <div style={{ marginTop: 3, color: '#617089', fontSize: 11, fontWeight: 700 }}>Ticket médio</div>
        </div>
        <div className="surface" style={{ padding: 14, boxShadow: 'none' }}>
          <CalendarDays size={18} color="#b54708" />
          <div style={{ marginTop: 10, color: '#132238', fontSize: 18, fontWeight: 900 }}>{loading ? '-' : money(metrics.todayRevenue)}</div>
          <div style={{ marginTop: 3, color: '#617089', fontSize: 11, fontWeight: 700 }}>Hoje</div>
        </div>
      </div>

      <section className="surface" style={{ marginBottom: 14, padding: 14, boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 size={18} color="#008fc0" />
          <div className="section-label" style={{ color: '#40506a' }}>Últimos 7 dias</div>
        </div>
        <div style={{ height: 150, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', alignItems: 'end', gap: 7, marginTop: 14 }}>
          {dailyData.map(day => {
            const height = day.revenue > 0 ? Math.max(12, (day.revenue / chartMaximum) * 112) : 4
            return (
              <div key={day.date.toISOString()} style={{ minWidth: 0, textAlign: 'center' }} title={`${day.date.toLocaleDateString('pt-BR')}: ${money(day.revenue)}`}>
                <motion.div initial={{ height: 0 }} animate={{ height }} style={{ width: '100%', maxWidth: 28, minHeight: 4, margin: '0 auto', borderRadius: '5px 5px 2px 2px', background: day.revenue > 0 ? '#18a957' : '#dfe6ed' }} />
                <div style={{ marginTop: 7, overflow: 'hidden', color: '#718096', fontSize: 9, fontWeight: 750, textTransform: 'capitalize', textOverflow: 'clip' }}>{day.label}</div>
              </div>
            )
          })}
        </div>
      </section>

      <button type="button" className="surface" onClick={() => navigate('/carteira')} style={{ width: '100%', minHeight: 68, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, padding: '11px 13px', border: '1px solid #cce9d8', background: '#f5fbf7', color: '#132238', textAlign: 'left', cursor: 'pointer', boxShadow: 'none' }}>
        <span style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', flex: '0 0 40px', borderRadius: 8, background: '#e4f5eb', color: '#148447' }}><Wallet size={20} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 900 }}>Abrir Carteira</span>
          <span style={{ display: 'block', marginTop: 2, color: '#617089', fontSize: 11, lineHeight: 1.35, fontWeight: 600 }}>Consulte líquido, taxas, conta de recebimento e saques.</span>
        </span>
        <ChevronRight size={17} color="#718096" />
      </button>

      <section>
        <div className="section-label" style={{ marginBottom: 9 }}>Entregas recentes</div>
        {loading ? (
          <div className="surface shimmer" style={{ height: 120 }} />
        ) : orders.length === 0 ? (
          <div className="surface" style={{ padding: '24px 18px', color: '#617089', fontSize: 12, fontWeight: 650, textAlign: 'center', boxShadow: 'none' }}>Nenhum pedido entregue nos últimos 30 dias.</div>
        ) : (
          <div className="surface" style={{ overflow: 'hidden', boxShadow: 'none' }}>
            {orders.slice(0, 10).map((order, index) => (
              <div key={order.id} style={{ minHeight: 58, display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderTop: index ? '1px solid #e7ecf1' : 0 }}>
                <div style={{ width: 35, height: 35, display: 'grid', placeItems: 'center', flex: '0 0 35px', borderRadius: 8, background: '#eaf8ef', color: '#148447' }}><Receipt size={17} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#132238', fontSize: 12, fontWeight: 900 }}>{shortId(order.id)}</div>
                  <div style={{ marginTop: 2, color: '#718096', fontSize: 10, fontWeight: 650 }}>{new Date(order.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                </div>
                <div style={{ color: '#148447', fontSize: 13, fontWeight: 900 }}>{money(Number(order.total) || 0)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
