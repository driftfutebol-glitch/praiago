import { Routes, Route, useLocation, Navigate } from 'react-router-dom'
import { useSessao } from './lib/auth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PedidosPage from './pages/PedidosPage'
import CardapioPage from './pages/CardapioPage'
import PerfilPage from './pages/PerfilPage'
import ZonasPage from './pages/ZonasPage'
import BottomNav from './components/BottomNav'
import { useGPS } from './hooks/useGPS'

const PUBLIC_ROUTES = ['/login', '/cadastro']

// Logo do PraiaGo
function LogoBar({ gpsStatus }: { gpsStatus: string }) {
  const isActive = gpsStatus === 'active'
  const isError = gpsStatus === 'error'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 20px',
      background: '#fff',
      borderBottom: '1px solid #e2e8f0',
      position: 'sticky', top: 0, zIndex: 60,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
          <rect width="34" height="34" rx="10" fill="url(#amb-g)"/>
          <defs>
            <linearGradient id="amb-g" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
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
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#94a3b8', textTransform: 'uppercase' }}>Ambulante</div>
        </div>
      </div>

      {/* GPS badge */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        background: isActive ? '#f0fdf4' : isError ? '#fef2f2' : '#f8fafc',
        border: `1px solid ${isActive ? '#bbf7d0' : isError ? '#fecaca' : '#e2e8f0'}`,
        borderRadius: 20, padding: '5px 12px',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isActive ? '#22c55e' : isError ? '#ef4444' : '#94a3b8',
          boxShadow: isActive ? '0 0 0 2px rgba(34,197,94,0.3)' : 'none',
        }} />
        <span style={{
          fontSize: 11, fontWeight: 700,
          color: isActive ? '#16a34a' : isError ? '#ef4444' : '#94a3b8',
        }}>
          {isActive ? 'GPS Ativo' : isError ? 'GPS Erro' : 'GPS...'}
        </span>
      </div>
    </div>
  )
}

export default function App() {
  const location = useLocation()
  const isPublic = PUBLIC_ROUTES.includes(location.pathname)
  const sessao = useSessao()

  // GPS ativo em todo o app — transmite posição em tempo real
  const { status: gpsStatus } = useGPS()

  // Proteção de rota: sem sessão, vai para o login
  if (!sessao && !isPublic) return <Navigate to="/login" replace />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f1f5f9' }}>
      {!isPublic && <LogoBar gpsStatus={gpsStatus} />}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: isPublic ? 0 : '72px' }}>
        <Routes>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/"         element={<DashboardPage />} />
          <Route path="/pedidos"  element={<PedidosPage />} />
          <Route path="/cardapio" element={<CardapioPage />} />
          <Route path="/zonas"    element={<ZonasPage />} />
          <Route path="/perfil"   element={<PerfilPage />} />
        </Routes>
      </main>
      {!isPublic && <BottomNav />}
    </div>
  )
}
