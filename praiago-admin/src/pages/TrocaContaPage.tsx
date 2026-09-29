// Aprovacao de troca da conta bancaria do vendedor.
//
// Por que isso existe: trocar a conta que recebe o dinheiro e o golpe classico
// de marketplace. Se a conta do vendedor for invadida, o atacante so precisa
// apontar o recebimento pra conta dele — sem tocar em mais nada. Por isso a
// troca nunca e automatica.
//
// Aprovar NAO troca a conta: abre uma JANELA em que o vendedor pode cadastrar
// a nova conta. Isso garante que quem digita os dados finais e ele, no app
// dele, e nao alguem daqui de dentro.
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Landmark, ShieldCheck, ShieldX, Clock, Loader2, User, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Pedido = {
  id: string
  vendedor_id: string
  status: string
  banco_codigo: string
  banco_nome: string | null
  agencia: string
  conta_mascarada: string
  titular_nome: string
  titular_documento: string
  motivo: string | null
  parecer: string | null
  liberado_ate: string | null
  created_at: string
  profiles?: { nome: string | null; email: string | null; role: string | null; documento: string | null } | null
}

const STATUS: Record<string, { label: string; cor: string; fundo: string }> = {
  pendente: { label: 'Aguardando análise', cor: '#f5c366', fundo: 'rgba(245,158,11,0.12)' },
  em_analise: { label: 'Em análise', cor: '#76d3ff', fundo: 'rgba(14,165,233,0.12)' },
  aprovado: { label: 'Aprovado', cor: '#72dda4', fundo: 'rgba(34,197,94,0.12)' },
  recusado: { label: 'Recusado', cor: '#ff96ae', fundo: 'rgba(239,68,68,0.1)' },
  cancelado: { label: 'Cancelado', cor: '#9ba8c4', fundo: 'rgba(100,116,139,0.12)' },
}

const mascararDoc = (d?: string | null) => {
  const s = String(d ?? '').replace(/\D/g, '')
  return s ? `•••${s.slice(-4)}` : '—'
}

