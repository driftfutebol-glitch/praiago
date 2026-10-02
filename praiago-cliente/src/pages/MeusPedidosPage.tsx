import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShoppingBag, Clock, Bike, CheckCircle2, RotateCcw, XCircle, LifeBuoy, Send, CreditCard, KeyRound, Undo2 } from 'lucide-react'
import { useStore } from '../store/useStore'
import { theme } from '../lib/theme'
import { confirmDialog, alertDialog } from '../lib/dialog'
import { verificarPagamento as verificarPagamentoServidor } from '../lib/pagamento'
import { aguardarPagamento } from '../lib/aguardarPagamento'
import { dentroDoPrazo, tempoRestante, JANELA_REEMBOLSO_HORAS } from '../lib/reembolso'
import LocalizacaoAoVivoBotao from '../components/LocalizacaoAoVivoBotao'
import { supabase } from '../lib/supabase'

const STATUS_CFG = {
  aguardando_pagamento: { label: 'Verificando pagamento', cor: 'var(--pg-warning)', bg: 'var(--pg-warning-bg)', icon: CreditCard },
  enviado: { label: 'Pedido enviado', cor: 'var(--pg-ocean-dark)', bg: 'var(--pg-brand-soft)', icon: Send },
  preparando: { label: 'Preparando', cor: 'var(--pg-warning)', bg: 'var(--pg-warning-bg)', icon: Clock },
  a_caminho:  { label: 'A caminho',  cor: 'var(--pg-ocean-dark)', bg: 'var(--pg-brand-soft)', icon: Bike },
  entregue:   { label: 'Entregue',   cor: 'var(--pg-success)', bg: 'var(--pg-success-bg)', icon: CheckCircle2 },
  cancelado:  { label: 'Cancelado',  cor: 'var(--pg-danger)', bg: 'var(--pg-danger-bg)', icon: XCircle },
} as const

// Enquanto a entrega está acontecendo, faz sentido oferecer o compartilhamento
// de localização. Antes disso o vendedor nem viu o pedido; depois, acabou.
const EM_ANDAMENTO = ['enviado', 'preparando', 'a_caminho'] as const

const REEMBOLSO_CFG: Record<string, { rotulo: string; cor: string; bg: string; borda: string }> = {
  solicitado: { rotulo: 'Reembolso em análise', cor: 'var(--pg-warning)', bg: 'var(--pg-warning-bg)', borda: 'rgba(var(--pg-warning-rgb), 0.28)' },
  aprovado:   { rotulo: 'Reembolso aprovado',   cor: 'var(--pg-success)', bg: 'var(--pg-success-bg)', borda: 'rgba(var(--pg-success-rgb), 0.28)' },
  concluido:  { rotulo: 'Reembolso concluído',  cor: 'var(--pg-success)', bg: 'var(--pg-success-bg)', borda: 'rgba(var(--pg-success-rgb), 0.28)' },
  rejeitado:  { rotulo: 'Reembolso recusado',   cor: 'var(--pg-danger)', bg: 'var(--pg-danger-bg)', borda: 'rgba(var(--pg-danger-rgb), 0.28)' },
}

function fmtData(ts: number) {
  const diff = Date.now() - ts
  if (diff < 86_400_000) return 'Hoje'
  if (diff < 172_800_000) return 'Ontem'
  return new Date(ts).toLocaleDateString('pt-BR')
}

