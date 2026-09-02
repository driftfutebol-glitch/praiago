import { Routes, Route, NavLink, useLocation, useNavigate, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, ShoppingBag, UtensilsCrossed, Map, User, Users,
  Bell, LogOut, TrendingUp, Zap, Wifi,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSessao, logout, getSessao } from './lib/auth'
import { supabase } from './lib/supabase'
import { useOrders, connectRealtime } from './store/useOrders'
import LoginPage        from './pages/LoginPage'
import DashboardPage    from './pages/DashboardPage'
import PedidosPage      from './pages/PedidosPage'
import VendasPage       from './pages/VendasPage'
import CardapioPage     from './pages/CardapioPage'
import MapaPage         from './pages/MapaPage'
import EntregadoresPage from './pages/EntregadoresPage'
import PerfilPage       from './pages/PerfilPage'
import CarteiraPage     from './pages/CarteiraPage'
import VerificationBar  from './components/VerificationBar'
import AiChatbot        from './components/AiChatbot'
import ChamadoKycPanel  from './components/ChamadoKycPanel'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import { DialogHost } from './lib/dialog'

const navItems = [
  { to: '/',             icon: LayoutDashboard, label: 'Painel',        badge: null },
  { to: '/pedidos',      icon: ShoppingBag,     label: 'Pedidos',       badge: null },
  { to: '/vendas',       icon: TrendingUp,      label: 'Vendas',        badge: null },
  { to: '/cardapio',     icon: UtensilsCrossed, label: 'Cardápio',      badge: null },
  { to: '/entregadores', icon: Users,           label: 'Entregadores',  badge: null },
  { to: '/mapa',         icon: Map,             label: 'Zonas Ao Vivo', badge: null },
  { to: '/perfil',       icon: User,            label: 'Perfil',        badge: null },
]

const PUBLIC = ['/login']

const NOTIFS: any[] = []

type LocationNotice = {
  id: string
  status: 'aprovada' | 'rejeitada'
  observacao_admin: string | null
  autorizado_ate: string | null
  updated_at: string
}

function playAvisoSound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    const now = ctx.currentTime
    ;[659, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.15 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.15 + 0.14)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.15)
      osc.stop(now + i * 0.15 + 0.16)
    })
    setTimeout(() => ctx.close(), 700)
  } catch {
    // Audio pode ficar bloqueado ate o primeiro toque do usuario.
  }
}

