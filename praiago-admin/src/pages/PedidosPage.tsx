import ResponsiveTable from '../components/ResponsiveTable'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { confirmDialog, alertDialog } from '../lib/dialog'
import { Search, Ban, CheckCircle2 } from 'lucide-react'
import { canConcludeExternalDelivery } from '../lib/adminExceptions'
import { askExceptionReason } from '../lib/adminExceptionDialogs'
import { format } from 'date-fns'
import { formatMoney } from '../lib/dashboardMetrics'

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [busca, setBusca] = useState('')
  const [concluindo, setConcluindo] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setLoadError(false)
      try {
      const { data, error } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false })
      if (!error && data) setPedidos(data)
      else setLoadError(true)
      } catch {setLoadError(true)}
      finally {setLoading(false)}
    }
    load()

    const channel = supabase.channel('admin_pedidos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
        load() // Recarrega tudo se houver mudança
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function cancelarPedido(id: string) {
    if (!await confirmDialog({ title: 'Forçar cancelamento', message: 'Tem certeza que deseja cancelar este pedido? O repasse pendente é cancelado junto.', confirmText: 'Cancelar pedido', tone: 'danger' })) return
    // Cancela o pedido E o repasse pendente (senão continuava aparecendo pra "Marcar pago")
    const { error } = await supabase.from('pedidos').update({ status: 'cancelado', settlement_status: 'cancelado' }).eq('id', id)
    if (error) { alertDialog({ title: 'Erro', message: error.message, tone: 'danger' }); return }
    await supabase.from('financial_ledger').update({ status: 'cancelado' }).eq('pedido_id', id).neq('status', 'pago')
  }

  async function concluirEntrega(pedido: any) {
    if (concluindo) return
    setConcluindo(pedido.id)
    try {
      const motivo = await askExceptionReason('Concluir entrega por exceção', `Pedido ${pedido.id.slice(0, 8)}: descreva como a entrega foi confirmada por fora e por que o código não pôde ser usado. O repasse externo deve estar registrado antes.`)
      if (!motivo || !await confirmDialog({ title: 'Confirmar entrega administrativa?', message: 'Use somente após conferir que a entrega foi realizada. O pedido ficará entregue por ação administrativa, sem validar o código do cliente e sem liberar novamente o saldo já pago.', confirmText: 'Concluir sem código', tone: 'danger' })) return
      const { data, error } = await supabase.rpc('admin_concluir_entrega_externa', { p_pedido: pedido.id, p_motivo: motivo })
      if (error || data?.ok !== true) throw new Error(error?.message || 'O servidor não confirmou a entrega.')
      setPedidos(rows => rows.map(row => row.id === pedido.id ? { ...row, status: 'entregue', entrega_confirmada: true } : row))
      await alertDialog({ title: 'Pedido concluído', message: 'Exceção registrada na auditoria. O saldo pago não foi liberado novamente.', tone: 'success' })
    } catch (error) {
      await alertDialog({ title: 'Pedido não concluído', message: error instanceof Error ? error.message : 'Não foi possível concluir agora.', tone: 'danger' })
    } finally {
      setConcluindo(null)
    }
  }

  const filtrados = pedidos.filter(p => (statusFilter==='all'||p.status===statusFilter) && (
    p.id.toLowerCase().includes(busca.toLowerCase()) || 
    String(p.cliente_nome || '').toLowerCase().includes(busca.toLowerCase())
  ))

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-100 tracking-tight">Pedidos Globais</h1>
          <p className="text-slate-400 font-medium">Controle e auditoria de todos os pedidos da plataforma.</p>
        </div>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input 
            type="search" aria-label="Buscar pedidos por ID ou cliente"
            placeholder="Buscar ID ou Cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-purple-500/50 w-64"
          />
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-400">{loading?'Consultando pedidos…':filtrados.length+' pedidos na lista carregada'}</p><select aria-label="Filtrar status do pedido" value={statusFilter} onChange={event=>setStatusFilter(event.target.value)} className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm"><option value="all">Todos os status</option>{[...new Set(pedidos.map(order=>String(order.status)))].sort().map(status=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></div>
      {loadError&&<p className="admin-inline-warning" role="alert">Não foi possível atualizar a lista. Os pedidos carregados anteriormente foram mantidos.</p>}
      <div className="glass-panel rounded-2xl overflow-hidden border-slate-800">
        <ResponsiveTable label="Pedidos" className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/80 text-slate-400 text-xs font-bold uppercase tracking-wider border-b border-slate-800">
              <th className="p-4">ID</th>
              <th className="p-4">Data/Hora</th>
              <th className="p-4">Cliente</th>
              <th className="p-4">Zona</th>
              <th className="p-4">Valor</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Ações Admin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-sm">
            {filtrados.map(p => (
              <tr key={p.id} className="hover:bg-slate-800/20 transition-colors">
                <td className="p-4 font-mono font-bold text-purple-400">{p.id}</td>
                <td className="p-4 text-slate-400">{format(new Date(p.created_at), 'dd/MM HH:mm')}</td>
                <td className="p-4 text-slate-200 font-bold">{p.cliente_nome}</td>
                <td className="p-4 text-slate-400">{p.zona}</td>
                <td className="p-4 text-green-400 font-bold">{p.total!==null&&Number.isFinite(Number(p.total))?formatMoney(Number(p.total)):'—'}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${p.status === 'cancelado' ? 'bg-red-500/10 text-red-400' : p.status === 'entregue' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {canConcludeExternalDelivery(p) && (
                    <button disabled={!!concluindo} onClick={() => void concluirEntrega(p)} className="p-2 mr-2 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 rounded-lg inline-flex items-center gap-2 text-xs font-bold disabled:opacity-40">
                      <CheckCircle2 size={14} /> {concluindo === p.id ? 'Conferindo…' : 'Concluir sem código'}
                    </button>
                  )}
                  {p.status !== 'cancelado' && p.status !== 'entregue' && p.settlement_status !== 'repasse_manual_pago' && (
                    <button 
                      onClick={() => cancelarPedido(p.id)}
                      className="p-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors inline-flex items-center gap-2 text-xs font-bold"
                    >
                      <Ban size={14} /> FORÇAR CANCELAMENTO
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading&&!loadError&&filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500 font-bold">Nenhum pedido encontrado.</td>
              </tr>
            )}
            {loading&&<tr><td colSpan={7} className="p-8 text-center text-slate-400">Carregando pedidos…</td></tr>}
          </tbody>
        </ResponsiveTable>
      </div>
    </div>
  )
}
