import { Store, MapPin, Phone, Star, TrendingUp, ChevronRight, Bell, Shield, HelpCircle, LogOut } from 'lucide-react'

export default function PerfilPage() {
  return (
    <div style={{ padding: '28px 32px', background: '#f8fafc', minHeight: '100vh' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 24 }}>Perfil do restaurante</h1>

      {/* Card principal */}
      <div style={{
        background: 'linear-gradient(135deg, #f97316, #ef4444)',
        borderRadius: 20, padding: '28px 28px',
        marginBottom: 24, position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 160, height: 160,
          borderRadius: '50%', background: 'rgba(255,255,255,0.08)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 20, background: 'rgba(255,255,255,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, border: '3px solid rgba(255,255,255,0.4)',
          }}>🍽️</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>Restaurante Praia Sol</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <MapPin size={13} color="rgba(255,255,255,0.8)" />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)' }}>Praia Grande, SP</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8 }}>
              <Star size={14} color="#fbbf24" fill="#fbbf24" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>4.7</span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>· 328 avaliações</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* Stats */}
        <div style={{ background: '#fff', borderRadius: 18, padding: 20, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Estatísticas</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Pedidos este mês', value: '214', icon: Store },
              { label: 'Faturamento', value: 'R$ 12.480', icon: TrendingUp },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: '#64748b' }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Contato */}
        <div style={{ background: '#fff', borderRadius: 18, padding: 20, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16 }}>Contato</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Telefone', value: '(13) 99999-0000', icon: Phone },
              { label: 'Endereço', value: 'Av. Presidente Costa e Silva, 1200', icon: MapPin },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Menu de configurações */}
      <div style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
        {[
          { icon: Bell, label: 'Notificações de pedidos' },
          { icon: Shield, label: 'Segurança da conta' },
          { icon: HelpCircle, label: 'Suporte PraiaGo' },
        ].map(({ icon: Icon, label }, i) => (
          <button key={label} style={{
            width: '100%', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '16px 20px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', textAlign: 'left',
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} color="#64748b" />
            </div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{label}</span>
            <ChevronRight size={16} color="#cbd5e1" />
          </button>
        ))}
      </div>

      <button style={{
        width: '100%', background: '#fff', border: '1px solid #fee2e2', borderRadius: 14,
        padding: '14px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      }}>
        <LogOut size={18} color="#ef4444" />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>Sair da conta</span>
      </button>
    </div>
  )
}