function GlobalAvisoToast({ locationNotice }: { locationNotice: LocationNotice | null }) {
  const [aviso, setAviso] = useState<{ id?: string; titulo?: string; mensagem?: string; cupom_codigo?: string | null } | null>(null)

  useEffect(() => {
    const sessao = getSessao()

    const mostrar = (row: { id?: string; titulo?: string; mensagem?: string; cupom_codigo?: string | null }) => {
      setAviso(row)
      playAvisoSound()
      window.setTimeout(() => setAviso(current => current?.id === row.id ? null : current), 8000)
    }

    const channel = supabase
      .channel('avisos_restaurante')
      // Broadcast da equipe: promocao, comunicado.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos' }, payload => {
        const row = payload.new as { id?: string; titulo?: string; mensagem?: string; publico?: string; cupom_codigo?: string | null }
        if (row.publico && row.publico !== 'restaurantes' && row.publico !== 'todos') return
        mostrar(row)
      })
      .subscribe()

    // Aviso dirigido a ESTE vendedor: link de verificacao chegou, cadastro
    // aprovado, cadastro recusado. Existia so no ambulante — o restaurante
    // abria chamado e nunca era avisado da resposta.
    //
    // Canal separado porque leva filtro por vendedor_id; junto no de cima, o
    // filtro valeria para os dois e o broadcast pararia de chegar.
    let pessoal: ReturnType<typeof supabase.channel> | null = null
    if (sessao?.id) {
      pessoal = supabase
        .channel(`notif_vendedor_${sessao.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notificacoes_vendedor', filter: `vendedor_id=eq.${sessao.id}` },
          payload => mostrar(payload.new as { id?: string; titulo?: string; mensagem?: string }),
        )
        .subscribe()
    }

    return () => {
      supabase.removeChannel(channel)
      if (pessoal) supabase.removeChannel(pessoal)
    }
  }, [])

  useEffect(() => {
    if (!locationNotice) return
    const aprovado = locationNotice.status === 'aprovada'
    const row = {
      id: `local-${locationNotice.id}-${locationNotice.updated_at}`,
      titulo: aprovado ? 'Correcao de localizacao autorizada' : 'Solicitacao de localizacao revisada',
      mensagem: aprovado
        ? 'Acesse Perfil, va ate o restaurante e grave o novo ponto fixo.'
        : (locationNotice.observacao_admin || 'A solicitacao nao foi autorizada. Confira o motivo no Perfil.'),
    }
    setAviso(row)
    playAvisoSound()
    const timer = window.setTimeout(() => setAviso(current => current?.id === row.id ? null : current), 10000)
    return () => window.clearTimeout(timer)
  }, [locationNotice])

  if (!aviso) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.96 }}
      style={{
        position: 'fixed',
        right: 28,
        bottom: 28,
        zIndex: 9999,
        width: 360,
        maxWidth: 'calc(100vw - 32px)',
        background: '#ffffff',
        border: '1px solid rgba(249,115,22,0.24)',
        borderRadius: 18,
        boxShadow: '0 18px 45px rgba(15,23,42,0.22)',
        padding: 14,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 14, background: 'linear-gradient(135deg,#f97316,#ea580c)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>!</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 900 }}>{aviso.titulo || 'Aviso PraiaGo'}</div>
        <div style={{ fontSize: 12, color: '#475569', fontWeight: 650, lineHeight: 1.35, marginTop: 3 }}>
          {aviso.mensagem}{aviso.cupom_codigo ? ` - Cupom ${aviso.cupom_codigo}` : ''}
        </div>
      </div>
      <button onClick={() => setAviso(null)} style={{ border: 0, borderRadius: 12, background: '#f1f5f9', color: '#64748b', width: 32, height: 32, cursor: 'pointer' }}>x</button>
    </motion.div>
  )
}

// Tela de espera da verificação.
//
// Ela substitui todas as rotas e o menu lateral some junto, então quem cai
// aqui não tem para onde ir. No app do ambulante isso rendeu reprovação da
// Apple em 31/08/2026 — o revisor criou conta, parou nesta tela e ficou
// preso. Aqui a parede é a mesma, então a saída também é.
function KycLockedPanel() {
  const navigate = useNavigate()

  function sair() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ padding: 32 }}>
      <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 18, padding: 20, maxWidth: 760, margin: '0 auto' }}>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#92400e', marginBottom: 8 }}>Verificação em análise</div>
        <p style={{ margin: 0, color: '#92400e', fontSize: 14, lineHeight: 1.55, fontWeight: 600 }}>
          Para o restaurante vender pelo PraiaGo a gente precisa confirmar o
          negócio. Envie o nome do responsável, CPF, CNPJ, documento com foto,
          selfie e a comprovação do endereço no bloco acima. Enquanto a análise
          não termina, o restaurante não aparece no mapa e não consegue
          cadastrar produtos.
        </p>
      </div>

      <div style={{ maxWidth: 760, margin: '16px auto 0' }}>
        <button
          type="button"
          onClick={sair}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 14,
            border: '1px solid #cbd5e1', background: '#fff', color: '#334155',
            fontSize: 14.5, fontWeight: 800, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <LogOut size={17} /> Sair da conta
        </button>
        <div style={{ marginTop: 8, textAlign: 'center', fontSize: 12.5, color: '#64748b', fontWeight: 600 }}>
          Quer entrar com outra conta? Saia por aqui.
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const location    = useLocation()
  const navigate    = useNavigate()
  const isPublic    = PUBLIC.includes(location.pathname)
  const sessao      = useSessao()
  const [aberto, setAberto]       = useState(true)
  const [notifOpen, setNotifOpen] = useState(false)
  const [kycLocked, setKycLocked] = useState(false)
  const [locationNotice, setLocationNotice] = useState<LocationNotice | null>(null)

  const pedidos = useOrders(s => s.pedidos)            // referência estável
  const pedidosNovos = pedidos.filter(p => p.status === 'novo')
  const novos = pedidosNovos.length

  // Recebe pedidos do cliente em tempo real (uma vez)
  useEffect(() => { connectRealtime() }, [])

  useEffect(() => {
    if (!sessao?.id || isPublic) return

    let ativo = true
    const bloquearAcessoInvalido = (perfil?: { status?: string; role?: string; ban_motivo?: string | null; verificado?: boolean | null } | null, userId?: string) => {
      if (!ativo) return
      if (perfil?.status !== 'banido' && perfil?.role === 'restaurante' && userId === sessao.id) return
      logout()
      supabase.auth.signOut()
      navigate('/login', { replace: true })
    }
    const atualizarGate = (perfil?: { status?: string; role?: string; ban_motivo?: string | null; verificado?: boolean | null } | null, userId = sessao.id) => {
      if (!ativo) return
      bloquearAcessoInvalido(perfil, userId)
      setKycLocked(perfil?.status !== 'banido' && perfil?.verificado !== true)
    }

    // Só derruba a sessão quando o servidor RESPONDE que ela não vale.
    //
    // Antes, "não consegui falar com o servidor" caía no mesmo
    // `bloquearAcessoInvalido` que a resposta de conta banida — e uma queda
    // de rede de um segundo deslogava o restaurante no meio do expediente.
    //
    // Erro de rede agora não conclui nada. O bloqueio continua funcionando,
    // porque para bloquear o servidor precisa responder.
    // Conta APAGADA chega como erro do Supabase ("User from sub claim in JWT
    // does not exist"), nao como usuario nulo — entao caia no mesmo `return`
    // da falha de rede e o aparelho ficava logado para sempre numa conta que
    // nao existe mais. A separacao e o codigo HTTP: 4xx e o servidor dizendo
    // que o token nao vale; sem codigo e a rede que nao chegou la.
    const respostaNegativa = (erro: unknown) => {
      const status = (erro as { status?: number } | null)?.status
      return typeof status === 'number' && status >= 400 && status < 500
    }

    const checarStatus = async () => {
      const { data: authData, error: erroAuth } = await supabase.auth.getUser()
      if (erroAuth) {
        if (respostaNegativa(erroAuth)) bloquearAcessoInvalido(null, undefined)
        return
      }
      if (!authData.user) {
        bloquearAcessoInvalido(null, undefined)
        return
      }
      const { data, error: erroPerfil } = await supabase
        .from('profiles')
        .select('status,role,ban_motivo,verificado')
        .eq('id', sessao.id)
        .maybeSingle()
      if (erroPerfil) return
      // Sessao valida e nenhuma linha: o perfil foi apagado.
      if (!data) {
        bloquearAcessoInvalido(null, undefined)
        return
      }
      atualizarGate(data, authData.user.id)
    }
    checarStatus()
    const channel = supabase.channel(`restaurante_kyc_gate_${sessao.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, payload => atualizarGate(payload.new as { status?: string; role?: string; ban_motivo?: string | null; verificado?: boolean | null }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes', filter: `user_id=eq.${sessao.id}` }, () => checarStatus())
      .subscribe()
    // 10s era herança de quando isso derrubava a sessão. O realtime logo
    // acima já avisa da mudança no perfil no instante em que ela acontece;
    // esta ronda é rede de segurança, não precisa acordar o aparelho o dia
    // inteiro.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') checarStatus()
    }, 300000)

    return () => {
      ativo = false
      supabase.removeChannel(channel)
      window.clearInterval(timer)
    }
  }, [sessao?.id, isPublic, navigate])

  useEffect(() => {
    if (!sessao?.id || isPublic) {
      setLocationNotice(null)
      return
    }

    let ativo = true
    supabase
      .from('solicitacoes_correcao_localizacao')
      .select('id,status,observacao_admin,autorizado_ate,updated_at')
      .eq('restaurante_id', sessao.id)
      .in('status', ['aprovada', 'rejeitada'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo) setLocationNotice((data as LocationNotice | null) ?? null)
      })

    const channel = supabase
      .channel(`correcao_local_aviso_${sessao.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'solicitacoes_correcao_localizacao',
        filter: `restaurante_id=eq.${sessao.id}`,
      }, payload => {
        const row = payload.new as LocationNotice & { status: string }
        setLocationNotice(row.status === 'aprovada' || row.status === 'rejeitada'
          ? row as LocationNotice
          : null)
      })
      .subscribe()

    return () => {
      ativo = false
      supabase.removeChannel(channel)
    }
  }, [sessao?.id, isPublic])

  // Notificacoes: pedidos novos reais + alertas operacionais
  const notifs = [
    ...(locationNotice ? [{
      id: `local-${locationNotice.id}`,
      msg: locationNotice.status === 'aprovada'
        ? 'Correcao de localizacao autorizada. Abra o Perfil para gravar o novo ponto.'
        : `Correcao de localizacao nao autorizada${locationNotice.observacao_admin ? `: ${locationNotice.observacao_admin}` : '.'}`,
      time: 'instantes',
      cor: locationNotice.status === 'aprovada' ? '#16a34a' : '#ef4444',
    }] : []),
    ...pedidosNovos.slice(0, 3).map(p => ({ id: p.id, msg: `Novo pedido ${p.id} — ${p.cliente}`, time: p.hora, cor: '#f97316' })),
    ...NOTIFS,
  ].slice(0, 5)

  // Proteção de rota: sem sessão, vai para o login
  if (!sessao && !isPublic) return <Navigate to="/login" replace />

  function sair() { logout(); navigate('/login') }

  return (
    <div className="restaurant-shell" style={{ display: 'flex', minHeight: '100vh', fontFamily: 'system-ui,-apple-system,sans-serif' }}>
      <PasswordRecoveryHandler />

      {/* ══ SIDEBAR ══════════════════════════════════════════ */}
      {!isPublic && !kycLocked && (
        <aside className="restaurant-sidebar" style={{
          width: 256,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)',
          display: 'flex', flexDirection: 'column',
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 40,
          borderRight: '1px solid rgba(0,0,0,0.05)',
          boxShadow: '4px 0 24px rgba(0,0,0,0.4)',
        }}>

          {/* Logo + status */}
          <div className="restaurant-sidebar-header" style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
            {/* Logo — mesma marca e mesmo recorte do app do cliente.
                O PNG e quadrado (1600x1600) com muita margem: a caixa de
                140x59 recorta so o brasao, por isso a imagem e maior que ela. */}
            <div style={{ marginBottom: 18 }}>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                aria-label="PraiaGo"
                style={{ width: 140, height: 59, overflow: 'hidden', position: 'relative', flexShrink: 0 }}
              >
                <img
                  src="/praiago-logo-transparent.png"
                  alt="PraiaGo"
                  style={{
                    position: 'absolute', width: 231, height: 231, maxWidth: 'none',
                    left: -56, top: -67, display: 'block',
                  }}
                />
              </motion.div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2.5, color: '#f97316', textTransform: 'uppercase', marginTop: 2 }}>
                Restaurante
              </div>
            </div>

            {/* Toggle aberto/fechado */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: aberto ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${aberto ? 'rgba(34,197,94,0.3)' : 'rgba(0,0,0,0.05)'}`,
              borderRadius: 14, padding: '12px 16px',
              transition: 'all 0.3s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className={aberto ? 'animate-pulse-neon' : ''} style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: aberto ? '#4ade80' : '#64748b',
                  boxShadow: aberto ? '0 0 10px #4ade80' : 'none',
                }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: aberto ? '#4ade80' : '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {aberto ? 'Aberto' : 'Fechado'}
                </span>
              </div>
              <button onClick={() => setAberto(v => !v)} style={{
                width: 46, height: 24, borderRadius: 12,
                background: aberto ? '#22c55e' : '#334155',
                border: 'none', position: 'relative', cursor: 'pointer',
                transition: 'background 0.3s',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3, left: aberto ? 25 : 3,
                  transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>
          </div>

          {/* Navegação */}
          <nav className="restaurant-sidebar-nav" style={{ flex: 1, padding: '20px 14px', overflowY: 'auto' }}>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: '#64748b', textTransform: 'uppercase', marginBottom: 12, paddingLeft: 10 }}>
              Gestão
            </p>
            {navItems.map(({ to, icon: Icon, label, badge }) => {
              const badgeVal = to === '/pedidos' ? (novos > 0 ? String(novos) : null) : badge
              return (
                <NavLink className="restaurant-nav-link" key={to} to={to} style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', borderRadius: 14, marginBottom: 6,
                  textDecoration: 'none',
                  background: isActive ? 'linear-gradient(135deg, rgba(249,115,22,0.15), rgba(234,88,12,0.05))' : 'transparent',
                  color: isActive ? '#f97316' : '#94a3b8',
                  fontWeight: isActive ? 800 : 600, fontSize: 14,
                  borderLeft: isActive ? '3px solid #f97316' : '3px solid transparent',
                  transition: 'all 0.2s',
                  boxShadow: isActive ? 'inset 0 0 20px rgba(249,115,22,0.05)' : 'none'
                })}>
                  <Icon size={18} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {badgeVal && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 20, boxShadow: '0 0 10px rgba(239,68,68,0.5)' }}>
                      {badgeVal}
                    </motion.span>
                  )}
                </NavLink>
              )
            })}

            {/* Radar da praia */}
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: '#64748b', textTransform: 'uppercase', margin: '24px 0 12px', paddingLeft: 10 }}>
              Radar da Praia
            </p>
            <div className="glass-panel restaurant-radar-card" style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.1), rgba(139,92,246,0.05))',
              border: '1px solid rgba(168,85,247,0.3)', borderRadius: 16, padding: '16px',
              position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, background: '#a855f7', opacity: 0.2, filter: 'blur(20px)', borderRadius: '50%' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, position: 'relative', zIndex: 1 }}>
                <Zap size={16} color="#c084fc" />
                <span style={{ fontSize: 12, fontWeight: 900, color: '#c084fc', letterSpacing: 0.5, textTransform: 'uppercase' }}>Radar Ativo</span>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', marginLeft: 'auto', boxShadow: '0 0 10px #c084fc' }} className="animate-pulse-neon" />
              </div>
              <p style={{ fontSize: 13, color: '#7e22ce', lineHeight: 1.5, marginBottom: 10, fontWeight: 500, position: 'relative', zIndex: 1 }}>
                Acompanhe o movimento das zonas da praia no mapa.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', zIndex: 1 }}>
                <TrendingUp size={14} color="#a855f7" />
                <span style={{ fontSize: 11, color: '#9333ea', fontWeight: 800 }}>ATUALIZAÇÃO EM TEMPO REAL</span>
              </div>
            </div>
          </nav>

          {/* Rodapé */}
          <div className="restaurant-sidebar-footer" style={{ padding: '16px', borderTop: '1px solid rgba(0,0,0,0.05)', position: 'relative' }}>
            <button onClick={() => setNotifOpen(v => !v)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 14, border: '1px solid rgba(0,0,0,0.05)',
              background: 'rgba(255,255,255,0.02)', cursor: 'pointer',
              color: '#334155', fontSize: 14, fontWeight: 700, marginBottom: 8,
              transition: 'background 0.2s'
            }}>
              <Bell size={18} />
              <span style={{ flex: 1, textAlign: 'left' }}>Notificações</span>
              <span style={{ background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 900, padding: '2px 8px', borderRadius: 20, boxShadow: '0 0 10px rgba(239,68,68,0.5)' }}>{notifs.length}</span>
            </button>

            <AnimatePresence>
              {notifOpen && (
                <motion.div initial={{ opacity: 0, y: 10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.95 }} style={{
                  position: 'absolute', bottom: 100, left: 16, width: 232,
                  background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 100,
                }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 }}>Notificações</span>
                  </div>
                  {notifs.map(n => (
                    <div key={n.id} style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.02)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: n.cor, flexShrink: 0, marginTop: 4, boxShadow: `0 0 8px ${n.cor}` }} />
                      <div>
                        <div style={{ fontSize: 12, color: '#0f172a', lineHeight: 1.4, fontWeight: 500 }}>{n.msg}</div>
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 4, fontWeight: 700 }}>{n.time} atrás</div>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            <button onClick={sair} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 16px', borderRadius: 14, border: 'none',
              background: 'transparent', cursor: 'pointer', color: '#64748b', fontSize: 13, fontWeight: 700,
              transition: 'color 0.2s'
            }} onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'} onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}>
              <LogOut size={16} /> Desconectar Terminal
            </button>
          </div>
        </aside>
      )}

      {/* ══ MAIN ═════════════════════════════════════════════ */}
      <main className="restaurant-main" style={{ flex: 1, marginLeft: isPublic || kycLocked ? 0 : 256, overflowY: 'auto', minHeight: '100vh', position: 'relative' }}>
        <AnimatePresence mode="wait">
          {!isPublic && !kycLocked && (
            <motion.div className="restaurant-topbar" initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{
              position: 'sticky', top: 0, zIndex: 30,
              background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)',
              borderBottom: '1px solid rgba(0,0,0,0.05)', padding: '14px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className="animate-pulse-neon" style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 10px #4ade80' }} />
                <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Base do restaurante ativa</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.1)', padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(34,197,94,0.2)' }}>
                <Wifi size={14} color="#4ade80" />
                <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Sinal Estável</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            className="restaurant-route-frame"
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{ height: isPublic ? '100vh' : 'calc(100vh - 60px)' }}
          >
            {!isPublic && <VerificationBar />}
            {!isPublic && kycLocked ? (
              <KycLockedPanel />
            ) : (
              <Routes location={location}>
                <Route path="/login"         element={<LoginPage />} />
                <Route path="/"              element={<DashboardPage />} />
                <Route path="/pedidos"       element={<PedidosPage />} />
                <Route path="/vendas"        element={<VendasPage />} />
                <Route path="/cardapio"      element={<CardapioPage />} />
                <Route path="/entregadores"  element={<EntregadoresPage />} />
                <Route path="/mapa"          element={<MapaPage />} />
                <Route path="/perfil"        element={<PerfilPage />} />
                <Route path="/carteira"      element={<CarteiraPage />} />
              </Routes>
            )}
          </motion.div>
        </AnimatePresence>
        {!isPublic && !kycLocked && <AiChatbot plataforma="restaurante" />}
        {!isPublic && (
          <AnimatePresence>
            <GlobalAvisoToast locationNotice={locationNotice} />
          </AnimatePresence>
        )}
      </main>
      {/* Fora da trava do kycLocked de proposito: o chamado de verificacao e
          exatamente o que tira o vendedor dessa trava. Esconde-lo ali seria
          trancar a porta e guardar a chave do lado de dentro. */}
      {!isPublic && <ChamadoKycPanel />}
      <DialogHost />
    </div>
  )
}
