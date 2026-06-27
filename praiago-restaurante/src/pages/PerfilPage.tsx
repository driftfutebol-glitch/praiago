import { Store, MapPin, Phone, Star, TrendingUp, ChevronRight, Bell, Shield, HelpCircle, LogOut } from 'lucide-react'
import { motion } from 'framer-motion'

export default function PerfilPage() {
  return (
    <div style={{ padding: '32px 40px 48px', minHeight: '100vh' }}>
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 style={{ fontSize: 38, fontWeight: 900, color: '#f8fafc', margin: '0 0 8px', letterSpacing: -1, textShadow: '0 0 30px rgba(255,255,255,0.1)' }}>Central do Restaurante</h1>
        <p style={{ fontSize: 15, color: '#94a3b8', margin: '0 0 32px', fontWeight: 500 }}>Gerencie seu perfil e configurações da conta</p>
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
            <div style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc', textShadow: '0 0 20px rgba(255,255,255,0.2)' }}>Restaurante Maré</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#cbd5e1', fontWeight: 500, background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                <MapPin size={14} color="#f97316" /> Praia Grande, SP
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#cbd5e1', fontWeight: 500, background: 'rgba(255,255,255,0.05)', padding: '4px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                <Star size={14} color="#fbbf24" fill="#fbbf24" />
                <span style={{ fontWeight: 800, color: '#f8fafc' }}>4.9</span> <span style={{ color: '#64748b' }}>· 328 avaliações</span>
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Stats */}
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="glass-panel" style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color="#4ade80" /> DESEMPENHO DO MÊS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Pedidos concluídos', value: '214', icon: Store, c: '#f8fafc' },
              { label: 'Faturamento bruto', value: 'R$ 12.480,00', icon: TrendingUp, c: '#4ade80' },
            ].map(({ label, value, icon: Icon, c }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.02)' }}>
                <span style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: 18, fontWeight: 900, color: c, textShadow: `0 0 15px ${c}40` }}>{value}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Contato */}
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="glass-panel" style={{ borderRadius: 24, padding: 24, border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MapPin size={16} color="#0ea5e9" /> INFORMAÇÕES PÚBLICAS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { label: 'Telefone comercial', value: '(13) 99999-0000', icon: Phone },
              { label: 'Endereço da base', value: 'Av. Costa e Silva, 1200 - Boqueirão', icon: MapPin },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} style={{ display: 'flex', gap: 16, alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.02)' }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color="#94a3b8" />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4, fontWeight: 700, letterSpacing: 0.5 }}>{label.toUpperCase()}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{value}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Menu de configurações */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-panel" style={{ borderRadius: 24, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)', marginBottom: 24 }}>
        {[
          { icon: Bell, label: 'Notificações e Alertas' },
          { icon: Shield, label: 'Privacidade e Segurança' },
          { icon: HelpCircle, label: 'Central de Ajuda PraiaGo' },
        ].map(({ icon: Icon, label }, i) => (
          <motion.button whileHover={{ backgroundColor: 'rgba(255,255,255,0.05)' }} whileTap={{ backgroundColor: 'rgba(255,255,255,0.02)' }} key={label} style={{
            width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '20px 24px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none', textAlign: 'left',
            transition: 'background 0.2s'
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Icon size={20} color="#94a3b8" />
            </div>
            <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#f8fafc', letterSpacing: 0.5 }}>{label}</span>
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
