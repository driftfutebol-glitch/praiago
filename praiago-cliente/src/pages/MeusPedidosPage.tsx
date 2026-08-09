import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Clock, Bike, CheckCircle2, RotateCcw, XCircle, LifeBuoy, Trash2, Send, CreditCard, KeyRound } from 'lucide-react'
import { useStore } from '../store/useStore'
import { theme } from '../lib/theme'
import { confirmDialog, alertDialog } from '../lib/dialog'
import { verificarPagamento as verificarPagamentoServidor } from '../lib/pagamento'
import { supabase } from '../lib/supabase'

const STATUS_CFG = {
  aguardando_pagamento: { label: 'Verificando pagamento', cor: '#d97706', bg: 'rgba(245,158,11,0.12)', icon: CreditCard },
  enviado: { label: 'Pedido enviado', cor: '#0ea5e9', bg: 'rgba(14,165,233,0.12)', icon: Send },
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
  const sincronizarPedidos = useStore(s => s.sincronizarPedidos)
  const cancelarPedido = useStore(s => s.cancelarPedido)
  const removerPedido = useStore(s => s.removerPedido)
  // Codigo de entrega fica so em memoria: sai da tela quando o app fecha.
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [buscandoCodigo, setBuscandoCodigo] = useState<string | null>(null)
  const solicitarAjudaPedido = useStore(s => s.solicitarAjudaPedido)
  const [verificandoId, setVerificandoId] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    let ocupado = false

    async function atualizar() {
      await sincronizarPedidos()
      const pendente = useStore.getState().pedidos.find(p => p.status === 'aguardando_pagamento')
      if (!pendente || ocupado) return

      ocupado = true
      if (ativo) setVerificandoId(prev => prev ?? pendente.id)
      try {
        await verificarPagamentoServidor(pendente.id)
        await sincronizarPedidos()
      } catch {
        // O botao manual continua disponivel se o gateway ou a rede falhar.
      } finally {
        if (ativo) setVerificandoId(prev => prev === pendente.id ? null : prev)
        ocupado = false
      }
    }

    void atualizar()
    const timer = window.setInterval(() => { void atualizar() }, 12000)
    return () => {
      ativo = false
      window.clearInterval(timer)
    }
  }, [sincronizarPedidos])

  async function verificarPagamento(id: string, silencioso = false) {
    setVerificandoId(id)
    try {
      const result = await verificarPagamentoServidor(id)
      await sincronizarPedidos()
      if (!silencioso) {
        await alertDialog({
          title: result.payment_status === 'aprovado' ? 'Pagamento aprovado' : 'Pagamento em verificacao',
          message: result.payment_status === 'aprovado'
            ? 'Pedido aprovado e enviado para o vendedor.'
            : 'Ainda estamos aguardando a confirmacao do pagamento.',
          tone: result.payment_status === 'aprovado' ? 'success' : 'default',
        })
      }
    } catch (err) {
      if (!silencioso) {
        await alertDialog({
          title: 'Nao foi possivel verificar',
          message: err instanceof Error ? err.message : 'Tente novamente em instantes.',
          tone: 'danger',
        })
      }
    } finally {
      setVerificandoId(null)
    }
  }

  async function cancelar(id: string) {
    const ok = await confirmDialog({
      title: 'Cancelar pedido?',
      message: 'Depois que o vendedor começar a preparar, o cancelamento não é mais possível. O suporte também será avisado.',
      confirmText: 'Sim, cancelar',
      cancelText: 'Voltar',
      tone: 'danger',
    })
    if (!ok) return
    const feito = await cancelarPedido(id)
    // O vendedor pode ter aceitado o pedido entre a tela carregar e o clique:
    // nesse caso o servidor recusa, e o cliente precisa saber por que.
    if (!feito) {
      await alertDialog({
        title: 'Não deu pra cancelar',
        message: 'O vendedor já começou a preparar seu pedido. Se precisar, fale com a gente pelo botão Ajuda.',
        tone: 'danger',
      })
    }
  }

  /** Busca o código no servidor — ele nunca fica guardado no aparelho. */
  async function gerarCodigo(id: string) {
    setBuscandoCodigo(id)
    const { data, error } = await supabase.rpc('obter_codigo_entrega', { p_pedido_id: id })
    setBuscandoCodigo(null)
    if (error || typeof data !== 'string') {
      await alertDialog({
        title: 'Não deu pra gerar o código',
        message: 'Tente de novo em instantes.',
        tone: 'danger',
      })
      return
    }
    setCodigos(c => ({ ...c, [id]: data }))
  }

  async function pedirAjuda(id: string, tipo: 'ajuda' | 'reembolso') {
    await solicitarAjudaPedido(id, tipo)
    await alertDialog({
      title: tipo === 'reembolso' ? 'Reembolso solicitado' : 'Atendimento aberto',
      message: tipo === 'reembolso' ? 'Seu pedido foi enviado para análise de reembolso. 💙' : 'Abrimos um atendimento para este pedido — já vamos te ajudar.',
      tone: 'success',
    })
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

                {p.status === 'aguardando_pagamento' && (
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px', marginBottom: 12, fontWeight: 700 }}>
                    Seu pedido so vai para o ambulante ou restaurante depois que o pagamento for aprovado.
                  </div>
                )}

                {/* Codigo de entrega: o cliente so entrega o codigo quando
                    recebe o pedido na mao. E o que impede o vendedor de marcar
                    "entregue" sem ter entregado — e o que libera o dinheiro. */}
                {p.status === 'a_caminho' && (
                  <div style={{ marginBottom: 12, background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.22)', borderRadius: 14, padding: 12 }}>
                    {codigos[p.id] ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 1 }}>
                          Código de entrega
                        </div>
                        <div style={{ fontSize: 30, fontWeight: 950, letterSpacing: 8, color: '#0f172a', margin: '6px 0 4px' }}>
                          {codigos[p.id]}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#64748b', fontWeight: 600, lineHeight: 1.4 }}>
                          Mostre só na hora de receber. Sem ele o pedido não é dado como entregue.
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => gerarCodigo(p.id)}
                        disabled={buscandoCodigo === p.id}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'transparent', border: 'none', color: '#0284c7', fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: 2 }}
                      >
                        <KeyRound size={15} /> {buscandoCodigo === p.id ? 'Gerando…' : 'Ver código de entrega'}
                      </button>
                    )}
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: (p.status === 'enviado' || p.status === 'entregue' || p.status === 'cancelado') ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {p.status === 'aguardando_pagamento' && (
                    <button disabled={verificandoId === p.id} onClick={() => verificarPagamento(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.24)', borderRadius: 12, padding: '10px 12px', color: '#b45309', fontSize: 12, fontWeight: 800, cursor: verificandoId === p.id ? 'default' : 'pointer' }}>
                      <CreditCard size={14} /> {verificandoId === p.id ? 'Verificando...' : 'Verificar pagamento'}
                    </button>
                  )}

                  {/* Cancelar so enquanto o vendedor ainda nao comecou a
                      preparar. Depois disso ele ja gastou insumo e tempo —
                      cancelar ali seria prejuizo dele, nao arrependimento. */}
                  {p.status === 'enviado' && (
                    <button onClick={() => cancelar(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)', borderRadius: 12, padding: '10px 12px', color: '#dc2626', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                      <XCircle size={14} /> Cancelar
                    </button>
                  )}

                  {p.status !== 'aguardando_pagamento' && (
                    <button onClick={() => pedirAjuda(p.id, p.status === 'entregue' || p.status === 'cancelado' ? 'reembolso' : 'ajuda')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)', borderRadius: 12, padding: '10px 12px', color: '#0284c7', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                      <LifeBuoy size={14} /> {p.status === 'entregue' || p.status === 'cancelado' ? 'Reembolso' : 'Ajuda'}
                    </button>
                  )}

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
