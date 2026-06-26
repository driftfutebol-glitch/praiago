import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Package, UtensilsCrossed, User, Zap } from 'lucide-react'

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
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430,
      background: '#fff', borderTop: '1px solid #e2e8f0',
      display: 'flex', height: 72, zIndex: 50,
      boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
    }}>
      {navItems.map(({ to, icon: Icon, label, highlight }) => {
        const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
        if (highlight) {
          return (
            <NavLink key={to} to={to} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 4,
              textDecoration: 'none', fontSize: 11, fontWeight: 500,
              color: active ? '#0ea5e9' : '#94a3b8',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: active
                  ? 'linear-gradient(135deg, #0ea5e9, #22c55e)'
                  : 'linear-gradient(135deg, #0ea5e920, #22c55e20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: -18,
                boxShadow: active ? '0 4px 20px rgba(14,165,233,0.4)' : 'none',
                border: active ? 'none' : '2px solid #e2e8f0',
              }}>
                <Icon size={20} color={active ? '#fff' : '#0ea5e9'} />
              </div>
              <span style={{ color: active ? '#0ea5e9' : '#94a3b8', fontWeight: active ? 700 : 500 }}>{label}</span>
            </NavLink>
          )
        }
        return (
          <NavLink key={to} to={to} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 4,
            color: active ? '#0ea5e9' : '#94a3b8',
            textDecoration: 'none', fontSize: 11, fontWeight: active ? 700 : 500,
          }}>
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
