import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wallet, ArrowLeft, TrendingUp, Clock, ArrowDownToLine, Loader2, Receipt, Building2, AlertCircle, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/auth'
import { confirmDialog, alertDialog } from '../lib/dialog'
import ContaRecebimento from '../components/ContaRecebimento'
import { chamarEdge } from '../lib/edge'

type Espelho = {
  vendas_brutas: number; comissao_praiago: number; taxa_provedor: number; valor_liquido: number
  saldo_pendente: number; saldo_disponivel: number; transferido: number
  estornos: number; chargebacks: number; proxima_liquidacao: string | null
}
type Previa = {
  disponivel_agora: number; antecipavel: number; taxa_percent: number
  taxa_valor: number; receberia: number; ativo: boolean
  antecipavel_credito: number; taxa_percent_credito: number
  taxa_valor_credito: number; receberia_credito: number; credito_ativo: boolean
}
type Payout = { id: string; valor: number; status: string; chave_pix: string | null; created_at: string }
type Lancamento = { id: string; tipo: string; valor: number; status: string; created_at: string; disponivel_em: string | null }

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const STATUS_SAQUE: Record<string, { label: string; cor: string }> = {
  solicitado: { label: 'Solicitado', cor: '#f59e0b' },
  processando: { label: 'Processando', cor: '#0ea5e9' },
  pago: { label: 'Pago', cor: '#16a34a' },
  falhou: { label: 'Falhou', cor: '#ef4444' },
  cancelado: { label: 'Cancelado', cor: '#94a3b8' },
}
const TIPO_LABEL: Record<string, string> = {
  repasse_vendedor: 'Venda (seu líquido)', taxa_plataforma: 'Comissão Praia Go',
  taxa_provedor: 'Taxa do provedor', saque: 'Saque', estorno: 'Estorno', chargeback: 'Chargeback',
  taxa_antecipacao: 'Taxa de antecipação',
}

