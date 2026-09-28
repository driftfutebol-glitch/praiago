import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, RefreshCw, ShoppingBag, TrendingUp, Receipt, Wallet } from 'lucide-react'
import { formatBRL, salesPeriods, summarizeSales, type SalesPeriod } from '../lib/salesReport'
import { useSalesReport } from '../hooks/useSalesReport'

export default function SalesOverview({ data }: { data: ReturnType<typeof useSalesReport> }) {
  const [period, setPeriod] = useState<SalesPeriod>('all')
  const summary = data.report ? summarizeSales(data.report, period) : null
  const value = (amount: number | null | undefined) => amount == null ? '—' : formatBRL(amount)
  const cards = [
    { label: 'Vendas realizadas', value: summary ? String(summary.count) : '—', help: 'Pedidos válidos, inclusive em entrega', icon: ShoppingBag, color: '#ea580c' },
    { label: 'Faturamento bruto', value: value(summary?.gross), help: 'Antes de comissão e taxas', icon: TrendingUp, color: '#15803d' },
    { label: 'Comissão PraiaGo', value: value(summary?.commission), help: 'Valor real registrado na carteira', icon: Receipt, color: '#c2410c' },
    { label: 'Líquido da loja', value: value(summary?.net), help: 'Não é o saldo disponível para saque', icon: Wallet, color: '#0369a1' },
  ]
  return <section className="sales-overview" aria-label="Desempenho de vendas" aria-busy={data.loading}>
    <div className="sales-toolbar">
      <div><h2>Seu desempenho</h2><p>Histórico real da loja · horário de Brasília</p></div>
      <div className="sales-toolbar-actions">
        <label className="sales-period">Período<select aria-label="Período das vendas" value={period} onChange={event => setPeriod(event.target.value as SalesPeriod)}>
          {salesPeriods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <button type="button" className="sales-refresh" onClick={() => void data.refresh()} disabled={data.loading} aria-label="Atualizar vendas"><RefreshCw size={17} className={data.loading ? 'sales-spin' : ''} /><span>Atualizar</span></button>
      </div>
    </div>
    <div className="sales-sync" role="status">{data.loading ? 'Atualizando dados reais…' : data.error ? (data.updatedAt ? 'Exibindo a última consulta disponível; os dados podem estar desatualizados.' : 'Dados indisponíveis — isso não significa que suas vendas sejam zero.')
      : data.updatedAt ? `Atualizado às ${data.updatedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}` : 'Aguardando consulta de vendas'}</div>
    {data.error && <div className="sales-alert" role="alert">{data.error}</div>}
    <div className="sales-metrics-grid">{cards.map(({ label, value: cardValue, help, icon: Icon, color }) => <article className="sales-metric" key={label}>
      <div className="sales-metric-label"><span style={{ background: `${color}12`, color }}><Icon size={19} /></span><h3>{label}</h3></div>
      <strong className="sales-metric-value">{cardValue}</strong><p>{help}</p>
    </article>)}</div>
    {summary && <>
      <div className="sales-secondary-grid">
        <div><span>Ticket médio</span><strong>{formatBRL(summary.average)}</strong></div>
        <div><span>Taxa do provedor</span><strong>{value(summary.providerFee)}</strong></div>
        <div><span>Entregues no período</span><strong>{summary.delivered}</strong></div>
        <div><span>Em andamento no período</span><strong>{summary.inProgress}</strong></div>
      </div>
      {summary.count === 0 && !data.error && <p className="sales-empty">Nenhuma venda válida neste período. Se a loja já vendeu em outro dia, selecione “Todo o histórico”.</p>}
      {summary.unreconciled > 0 && <p className="sales-alert" role="status">{summary.unreconciled} venda(s) ainda sem lançamento financeiro completo. Comissão e líquido não serão estimados.</p>}
      <div className="sales-explainer"><p>Pagamentos aprovados entram mesmo antes da entrega. Pedidos cancelados, recusados, estornados ou aguardando pagamento não entram. {summary.cashOrders > 0 && 'Pedidos presenciais estão incluídos; o recebimento acontece diretamente na loja. '}O líquido já desconta a comissão e a taxa do provedor; liberação e saque têm seus próprios prazos.</p><Link to="/carteira">Ver carteira <ArrowUpRight size={16} /></Link></div>
    </>}
  </section>
}
