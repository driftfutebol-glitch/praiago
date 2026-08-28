import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, MessageSquare, Star, UserRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { getSessao } from '../lib/auth'
import { supabase } from '../lib/supabase'

type Review = {
  id: string
  nota: number
  comentario: string | null
  cliente_nome: string | null
  created_at: string
}

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span aria-label={`${value} de 5 estrelas`} style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(item => (
        <Star key={item} size={size} color={item <= value ? '#d99a00' : '#dfe6ed'} fill={item <= value ? '#d99a00' : '#dfe6ed'} />
      ))}
    </span>
  )
}

export default function AvaliacoesPage() {
  const navigate = useNavigate()
  const session = getSessao()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session?.id) return
    const load = async () => {
      const { data } = await supabase
        .from('avaliacoes')
        .select('id,nota,comentario,cliente_nome,created_at')
        .eq('vendedor_id', session.id)
        .order('created_at', { ascending: false })
        .limit(100)
      setReviews((data || []) as Review[])
      setLoading(false)
    }
    void load()
    const channel = supabase
      .channel(`avaliacoes_${session.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avaliacoes', filter: `vendedor_id=eq.${session.id}` }, load)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [session?.id])

  const summary = useMemo(() => {
    const total = reviews.length
    const average = total ? reviews.reduce((sum, review) => sum + (Number(review.nota) || 0), 0) / total : 0
    const distribution = [5, 4, 3, 2, 1].map(value => ({
      value,
      total: reviews.filter(review => Math.round(review.nota) === value).length,
    }))
    return { total, average, distribution }
  }, [reviews])

  return (
    <div className="page-shell">
      <div className="page-heading">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <button type="button" className="icon-button" onClick={() => navigate('/perfil')} aria-label="Voltar"><ArrowLeft size={19} /></button>
          <div>
            <h1>Avaliações</h1>
            <p>Notas e comentários dos seus clientes.</p>
          </div>
        </div>
      </div>

      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="surface" style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14, padding: 16, boxShadow: 'none' }}>
        <div style={{ width: 88, flex: '0 0 88px', textAlign: 'center' }}>
          <div style={{ color: '#132238', fontSize: 34, lineHeight: 1, fontWeight: 900 }}>{loading ? '-' : summary.average.toFixed(1).replace('.', ',')}</div>
          <div style={{ marginTop: 6 }}><Stars value={Math.round(summary.average)} size={13} /></div>
          <div style={{ marginTop: 4, color: '#718096', fontSize: 10, fontWeight: 700 }}>{summary.total} {summary.total === 1 ? 'avaliação' : 'avaliações'}</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {summary.distribution.map(item => (
            <div key={item.value} style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: item.value === 5 ? 0 : 5 }}>
              <span style={{ width: 9, color: '#617089', fontSize: 10, fontWeight: 800 }}>{item.value}</span>
              <Star size={10} color="#d99a00" fill="#d99a00" />
              <div style={{ height: 6, flex: 1, overflow: 'hidden', borderRadius: 3, background: '#edf1f5' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${summary.total ? item.total / summary.total * 100 : 0}%` }} style={{ height: '100%', borderRadius: 3, background: '#d99a00' }} />
              </div>
              <span style={{ width: 18, color: '#8793a5', fontSize: 10, fontWeight: 700, textAlign: 'right' }}>{item.total}</span>
            </div>
          ))}
        </div>
      </motion.section>

      {loading ? (
        <div className="surface shimmer" style={{ height: 130 }} />
      ) : reviews.length === 0 ? (
        <div className="surface" style={{ padding: '34px 20px', textAlign: 'center', boxShadow: 'none' }}>
          <MessageSquare size={34} color="#8793a5" style={{ margin: '0 auto 12px' }} />
          <div style={{ color: '#132238', fontSize: 15, fontWeight: 900 }}>Ainda não há avaliações</div>
          <p style={{ margin: '6px auto 0', maxWidth: 270, color: '#617089', fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>As avaliações de pedidos entregues aparecerão aqui.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 9 }}>
          {reviews.map((review, index) => (
            <motion.article key={review.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.24) }} className="surface" style={{ padding: 13, boxShadow: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', flex: '0 0 38px', borderRadius: 8, background: '#edf5f8', color: '#008fc0' }}><UserRound size={19} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ overflow: 'hidden', color: '#132238', fontSize: 13, fontWeight: 900, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{review.cliente_nome || 'Cliente PraiaGo'}</div>
                  <div style={{ marginTop: 3 }}><Stars value={Math.round(review.nota)} size={12} /></div>
                </div>
                <time dateTime={review.created_at} style={{ color: '#8793a5', fontSize: 10, fontWeight: 650 }}>{new Date(review.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</time>
              </div>
              {review.comentario && <p style={{ margin: '10px 0 0 48px', color: '#526178', fontSize: 12, lineHeight: 1.5, fontWeight: 600 }}>{review.comentario}</p>}
            </motion.article>
          ))}
        </div>
      )}
    </div>
  )
}
