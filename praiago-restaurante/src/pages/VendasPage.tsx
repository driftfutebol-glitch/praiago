// Resumo de Vendas — 100% dados reais da tabela `pedidos` deste vendedor.
// Bruto = soma dos pedidos entregues; Líquido = bruto - taxa da plataforma.
import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, ShoppingBag, Receipt, Wallet, CalendarDays } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

const TAXA_PLATAFORMA = 0 // % — lançamento sem taxa; ajuste quando definir o modelo

type PedidoRow = { total: number | string; status: string; created_at: string }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

export default function VendasPage() {
  const sessao = getSessao()
  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    if (!sessao) return
    const inicio = new Date(); inicio.setDate(inicio.getDate() - 30); inicio.setHours(0, 0, 0, 0)
    supabase.from('pedidos').select('total, status, created_at')
      .eq('vendedor_id', sessao.id).gte('created_at', inicio.toISOString())
      .then(({ data }) => { setPedidos((data as PedidoRow[]) ?? []); setCarregado(true) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const resumo = useMemo(() => {
    const entregues = pedidos.filter(p => p.status === 'entregue')
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const doDia = entregues.filter(p => new Date(p.created_at) >= hoje)
    const brutoMes = entregues.reduce((a, p) => a + (Number(p.total) || 0), 0)
    const brutoDia = doDia.reduce((a, p) => a + (Number(p.total) || 0), 0)
    // últimos 7 dias para o gráfico
    const dias: { label: string; valor: number; pedidos: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
      const fim = new Date(d); fim.setDate(fim.getDate() + 1)
      const doD = entregues.filter(p => { const t = new Date(p.created_at); return t >= d && t < fim })
      dias.push({ label: DIAS[d.getDay()], valor: doD.reduce((a, p) => a + (Number(p.total) || 0), 0), pedidos: doD.length })
    }
    return {
      brutoMes, brutoDia,
      liquidoMes: brutoMes * (1 - TAXA_PLATAFORMA / 100),
      pedidosMes: entregues.length, pedidosDia: doDia.length,
      ticketMedio: entregues.length ? brutoMes / entregues.length : 0,
      pendentes: pedidos.filter(p => p.status !== 'entregue').length,
      dias,
    }
  }, [pedidos])

  const maxDia = Math.max(...resumo.dias.map(d => d.valor), 1)

  const cards = [
    { label: 'Vendas hoje', valor: fmtBRL(resumo.brutoDia), extra: `${resumo.pedidosDia} pedido${resumo.pedidosDia === 1 ? '' : 's'}`, icon: ShoppingBag, cor: '#f97316' },
    { label: 'Bruto (30 dias)', valor: fmtBRL(resumo.brutoMes), extra: `${resumo.pedidosMes} entregues`, icon: TrendingUp, cor: '#16a34a' },
    { label: 'Líquido (30 dias)', valor: fmtBRL(resumo.liquidoMes), extra: `taxa PraiaGo ${TAXA_PLATAFORMA}%`, icon: Wallet, cor: '#0284c7' },
    { label: 'Ticket médio', valor: fmtBRL(resumo.ticketMedio), extra: `${resumo.pendentes} em andamento`, icon: Receipt, cor: '#7c3aed' },
  ]

  return (
    <div style={{ padding: '32px 40px 48px', minHeight: '100vh' }}>
      <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', margin: '0 0 8px', letterSpacing: -1 }}>Resumo de Vendas</h1>
        <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 32px', fontWeight: 500 }}>Seu desempenho real, direto dos pedidos entregues</p>
      </motion.div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginBottom: 28 }}>
        {cards.map(({ label, valor, extra, icon: Icon, cor }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="glass-panel card-hover" style={{ borderRadius: 22, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: `${cor}18`, display: 'grid', placeItems: 'center' }}>
                <Icon size={19} color={cor} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, color: '#0f172a', letterSpacing: -0.5 }}>{valor}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: cor, marginTop: 4 }}>{extra}</div>
          </motion.div>
        ))}
      </div>

      {/* Gráfico últimos 7 dias */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel" style={{ borderRadius: 24, padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <CalendarDays size={18} color="#f97316" />
          <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 1 }}>Últimos 7 dias</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#64748b' }}>faturamento por dia</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 190 }}>
          {resumo.dias.map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: d.valor > 0 ? '#16a34a' : '#cbd5e1' }}>
                {d.valor > 0 ? fmtBRL(d.valor) : '—'}
              </div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (d.valor / maxDia) * 100)}%` }}
                transition={{ delay: 0.35 + i * 0.07, type: 'spring', stiffness: 120, damping: 16 }}
                style={{
                  width: '100%', maxWidth: 46, borderRadius: 10,
                  background: d.valor > 0 ? 'linear-gradient(180deg, #fb923c, #f97316)' : '#f1f5f9',
                  boxShadow: d.valor > 0 ? '0 8px 20px rgba(249,115,22,0.25)' : 'none',
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>{d.label}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{d.pedidos} ped.</div>
            </div>
          ))}
        </div>
        {carregado && resumo.pedidosMes === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, fontWeight: 600, marginTop: 18 }}>
            Nenhuma venda entregue nos últimos 30 dias — assim que os pedidos forem concluídos, tudo aparece aqui. 🌊
          </div>
        )}
      </motion.div>
    </div>
  )
}