export default function TrocaContaPage() {
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState<string | null>(null)
  const [parecer, setParecer] = useState<Record<string, string>>({})
  const [soAbertos, setSoAbertos] = useState(true)

  const carregar = useCallback(async () => {
    setCarregando(true)
    let q = supabase
      .from('bank_account_change_requests')
      .select('*, profiles!bank_account_change_requests_vendedor_id_fkey(nome,email,role,documento)')
      .order('created_at', { ascending: false })
      .limit(60)
    if (soAbertos) q = q.in('status', ['pendente', 'em_analise'])
    const { data } = await q
    setPedidos((data as Pedido[]) ?? [])
    setCarregando(false)
  }, [soAbertos])

  useEffect(() => { carregar() }, [carregar])

  async function decidir(id: string, decisao: 'aprovado' | 'recusado' | 'em_analise') {
    setProcessando(id)
    const { error } = await supabase.rpc('analisar_troca_conta', {
      p_pedido: id,
      p_decisao: decisao,
      p_parecer: parecer[id]?.trim() || null,
      p_horas: 48,
    })
    setProcessando(null)
    if (error) { alert('Não foi possível registrar a decisão: ' + error.message); return }
    carregar()
  }

  return (
    <div style={{ padding: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: '#edf2ff', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Landmark size={24} /> Troca de conta bancária
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setSoAbertos(s => !s)} style={{ border: '1px solid rgba(166,181,225,0.18)', background: soAbertos ? '#112741' : '#111a30', color: soAbertos ? '#76d3ff' : '#9ba8c4', borderRadius: 12, padding: '9px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
            {soAbertos ? 'Só pendentes' : 'Todos'}
          </button>
          <button onClick={carregar} style={{ border: '1px solid rgba(166,181,225,0.18)', background: '#111a30', color: '#9ba8c4', borderRadius: 12, padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <p style={{ fontSize: 13.5, color: '#9ba8c4', fontWeight: 600, marginTop: 0, marginBottom: 20, maxWidth: 720 }}>
        Confirme com o vendedor pelo chat antes de aprovar. Aprovar <strong>não troca a conta</strong> — libera uma janela de 48h pra ele cadastrar os dados novos no app dele.
      </p>

      {carregando ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ba8c4', fontWeight: 700 }}>
          <Loader2 size={16} className="animate-spin" /> Carregando…
        </div>
      ) : pedidos.length === 0 ? (
        <div style={{ background: '#111a30', border: '1px solid rgba(166,181,225,0.14)', borderRadius: 20, padding: 40, textAlign: 'center', color: '#9ba8c4', fontWeight: 700 }}>
          Nenhum pedido {soAbertos ? 'pendente' : 'registrado'}.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {pedidos.map(p => {
            const st = STATUS[p.status] ?? STATUS.pendente
            const aberto = ['pendente', 'em_analise'].includes(p.status)
            // Bate o CPF/CNPJ do titular com o do cadastro: divergencia aqui e o
            // sinal mais forte de que a conta nao e do vendedor.
            const docCadastro = String(p.profiles?.documento ?? '').replace(/\D/g, '')
            const docPedido = String(p.titular_documento ?? '').replace(/\D/g, '')
            const documentoBate = !!docCadastro && docCadastro === docPedido

            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                style={{ background: '#111a30', border: '1px solid rgba(166,181,225,0.14)', borderRadius: 20, padding: 18 }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#edf2ff', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <User size={15} color="#9ba8c4" /> {p.profiles?.nome || 'Vendedor'}
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#9ba8c4', textTransform: 'uppercase', background: '#16213c', borderRadius: 8, padding: '2px 8px' }}>
                        {p.profiles?.role ?? '—'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, color: '#9ba8c4', fontWeight: 600, marginTop: 3 }}>
                      {p.profiles?.email} · pedido em {new Date(p.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 800, color: st.cor, background: st.fundo, borderRadius: 999, padding: '6px 12px' }}>
                    {st.label}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(160px, 100%), 1fr))', gap: 10, marginTop: 14, background: '#0c1428', borderRadius: 14, padding: 14 }}>
                  {[
                    ['Banco', `${p.banco_codigo} ${p.banco_nome ? `· ${p.banco_nome}` : ''}`],
                    ['Agência', p.agencia],
                    ['Conta', p.conta_mascarada],
                    ['Titular', p.titular_nome],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: '#a8b4cf', textTransform: 'uppercase', letterSpacing: 0.6 }}>{k}</div>
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#edf2ff', marginTop: 2 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <div style={{
                  marginTop: 10, fontSize: 12.5, fontWeight: 800, borderRadius: 12, padding: '10px 12px',
                  display: 'flex', alignItems: 'center', gap: 7,
                  color: documentoBate ? '#72dda4' : '#ff96ae',
                  background: documentoBate ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${documentoBate ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`,
                }}>
                  {documentoBate ? <ShieldCheck size={14} /> : <ShieldX size={14} />}
                  {documentoBate
                    ? `Documento do titular confere com o cadastro (${mascararDoc(docPedido)})`
                    : `ATENÇÃO: documento do titular (${mascararDoc(docPedido)}) NÃO bate com o do cadastro (${mascararDoc(docCadastro)})`}
                </div>

                {p.motivo && (
                  <div style={{ marginTop: 10, fontSize: 13, color: '#b5c0d7', fontWeight: 600 }}>
                    <strong style={{ color: '#edf2ff' }}>Motivo alegado:</strong> {p.motivo}
                  </div>
                )}
                {p.parecer && !aberto && (
                  <div style={{ marginTop: 8, fontSize: 13, color: '#b5c0d7', fontWeight: 600 }}>
                    <strong style={{ color: '#edf2ff' }}>Parecer:</strong> {p.parecer}
                  </div>
                )}
                {p.status === 'aprovado' && p.liberado_ate && (
                  <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 800, color: '#72dda4', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={13} /> Janela aberta até {new Date(p.liberado_ate).toLocaleString('pt-BR')}
                  </div>
                )}

                {aberto && (
                  <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                    <input
                      value={parecer[p.id] ?? ''}
                      onChange={e => setParecer(v => ({ ...v, [p.id]: e.target.value }))}
                      placeholder="Parecer (o vendedor vê isso se for recusado)"
                      style={{ width: '100%', border: '1px solid rgba(166,181,225,0.18)', borderRadius: 12, padding: '11px 12px', fontSize: 14, fontWeight: 600, color: '#edf2ff', background: '#0c1428', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => decidir(p.id, 'aprovado')} disabled={processando === p.id}
                        style={{ flex: 1, minWidth: 150, border: 'none', background: 'linear-gradient(135deg, #16a34a, #22c55e)', color: '#111a30', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
                      >
                        {processando === p.id ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Aprovar (libera 48h)
                      </button>
                      {p.status === 'pendente' && (
                        <button
                          onClick={() => decidir(p.id, 'em_analise')} disabled={processando === p.id}
                          style={{ border: '1px solid rgba(14,165,233,0.3)', background: '#112741', color: '#76d3ff', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
                        >
                          Marcar em análise
                        </button>
                      )}
                      <button
                        onClick={() => decidir(p.id, 'recusado')} disabled={processando === p.id}
                        style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)', color: '#ff96ae', borderRadius: 12, padding: '12px 16px', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7 }}
                      >
                        <ShieldX size={15} /> Recusar
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
