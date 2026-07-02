import { useState, useEffect } from 'react'
import { Store, MapPin, Phone, Star, TrendingUp, ChevronRight, Bell, Shield, HelpCircle, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { getSessao } from '../lib/auth'

type PerfilInfo = {
  nome: string
  avaliacao: number
  totalAvaliacoes: number
  telefone: string | null
  endereco: string | null
}

export default function PerfilPage() {
  const sessao = getSessao()
  const [perfil, setPerfil] = useState<PerfilInfo>({ nome: sessao?.nome || 'Meu Restaurante', avaliacao: 0, totalAvaliacoes: 0, telefone: null, endereco: null })
  const [pedidosMes, setPedidosMes] = useState(0)
  const [faturamentoMes, setFaturamentoMes] = useState(0)

  // Dados REAIS: perfil + pedidos entregues no mês (nada fictício)
  useEffect(() => {
    if (!sessao) return
    supabase.from('profiles').select('nome, razao_social, avaliacao_media, total_avaliacoes, telefone_comercial, endereco').eq('id', sessao.id).maybeSingle()
      .then(({ data }) => {
        if (data) setPerfil({
          nome: data.nome || data.razao_social || sessao.nome || 'Meu Restaurante',
          avaliacao: Number(data.avaliacao_media) || 0,
          totalAvaliacoes: Number(data.total_avaliacoes) || 0,
          telefone: data.telefone_comercial,
          endereco: data.endereco,
        })
      })
    const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    supabase.from('pedidos').select('total, status').eq('vendedor_id', sessao.id).gte('created_at', inicioMes.toISOString())
      .then(({ data }) => {
        const entregues = (data ?? []).filter(p => p.status === 'entregue')
        setPedidosMes(entregues.length)
        setFaturamentoMes(entregues.reduce((a, p) => a + (Number(p.total) || 0), 0))
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ padding: '32px 40px 48px', minHeight: '100vh' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 38, fontWeight: 900, color: '#0f172a', margin: '0 0 8px', letterSpacing: -1, textShadow: '0 0 30px rgba(0,0,0,0.08)' }}>Central do Restaurante</h1>
        <p style={{ fontSize: 15, color: '#64748b', margin: '0 0 32px', fontWeight: 500 }}>Gerencie seu perfil e configurações da conta</p>
      </motion.div>

      {/* Card principal */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel" style={{
        background: 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(220,38,38,0.15))',
        border: '1px solid rgba(249,115,22,0.3)',
        borderRadius: 24, padding: '32px',
        marginBottom: 32, position: 'relative', overflow: 'hidden',
        boxShadow: '0 20px 40px rgba(0,0,0,0.3), inset 0 0 40px rgba(249,115,22,0.05)'
      }}>
        {/* Efeito luminoso de fundo */}
        <div style={{
          position: 'absolute', top: -100, right: -100, width: 300, height: 300,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.2) 0%, transparent 70%)',
          filter: 'blur(40px)', zIndex: 0
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, position: 'relative', zIndex: 1 }}>
          <div style={{
            width: 88, height: 88, borderRadius: 24, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, border: '1px solid rgba(249,115,22,0.4)',
            boxShadow: '0 10px 25px rgba(249,115,22,0.2), inset 0 0 20px rgba(249,115,22,0.1)',
            backdropFilter: 'blur(10px)'
          }}>🍽️</div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a', textShadow: '0 0 20px rgba(255,255,255,0.2)' }}>{perfil.nome}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#334155', fontWeight: 500, background: 'rgba(0,0,0,0.05)', padding: '4px 12px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}>
                <MapPin size={14} color="#f97316" /> Praia Grande, SP
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#334155', fontWeight: 500, background: 'rgba(0,0,0,0.05)', padding: '4px 12px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}>
                <Star size={14} color="#fbbf24" fill="#fbbf24" />
                {perfil.totalAvaliacoes > 0
                  ? <><span style={{ fontWeight: 800, color: '#0f172a' }}>{perfil.avaliacao.toFixed(1)}</span> <span style={{ color: '#64748b' }}>· {perfil.totalAvaliacoes} avaliaç{perfil.totalAvaliacoes === 1 ? 'ão' : 'ões'}</span></>
                  : <span style={{ color: '#64748b' }}>Sem avaliações ainda</span>}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Stats */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="glass-panel" style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(0,0,0,0.05)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color="#4ade80" /> DESEMPENHO DO MÊS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Pedidos concluídos', value: String(pedidosMes), icon: Store, c: '#0f172a' },
              { label: 'Faturamento bruto', value: `R$ ${faturamentoMes.toFixed(2).replace('.', ',')}`, icon: TrendingUp, c: '#16a34a' },
            ].map(({ label, value, icon: Icon, c }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: c, textShadow: `0 0 15px ${c}40` }}>{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Contato */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="glass-panel" style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(0,0,0,0.05)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={16} color="#0ea5e9" /> INFORMAÇÕES PÚBLICAS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Telefone comercial', value: perfil.telefone || 'Adicione no cadastro', icon: Phone },
              { label: 'Endereço da base', value: perfil.endereco || 'Adicione no cadastro', icon: MapPin },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color="#94a3b8" />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 700, letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#1e293b' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Menu de configurações */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-panel" style={{ borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', marginBottom: 24 }}>
        {[
          { icon: Bell, label: 'Notificações e Alertas' },
          { icon: Shield, label: 'Privacidade e Segurança' },
          { icon: HelpCircle, label: 'Central de Ajuda PraiaGo' },
        ].map(({ icon: Icon, label }, i) => (
          <motion.button whileHover={{ backgroundColor: 'rgba(0,0,0,0.05)' }} whileTap={{ backgroundColor: 'rgba(255,255,255,0.02)' }} key={label} style={{
            width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '20px 24px', borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none', textAlign: 'left',
            transition: 'background 0.2s'
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,0,0,0.08)' }}>
              <Icon size={20} color="#94a3b8" />
            </div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#0f172a', letterSpacing: 0.5 }}>{label}</span>
            <ChevronRight size={18} color="#475569" />
          </motion.button>
        ))}
      </motion.div>

      <motion.button whileHover={{ scale: 1.02, backgroundColor: 'rgba(239,68,68,0.1)' }} whileTap={{ scale: 0.98 }} style={{
        width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20,
        padding: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        boxShadow: '0 4px 15px rgba(239,68,68,0.1)'
      }}>
        <LogOut size={20} color="#ef4444" />
        <span style={{ fontSize: 15, fontWeight: 800, color: '#ef4444', letterSpacing: 1 }}>ENCERRAR SESSÃO</span>
      </motion.button>
    </div>
  )
}
