import { LayoutDashboard, MapPinned, Package, Store, UserRound } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Painel' },
  { to: '/pedidos', icon: Package, label: 'Pedidos' },
  { to: '/zonas', icon: MapPinned, label: 'Mapa' },
  { to: '/cardapio', icon: Store, label: 'Produtos' },
  { to: '/perfil', icon: UserRound, label: 'Perfil' },
]

export default function BottomNav() {
  const location = useLocation()

  return (
    <nav
      aria-label="Navegacao principal"
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'max(10px, env(safe-area-inset-bottom))',
        zIndex: 80,
        maxWidth: 470,
        margin: '0 auto',
      }}
    >
      <div style={{
        height: 70,
        display: 'grid',
        gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
        padding: 6,
        border: '1px solid rgba(215,224,233,0.96)',
        borderRadius: 18,
        background: 'rgba(255,255,255,0.96)',
        boxShadow: 'var(--shadow-toolbar)',
        backdropFilter: 'blur(18px)',
      }}>
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              style={{
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                borderRadius: 12,
                background: active ? '#e9f7f7' : 'transparent',
                color: active ? '#087f92' : '#6a788e',
                textDecoration: 'none',
                transition: 'background 180ms ease, color 180ms ease',
              }}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              <span style={{
                maxWidth: '100%',
                overflow: 'hidden',
                fontSize: 10,
                lineHeight: 1,
                fontWeight: active ? 850 : 700,
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {label}
              </span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
