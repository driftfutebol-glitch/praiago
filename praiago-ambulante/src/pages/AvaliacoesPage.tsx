// Avaliações que o ambulante recebeu dos clientes (100% real, tabela `avaliacoes`).
import { useEffect, useMemo, useState } from 'react'
import { Star, MessageSquare, ChevronLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

type Avaliacao = {
  id: string
  nota: number
  comentario: string | null
  cliente_nome: string | null
  created_at: string
}

function estrelas(n: number, size = 15) {
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} color={i <= n ? '#f59e0b' : '#e2e8f0'} fill={i <= n ? '#f59e0b' : '#e2e8f0'} />
      ))}
    </span>
  )
}

export default function AvaliacoesPage() {
  const navigate = useNavigate()
  const sessao = getSessao()
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([])
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    if (!sessao) return
    const carregar = () => {
      supabase.from('avaliacoes')
        .select('id, nota, comentario, cliente_nome, created_at')
        .eq('vendedor_id', sessao.id)
        .order('created_at', { ascending: false })
        .limit(100)
        .then(({ data }) => { setAvaliacoes((data as Avaliacao[]) ?? []); setCarregado(true) })
    }
    carregar()
    const ch = supabase.channel(`avaliacoes_${sessao.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avaliacoes', filter: `vendedor_id=eq.${sessao.id}` }, carregar)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const resumo = useMemo(() => {
    const total = avaliacoes.length
    const media = total ? avaliacoes.reduce((a, r) => a + (Number(r.nota) || 0), 0) / total : 0
    const dist = [5, 4, 3, 2, 1].map(n => ({ n, qtd: avaliacoes.filter(r => Math.round(r.nota) === n).length }))
    return { total, media, dist }
  }, [avaliacoes])

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 110, background: '#ffffff' }}>
      <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => navigate(-1)} aria-label="Voltar" style={{ width: 40, height: 40, borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <ChevronLeft size={20} color="#334155" />
        </button>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>Avaliações</h1>
          <p style={{ fontSize: 13, color: '#64748b', margin: '2px 0 0', fontWeight: 500 }}>O que os clientes acharam de você</p>
        </div>
      </div>

      {/* Resumo */}
      <div style={{ padding: '12px 20px' }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel" style={{ borderRadius: 24, padding: 22, display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 44, fontWeight: 950, color: '#0f172a', lineHeight: 1 }}>{resumo.media.toFixed(1)}</div>
            <div style={{ marginTop: 6 }}>{estrelas(Math.round(resumo.media), 16)}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 700, marginTop: 4 }}>{resumo.total} avaliaç{resumo.total === 1 ? 'ão' : 'ões'}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {resumo.dist.map(({ n, qtd }) => (
              <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', width: 10 }}>{n}</span>
                <Star size={11} color="#f59e0b" fill="#f59e0b" />
                <div style={{ flex: 1, height: 7, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${resumo.total ? (qtd / resumo.total) * 100 : 0}%`, background: 'linear-gradient(90deg,#f59e0b,#f97316)', borderRadius: 6 }} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', width: 18, textAlign: 'right' }}>{qtd}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Lista */}
      <div style={{ padding: '8px 20px' }}>
        {carregado && avaliacoes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#64748b' }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <MessageSquare size={28} color="#94a3b8" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#334155' }}>Ainda sem avaliações</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Assim que um cliente avaliar um pedido seu, aparece aqui na hora. 🌊</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {avaliacoes.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.04, 0.3) }} style={{ background: '#f8fafc', border: '1px solid rgba(0,0,0,0.05)', borderRadius: 18, padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: r.comentario ? 8 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 15 }}>
                      {(r.cliente_nome || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{r.cliente_nome || 'Cliente'}</div>
                      <div style={{ marginTop: 2 }}>{estrelas(Math.round(r.nota), 13)}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                    {new Date(r.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
                {r.comentario && (
                  <div style={{ fontSize: 13.5, color: '#475569', fontWeight: 500, lineHeight: 1.5, paddingLeft: 48 }}>
                    "{r.comentario}"
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
