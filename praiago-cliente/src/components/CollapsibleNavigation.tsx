import { useRef, type RefObject } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronUp, ClipboardList, Home, MapPin, ShoppingBag, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { useCollapsibleNavigation } from '../hooks/useCollapsibleNavigation'

const destinations = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/pedidos', icon: ClipboardList, label: 'Pedidos' },
  { to: '/pedir', icon: ShoppingBag, label: 'Explorar' },
  { to: '/ambulantes', icon: MapPin, label: 'Mapa' },
  { to: '/perfil', icon: User, label: 'Perfil' },
]

export default function CollapsibleNavigation({ scrollRef }: { scrollRef: RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation()
  const navRef = useRef<HTMLElement>(null)
  const { expanded, toggle } = useCollapsibleNavigation(scrollRef, navRef, pathname)
  return (
    <div className="pg-navigation-dock" data-expanded={expanded}>
      <button
        type="button"
        className="pg-navigation-toggle"
        aria-label={expanded ? 'Recolher menu de navegação' : 'Mostrar menu de navegação'}
        aria-expanded={expanded}
        aria-controls="menu-principal"
        onClick={toggle}
      >
        {expanded ? <ChevronDown size={18} aria-hidden="true" /> : <ChevronUp size={18} aria-hidden="true" />}
        <span>{expanded ? 'Recolher' : 'Menu'}</span>
      </button>
      <nav ref={navRef} id="menu-principal" className="pg-bottom-navigation" aria-label="Navegação principal" aria-hidden={!expanded} inert={!expanded}>
        {destinations.map(({ to, icon: Icon, label }) => {
          const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
          return (
            <NavLink key={to} to={to} end={to === '/'} aria-label={label} className="pg-navigation-link" data-active={active}>
              {active && <motion.div className="pg-navigation-bubble" layoutId="navBubble" transition={{ type: 'spring', stiffness: 320, damping: 30 }} />}
              <span className="pg-navigation-label"><Icon size={21} strokeWidth={active ? 2.5 : 1.9} aria-hidden="true" /><span>{label}</span></span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
