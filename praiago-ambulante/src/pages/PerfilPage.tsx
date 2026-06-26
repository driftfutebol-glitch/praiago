import { Star, MapPin, Package, TrendingUp, ChevronRight, LogOut, Bell, Shield, HelpCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { logout, useSessao } from '../lib/auth'

const menuItems = [
  { icon: Bell, label: 'Notificações', desc: 'Novos pedidos e alertas' },
  { icon: Shield, label: 'Conta e segurança', desc: 'Senha e dados pessoais' },
  { icon: HelpCircle, label: 'Ajuda e suporte', desc: 'Fale com a equipe PraiaGo' },
]

export default function PerfilPage() {
  const navigate = useNavigate()
  const sessao = useSessao()

  function sair() {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', paddingBottom: 24 }}>
      {/* Header com avatar */}
      <div style={{
        background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
        padding: '32px 20px 48px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'rgba(255,255,255,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 28, border: '3px solid rgba(255,255,255,0.5)',
          }}>🌴</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', textTransform: 'capitalize' }}>{sessao?.nome ?? 'João Ambulante'}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{sessao?.email ?? 'Vendedor desde Jun 2025'}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <Star size={13} color="#fbbf24" fill="#fbbf24" />
              <span style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>4,8</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>· 34 avaliações</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginTop: -24 }}>
        {/* Stats rápidos */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          gap: 10, marginBottom: 20,
        }}>
          {[
            { icon: Package, label: 'Pedidos', value: '127', color: '#0ea5e9' },
            { icon: TrendingUp, label: 'Este mês', value: 'R$ 0', color: '#22c55e' },
            { icon: MapPin, label: 'Praia', value: 'Grande', color: '#f97316' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} style={{
              background: '#fff', borderRadius: 14, padding: '14px 10px',
              textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
              <Icon size={18} color={color} style={{ margin: '0 auto 6px' }} />
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{value}</div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Info da banca */}
        <div style={{
          background: '#fff', borderRadius: 16, padding: '16px 20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: 16,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Sua banca
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: '#64748b' }}>Nome</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Coco do João</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: '#64748b' }}>Categoria</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Bebidas</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: '#64748b' }}>Localização</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>Praia Grande, SP</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: '#64748b' }}>Status conta</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e', background: '#dcfce7', borderRadius: 20, padding: '2px 10px' }}>Aprovado</span>
            </div>
          </div>
        </div>

        {/* Menu de opções */}
        <div style={{
          background: '#fff', borderRadius: 16,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: 16,
        }}>
          {menuItems.map(({ icon: Icon, label, desc }, i) => (
            <button key={label} style={{
              width: '100%', background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
              borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
              textAlign: 'left',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, background: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={18} color="#64748b" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{label}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 1 }}>{desc}</div>
              </div>
              <ChevronRight size={16} color="#cbd5e1" />
            </button>
          ))}
        </div>

        {/* Logout */}
        <button onClick={sair} style={{
          width: '100%', background: '#fff', border: 'none', borderRadius: 16,
          padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center',
          gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, background: '#fff0f0',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <LogOut size={18} color="#ef4444" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>Sair da conta</span>
        </button>
      </div>
    </div>
  )
}
