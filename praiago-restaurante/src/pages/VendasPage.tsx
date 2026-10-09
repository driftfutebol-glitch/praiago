import { Link } from 'react-router-dom'
import { CalendarDays, ArrowUpRight, ShoppingBag } from 'lucide-react'
import SalesOverview from '../components/SalesOverview'
import { useSalesReport } from '../hooks/useSalesReport'
import { formatBRL, salesChart } from '../lib/salesReport'

const statusLabels: Record<string, string> = { novo: 'Novo', preparando: 'Em preparo', pronto: 'Pronto', entregando: 'Em entrega', entregue: 'Entregue' }
const chartMoney = (cents: number) => cents >= 100000
  ? (cents / 100).toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })
  : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export default function VendasPage() {
  const data = useSalesReport()
  return <VendasContent data={data} />
}
export function VendasContent({ data }: { data: ReturnType<typeof useSalesReport> }) {
  const days = salesChart(data.report ?? [])
  const max = Math.max(...days.map(day => day.gross), 1)
  return <div className="restaurant-page sales-page" style={{ padding: '32px 40px 48px', minHeight: '100vh' }}>
    <header className="sales-page-heading"><h1>Resumo de Vendas</h1><p>Todas as vendas da loja, com os valores reais da sua carteira.</p></header>
    <SalesOverview data={data} />
    <section className="sales-panel" aria-label="Faturamento dos últimos sete dias">
      <div className="sales-panel-heading"><CalendarDays size={20} /><div><h2>Últimos 7 dias</h2><p>Bruto em R$ · data do pagamento · Brasília</p></div></div>
      {data.report ? <div className="sales-chart-scroll" tabIndex={0} role="region" aria-label="Gráfico de vendas por dia">
        <div className="sales-chart">{days.map(day => <div className="sales-chart-column" key={day.day}>
          <strong aria-label={formatBRL(day.gross)} title={formatBRL(day.gross)}>{chartMoney(day.gross)}</strong><div className="sales-chart-track"><div className={day.gross ? 'has-sales' : ''} style={{ height: `${Math.max(3, day.gross / max * 100)}%` }} /></div>
          <span>{day.label}</span><small>{day.count} venda{day.count === 1 ? '' : 's'}</small>
        </div>)}</div>
      </div> : <p className="sales-empty">{data.loading ? 'Carregando o gráfico…' : 'Gráfico indisponível. Tente atualizar os dados.'}</p>}
    </section>
    <section className="sales-panel" aria-label="Vendas mais recentes">
      <div className="sales-panel-heading"><ShoppingBag size={20} /><div><h2>Vendas mais recentes</h2><p>Últimas 10 vendas de todo o histórico</p></div><Link to="/pedidos">Pedidos <ArrowUpRight size={16} /></Link></div>
      {data.report?.slice(0, 10).map(sale => <article className="sales-history-row" key={sale.id}>
        <div><strong>Pedido #{sale.id.slice(0, 8).toUpperCase()}</strong><time dateTime={sale.date}>{new Date(sale.date).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</time><span className="sales-order-status">{statusLabels[sale.status]}</span></div>
        <div className="sales-history-amount"><strong>{formatBRL(sale.gross)}</strong><small>{sale.net == null ? 'Líquido aguardando registro' : `${formatBRL(sale.net)} líquido`}</small></div>
      </article>)}
      {data.report && data.report.length === 0 && <p className="sales-empty">Ainda não há vendas válidas registradas.</p>}
      {!data.report && <p className="sales-empty">{data.loading ? 'Carregando o histórico…' : 'Histórico indisponível. Tente atualizar os dados.'}</p>}
    </section>
  </div>
}