export default function MeusPedidosPage() {
  const navigate = useNavigate()
  const pedidos = useStore(s => s.pedidos)
  const sessao = useStore(s => s.sessao)
  const [filtro, setFiltro] = useState<'todos' | 'ativos' | 'historico'>('todos')
  const pedidosVisiveis = pedidos.filter(p => filtro === 'todos' || (filtro === 'historico' ? ['entregue', 'cancelado'].includes(p.status) : !['entregue', 'cancelado'].includes(p.status)))
  const sincronizarPedidos = useStore(s => s.sincronizarPedidos)
  const cancelarPedido = useStore(s => s.cancelarPedido)
  // Codigo de entrega fica so em memoria: sai da tela quando o app fecha.
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [buscandoCodigo, setBuscandoCodigo] = useState<string | null>(null)
  const solicitarAjudaPedido = useStore(s => s.solicitarAjudaPedido)
  const [verificandoId, setVerificandoId] = useState<string | null>(null)
  const [pedindoAjuda, setPedindoAjuda] = useState<string | null>(null)
  // Um relógio de minuto em minuto só para o prazo de reembolso ir andando na
  // tela. Sem ele o botão continuaria visível depois de o prazo fechar, até o
  // cliente sair e voltar.
  const [, setTique] = useState(0)

  // Carrega o histórico ao abrir e quando o app volta do segundo plano. Antes
  // isto era um setInterval de 12s que rodava para sempre — uma consulta ao
  // banco a cada 12 segundos, com a tela aberta e nada acontecendo.
  useEffect(() => {
    void sincronizarPedidos()
    function aoVoltar() {
      if (document.visibilityState === 'visible') void sincronizarPedidos()
    }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => document.removeEventListener('visibilitychange', aoVoltar)
  }, [sincronizarPedidos])

  // Um pedido pendente, uma espera. `aguardarPagamento` usa o realtime como
  // sinal principal e só pergunta ao gateway em intervalos que crescem —
  // parando de vez quando o pagamento resolve, quando o pedido some (foi
  // arquivado por ficar preso) ou quando o prazo da espera acaba.
  const idPendente = pedidos.find(p => p.status === 'aguardando_pagamento')?.id ?? null

  useEffect(() => {
    if (!idPendente) return

    setVerificandoId(idPendente)
    const parar = aguardarPagamento(idPendente, {
      aoTerminar: fim => {
        setVerificandoId(prev => (prev === idPendente ? null : prev))
        // Em qualquer desfecho o histórico muda: aprovado vira "enviado",
        // sumido some da lista. Uma leitura, não um laço.
        if (fim !== 'prazo') void sincronizarPedidos()
      },
    })

    return () => {
      parar()
      setVerificandoId(prev => (prev === idPendente ? null : prev))
    }
  }, [idPendente, sincronizarPedidos])

  useEffect(() => {
    const t = window.setInterval(() => setTique(n => n + 1), 60_000)
    return () => window.clearInterval(t)
  }, [])

  async function verificarPagamento(id: string) {
    setVerificandoId(id)
    try {
      const result = await verificarPagamentoServidor(id)
      await sincronizarPedidos()
      await alertDialog({
        title: result.payment_status === 'aprovado' ? 'Pagamento aprovado' : 'Pagamento em verificacao',
        message: result.payment_status === 'aprovado'
          ? 'Pedido aprovado e enviado para o vendedor.'
          : 'Ainda estamos aguardando a confirmacao do pagamento.',
        tone: result.payment_status === 'aprovado' ? 'success' : 'default',
      })
    } catch (err) {
      await alertDialog({
        title: 'Nao foi possivel verificar',
        message: err instanceof Error ? err.message : 'Tente novamente em instantes.',
        tone: 'danger',
      })
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
    if (tipo === 'reembolso') {
      const ok = await confirmDialog({
        title: 'Pedir reembolso?',
        message: `O valor volta pela mesma forma de pagamento depois da análise. O prazo para pedir é de ${JANELA_REEMBOLSO_HORAS} horas a partir da entrega.`,
        confirmText: 'Pedir reembolso',
        cancelText: 'Voltar',
      })
      if (!ok) return
    }

    setPedindoAjuda(id)
    const r = await solicitarAjudaPedido(id, tipo)
    setPedindoAjuda(null)

    if (!r.ok) {
      // O prazo pode ter fechado entre a tela renderizar e o toque, ou o banco
      // pode ter recusado por outro motivo. Mostra o motivo real.
      await sincronizarPedidos()
      await alertDialog({ title: 'Não foi possível', message: r.erro || 'Tente de novo em instantes.', tone: 'danger' })
      return
    }

    await alertDialog({
      title: tipo === 'reembolso' ? 'Reembolso solicitado' : 'Atendimento aberto',
      message: tipo === 'reembolso'
        ? 'Seu pedido foi enviado para análise de reembolso. 💙'
        : 'Abrimos um atendimento para este pedido — já vamos te ajudar.',
      tone: 'success',
    })
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--pg-sand)', paddingBottom: 28 }}>
      <header style={{ padding: '20px 20px 8px' }}>
        <span className="pg-eyebrow">DO PEDIDO AO PRIMEIRO GOLE</span>
        <h1 className="pg-heading">Meus pedidos</h1>
        <p style={{ fontSize: 13, color: theme.color.textMuted, marginTop: 2 }}>
          {pedidos.length === 0 ? 'Seu dia de praia, acompanhado por aqui.' : `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'} · acompanhe cada etapa`}
        </p>
      </header>
      {pedidos.length > 0 && <div style={{ display: 'flex', gap: 8, padding: '12px 20px' }} aria-label="Filtrar pedidos">{([{ id: 'todos', label: 'Todos' }, { id: 'ativos', label: 'Em andamento' }, { id: 'historico', label: 'Histórico' }] as const).map(item => <button key={item.id} className="pg-chip" aria-pressed={filtro === item.id} onClick={() => setFiltro(item.id)}>{item.label}</button>)}</div>}

      {pedidos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: theme.color.textMuted }}>
          <div style={{ width: 72, height: 72, borderRadius: 24, background: theme.color.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <ShoppingBag size={32} color={theme.color.textFaint} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--pg-ink)' }}>{sessao ? 'Seu primeiro pedido vem aí' : 'Seus pedidos, num só lugar'}</div>
          <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>{sessao ? 'Explore os sabores da praia e escolha seu favorito.' : 'Entre na sua conta para acompanhar pedidos e consultar seu histórico.'}</div>
          <button onClick={() => navigate(sessao ? '/pedir' : '/perfil')} className="pg-button pg-button-primary" style={{ marginTop: 20 }}>
            {sessao ? 'Explorar lojas' : 'Entrar na minha conta'}
          </button>
        </div>
      ) : (
        <div style={{ padding: '8px 16px' }}>
          {pedidosVisiveis.length === 0 && <div className="pg-card" style={{ textAlign: 'center', padding: 32 }}><p className="pg-section-title">{filtro === 'ativos' ? 'Tudo tranquilo por aqui' : 'Seu histórico está começando'}</p><p className="pg-caption">{filtro === 'ativos' ? 'Você não tem pedidos em andamento.' : 'Pedidos finalizados aparecerão nesta aba.'}</p></div>}
          {pedidosVisiveis.map(p => {
            const cfg = STATUS_CFG[p.status]
            const Icon = cfg.icon
            const emAndamento = (EM_ANDAMENTO as readonly string[]).includes(p.status)
            const reembolso = REEMBOLSO_CFG[p.reembolsoStatus ?? 'nenhum']
            // Só oferece reembolso do que foi pago online, dentro das 4 horas e
            // sem pedido em aberto. Mesma regra do banco (migration
            // 20260826190000) — aqui é só a tela sendo honesta antes do toque.
            const pagouOnline = p.pagamentoStatus === 'aprovado' || p.pagamentoStatus === 'pago'
            const podeReembolso = pagouOnline
              && (p.reembolsoStatus ?? 'nenhum') === 'nenhum'
              && (p.status === 'entregue' || p.status === 'cancelado')
              && dentroDoPrazo(p)
            const prazoAcabou = pagouOnline
              && (p.reembolsoStatus ?? 'nenhum') === 'nenhum'
              && (p.status === 'entregue' || p.status === 'cancelado')
              && !dentroDoPrazo(p)

            return (
              <div key={p.id} style={{ background: theme.color.surface, borderRadius: 20, padding: 16, marginBottom: 12, border: `1px solid ${theme.color.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <div style={{ flex: '1 1 150px', minWidth: 0, overflowWrap: 'anywhere' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: theme.color.text }}>{p.vendedorNome}</div>
                    <div style={{ fontSize: 12, color: theme.color.textMuted, marginTop: 2 }}>{p.id} · {fmtData(p.data)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: cfg.bg, color: cfg.cor, padding: '5px 11px', borderRadius: 12, fontSize: 12, fontWeight: 800 }}>
                    <Icon size={13} /> {cfg.label}
                  </div>
                </div>

                <div style={{ background: theme.color.bg, borderRadius: 14, padding: '10px 14px', marginBottom: 12 }}>
                  {p.itens.map((it, i) => (
                    <div key={i} style={{ fontSize: 13, color: 'var(--pg-ink)', lineHeight: 1.7 }}>
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
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--pg-warning)', background: 'var(--pg-warning-bg)', border: '1px solid var(--pg-warning)', borderRadius: 12, padding: '10px 12px', marginBottom: 12, fontWeight: 700 }}>
                    Seu pedido so vai para o ambulante ou restaurante depois que o pagamento for aprovado.
                    Sem pagamento em 7 dias, ele sai do seu histórico automaticamente.
                  </div>
                )}

                {reembolso && (
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: reembolso.cor, background: reembolso.bg, border: `1px solid ${reembolso.borda}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12, fontWeight: 800 }}>
                    {reembolso.rotulo}
                  </div>
                )}

                {/* O vendedor precisa achar o cliente AGORA, não onde ele estava
                    quando pediu. Só aparece durante a entrega e é escolha do
                    cliente ligar. */}
                {emAndamento && (
                  <LocalizacaoAoVivoBotao
                    pedidoId={p.id}
                    autoIniciar={p.entrega?.modo === 'tempo_real'}
                  />
                )}

                {/* Codigo de entrega: o cliente so entrega o codigo quando
                    recebe o pedido na mao. E o que impede o vendedor de marcar
                    "entregue" sem ter entregado — e o que libera o dinheiro. */}
                {p.status === 'a_caminho' && (
                  <div style={{ marginBottom: 12, background: 'rgba(var(--pg-ocean-rgb), 0.06)', border: '1px solid rgba(var(--pg-ocean-rgb), 0.22)', borderRadius: 14, padding: 12 }}>
                    {codigos[p.id] ? (
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--pg-ocean-dark)', textTransform: 'uppercase', letterSpacing: 1 }}>
                          Código de entrega
                        </div>
                        <div style={{ fontSize: 30, fontWeight: 950, letterSpacing: 8, color: 'var(--pg-ink)', margin: '6px 0 4px' }}>
                          {codigos[p.id]}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--pg-muted)', fontWeight: 600, lineHeight: 1.4 }}>
                          Mostre só na hora de receber. Sem ele o pedido não é dado como entregue.
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => gerarCodigo(p.id)}
                        disabled={buscandoCodigo === p.id}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: 'transparent', border: 'none', color: 'var(--pg-ocean-dark)', fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: 2 }}
                      >
                        <KeyRound size={15} /> {buscandoCodigo === p.id ? 'Gerando…' : 'Ver código de entrega'}
                      </button>
                    )}
                  </div>
                )}

                {prazoAcabou && (
                  <div style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--pg-muted)', marginBottom: 10, fontWeight: 650 }}>
                    O prazo de {JANELA_REEMBOLSO_HORAS} horas para pedir reembolso deste pedido já passou.
                    Se ainda tiver algo errado, fale com a gente pelo botão Ajuda.
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: podeReembolso ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {p.status === 'aguardando_pagamento' && (
                    <button disabled={verificandoId === p.id} onClick={() => verificarPagamento(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(var(--pg-warning-rgb), 0.08)', border: '1px solid rgba(var(--pg-warning-rgb), 0.24)', borderRadius: 12, padding: '10px 12px', color: 'var(--pg-warning)', fontSize: 12, fontWeight: 800, cursor: verificandoId === p.id ? 'default' : 'pointer' }}>
                      <CreditCard size={14} /> {verificandoId === p.id ? 'Verificando...' : 'Verificar pagamento'}
                    </button>
                  )}

                  {/* Cancelar so enquanto o vendedor ainda nao comecou a
                      preparar. Depois disso ele ja gastou insumo e tempo —
                      cancelar ali seria prejuizo dele, nao arrependimento. */}
                  {p.status === 'enviado' && (
                    <button onClick={() => cancelar(p.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(var(--pg-danger-rgb), 0.08)', border: '1px solid rgba(var(--pg-danger-rgb), 0.22)', borderRadius: 12, padding: '10px 12px', color: 'var(--pg-danger)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                      <XCircle size={14} /> Cancelar
                    </button>
                  )}

                  {p.status !== 'aguardando_pagamento' && (
                    <button disabled={pedindoAjuda === p.id} onClick={() => pedirAjuda(p.id, 'ajuda')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(var(--pg-ocean-rgb), 0.08)', border: '1px solid rgba(var(--pg-ocean-rgb), 0.2)', borderRadius: 12, padding: '10px 12px', color: 'var(--pg-ocean-dark)', fontSize: 12, fontWeight: 800, cursor: pedindoAjuda === p.id ? 'default' : 'pointer' }}>
                      <LifeBuoy size={14} /> Ajuda
                    </button>
                  )}

                  {podeReembolso && (
                    <button disabled={pedindoAjuda === p.id} onClick={() => pedirAjuda(p.id, 'reembolso')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(var(--pg-warning-rgb), 0.08)', border: '1px solid rgba(var(--pg-warning-rgb), 0.24)', borderRadius: 12, padding: '10px 12px', color: 'var(--pg-warning)', fontSize: 12, fontWeight: 800, cursor: pedindoAjuda === p.id ? 'default' : 'pointer' }}>
                      <Undo2 size={14} /> Reembolso · {tempoRestante(p)}
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
