import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Clock, Bike, CheckCircle2, RotateCcw, XCircle, LifeBuoy, Trash2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { theme } from '../lib/theme'

const STATUS_CFG = {
  preparando: { label: 'Preparando', cor: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Clock },
  a_caminho:  { label: 'A caminho',  cor: '#0ea5e9', bg: 'rgba(14,165,233,0.12)', icon: Bike },
  entregue:   { label: 'Entregue',   cor: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: CheckCircle2 },
  cancelado:  { label: 'Cancelado',  cor: '#ef4444', bg: 'rgba(239,68,68,0.10)', icon: XCircle },
} as const

function fmtData(ts: number) {
  const diff = Date.now() - ts
  if (diff < 86_400_000) return 'Hoje'
  if (diff < 172_800_000) return 'Ontem'
  return new Date(ts).toLocaleDateString('pt-BR')
}

export default function MeusPedidosPage() {
  const navigate = useNavigate()
  const pedidos = useStore(s => s.pedidos)
  const cancelarPedido = useStore(s => s.cancelarPedido)
  const removerPedido = useStore(s => s.removerPedido)
  const solicitarAjudaPedido = useStore(s => s.solicitarAjudaPedido)

  async function cancelar(id: string) {
    if (!window.confirm('Cancelar este pedido? O suporte tambem sera avisado para acompanhar o caso.')) return
    await cancelarPedido(id)
  }

  async function pedirAjuda(id: string, tipo: 'ajuda' | 'reembolso') {
    await solicitarAjudaPedido(id, tipo)
    window.alert(tipo === 'reembolso' ? 'Pedido enviado para analise de reembolso.' : 'Atendimento aberto para este pedido.')
  }

  return (
    <div style={{ minHeight: '100vh', background: theme.color.bg, paddingBottom: 90 }}>
      <header style={{ padding: '20px 20px 8px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: theme.color.text }}>Meus Pedidos</h1>
        <p style={{ fontSize: 13, color: theme.color.textMuted, marginTop: 2 }}>
          {pedidos.length === 0 ? 'Nenhum pedido ainda' : `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'}`}
        </p>
      </header>

      {pedidos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: theme.color.textMuted }}>
          <div style={{ width: 72, height: 72, borderRadius: 24, background: theme.color.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <ShoppingBag size={32} color={theme.color.textFaint} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: theme.color.text }}>Você ainda não pediu nada</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Que tal uma água de coco geladinha? 🥥</div>
          <button onClick={() => navigate('/pedir')} style={{ marginTop: 20, background: theme.gradient.brand, border: 'none', borderRadius: 16, padding: '14px 28px', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
            Fazer um pedido
          </button>
        </div>
      ) : (
        <div style={{ padding: '8px 16px' }}>
          {pedidos.map(p => {
            const cfg = STATUS_CFG[p.status]
            const Icon = cfg.icon
            return (
              <div key={p.id} style={{ background: theme.color.surface, borderRadius: 20, padding: 16, marginBottom: 12, border: `1px solid ${theme.color.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: theme.color.text }}>{p.vendedorNome}</div>
                    <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: 2 }}>{p.id} · {fmtData(p.data)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.cor, padding: '5px 11px', borderRadius: 12, fontSize: 12, fontWeight: 800 }}>
                    <Icon size={13} /> {cfg.label}
                  </div>
                </div>

                <div style={{ background: theme.color.bg, borderRadius: 14, padding: '10px 14px', marginBottom: 12 }}>
                  {p.itens.map((it, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#334155', lineHeight: 1.7 }}>
                      <span style={{ color: theme.color.accent, fontWeight: 800 }}>·</span> {it.qtd}x {it.nome}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: theme.color.accent }}>R$ {p.total.toFixed(2)}</div>
                  <button onClick={() => navigate(`/pedir?v=${p.vendedorId}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: `1px solid ${theme.color.border}`, borderRadius: 12, padding: '8px 14px', color: theme.color.primary, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    <RotateCcw size={14} /> Pedir de novo
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: (p.status === 'preparando' || p.status === 'entregue' || p.status === 'cancelado') ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {p.status === 'preparando' && (
                    <button onClick={() => cancelar(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 12, padding: '10px 12px', color: '#dc2626', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                      <XCircle size={14} /> Cancelar
                    </button>
                  )}

                  <button onClick={() => pedirAjuda(p.id, p.status === 'entregue' || p.status === 'cancelado' ? 'reembolso' : 'ajuda')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 12, padding: '10px 12px', color: '#0284c7', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    <LifeBuoy size={14} /> {p.status === 'entregue' || p.status === 'cancelado' ? 'Reembolso' : 'Ajuda'}
                  </button>

                  {(p.status === 'entregue' || p.status === 'cancelado') && (
                    <button onClick={() => removerPedido(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#f8fafc', border: `1px solid ${theme.color.border}`, borderRadius: 12, padding: '10px 12px', color: '#64748b', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                      <Trash2 size={14} /> Excluir historico
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
