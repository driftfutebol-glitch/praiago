import { Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Map, User, Users,
  Bell, LogOut, TrendingUp, Zap, Wifi,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { useSessao, logout } from './lib/auth'
import { useOrders, connectRealtime } from './store/useOrders'
import LoginPage        from './pages/LoginPage'
import DashboardPage    from './pages/DashboardPage'
import PedidosPage      from './pages/PedidosPage'
import CardapioPage     from './pages/CardapioPage'
import MapaPage         from './pages/MapaPage'
import EntregadoresPage from './pages/EntregadoresPage'
import PerfilPage       from './pages/PerfilPage'

const navItems = [
  { to: '/',             icon: LayoutDashboard, label: 'Painel',        badge: null },
  { to: '/pedidos',      icon: ShoppingBag,     label: 'Pedidos',       badge: null },
  { to: '/cardapio',     icon: UtensilsCrossed, label: 'Cardápio',      badge: null },
  { to: '/entregadores', icon: Users,           label: 'Entregadores',  badge: null },
  { to: '/mapa',         icon: Map,             label: 'Zonas Ao Vivo', badge: null },
  { to: '/perfil',       icon: User,            label: 'Perfil',        badge: null },
]

const PUBLIC = ['/login']

const NOTIFS = [
  { id: 1, msg: 'Novo pedido #104 — Ana Silva',  time: 'agora',  cor: '#f97316' },
  { id: 2, msg: 'Carlos chegou ao restaurante',  time: '2 min',  cor: '#0ea5e9' },
  { id: 3, msg: 'Zona Boqueirão EXPLOSIVA 🔥',   time: '5 min',  cor: '#a855f7' },
]

export default function App() {
  const location    = useLocation()
  const navigate    = useNavigate()
  const isPublic    = PUBLIC.includes(location.pathname)
  const sessao      = useSessao()
  const [aberto, setAberto]       = useState(true)
  const [notifOpen, setNotifOpen] = useState(false)

  const pedidos = useOrders(s => s.pedidos)            // referência estável
  const pedidosNovos = pedidos.filter(p => p.status === 'novo')
  const novos = pedidosNovos.length

  // Recebe pedidos do cliente em tempo real (uma vez)
  useEffect(() => { connectRealtime() }, [])

  // Notificações: pedidos novos reais + alertas do agente
  const notifs = [
    ...pedidosNovos.slice(0, 3).map(p => ({ id: p.id, msg: `Novo pedido ${p.id} — ${p.cliente}`, time: p.hora, cor: '#f97316' })),
    ...NOTIFS,
  ].slice(0, 5)

  // Proteção de rota: sem sessão, vai para o login
  if (!sessao && !isPublic) return <Navigate to="/login" replace />

  function sair() { logout(); navigate('/login') }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc', fontFamily: 'system-ui,-apple-system,sans-serif' }}>

      {/* ══ SIDEBAR ══════════════════════════════════════════ */}
      {!isPublic && (
        <aside style={{
          width: 256,
          background: 'linear-gradient(180deg,#0f172a 0%,#1a2744 100%)',
          display: 'flex', flexDirection: 'column',
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
          boxShadow: '4px 0 24px rgba(0,0,0,0.18)',
        }}>

          {/* Logo + status */}
          <div style={{ padding: '22px 18px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <svg width="40" height="40" viewBox="0 0 34 34" fill="none">
                <rect width="34" height="34" rx="10" fill="url(#app-rest-g)"/>
                <defs>
                  <linearGradient id="app-rest-g" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#f97316"/><stop offset="1" stopColor="#ea580c"/>
                  </linearGradient>
                </defs>
                <path d="M6 24 Q10 20 14 24 Q18 28 22 24 Q26 20 28 24"
                  stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
                <circle cx="23" cy="10" r="5" fill="#fbbf24"/>
                <path d="M10 30 Q11 23 13 19" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
                <path d="M13 19 Q9 15 6 16 M13 19 Q13 14 11 12 M13 19 Q17 15 17 12"
                  stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              </svg>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.5, lineHeight: 1 }}>
                  <span style={{ color: '#f97316' }}>Praia</span><span style={{ color: '#fff' }}>Go</span>
                </div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#f97316', textTransform: 'uppercase', marginTop: 2 }}>
                  Restaurante
                </div>
              </div>
            </div>

            {/* Toggle aberto/fechado */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: aberto ? 'rgba(34,197,94,0.10)' : 'rgba(100,116,139,0.10)',
              border: `1px solid ${aberto ? 'rgba(34,197,94,0.22)' : 'rgba(100,116,139,0.18)'}`,
              borderRadius: 14, padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: aberto ? '#22c55e' : '#475569',
                  boxShadow: aberto ? '0 0 0 3px rgba(34,197,94,0.25)' : 'none',
                }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: aberto ? '#22c55e' : '#64748b' }}>
                  {aberto ? 'Aberto agora' : 'Fechado'}
                </span>
              </div>
              <button onClick={() => setAberto(v => !v)} style={{
                width: 42, height: 22, borderRadius: 11,
                background: aberto ? '#22c55e' : '#334155',
                border: 'none', position: 'relative', cursor: 'pointer',
                transition: 'background 0.3s',
              }}>
                <div style={{
                  width: 16, height: 16, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: aberto ? 23 : 3,
                  transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          </div>

          {/* Navegação */}
          <nav style={{ flex: 1, padding: '14px 12px', overflowY: 'auto' }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#475569', textTransform: 'uppercase', marginBottom: 8, paddingLeft: 6, margin: '0 0 10px' }}>
              Gestão
            </p>
            {navItems.map(({ to, icon: Icon, label, badge }) => {
              const badgeVal = to === '/pedidos' ? (novos > 0 ? String(novos) : null) : badge
              return (
              <NavLink key={to} to={to} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', borderRadius: 14, marginBottom: 3,
                textDecoration: 'none',
                background: isActive ? 'linear-gradient(135deg,rgba(249,115,22,0.18),rgba(234,88,12,0.08))' : 'transparent',
                color: isActive ? '#f97316' : '#94a3b8',
                fontWeight: isActive ? 700 : 500, fontSize: 14,
                borderLeft: isActive ? '3px solid #f97316' : '3px solid transparent',
                transition: 'all 0.15s',
              })}>
                <Icon size={18} />
                <span style={{ flex: 1 }}>{label}</span>
                {badgeVal && (
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>
                    {badgeVal}
                  </span>
                )}
              </NavLink>
              )
            })}

            {/* Bloco IA */}
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#475569', textTransform: 'uppercase', margin: '20px 0 10px', paddingLeft: 6 }}>
              Inteligência IA
            </p>
            <div style={{
              background: 'linear-gradient(135deg,rgba(168,85,247,0.13),rgba(139,92,246,0.07))',
              border: '1px solid rgba(168,85,247,0.2)', borderRadius: 14, padding: '14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <Zap size={15} color="#a855f7" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#c084fc' }}>Agente Ativo</span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', marginLeft: 'auto', boxShadow: '0 0 0 2px rgba(168,85,247,0.3)' }} />
              </div>
              <p style={{ fontSize: 11, color: '#a78bfa', lineHeight: 1.5, marginBottom: 8 }}>
                Boqueirão explosiva — envie +1 entregador agora!
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={11} color="#a855f7" />
                <span style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600 }}>Pico previsto: 15h</span>
              </div>
            </div>
          </nav>

          {/* Rodapé */}
          <div style={{ padding: '12px 12px 22px', borderTop: '1px solid rgba(255,255,255,0.07)', position: 'relative' }}>
            <button onClick={() => setNotifOpen(v => !v)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 14, border: 'none',
              background: 'rgba(255,255,255,0.05)', cursor: 'pointer',
              color: '#94a3b8', fontSize: 13, fontWeight: 600, marginBottom: 6,
            }}>
              <Bell size={16} />
              <span style={{ flex: 1, textAlign: 'left' }}>Notificações</span>
              <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20 }}>{notifs.length}</span>
            </button>

            {notifOpen && (
              <div style={{
                position: 'absolute', bottom: 90, left: 12, width: 232,
                background: '#1e293b', borderRadius: 16, border: '1px solid #334155',
                boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 100,
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>Alertas recentes</span>
                </div>
                {notifs.map(n => (
                  <div key={n.id} style={{ padding: '11px 16px', borderBottom: '1px solid #0f172a', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: n.cor, flexShrink: 0, marginTop: 4 }} />
                    <div>
                      <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.4 }}>{n.msg}</div>
                      <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{n.time} atrás</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={sair} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 14, border: 'none',
              background: 'transparent', cursor: 'pointer', color: '#475569', fontSize: 13,
            }}>
              <LogOut size={15} /> Sair da conta
            </button>
          </div>
        </aside>
      )}

      {/* ══ MAIN ═════════════════════════════════════════════ */}
      <main style={{ flex: 1, marginLeft: isPublic ? 0 : 256, overflowY: 'auto', minHeight: '100vh' }}>
        {!isPublic && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 30,
            background: 'rgba(248,250,252,0.88)', backdropFilter: 'blur(12px)',
            borderBottom: '1px solid #e2e8f0', padding: '12px 32px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,0.2)' }} />
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>GPS Engine ativo · 2 entregadores online</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <Wifi size={14} color="#22c55e" />
              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>Tempo real</span>
            </div>
          </div>
        )}

        <Routes>
          <Route path="/login"         element={<LoginPage />} />
          <Route path="/"              element={<DashboardPage />} />
          <Route path="/pedidos"       element={<PedidosPage />} />
          <Route path="/cardapio"      element={<CardapioPage />} />
          <Route path="/entregadores"  element={<EntregadoresPage />} />
          <Route path="/mapa"          element={<MapaPage />} />
          <Route path="/perfil"        element={<PerfilPage />} />
        </Routes>
      </main>
    </div>
  )
}
