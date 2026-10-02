import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Bell, LogOut, MoreHorizontal, X } from 'lucide-react'
import { mobilePrimaryPaths, restaurantNavigation } from '../lib/navigation'

type Notice = { id: string; msg: string; time: string; cor: string }

export default function MobileNavigation({ restaurantName, newOrders, notices, onLogout }: {
  restaurantName: string
  newOrders: number
  notices: Notice[]
  onLogout: () => void
}) {
  const { pathname } = useLocation()
  const dialog = useRef<HTMLDialogElement>(null)
  const currentPage = restaurantNavigation.find(item => item.to === pathname)?.label || 'Restaurante'
  const moreActive = !mobilePrimaryPaths.includes(pathname)

  useEffect(() => {
    dialog.current?.close()
  }, [pathname])

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const closeOnDesktop = () => { if (media.matches) dialog.current?.close() }
    media.addEventListener('change', closeOnDesktop)
    return () => media.removeEventListener('change', closeOnDesktop)
  }, [])

  return (
    <>
      <header className="restaurant-mobile-header">
        <div className="restaurant-mobile-brand"><img src="/praiago-logo-transparent.png" alt="PraiaGo" /></div>
        <div className="restaurant-mobile-heading">
          <span>{restaurantName}</span>
          <strong>{currentPage}</strong>
        </div>
        <div id="restaurant-mobile-verification" className="restaurant-mobile-verification" />
        <button type="button" className="restaurant-mobile-notices" aria-label={`Notificações, ${notices.length} avisos`} onClick={() => dialog.current?.showModal()}>
          <Bell size={20} />
          {notices.length > 0 && <span className="restaurant-mobile-badge">{notices.length}</span>}
        </button>
      </header>

      <nav className="restaurant-mobile-nav" aria-label="Navegação principal">
        {mobilePrimaryPaths.map(path => {
          const item = restaurantNavigation.find(entry => entry.to === path)!
          const Icon = item.icon
          return (
            <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `restaurant-mobile-link${isActive ? ' is-active' : ''}`}>
              <span className="restaurant-mobile-icon"><Icon size={21} />{path === '/pedidos' && newOrders > 0 && <span className="restaurant-mobile-badge">{newOrders > 99 ? '99+' : newOrders}</span>}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}
        <button type="button" className={`restaurant-mobile-link${moreActive ? ' is-active' : ''}`} aria-haspopup="dialog" aria-controls="restaurant-mobile-menu" onClick={() => dialog.current?.showModal()}>
          <MoreHorizontal size={23} /><span>Mais</span>
        </button>
      </nav>

      {/* Dialog nativo: foco contido, Escape e fundo inerte sem esconder rotas. */}
      <dialog ref={dialog} id="restaurant-mobile-menu" className="restaurant-mobile-menu" aria-labelledby="restaurant-mobile-menu-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close() }}>
        <div className="restaurant-mobile-menu-content">
          <div className="restaurant-mobile-menu-title">
            <div><h2 id="restaurant-mobile-menu-title">Sua loja, na mão</h2><p>Todas as áreas do restaurante</p></div>
            <button type="button" autoFocus aria-label="Fechar menu" onClick={() => dialog.current?.close()}><X size={21} /></button>
          </div>
          <nav className="restaurant-mobile-menu-grid" aria-label="Todas as áreas">
            {restaurantNavigation.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={() => dialog.current?.close()} className={({ isActive }) => isActive ? 'is-active' : ''}>
                <Icon size={22} /><span>{label}</span>{to === '/pedidos' && newOrders > 0 && <span className="restaurant-menu-count">{newOrders}</span>}
              </NavLink>
            ))}
          </nav>
          <section className="restaurant-mobile-menu-notices" aria-label="Notificações">
            <h3><Bell size={16} /> Notificações</h3>
            {notices.length === 0 ? <p>Nenhum aviso novo no momento.</p> : notices.map(notice => <p key={notice.id}>{notice.msg}</p>)}
          </section>
          <button type="button" className="restaurant-mobile-logout" onClick={onLogout}><LogOut size={18} /> Sair da conta</button>
        </div>
      </dialog>
    </>
  )
}