export default function CarteiraPage() {
  const navigate = useNavigate()
  const sessao = useSessao()
  const [esp, setEsp] = useState<Espelho | null>(null)
  const [saques, setSaques] = useState<Payout[]>([])
  const [extrato, setExtrato] = useState<Lancamento[]>([])
  const [temConta, setTemConta] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sacando, setSacando] = useState(false)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [antecipando, setAntecipando] = useState(false)

  const carregar = useCallback(async () => {
    if (!sessao?.id) return
    const [{ data: espData }, { data: pays }, { data: led }, { data: vpa }, { data: prev }] = await Promise.all([
      supabase.rpc('carteira_espelho', { p_vendedor: sessao.id }),
      supabase.from('payouts').select('id,valor,status,chave_pix,created_at').eq('vendedor_id', sessao.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('financial_ledger').select('id,tipo,valor,status,created_at,disponivel_em').eq('vendedor_id', sessao.id).order('created_at', { ascending: false }).limit(15),
      supabase.from('seller_recipients').select('recipient_id').eq('vendedor_id', sessao.id).maybeSingle(),
      supabase.rpc('previa_saque_rapido', { p_vendedor: sessao.id }),
    ])
    setEsp((Array.isArray(espData) ? espData[0] : espData) as Espelho ?? null)
    setSaques((pays as Payout[]) ?? [])
    setExtrato((led as Lancamento[]) ?? [])
    setTemConta(!!(vpa as { recipient_id?: string } | null)?.recipient_id)
    setPrevia((Array.isArray(prev) ? prev[0] : prev) as Previa ?? null)
    setLoading(false)
  }, [sessao?.id])

  useEffect(() => { carregar() }, [carregar])

  // Credito liquida em D+30 e PIX/debito em D+1: prazos diferentes, taxas
  // diferentes. O grupo diz de qual saldo estamos falando.
  async function anteciparSaldo(grupo: 'rapido' | 'credito' = 'rapido') {
    if (!previa) return
    const bruto = grupo === 'credito' ? previa.antecipavel_credito : previa.antecipavel
    const liquido = grupo === 'credito' ? previa.receberia_credito : previa.receberia
    const pct = grupo === 'credito' ? previa.taxa_percent_credito : previa.taxa_percent
    const taxa = grupo === 'credito' ? previa.taxa_valor_credito : previa.taxa_valor
    const ok = await confirmDialog({
      title: 'Antecipar seu saldo?',
      message: `Você recebe ${brl(liquido)} agora, em vez de ${brl(bruto)} no prazo. A taxa de ${pct}% (${brl(taxa)}) é descontada na hora e não tem volta.`,
      confirmText: 'Antecipar',
      cancelText: 'Prefiro esperar',
    })
    if (!ok) return
    setAntecipando(true)
    const { error } = await supabase.rpc('antecipar_saldo', { p_vendedor: sessao!.id, p_grupo: grupo })
    setAntecipando(false)
    if (error) { alertDialog({ title: 'Não deu pra antecipar', message: error.message, tone: 'danger' }); return }
    await alertDialog({ title: 'Saldo liberado!', message: 'Já pode sacar pra sua conta.', tone: 'success' })
    carregar()
  }

  async function solicitarSaque() {
    const disponivel = esp?.saldo_disponivel ?? 0
    if (disponivel <= 0) { alertDialog({ title: 'Sem saldo disponível', message: 'Você ainda não tem saldo liberado pra sacar.', tone: 'danger' }); return }
    if (!temConta) { alertDialog({ title: 'Cadastre sua conta', message: 'Antes de sacar, cadastre a conta bancária que recebe suas vendas aqui na Carteira.', tone: 'danger' }); return }
    const ok = await confirmDialog({ title: 'Sacar pra sua conta?', message: `Vamos transferir ${brl(disponivel)} para a sua conta bancária. O prazo depende do banco.`, confirmText: 'Sacar' })
    if (!ok) return
    setSacando(true)
    const r = await chamarEdge('solicitar-saque', { valor: disponivel }, 'Não foi possível solicitar o saque agora. Tente de novo em instantes.')
    setSacando(false)

    if (!r.ok) {
      // O saldo existe mas o processador ainda não liberou (venda no crédito
      // esperando liquidação, por exemplo). Repetir nunca vai funcionar, e o
      // dinheiro não sumiu — dizer isso evita o vendedor achar que perdeu.
      const saldoPreso = r.codigo === 'saldo_nao_liquidado'
      alertDialog({
        title: saldoPreso ? 'Saldo ainda não liberado' : 'Não deu pra sacar',
        message: r.erro,
        tone: saldoPreso ? 'default' : 'danger',
      })
      carregar()
      return
    }

    // Sem recebedor no gateway o saque fica registrado e a equipe conclui à
    // mão. Prometer "cai na sua conta" nesse caso seria mentira.
    const aviso = (r.data as { aviso?: string } | null)?.aviso
    await alertDialog({
      title: 'Saque solicitado',
      message: aviso || 'Assim que o provedor liquidar, o valor cai na sua conta.',
      tone: 'success',
    })
    carregar()
  }

  const cardBase: React.CSSProperties = { borderRadius: 8, padding: 16, border: '1px solid #dfe6ed', boxShadow: 'none' }

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button type="button" aria-label="Voltar" onClick={() => navigate('/perfil')} className="icon-button"><ArrowLeft size={19} /></button>
          <div>
            <h1>Carteira</h1>
            <p>Saldo, conta bancária, extrato e saques.</p>
          </div>
        </div>
      </div>

      <div>
        {/* Saldo disponível + saque */}
        <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel" style={{ ...cardBase, marginBottom: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Saldo disponível pra saque</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: '#16a34a', margin: '4px 0 6px' }}>{loading ? '—' : brl(esp?.saldo_disponivel ?? 0)}</div>
          <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Clock size={13} /> Pendente (liberando): <strong style={{ color: '#0f172a' }}>{brl(esp?.saldo_pendente ?? 0)}</strong>
          </div>
          <button onClick={solicitarSaque} disabled={sacando || loading} className="primary-button" style={{ width: '100%' }}>
            {sacando ? <Loader2 size={18} className="animate-spin-slow" /> : <ArrowDownToLine size={18} />} Sacar pra minha conta
          </button>
          {!temConta && !loading && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <AlertCircle size={13} /> Cadastre sua conta bancária abaixo pra poder sacar
            </div>
          )}

          {/* Antecipacao: so aparece quando ha saldo de pedido JA ENTREGUE
              esperando o prazo. Mostra o desconto antes de o vendedor decidir —
              taxa que so aparece depois de clicar e o que gera reclamacao. */}
          {previa?.ativo && (previa.antecipavel ?? 0) > 0 && (
            <div style={{ marginTop: 12, background: '#fffaf2', border: '1px solid #f4d39f', borderRadius: 8, padding: 13, textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} /> Receber agora, sem esperar
              </div>
              <div style={{ fontSize: 12.5, color: '#475569', fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>
                Você tem <strong>{brl(previa.antecipavel)}</strong> de pedidos entregues aguardando o prazo.
                Antecipando, a taxa é de {previa.taxa_percent}% ({brl(previa.taxa_valor)}) e você fica com{' '}
                <strong style={{ color: '#0f172a' }}>{brl(previa.receberia)}</strong>.
              </div>
              <button
                onClick={() => anteciparSaldo('rapido')} disabled={antecipando}
                style={{ width: '100%', minHeight: 44, marginTop: 10, border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 900, color: '#fff', background: '#b54708', cursor: antecipando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {antecipando ? <Loader2 size={16} className="animate-spin-slow" /> : <Zap size={16} />}
                Antecipar {brl(previa.antecipavel)}
              </button>
            </div>
          )}

          {/* Credito tem prazo (e taxa) proprios: o gateway so libera em D+30. */}
          {previa?.credito_ativo && (previa.antecipavel_credito ?? 0) > 0 && (
            <div style={{ marginTop: 10, background: '#f8f6fc', border: '1px solid #d7cbed', borderRadius: 8, padding: 13, textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 900, color: '#7c3aed', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} /> Antecipar vendas no cartão de crédito
              </div>
              <div style={{ fontSize: 12.5, color: '#475569', fontWeight: 600, marginTop: 6, lineHeight: 1.5 }}>
                Venda no crédito só cai em 30 dias. Você tem <strong>{brl(previa.antecipavel_credito)}</strong> nesse prazo —
                antecipando, a taxa é de {previa.taxa_percent_credito}% ({brl(previa.taxa_valor_credito)}) e você fica com{' '}
                <strong style={{ color: '#0f172a' }}>{brl(previa.receberia_credito)}</strong>.
              </div>
              <button
                onClick={() => anteciparSaldo('credito')} disabled={antecipando}
                style={{ width: '100%', minHeight: 44, marginTop: 10, border: 'none', borderRadius: 8, padding: 10, fontSize: 13, fontWeight: 900, color: '#fff', background: '#6d49b8', cursor: antecipando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {antecipando ? <Loader2 size={16} className="animate-spin-slow" /> : <Zap size={16} />}
                Antecipar {brl(previa.antecipavel_credito)}
              </button>
            </div>
          )}
        </motion.div>

        {/* Conta bancaria: e ela que abre o saldo do vendedor no gateway. */}
        <ContaRecebimento onMudou={carregar} />

        {/* Resumo espelho */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          {[
            { icon: TrendingUp, label: 'Vendas brutas', v: esp?.vendas_brutas ?? 0, cor: '#0ea5e9' },
            { icon: Receipt, label: 'Comissão Praia Go', v: esp?.comissao_praiago ?? 0, cor: '#f97316' },
            { icon: Wallet, label: 'Seu líquido', v: esp?.valor_liquido ?? 0, cor: '#16a34a' },
            { icon: Building2, label: 'Taxa do provedor', v: esp?.taxa_provedor ?? 0, cor: '#8b5cf6' },
          ].map(({ icon: Icon, label, v, cor }) => (
            <div key={label} className="glass-panel" style={{ ...cardBase, padding: 14 }}>
              <Icon size={16} color={cor} />
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', marginTop: 6 }}>{loading ? '—' : brl(v)}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{label}</div>
            </div>
          ))}
        </div>

        {esp?.proxima_liquidacao && (
          <div className="glass-panel" style={{ ...cardBase, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Clock size={16} color="#0ea5e9" />
            <span style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Próxima liberação prevista: <strong style={{ color: '#0f172a' }}>{new Date(esp.proxima_liquidacao).toLocaleDateString('pt-BR')}</strong></span>
          </div>
        )}

        {/* Extrato */}
        <div className="glass-panel" style={{ ...cardBase, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Extrato</div>
          {loading ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Carregando…</div>
            : extrato.length === 0 ? <div style={{ color: '#94a3b8', fontSize: 13 }}>Sem lançamentos ainda.</div>
            : extrato.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a' }}>{TIPO_LABEL[l.tipo] || l.tipo}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(l.created_at).toLocaleDateString('pt-BR')} · {l.status}</div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: ['saque', 'estorno', 'chargeback', 'taxa_plataforma', 'taxa_provedor'].includes(l.tipo) ? '#ef4444' : '#16a34a' }}>
                  {['saque', 'estorno', 'chargeback', 'taxa_plataforma', 'taxa_provedor'].includes(l.tipo) ? '−' : '+'}{brl(l.valor)}
                </div>
              </div>
            ))}
        </div>

        {/* Saques */}
        {saques.length > 0 && (
          <div className="glass-panel" style={{ ...cardBase }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Meus saques</div>
            {saques.map(s => {
              const st = STATUS_SAQUE[s.status] || { label: s.status, cor: '#94a3b8' }
              return (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{brl(s.valor)}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(s.created_at).toLocaleDateString('pt-BR')}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: st.cor, background: `${st.cor}18`, borderRadius: 10, padding: '4px 10px' }}>{st.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
