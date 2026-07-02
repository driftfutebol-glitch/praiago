import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Package, UtensilsCrossed, User, Zap } from 'lucide-react'
import { motion } from 'framer-motion'

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Painel'   },
  { to: '/pedidos',  icon: Package,         label: 'Pedidos'  },
  { to: '/zonas',    icon: Zap,             label: 'Zonas',   highlight: true },
  { to: '/cardapio', icon: UtensilsCrossed, label: 'Cardápio' },
  { to: '/perfil',   icon: User,            label: 'Perfil'   },
]

export default function BottomNav() {
  const location = useLocation()
  return (
    <nav style={{
      position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 400,
      zIndex: 50,
    }}>
      <div className="glass-panel" style={{
        display: 'flex', height: 64, borderRadius: 24,
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
        border: '1px solid rgba(0,0,0,0.05)',
        position: 'relative'
      }}>
        {navItems.map(({ to, icon: Icon, label, highlight }) => {
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          
          if (highlight) {
            return (
              <NavLink key={to} to={to} style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
                textDecoration: 'none', position: 'relative',
              }}>
                <motion.div whileTap={{ scale: 0.9 }} style={{
                  width: 50, height: 50, borderRadius: '50%',
                  background: active ? 'linear-gradient(135deg, #0ea5e9, #22c55e)' : '#1e293b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: -24,
                  boxShadow: active ? '0 8px 25px rgba(34,197,94,0.4)' : '0 4px 15px rgba(0,0,0,0.5)',
                  border: active ? 'none' : '2px solid rgba(0,0,0,0.08)',
                  position: 'relative'
                }}>
                  {active && (
                    <motion.div
                      layoutId="navGlowHighlight"
                      style={{
                        position: 'absolute', inset: -4, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
                        filter: 'blur(8px)', opacity: 0.6, zIndex: -1
                      }}
                    />
                  )}
                  <Icon size={24} color={active ? '#fff' : '#4ade80'} />
                </motion.div>
                <span style={{ color: active ? '#4ade80' : '#94a3b8', fontWeight: active ? 800 : 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
              </NavLink>
            )
          }

          return (
            <NavLink key={to} to={to} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              color: active ? '#38bdf8' : '#64748b',
              textDecoration: 'none', position: 'relative'
            }}>
              {active && (
                <motion.div
                  layoutId="navIndicatorAmb"
                  style={{
                    position: 'absolute', top: -1, width: 24, height: 3,
                    background: '#38bdf8', borderRadius: '0 0 4px 4px',
                    boxShadow: '0 2px 10px #38bdf8'
                  }}
                />
              )}
              <motion.div whileTap={{ scale: 0.8 }}>
                <Icon size={22} color={active ? '#38bdf8' : '#64748b'} />
              </motion.div>
              <span style={{ fontSize: 10, fontWeight: active ? 800 : 600 }}>{label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
