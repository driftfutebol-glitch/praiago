import { useEffect, useState } from 'react'
import { Star, MapPin, Package, TrendingUp, ChevronRight, LogOut, Bell, Shield, HelpCircle, CreditCard, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { logout, useSessao } from '../lib/auth'
import { buscarStatusMercadoPago, iniciarVinculoMercadoPago, type MercadoPagoLinkStatus } from '../lib/mercadopago'

const menuItems = [
  { icon: TrendingUp, label: 'Resumo de vendas', desc: 'Quanto você vendeu, dia a dia', to: '/vendas' },
  { icon: Bell, label: 'Notificações', desc: 'Alertas de pedidos e novidades' },
  { icon: Shield, label: 'Segurança', desc: 'Sincronização e Conta' },
  { icon: HelpCircle, label: 'Suporte', desc: 'Central Tática PraiaGo' },
]

export default function PerfilPage() {
  const navigate = useNavigate()
  const sessao = useSessao()
  const [mpStatus, setMpStatus] = useState<MercadoPagoLinkStatus | null>(null)
  const [mpLoading, setMpLoading] = useState(false)
  const [mpErro, setMpErro] = useState('')

  useEffect(() => {
    if (!sessao) return
    buscarStatusMercadoPago(sessao.id).then(setMpStatus)
  }, [sessao])

  async function conectarMercadoPago() {
    if (!sessao) return
    setMpErro('')
    setMpLoading(true)
    try {
      await iniciarVinculoMercadoPago(sessao.id)
    } catch (err) {
      setMpErro(err instanceof Error ? err.message : 'Nao foi possivel vincular o Mercado Pago.')
      setMpLoading(false)
    }
  }

  function sair() {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 40 }}>
      {/* Header com avatar */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(14,165,233,0.2), rgba(34,197,94,0.2))',
        padding: '32px 20px 48px', position: 'relative', overflow: 'hidden',
        borderBottom: '1px solid rgba(0,0,0,0.05)'
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(14,165,233,0.3), rgba(34,197,94,0.3))', filter: 'blur(50px)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 20, position: 'relative', zIndex: 1 }}>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="neon-border" style={{
            width: 72, height: 72, borderRadius: 20,
            background: 'rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, boxShadow: '0 0 20px rgba(34,197,94,0.2)'
          }}>🌴</motion.div>
          <div>
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 }} style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', textTransform: 'capitalize', letterSpacing: -0.5 }}>{sessao?.nome || 'Ambulante'}</motion.div>
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.2 }} style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{sessao?.email || ''}</motion.div>
            <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, background: 'rgba(245,158,11,0.1)', padding: '4px 10px', borderRadius: 12, border: '1px solid rgba(245,158,11,0.2)', width: 'fit-content' }}>
              <Star size={14} color="#fbbf24" fill="#fbbf24" />
              <span style={{ fontSize: 13, color: '#fbbf24', fontWeight: 900 }}>0,0</span>
              <span style={{ fontSize: 11, color: 'rgba(251,191,36,0.7)', fontWeight: 600 }}>· 0 avaliações</span>
            </motion.div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginTop: -24, position: 'relative', zIndex: 10 }}>
        {/* Stats rápidos */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12, marginBottom: 24,
        }}>
          {[
            { icon: Package, label: 'Pedidos', value: '0', color: '#38bdf8' },
            { icon: TrendingUp, label: 'Este mês', value: 'R$ 0', color: '#4ade80' },
            { icon: MapPin, label: 'Praia', value: 'Grande', color: '#fbbf24' },
          ].map(({ icon: Icon, label, value, color }, i) => (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 + i * 0.1 }} key={label} className="glass-panel" style={{
              borderRadius: 20, padding: '16px 10px',
              textAlign: 'center', border: `1px solid ${color}30`,
              boxShadow: `0 4px 20px ${color}10`
            }}>
              <Icon size={20} color={color} style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a' }}>{value}</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 4 }}>{label}</div>
            </motion.div>
          ))}
        </div>

        {/* Info da banca */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="glass-panel" style={{
          borderRadius: 24, padding: '20px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
            DADOS DA BANCA
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Nome</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{sessao?.nome || 'Não definido'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Categoria</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Não definida</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Radar Ativo</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Praia Grande, SP</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#64748b', fontWeight: 500 }}>Status da conexão</span>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#4ade80', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '4px 12px', letterSpacing: 1, textTransform: 'uppercase' }}>Conectado</span>
            </div>
          </div>
        </motion.div>

        {/* Menu de opções */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.55 }} className="glass-panel" style={{
          borderRadius: 24, padding: '20px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
            RECEBIMENTOS MERCADO PAGO
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 14, color: '#64748b', fontWeight: 600 }}>Status do split</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: mpStatus?.provider === 'mercadopago' && mpStatus.status === 'verificado' ? '#16a34a' : '#d97706', background: mpStatus?.provider === 'mercadopago' && mpStatus.status === 'verificado' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: '5px 10px', textTransform: 'uppercase' }}>
              {mpStatus?.provider === 'mercadopago' && mpStatus.status === 'verificado' ? 'Vinculado' : 'Pendente'}
            </span>
          </div>
          <button
            type="button"
            onClick={conectarMercadoPago}
            disabled={mpLoading}
            style={{ width: '100%', border: '1px solid rgba(2,132,199,0.25)', background: '#eff6ff', color: '#0284c7', borderRadius: 16, padding: 14, fontSize: 14, fontWeight: 900, cursor: mpLoading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            {mpLoading ? <Loader2 size={18} className="animate-spin-slow" /> : <CreditCard size={18} />}
            {mpStatus?.provider === 'mercadopago' ? 'Atualizar vinculo Mercado Pago' : 'Vincular conta Mercado Pago'}
          </button>
          {mpErro && <div style={{ marginTop: 10, color: '#ef4444', fontSize: 13, fontWeight: 800 }}>{mpErro}</div>}
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="glass-panel" style={{
          borderRadius: 24, overflow: 'hidden', marginBottom: 20,
        }}>
          {menuItems.map(({ icon: Icon, label, desc, to }, i) => (
            <motion.button whileTap={{ backgroundColor: 'rgba(0,0,0,0.05)' }} key={label} onClick={() => to && navigate(to)} style={{
              width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
              borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none',
              textAlign: 'left', transition: 'background 0.2s'
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14, background: 'rgba(0,0,0,0.05)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                border: '1px solid rgba(0,0,0,0.08)'
              }}>
                <Icon size={20} color="#cbd5e1" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{label}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, fontWeight: 500 }}>{desc}</div>
              </div>
              <ChevronRight size={18} color="#64748b" />
            </motion.button>
          ))}
        </motion.div>

        {/* Logout */}
        <motion.button whileTap={{ scale: 0.98 }} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }} onClick={sair} className="glass-panel" style={{
          width: '100%', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 24,
          padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: 16, background: 'rgba(239,68,68,0.05)',
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14, background: 'rgba(239,68,68,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <LogOut size={20} color="#f87171" />
          </div>
          <span style={{ fontSize: 15, fontWeight: 900, color: '#f87171', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sair da conta</span>
        </motion.button>
      </div>
    </div>
  )
}
