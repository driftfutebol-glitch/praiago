import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { confirmDialog, alertDialog } from '../lib/dialog'
import { Search, Ban } from 'lucide-react'
import { format } from 'date-fns'

export default function PedidosPage() {
  const [pedidos, setPedidos] = useState<any[]>([])
  const [busca, setBusca] = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('pedidos').select('*').order('created_at', { ascending: false })
      if (data) setPedidos(data)
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

  const filtrados = pedidos.filter(p => 
    p.id.toLowerCase().includes(busca.toLowerCase()) || 
    p.cliente_nome.toLowerCase().includes(busca.toLowerCase())
  )

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
            type="text" 
            placeholder="Buscar ID ou Cliente..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            className="bg-slate-900/50 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-slate-200 outline-none focus:border-purple-500/50 w-64"
          />
        </div>
      </header>

      <div className="glass-panel rounded-2xl overflow-hidden border-slate-800">
        <table className="w-full text-left border-collapse">
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
                <td className="p-4 text-green-400 font-bold">R$ {Number(p.total).toFixed(2)}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase ${p.status === 'cancelado' ? 'bg-red-500/10 text-red-400' : p.status === 'entregue' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {p.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {p.status !== 'cancelado' && p.status !== 'entregue' && (
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
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500 font-bold">Nenhum pedido encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
