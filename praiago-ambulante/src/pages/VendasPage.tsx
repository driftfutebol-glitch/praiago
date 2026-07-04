// Resumo de Vendas — 100% dados reais da tabela `pedidos` deste vendedor.
// Bruto = soma dos pedidos entregues; Líquido = bruto - taxa da plataforma.
// Carteira: saldo a receber/já repassado vem do `financial_ledger` (repasses).
import { useState, useEffect, useMemo } from 'react'
import { TrendingUp, ShoppingBag, Receipt, Wallet, CalendarDays, PiggyBank, KeyRound, CheckCircle2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

const TAXA_PLATAFORMA = 0 // % — lançamento sem taxa; ajuste quando definir o modelo

type PedidoRow = { total: number | string; status: string; created_at: string }
type LedgerRow = { id: string; valor: number | string; status: string; descricao: string | null; created_at: string; settled_at: string | null; provider: string | null }

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const fmtBRL = (v: number) => `R$ ${v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`

export default function VendasPage() {
  const sessao = getSessao()
  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [carregado, setCarregado] = useState(false)

  // ── Carteira: repasses do financial_ledger + chave PIX pra depósito ──
  const [repasses, setRepasses] = useState<LedgerRow[]>([])
  const [verificado, setVerificado] = useState<boolean | null>(null)
  const [pixChave, setPixChave] = useState('')
  const [pixTitular, setPixTitular] = useState('')
  const [pixSalvo, setPixSalvo] = useState(false)
  const [pixSalvando, setPixSalvando] = useState(false)
  const [pixErro, setPixErro] = useState('')
  const [mpVinculado, setMpVinculado] = useState(false)

  useEffect(() => {
    if (!sessao) return
    const inicio = new Date(); inicio.setDate(inicio.getDate() - 30); inicio.setHours(0, 0, 0, 0)
    supabase.from('pedidos').select('total, status, created_at')
      .eq('vendedor_id', sessao.id).gte('created_at', inicio.toISOString())
      .then(({ data }) => { setPedidos((data as PedidoRow[]) ?? []); setCarregado(true) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sessao) return

    const carregarCarteira = () => {
      supabase.from('financial_ledger')
        .select('id, valor, status, descricao, created_at, settled_at, provider')
        .eq('vendedor_id', sessao.id)
        .eq('tipo', 'repasse_vendedor')
        .order('created_at', { ascending: false })
        .limit(40)
        .then(({ data }) => setRepasses((data as LedgerRow[]) ?? []))
    }
    carregarCarteira()

    supabase.from('profiles').select('verificado').eq('id', sessao.id).maybeSingle()
      .then(({ data }) => setVerificado(!!data?.verificado))

    supabase.from('vendor_payment_accounts')
      .select('pix_key, holder_name, mercadopago_user_id')
      .eq('vendedor_id', sessao.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        if (data.pix_key) { setPixChave(data.pix_key); setPixSalvo(true) }
        if (data.holder_name) setPixTitular(data.holder_name)
        setMpVinculado(!!data.mercadopago_user_id)
      })

    // saldo atualiza sozinho quando o admin paga ou entra repasse novo
    const ch = supabase.channel(`carteira_${sessao.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'financial_ledger', filter: `vendedor_id=eq.${sessao.id}` }, carregarCarteira)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const carteira = useMemo(() => {
    const soma = (filtro: (r: LedgerRow) => boolean) =>
      repasses.filter(filtro).reduce((a, r) => a + (Number(r.valor) || 0), 0)
    return {
      aReceber: soma(r => r.status === 'pendente'),
      recebido: soma(r => r.status === 'pago'),
    }
  }, [repasses])

  async function salvarPix() {
    if (!sessao) return
    const chave = pixChave.trim()
    if (chave.length < 5) { setPixErro('Digite uma chave PIX válida (CPF, celular, e-mail ou aleatória).'); return }
    if (!pixTitular.trim()) { setPixErro('Informe o nome do titular da conta.'); return }
    setPixErro('')
    setPixSalvando(true)
    const { error } = await supabase.from('vendor_payment_accounts').upsert({
      vendedor_id: sessao.id,
      provider: 'pix_manual',
      pix_key: chave,
      holder_name: pixTitular.trim(),
      // conta só é cadastrável depois do KYC aprovado, então já nasce verificada
      status: 'verificado',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'vendedor_id' })
    setPixSalvando(false)
    if (error) {
      setPixErro('Não deu pra salvar agora: ' + error.message)
      return
    }
    setPixSalvo(true)
  }

  const resumo = useMemo(() => {
    const entregues = pedidos.filter(p => p.status === 'entregue')
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
    const doDia = entregues.filter(p => new Date(p.created_at) >= hoje)
    const brutoMes = entregues.reduce((a, p) => a + (Number(p.total) || 0), 0)
    const brutoDia = doDia.reduce((a, p) => a + (Number(p.total) || 0), 0)
    // últimos 7 dias para o gráfico
    const dias: { label: string; valor: number; pedidos: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0)
      const fim = new Date(d); fim.setDate(fim.getDate() + 1)
      const doD = entregues.filter(p => { const t = new Date(p.created_at); return t >= d && t < fim })
      dias.push({ label: DIAS[d.getDay()], valor: doD.reduce((a, p) => a + (Number(p.total) || 0), 0), pedidos: doD.length })
    }
    return {
      brutoMes, brutoDia,
      liquidoMes: brutoMes * (1 - TAXA_PLATAFORMA / 100),
      pedidosMes: entregues.length, pedidosDia: doDia.length,
      ticketMedio: entregues.length ? brutoMes / entregues.length : 0,
      pendentes: pedidos.filter(p => p.status !== 'entregue').length,
      dias,
    }
  }, [pedidos])

  const maxDia = Math.max(...resumo.dias.map(d => d.valor), 1)

  const cards = [
    { label: 'Vendas hoje', valor: fmtBRL(resumo.brutoDia), extra: `${resumo.pedidosDia} pedido${resumo.pedidosDia === 1 ? '' : 's'}`, icon: ShoppingBag, cor: '#16a34a' },
    { label: 'Bruto (30 dias)', valor: fmtBRL(resumo.brutoMes), extra: `${resumo.pedidosMes} entregues`, icon: TrendingUp, cor: '#16a34a' },
    { label: 'Líquido (30 dias)', valor: fmtBRL(resumo.liquidoMes), extra: `taxa PraiaGo ${TAXA_PLATAFORMA}%`, icon: Wallet, cor: '#0284c7' },
    { label: 'Ticket médio', valor: fmtBRL(resumo.ticketMedio), extra: `${resumo.pendentes} em andamento`, icon: Receipt, cor: '#7c3aed' },
  ]

  return (
    <div style={{ padding: '24px 20px 110px', minHeight: '100vh' }}>
      <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', margin: '0 0 8px', letterSpacing: -1 }}>Resumo de Vendas</h1>
        <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 32px', fontWeight: 500 }}>Seu desempenho real, direto dos pedidos entregues</p>
      </motion.div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 18, marginBottom: 28 }}>
        {cards.map(({ label, valor, extra, icon: Icon, cor }, i) => (
          <motion.div key={label} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="glass-panel card-hover" style={{ borderRadius: 22, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, background: `${cor}18`, display: 'grid', placeItems: 'center' }}>
                <Icon size={19} color={cor} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 950, color: '#0f172a', letterSpacing: -0.5 }}>{valor}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: cor, marginTop: 4 }}>{extra}</div>
          </motion.div>
        ))}
      </div>

      {/* ── Carteira: quanto tem pra receber e pra onde vai o dinheiro ── */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="glass-panel" style={{ borderRadius: 24, padding: 26, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <PiggyBank size={18} color="#0284c7" />
          <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 1 }}>Carteira · Repasses</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#64748b' }}>vendas pagas pelo app</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <div style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.18)', borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: 0.8 }}>A receber</div>
            <div style={{ fontSize: 24, fontWeight: 950, color: '#0f172a', marginTop: 4 }}>{fmtBRL(carteira.aReceber)}</div>
          </div>
          <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 18, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: 0.8 }}>Já repassado</div>
            <div style={{ fontSize: 24, fontWeight: 950, color: '#0f172a', marginTop: 4 }}>{fmtBRL(carteira.recebido)}</div>
          </div>
        </div>

        <div style={{ fontSize: 12.5, color: '#64748b', fontWeight: 600, lineHeight: 1.5, marginBottom: 16 }}>
          {mpVinculado
            ? '✅ Conta Mercado Pago vinculada: sua parte cai direto na sua conta, sem esperar repasse.'
            : 'Vendas pagas pelo app ficam guardadas aqui e são repassadas pra sua chave PIX. Quer receber na hora? Vincule sua conta Mercado Pago no Perfil.'}
        </div>

        {/* Chave PIX pra depósito — só depois da verificação */}
        {verificado === false && (
          <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 14, padding: '12px 14px', fontSize: 12.5, color: '#b45309', fontWeight: 700 }}>
            Complete a verificação da sua conta (documentos) para cadastrar a chave PIX de recebimento.
          </div>
        )}
        {verificado && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <KeyRound size={15} color="#0284c7" />
              <span style={{ fontSize: 12, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.8 }}>Chave PIX pra receber</span>
              {pixSalvo && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 800, color: '#16a34a' }}>
                  <CheckCircle2 size={13} /> cadastrada
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
              <input
                value={pixChave}
                onChange={e => { setPixChave(e.target.value); setPixSalvo(false) }}
                placeholder="CPF, celular, e-mail ou chave aleatória"
                style={{ width: '100%', boxSizing: 'border-box', background: '#ffffff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '13px 14px', fontSize: 14, fontWeight: 600, color: '#0f172a', outline: 'none' }}
              />
              <input
                value={pixTitular}
                onChange={e => { setPixTitular(e.target.value); setPixSalvo(false) }}
                placeholder="Nome do titular da conta"
                style={{ width: '100%', boxSizing: 'border-box', background: '#ffffff', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 14, padding: '13px 14px', fontSize: 14, fontWeight: 600, color: '#0f172a', outline: 'none' }}
              />
              <button
                onClick={salvarPix}
                disabled={pixSalvando}
                style={{ border: 'none', background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', color: '#fff', borderRadius: 14, padding: '13px 14px', fontSize: 14, fontWeight: 900, cursor: pixSalvando ? 'wait' : 'pointer' }}
              >
                {pixSalvando ? 'Salvando…' : pixSalvo ? 'Atualizar chave PIX' : 'Salvar chave PIX'}
              </button>
            </div>
            {pixErro && <div style={{ marginTop: 8, fontSize: 12.5, color: '#ef4444', fontWeight: 700 }}>{pixErro}</div>}
          </div>
        )}

        {/* Extrato de repasses */}
        {repasses.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>Extrato</div>
            {repasses.slice(0, 10).map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.descricao || 'Repasse de venda'}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8' }}>
                    {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    {r.status === 'pago' && r.settled_at ? ` · pago em ${new Date(r.settled_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 900, color: r.status === 'pago' ? '#16a34a' : r.status === 'cancelado' ? '#94a3b8' : '#0284c7' }}>
                  {fmtBRL(Number(r.valor) || 0)}
                </div>
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 8, background: r.status === 'pago' ? 'rgba(34,197,94,0.12)' : r.status === 'cancelado' ? 'rgba(100,116,139,0.12)' : 'rgba(14,165,233,0.12)', color: r.status === 'pago' ? '#16a34a' : r.status === 'cancelado' ? '#64748b' : '#0284c7' }}>
                  {r.status === 'pago' ? 'Pago' : r.status === 'cancelado' ? 'Cancelado' : 'A receber'}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Gráfico últimos 7 dias */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-panel" style={{ borderRadius: 24, padding: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <CalendarDays size={18} color="#16a34a" />
          <span style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 1 }}>Últimos 7 dias</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#64748b' }}>faturamento por dia</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 190 }}>
          {resumo.dias.map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: d.valor > 0 ? '#16a34a' : '#cbd5e1' }}>
                {d.valor > 0 ? fmtBRL(d.valor) : '—'}
              </div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(4, (d.valor / maxDia) * 100)}%` }}
                transition={{ delay: 0.35 + i * 0.07, type: 'spring', stiffness: 120, damping: 16 }}
                style={{
                  width: '100%', maxWidth: 46, borderRadius: 10,
                  background: d.valor > 0 ? 'linear-gradient(180deg, #4ade80, #16a34a)' : '#f1f5f9',
                  boxShadow: d.valor > 0 ? '0 8px 20px rgba(34,197,94,0.25)' : 'none',
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>{d.label}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8' }}>{d.pedidos} ped.</div>
            </div>
          ))}
        </div>
        {carregado && resumo.pedidosMes === 0 && (
          <div style={{ textAlign: 'center', color: '#64748b', fontSize: 13, fontWeight: 600, marginTop: 18 }}>
            Nenhuma venda entregue nos últimos 30 dias — assim que os pedidos forem concluídos, tudo aparece aqui. 🌊
          </div>
        )}
      </motion.div>
    </div>
  )
}
