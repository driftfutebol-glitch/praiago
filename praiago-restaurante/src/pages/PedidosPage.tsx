import { useState, useEffect } from 'react'
import { CheckCircle2, ChevronRight, Zap, ChefHat, Bike,
         Search, MapPin, Truck, Package } from 'lucide-react'
import { useOrders, type Status } from '../store/useOrders'

const STATUS_CFG: Record<Status, { label: string; bg: string; cor: string; icon: any; glow: string }> = {
  novo:       { label: 'Novo',       bg: 'rgba(239,68,68,0.12)',   cor: '#ef4444', icon: Zap,         glow: 'rgba(239,68,68,0.15)'   },
  preparando: { label: 'Cozinhando', bg: 'rgba(14,165,233,0.12)',  cor: '#0ea5e9', icon: ChefHat,     glow: 'rgba(14,165,233,0.15)'  },
  pronto:     { label: 'Pronto',     bg: 'rgba(34,197,94,0.12)',   cor: '#22c55e', icon: CheckCircle2, glow: 'rgba(34,197,94,0.15)'  },
  entregando: { label: 'Em Rota',    bg: 'rgba(249,115,22,0.12)',  cor: '#f97316', icon: Bike,        glow: 'rgba(249,115,22,0.15)'  },
  entregue:   { label: 'Entregue',   bg: 'rgba(100,116,139,0.10)', cor: '#64748b', icon: CheckCircle2, glow: 'transparent'           },
}

const NEXT: Record<Status, Status | null> = {
  novo: 'preparando', preparando: 'pronto', pronto: 'entregando', entregando: 'entregue', entregue: null,
}

const NEXT_LABEL: Record<Status, string> = {
  novo: '✅ Aceitar & Iniciar',
  preparando: '🍽️ Marcar como pronto',
  pronto: '🛵 Enviar p/ entrega',
  entregando: '—', entregue: '—',
}

const TABS: { key: Status | 'todos'; label: string; emoji: string }[] = [
  { key: 'todos',      label: 'Todos',     emoji: '📋' },
  { key: 'novo',       label: 'Novos',     emoji: '🆕' },
  { key: 'preparando', label: 'Cozinha',   emoji: '👨‍🍳' },
  { key: 'pronto',     label: 'Prontos',   emoji: '✅' },
  { key: 'entregando', label: 'Em Rota',   emoji: '🛵' },
  { key: 'entregue',   label: 'Entregues', emoji: '🏁' },
]

