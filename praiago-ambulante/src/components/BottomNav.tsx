import { LayoutDashboard, MapPinned, Package, Store, UserRound } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Painel' },
  { to: '/pedidos', icon: Package, label: 'Pedidos' },
  { to: '/zonas', icon: MapPinned, label: 'Mapa' },
  { to: '/cardapio', icon: Store, label: 'Cardápio' },
  { to: '/perfil', icon: UserRound, label: 'Perfil' },
]

export default function BottomNav() {
  const location = useLocation()

  return (
    <nav
      className="ambulante-nav"
      aria-label="Navegacao principal"
      // `translateZ(0)` + `willChange` prendem a barra na propria camada de
      // composicao. Sem isso ela some no iPhone ao rolar tela longa com muitas
      // imagens: o WKWebView para de repintar a camada fixa e ela fica em
      // branco. Aconteceu no app do cliente, na tela de Eventos, e aqui o
      // padrao era o mesmo.
    >
      <div className="ambulante-nav-grid">
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className={`ambulante-nav-link${active ? ' is-active' : ''}`}
            >
              <Icon size={21} strokeWidth={active ? 2.4 : 2} />
              <span>{label}</span>
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
