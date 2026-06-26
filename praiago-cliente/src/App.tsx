import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { Home, ClipboardList, ShoppingBag, Calendar, User } from 'lucide-react'
import HomePage from './pages/HomePage'
import MeusPedidosPage from './pages/MeusPedidosPage'
import PedirPage from './pages/PedirPage'
import EventosPage from './pages/EventosPage'
import PerfilPage from './pages/PerfilPage'

const navItems = [
  { to: '/',        icon: Home,          label: 'Início'  },
  { to: '/pedidos', icon: ClipboardList, label: 'Pedidos' },
  { to: '/pedir',   icon: ShoppingBag,   label: 'Pedir'   },
  { to: '/eventos', icon: Calendar,      label: 'Eventos' },
  { to: '/perfil',  icon: User,          label: 'Perfil'  },
]

export default function App() {
  const location = useLocation()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0f172a' }}>
      {/* Logo bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 20px', background: '#0f172a', borderBottom: '1px solid #1e293b',
        position: 'sticky', top: 0, zIndex: 60,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="32" height="32" viewBox="0 0 34 34" fill="none">
            <rect width="34" height="34" rx="9" fill="url(#cli-logo)"/>
            <defs>
              <linearGradient id="cli-logo" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
                <stop stopColor="#0ea5e9"/>
                <stop offset="1" stopColor="#22c55e"/>
              </linearGradient>
            </defs>
            <path d="M6 24 Q10 20 14 24 Q18 28 22 24 Q26 20 28 24" stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
            <circle cx="23" cy="10" r="5" fill="#fbbf24"/>
            <path d="M10 30 Q11 23 13 19" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <path d="M13 19 Q9 15 6 16 M13 19 Q13 14 11 12 M13 19 Q17 15 17 12" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
          </svg>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
              <span style={{ color: '#0ea5e9' }}>Praia</span><span style={{ color: '#22c55e' }}>Go</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#475569', textTransform: 'uppercase' }}>Praia Grande · SP</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)' }} />
          Na praia agora 🏖️
        </div>
      </div>

      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: '72px' }}>
        <Routes>
          <Route path="/"        element={<HomePage />} />
          <Route path="/pedidos" element={<MeusPedidosPage />} />
          <Route path="/pedir"   element={<PedirPage />} />
          <Route path="/eventos" element={<EventosPage />} />
          <Route path="/perfil"  element={<PerfilPage />} />
        </Routes>
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: '430px',
        background: '#1e293b', borderTop: '1px solid #334155',
        display: 'flex', height: '72px', zIndex: 50,
      }}>
        {navItems.map(({ to, icon: Icon, label }) => {
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)
          return (
            <NavLink key={to} to={to} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '4px',
              color: active ? '#22c55e' : '#64748b',
              textDecoration: 'none', fontSize: '11px', fontWeight: active ? 700 : 500,
            }}>
              {to === '/pedir' ? (
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #0ea5e9, #22c55e)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: '-20px', boxShadow: '0 4px 20px rgba(34,197,94,0.4)',
                }}>
                  <Icon size={22} color="#fff" />
                </div>
              ) : (
                <Icon size={22} />
              )}
              <span>{label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