export default function PedidosPage() {
  const pedidos  = useOrders(s => s.pedidos)
  const avancar  = useOrders(s => s.avancar)
  const recusar  = useOrders(s => s.recusar)
  const markSeen = useOrders(s => s.markSeen)
  const [tab,    setTab]     = useState<Status | 'todos'>('todos')
  const [busca,  setBusca]   = useState('')

  // Ao abrir a tela, zera o contador de "novos" da sidebar
  useEffect(() => { markSeen() }, [markSeen])

  const filtrados = pedidos.filter(p => {
    const matchTab   = tab === 'todos' || p.status === tab
    const matchBusca = busca === ''
      || p.cliente.toLowerCase().includes(busca.toLowerCase())
      || p.id.includes(busca)
      || p.zona.toLowerCase().includes(busca.toLowerCase())
    return matchTab && matchBusca
  })

  const count = (s: Status | 'todos') =>
    s === 'todos' ? pedidos.length : pedidos.filter(p => p.status === s).length

  return (
    <div style={{ padding: '32px 40px 48px', background: '#f8fafc', minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', letterSpacing: -1, margin: '0 0 6px' }}>
            Gerenciar Pedidos
          </h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>
            {pedidos.filter(p => p.status !== 'entregue').length} ativos ·{' '}
            <span style={{ color: '#ef4444', fontWeight: 700 }}>
              {pedidos.filter(p => p.status === 'novo').length} novos aguardando
            </span>
          </p>
        </div>

        {/* Busca */}
        <div style={{ position: 'relative' }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente, zona..."
            style={{
              padding: '11px 14px 11px 38px', borderRadius: 14,
              border: '1.5px solid #e2e8f0', background: '#fff',
              fontSize: 13, color: '#0f172a', outline: 'none', width: 260,
            }}
          />
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const active = tab === t.key
          const cnt = count(t.key as any)
          return (
            <button key={t.key} onClick={() => setTab(t.key as any)} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', borderRadius: 16, border: active ? 'none' : '1.5px solid #e2e8f0',
              background: active ? '#0f172a' : '#fff',
              color: active ? '#fff' : '#64748b',
              fontWeight: 700, fontSize: 13, cursor: 'pointer',
              boxShadow: active ? '0 4px 14px rgba(15,23,42,0.2)' : 'none',
              transition: 'all 0.15s',
            }}>
              {t.emoji} {t.label}
              {cnt > 0 && (
                <span style={{
                  background: active ? 'rgba(255,255,255,0.2)' : '#f1f5f9',
                  color: active ? '#fff' : '#475569',
                  fontSize: 10, fontWeight: 900, padding: '1px 7px', borderRadius: 10,
                }}>{cnt}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Cards de pedidos ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 18 }}>
        {filtrados.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Nenhum pedido encontrado</div>
          </div>
        )}

        {filtrados.map(p => {
          const s = STATUS_CFG[p.status]
          const SIcon = s.icon
          const canAdv = NEXT[p.status] !== null

          return (
            <div key={p.id} style={{
              background: '#fff', borderRadius: 24,
              border: p.status === 'novo' ? '2px solid #ef4444' : '1.5px solid #f1f5f9',
              boxShadow: p.status === 'novo'
                ? `0 8px 30px ${s.glow}`
                : '0 4px 16px rgba(0,0,0,0.04)',
              overflow: 'hidden', position: 'relative',
            }}>
              {/* Barra colorida topo */}
              <div style={{ height: 4, background: `linear-gradient(90deg,${s.cor},${s.cor}88)` }} />

              <div style={{ padding: '20px 22px' }}>
                {/* Header do card */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 12, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SIcon size={18} color={s.cor} />
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>{p.cliente}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>{p.id} · {p.hora}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      <MapPin size={11} color="#94a3b8" />
                      <span style={{ fontSize: 12, color: '#64748b' }}>{p.zona}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
                      R$ {p.total.toFixed(2)}
                    </div>
                    <span style={{
                      fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
                      background: s.bg, color: s.cor,
                    }}>{s.label}</span>
                  </div>
                </div>

                {/* Itens */}
                <div style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 14px', marginBottom: 16 }}>
                  {p.itens.map((item, i) => (
                    <div key={i} style={{ fontSize: 13, color: '#475569', lineHeight: '1.8', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: s.cor, fontWeight: 900 }}>·</span> {item}
                    </div>
                  ))}
                </div>

                {/* Entregador */}
                {p.entregador && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14, fontSize: 12, color: '#0ea5e9', fontWeight: 700 }}>
                    <Truck size={13} /> {p.entregador} em rota
                  </div>
                )}

                {/* Botões de ação */}
                {p.status === 'novo' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => recusar(p.id)} style={{
                      flex: 1, padding: '12px 0', borderRadius: 14,
                      border: '1.5px solid #ef4444', background: 'transparent',
                      color: '#ef4444', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>✕ Recusar</button>
                    <button onClick={() => avancar(p.id)} style={{
                      flex: 2, padding: '12px 0', borderRadius: 14, border: 'none',
                      background: 'linear-gradient(135deg,#22c55e,#16a34a)',
                      color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(34,197,94,0.3)',
                    }}>✅ Aceitar & Iniciar</button>
                  </div>
                )}

                {(p.status === 'preparando' || p.status === 'pronto') && canAdv && (
                  <button onClick={() => avancar(p.id)} style={{
                    width: '100%', padding: '13px 0', borderRadius: 14, border: 'none',
                    background: p.status === 'preparando'
                      ? 'linear-gradient(135deg,#0ea5e9,#0284c7)'
                      : 'linear-gradient(135deg,#f97316,#ea580c)',
                    color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: `0 6px 20px ${s.glow}`,
                  }}>
                    {NEXT_LABEL[p.status]} <ChevronRight size={16} />
                  </button>
                )}

                {p.status === 'entregando' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', color: '#f97316', fontSize: 13, fontWeight: 700 }}>
                    <Bike size={16} /> Entregando na praia...
                  </div>
                )}

                {p.status === 'entregue' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 0', color: '#64748b', fontSize: 13, fontWeight: 600 }}>
                    <Package size={14} /> Entrega concluída
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
