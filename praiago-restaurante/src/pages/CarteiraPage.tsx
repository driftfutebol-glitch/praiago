import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Wallet, ArrowLeft, TrendingUp, Clock, ArrowDownToLine, Loader2, Receipt, Building2, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useSessao } from '../lib/auth'
import { confirmDialog, alertDialog } from '../lib/dialog'

type Espelho = {
  vendas_brutas: number; comissao_praiago: number; taxa_provedor: number; valor_liquido: number
  saldo_pendente: number; saldo_disponivel: number; transferido: number
  estornos: number; chargebacks: number; proxima_liquidacao: string | null
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
}

export default function CarteiraPage() {
  const navigate = useNavigate()
  const sessao = useSessao()
  const [esp, setEsp] = useState<Espelho | null>(null)
  const [saques, setSaques] = useState<Payout[]>([])
  const [extrato, setExtrato] = useState<Lancamento[]>([])
  const [chavePix, setChavePix] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sacando, setSacando] = useState(false)
  const [editandoPix, setEditandoPix] = useState(false)
  const [pixInput, setPixInput] = useState('')
  const [salvandoPix, setSalvandoPix] = useState(false)

  async function salvarPix() {
    if (!sessao?.id || !pixInput.trim()) return
    setSalvandoPix(true)
    const { error } = await supabase.from('vendor_payment_accounts')
      .upsert({ vendedor_id: sessao.id, provider: 'pix', pix_key: pixInput.trim(), status: 'ativo', updated_at: new Date().toISOString() }, { onConflict: 'vendedor_id' })
    setSalvandoPix(false)
    if (error) { alertDialog({ title: 'Erro', message: error.message, tone: 'danger' }); return }
    setChavePix(pixInput.trim()); setEditandoPix(false)
  }

  const carregar = useCallback(async () => {
    if (!sessao?.id) return
    const [{ data: espData }, { data: pays }, { data: led }, { data: vpa }] = await Promise.all([
      supabase.rpc('carteira_espelho', { p_vendedor: sessao.id }),
      supabase.from('payouts').select('id,valor,status,chave_pix,created_at').eq('vendedor_id', sessao.id).order('created_at', { ascending: false }).limit(10),
      supabase.from('financial_ledger').select('id,tipo,valor,status,created_at,disponivel_em').eq('vendedor_id', sessao.id).order('created_at', { ascending: false }).limit(15),
      supabase.from('vendor_payment_accounts').select('pix_key').eq('vendedor_id', sessao.id).maybeSingle(),
    ])
    setEsp((Array.isArray(espData) ? espData[0] : espData) as Espelho ?? null)
    setSaques((pays as Payout[]) ?? [])
    setExtrato((led as Lancamento[]) ?? [])
    setChavePix((vpa as { pix_key?: string } | null)?.pix_key ?? null)
    setLoading(false)
  }, [sessao?.id])

  useEffect(() => { carregar() }, [carregar])

  async function solicitarSaque() {
    const disponivel = esp?.saldo_disponivel ?? 0
    if (disponivel <= 0) { alertDialog({ title: 'Sem saldo disponível', message: 'Você ainda não tem saldo liberado pra sacar.', tone: 'danger' }); return }
    if (!chavePix) { alertDialog({ title: 'Cadastre sua chave Pix', message: 'Antes de sacar, cadastre a chave Pix em Perfil → Dados de recebimento.', tone: 'danger' }); return }
    const ok = await confirmDialog({ title: 'Solicitar saque?', message: `Vamos transferir ${brl(disponivel)} para sua chave Pix ${chavePix}. O prazo depende do provedor.`, confirmText: 'Sacar' })
    if (!ok) return
    setSacando(true)
    const { data, error } = await supabase.functions.invoke('solicitar-saque', { body: { valor: disponivel } })
    setSacando(false)
    const erro = (data as { error?: string })?.error || (error ? error.message : '')
    if (erro) { alertDialog({ title: 'Não deu pra sacar', message: erro, tone: 'danger' }); return }
    await alertDialog({ title: 'Saque solicitado! ✅', message: 'Assim que o provedor liquidar, o Pix cai na sua conta.', tone: 'success' })
    carregar()
  }

  const cardBase: React.CSSProperties = { borderRadius: 20, padding: 18, border: '1px solid rgba(0,0,0,0.06)' }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 100 }}>
      <div style={{ background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', padding: '24px 20px 44px', borderBottomLeftRadius: 28, borderBottomRightRadius: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Voltar" onClick={() => navigate('/perfil')} style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.2)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><ArrowLeft size={18} color="#fff" /></button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={22} color="#fff" />
            <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', margin: 0 }}>Minha Carteira</h1>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: -28 }}>
        {/* Saldo disponível + saque */}
        <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel" style={{ ...cardBase, marginBottom: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Saldo disponível pra saque</div>
          <div style={{ fontSize: 34, fontWeight: 900, color: '#16a34a', margin: '4px 0 6px' }}>{loading ? '—' : brl(esp?.saldo_disponivel ?? 0)}</div>
          <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Clock size={13} /> Pendente (liberando): <strong style={{ color: '#0f172a' }}>{brl(esp?.saldo_pendente ?? 0)}</strong>
          </div>
          <button onClick={solicitarSaque} disabled={sacando || loading} style={{ width: '100%', border: 'none', borderRadius: 16, padding: 15, fontSize: 15, fontWeight: 900, color: '#fff', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', cursor: sacando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {sacando ? <Loader2 size={18} className="animate-spin-slow" /> : <ArrowDownToLine size={18} />} Solicitar saque via Pix
          </button>
          {!chavePix && !loading && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#b45309', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <AlertCircle size={13} /> Cadastre sua chave Pix no perfil pra sacar
            </div>
          )}
        </motion.div>

        {/* Dados de recebimento (chave Pix) */}
        <div className="glass-panel" style={{ ...cardBase, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Chave Pix pra receber</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: chavePix ? '#0f172a' : '#ef4444', marginTop: 4 }}>{chavePix || 'Não cadastrada'}</div>
            </div>
            {!editandoPix && (
              <button onClick={() => { setPixInput(chavePix || ''); setEditandoPix(true) }} style={{ border: '1px solid rgba(14,165,233,0.3)', background: '#eff6ff', color: '#0284c7', borderRadius: 12, padding: '8px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
                {chavePix ? 'Alterar' : 'Cadastrar'}
              </button>
            )}
          </div>
          {editandoPix && (
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <input value={pixInput} onChange={e => setPixInput(e.target.value)} placeholder="CPF, e-mail, telefone ou aleatória" style={{ flex: 1, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: '11px 12px', fontSize: 14, fontWeight: 600, color: '#0f172a', background: '#f8fafc', outline: 'none' }} />
              <button onClick={salvarPix} disabled={salvandoPix} style={{ border: 'none', background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', color: '#fff', borderRadius: 12, padding: '0 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>{salvandoPix ? '...' : 'Salvar'}</button>
            </div>
          )}
        </div>

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
