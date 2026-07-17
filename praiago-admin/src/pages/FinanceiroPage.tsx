import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle2, CreditCard, DollarSign, Percent, RefreshCw, Search, WalletCards } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { confirmDialog, alertDialog } from '../lib/dialog'

type PedidoFinanceiro = {
  id: string
  created_at: string
  cliente_nome?: string | null
  vendedor_nome?: string | null
  pagamento?: string | null
  payment_provider?: string | null
  payment_status?: string | null
  settlement_status?: string | null
  gross_amount?: number | null
  total?: number | null
  platform_fee_amount?: number | null
  vendor_amount?: number | null
  mercadopago_payment_id?: string | null
  payment_checkout_url?: string | null
  reembolso_status?: string | null
  reembolso_motivo?: string | null
  reembolso_previsao?: string | null
}

type Settings = {
  platform_fee_percent: number
  platform_fee_fixed: number
  presencial_fee_mode: string
  repasse_dias: number
}

const money = (value: unknown) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`

function statusClass(status?: string | null) {
  if (['aprovado', 'pago', 'pago_split', 'repasse_manual_pago'].includes(status || '')) return 'bg-green-500/10 text-green-400 border-green-500/15'
  if (['rejeitado', 'cancelado', 'estornado', 'chargeback'].includes(status || '')) return 'bg-red-500/10 text-red-400 border-red-500/15'
  if ((status || '').includes('manual')) return 'bg-amber-500/10 text-amber-400 border-amber-500/15'
  return 'bg-blue-500/10 text-blue-400 border-blue-500/15'
}

export default function FinanceiroPage() {
  const [pedidos, setPedidos] = useState<PedidoFinanceiro[]>([])
  const [settings, setSettings] = useState<Settings>({ platform_fee_percent: 10, platform_fee_fixed: 0, presencial_fee_mode: 'cobrar_vendedor', repasse_dias: 7 })
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saques, setSaques] = useState<Array<{ id: string; valor: number; status: string; chave_pix: string | null; created_at: string; vendedor_nome: string }>>([])
  const [processandoSaque, setProcessandoSaque] = useState<string | null>(null)

  async function loadSaques() {
    const { data } = await supabase
      .from('payouts')
      .select('id,valor,status,chave_pix,created_at,vendedor_id')
      .in('status', ['solicitado', 'processando'])
      .order('created_at', { ascending: true })
    const rows = (data as Array<{ id: string; valor: number; status: string; chave_pix: string | null; created_at: string; vendedor_id: string }>) ?? []
    const ids = [...new Set(rows.map(r => r.vendedor_id))]
    const nomes: Record<string, string> = {}
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id,nome').in('id', ids)
      for (const p of (profs as Array<{ id: string; nome: string }>) ?? []) nomes[p.id] = p.nome
    }
    setSaques(rows.map(r => ({ ...r, vendedor_nome: nomes[r.vendedor_id] || 'Vendedor' })))
  }

  useEffect(() => { loadSaques() }, [])

  async function marcarSaquePago(saque: { id: string; vendedor_nome: string; valor: number }) {
    const ok = await confirmDialog({ title: 'Confirmar pagamento do saque?', message: `Confirma que o Pix de ${money(saque.valor)} para ${saque.vendedor_nome} foi enviado? (marca como pago no espelho)`, confirmText: 'Marcar pago' })
    if (!ok) return
    setProcessandoSaque(saque.id)
    const { error } = await supabase.from('payouts').update({ status: 'pago', updated_at: new Date().toISOString() }).eq('id', saque.id)
    setProcessandoSaque(null)
    if (error) { alertDialog({ title: 'Erro', message: error.message, tone: 'danger' }); return }
    loadSaques()
  }

  async function load() {
    setLoading(true)
    const [{ data: pedidosData }, { data: settingsData }] = await Promise.all([
      supabase
        .from('pedidos')
        .select('id,created_at,cliente_nome,vendedor_nome,pagamento,payment_provider,payment_status,settlement_status,gross_amount,total,platform_fee_amount,vendor_amount,mercadopago_payment_id,payment_checkout_url,reembolso_status,reembolso_motivo,reembolso_previsao')
        .order('created_at', { ascending: false }),
      supabase
        .from('payment_settings')
        .select('platform_fee_percent,platform_fee_fixed,presencial_fee_mode,repasse_dias')
        .eq('id', true)
        .maybeSingle(),
    ])
    setPedidos((pedidosData || []) as PedidoFinanceiro[])
    if (settingsData) {
      setSettings({
        platform_fee_percent: Number(settingsData.platform_fee_percent ?? 10),
        platform_fee_fixed: Number(settingsData.platform_fee_fixed ?? 0),
        presencial_fee_mode: String(settingsData.presencial_fee_mode ?? 'cobrar_vendedor'),
        repasse_dias: Number(settingsData.repasse_dias ?? 7),
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    const channel = supabase.channel('admin_financeiro')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const filtrados = useMemo(() => {
    const term = busca.trim().toLowerCase()
    if (!term) return pedidos
    return pedidos.filter(p =>
      p.id.toLowerCase().includes(term) ||
      String(p.cliente_nome || '').toLowerCase().includes(term) ||
      String(p.vendedor_nome || '').toLowerCase().includes(term) ||
      String(p.payment_status || '').toLowerCase().includes(term) ||
      String(p.settlement_status || '').toLowerCase().includes(term)
    )
  }, [busca, pedidos])

  const resumo = useMemo(() => {
    return pedidos.reduce((acc, p) => {
      const bruto = Number(p.gross_amount ?? p.total ?? 0)
      const taxa = Number(p.platform_fee_amount ?? 0)
      const repasse = Number(p.vendor_amount ?? 0)
      acc.bruto += bruto
      acc.taxa += taxa
      acc.repasse += repasse
      if (p.settlement_status === 'repasse_manual_pendente') acc.repasseManual += repasse
      if (p.payment_provider === 'mercadopago') acc.online += 1
      return acc
    }, { bruto: 0, taxa: 0, repasse: 0, repasseManual: 0, online: 0 })
  }, [pedidos])

  async function salvarTaxa() {
    setSalvando(true)
    await supabase.from('payment_settings').upsert({
      id: true,
      platform_fee_percent: settings.platform_fee_percent,
      platform_fee_fixed: settings.platform_fee_fixed,
      presencial_fee_mode: settings.presencial_fee_mode,
      repasse_dias: settings.repasse_dias,
      updated_at: new Date().toISOString(),
    })
    setSalvando(false)
    load()
  }

  async function marcarRepassePago(pedido: PedidoFinanceiro) {
    if (!await confirmDialog({ title: 'Confirmar repasse', message: `Marcar o repasse de ${money(pedido.vendor_amount)} para ${pedido.vendedor_nome || 'vendedor'} como pago?`, confirmText: 'Marcar pago', tone: 'success' })) return
    const now = new Date().toISOString()
    await Promise.all([
      supabase.from('pedidos').update({ settlement_status: 'repasse_manual_pago' }).eq('id', pedido.id),
      supabase.from('financial_ledger').update({ status: 'pago', settled_at: now, provider: 'repasse_manual' }).eq('pedido_id', pedido.id).eq('tipo', 'repasse_vendedor'),
    ])
    load()
  }

  const reembolsos = useMemo(() => pedidos.filter(p => p.reembolso_status === 'solicitado'), [pedidos])
  const [processandoReembolso, setProcessandoReembolso] = useState<string | null>(null)

  async function resolverReembolso(pedido: PedidoFinanceiro, acao: 'aprovar' | 'negar') {
    if (acao === 'aprovar' && !await confirmDialog({ title: 'Aprovar reembolso?', message: `Devolver ${money(pedido.total)} para ${pedido.cliente_nome || 'cliente'}? Se foi pago online, o estorno é disparado no Mercado Pago na hora (PIX volta rápido, cartão demora dias).`, confirmText: 'Aprovar e estornar', tone: 'danger' })) return
    if (acao === 'negar' && !await confirmDialog({ title: 'Negar reembolso?', message: 'O cliente será informado de que o reembolso não foi aprovado.', confirmText: 'Negar', tone: 'danger' })) return
    setProcessandoReembolso(pedido.id)
    const { data, error } = await supabase.functions.invoke('pedido-reembolso', { body: { pedido_id: pedido.id, acao } })
    setProcessandoReembolso(null)
    if (error) { await alertDialog({ title: 'Erro', message: 'Não foi possível processar agora. ' + error.message, tone: 'danger' }); return }
    await alertDialog({ title: acao === 'aprovar' ? 'Reembolso processado' : 'Reembolso negado', message: acao === 'aprovar' ? (data?.previsao || 'Estorno registrado.') : 'O cliente foi informado.', tone: 'success' })
    load()
  }

  const cards = [
    { label: 'Bruto processado', value: money(resumo.bruto), icon: DollarSign, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { label: '10% empresa', value: money(resumo.taxa), icon: Percent, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Repasse vendedores', value: money(resumo.repasse), icon: WalletCards, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Repasse manual pendente', value: money(resumo.repasseManual), icon: CreditCard, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  ]

  return (
    <div className="space-y-6">
      <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Financeiro e Repasses</h1>
          <p className="text-slate-400 font-medium">Controle do Mercado Pago, taxa da empresa e repasses dos vendedores.</p>
        </div>
        <button onClick={load} className="inline-flex items-center justify-center gap-2 bg-slate-900/70 border border-slate-800 text-slate-300 px-4 py-2 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors">
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(card => (
          <div key={card.label} className="glass-panel p-5 rounded-2xl border-slate-800 flex items-center gap-4 prg-lift">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.bg}`}>
              <card.icon size={22} className={card.color} />
            </div>
            <div>
              <div className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-0.5 font-mono">{card.label}</div>
              <div className="text-2xl font-black text-slate-100 font-mono">{card.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Saques solicitados (repasse via Pix) */}
      {saques.length > 0 && (
        <section className="glass-panel rounded-2xl border border-sky-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <WalletCards size={16} className="text-sky-400" />
            <h2 className="text-lg font-black text-slate-100">Saques solicitados</h2>
            <span className="text-xs font-black text-sky-400 font-mono">({saques.length})</span>
          </div>
          <div className="space-y-3">
            {saques.map(s => (
              <div key={s.id} className="flex flex-col md:flex-row md:items-center gap-3 bg-slate-950/40 rounded-xl p-4 border border-slate-800/50">
                <div className="flex-1">
                  <div className="text-slate-200 font-bold">{s.vendedor_nome} <span className="text-sky-400 font-mono">{money(s.valor)}</span></div>
                  <div className="text-xs text-slate-500 mt-0.5">Pix: {s.chave_pix || '—'} · {s.status} · {format(new Date(s.created_at), 'dd/MM/yyyy')}</div>
                </div>
                <button onClick={() => marcarSaquePago(s)} disabled={processandoSaque === s.id} className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg px-3 py-2 text-xs font-black hover:bg-green-500/20 disabled:opacity-50">
                  <CheckCircle2 size={14} /> Marcar pago
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 mt-3">Quando o provedor (Asaas) estiver ligado, o Pix sai automático e este painel só mostra o status. Por ora, confirme o pagamento manual aqui.</p>
        </section>
      )}

      {/* Reembolsos solicitados */}
      {reembolsos.length > 0 && (
        <section className="glass-panel rounded-2xl border border-amber-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <RefreshCw size={16} className="text-amber-400" />
            <h2 className="text-lg font-black text-slate-100">Reembolsos solicitados</h2>
            <span className="text-xs font-black text-amber-400 font-mono">({reembolsos.length})</span>
          </div>
          <div className="space-y-3">
            {reembolsos.map(p => (
              <div key={p.id} className="flex flex-col md:flex-row md:items-center gap-3 bg-slate-950/40 rounded-xl p-4 border border-slate-800/50">
                <div className="flex-1">
                  <div className="text-slate-200 font-bold">{p.cliente_nome || 'Cliente'} <span className="text-slate-500 font-normal">· {p.vendedor_nome || 'vendedor'}</span></div>
                  <div className="text-xs text-slate-500 mt-0.5">{money(p.total)} · {(p.pagamento || '').toUpperCase()} · {p.reembolso_motivo || 'sem motivo'}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => resolverReembolso(p, 'aprovar')} disabled={processandoReembolso === p.id} className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg px-3 py-2 text-xs font-black hover:bg-green-500/20 disabled:opacity-50">
                    <CheckCircle2 size={14} /> Aprovar e estornar
                  </button>
                  <button onClick={() => resolverReembolso(p, 'negar')} disabled={processandoReembolso === p.id} className="inline-flex items-center gap-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg px-3 py-2 text-xs font-black hover:bg-red-500/20 disabled:opacity-50">
                    Negar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="glass-panel rounded-2xl border-slate-800 p-5">
        <div className="flex flex-col xl:flex-row xl:items-end gap-4">
          <div className="flex-1">
            <div className="text-sm font-black text-slate-100 mb-1">Taxa da empresa</div>
            <p className="text-xs text-slate-500">Padrao atual: 10% para PraiaGo. Pedidos presenciais podem gerar cobranca manual do vendedor.</p>
          </div>
          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500">Percentual</span>
            <input type="number" min={0} max={100} step="0.01" value={settings.platform_fee_percent} onChange={e => setSettings(s => ({ ...s, platform_fee_percent: Number(e.target.value) }))} className="w-32 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-purple-500/50" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500">Fixa</span>
            <input type="number" min={0} step="0.01" value={settings.platform_fee_fixed} onChange={e => setSettings(s => ({ ...s, platform_fee_fixed: Number(e.target.value) }))} className="w-32 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-purple-500/50" />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500">Presencial</span>
            <select value={settings.presencial_fee_mode} onChange={e => setSettings(s => ({ ...s, presencial_fee_mode: e.target.value }))} className="w-52 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-purple-500/50">
              <option value="cobrar_vendedor">Cobrar vendedor</option>
              <option value="isento">Isento</option>
              <option value="mensalidade">Mensalidade</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500">Dias p/ repasse</span>
            <input type="number" min={0} max={60} step="1" value={settings.repasse_dias} onChange={e => setSettings(s => ({ ...s, repasse_dias: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} className="w-32 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-purple-500/50" />
          </label>
          <button onClick={salvarTaxa} disabled={salvando} className="inline-flex items-center justify-center gap-2 bg-green-500/10 text-green-400 border border-green-500/20 px-4 py-2 rounded-xl font-black text-sm hover:bg-green-500/20 disabled:opacity-60 transition-colors">
            <CheckCircle2 size={16} /> {salvando ? 'Salvando...' : 'Salvar taxa'}
          </button>
        </div>
      </section>

      <section className="glass-panel rounded-2xl overflow-hidden border-slate-800">
        <div className="p-4 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-slate-100">Tabela de pagamentos</h2>
            <p className="text-xs text-slate-500">{loading ? 'Carregando...' : `${filtrados.length} registro(s) exibido(s)`}</p>
          </div>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pedido, cliente, vendedor..." className="bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-purple-500/50 w-full lg:w-80" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/80 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-800">
                <th className="p-4">Pedido</th>
                <th className="p-4">Cliente / Vendedor</th>
                <th className="p-4">Metodo</th>
                <th className="p-4">Bruto</th>
                <th className="p-4">Empresa</th>
                <th className="p-4">Repasse</th>
                <th className="p-4">Pagamento</th>
                <th className="p-4">Repasse</th>
                <th className="p-4 text-right">Acao</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-sm">
              {filtrados.map(p => (
                <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                  <td className="p-4">
                    <div className="font-mono font-bold text-purple-400">{p.id.slice(0, 8)}</div>
                    <div className="text-xs text-slate-500">{format(new Date(p.created_at), 'dd/MM HH:mm')}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-200 font-bold">{p.cliente_nome || 'Cliente'}</div>
                    <div className="text-xs text-slate-500">{p.vendedor_nome || 'Vendedor'}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-300 font-bold uppercase">{p.pagamento || '-'}</div>
                    <div className="text-xs text-slate-500">{p.payment_provider || 'manual'}</div>
                  </td>
                  <td className="p-4 text-slate-100 font-mono font-black">{money(p.gross_amount ?? p.total)}</td>
                  <td className="p-4 text-green-400 font-mono font-black">{money(p.platform_fee_amount)}</td>
                  <td className="p-4 text-purple-300 font-mono font-black">{money(p.vendor_amount)}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase border ${statusClass(p.payment_status)}`}>{p.payment_status || 'pendente'}</span>
                    {p.mercadopago_payment_id && <div className="text-[10px] text-slate-600 mt-1 font-mono">MP {p.mercadopago_payment_id}</div>}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase border ${statusClass(p.settlement_status)}`}>{p.settlement_status || 'pendente'}</span>
                  </td>
                  <td className="p-4 text-right">
                    {p.settlement_status === 'repasse_manual_pendente' ? (
                      <button onClick={() => marcarRepassePago(p)} className="inline-flex items-center gap-2 bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 rounded-lg px-3 py-2 transition-colors text-xs font-black">
                        <CheckCircle2 size={14} /> Marcar pago
                      </button>
                    ) : p.payment_checkout_url ? (
                      <a href={p.payment_checkout_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 rounded-lg px-3 py-2 transition-colors text-xs font-black">
                        Abrir checkout
                      </a>
                    ) : (
                      <span className="text-slate-600 text-xs font-bold">Sem acao</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-500 font-bold">Nenhum pagamento encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
