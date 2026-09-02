import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { lazy, Suspense, useEffect, useState } from 'react'
import { LoaderCircle, LocateFixed, LogOut } from 'lucide-react'
import { getSessao, logout, setContaDemo, useSessao } from './lib/auth'
import { supabase } from './lib/supabase'
import BottomNav from './components/BottomNav'
import ChamadoKycPanel from './components/ChamadoKycPanel'
import VerificationBar from './components/VerificationBar'
import { DialogHost } from './lib/dialog'
import AiChatbot from './components/AiChatbot'
import PasswordRecoveryHandler from './components/PasswordRecoveryHandler'
import { useGPS } from './hooks/useGPS'
import { useOrderNotifications } from './hooks/useOrderNotifications'

const PUBLIC_ROUTES = ['/login']

const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const PedidosPage = lazy(() => import('./pages/PedidosPage'))
const VendasPage = lazy(() => import('./pages/VendasPage'))
const AvaliacoesPage = lazy(() => import('./pages/AvaliacoesPage'))
const CardapioPage = lazy(() => import('./pages/CardapioPage'))
const PerfilPage = lazy(() => import('./pages/PerfilPage'))
const ZonasPage = lazy(() => import('./pages/ZonasPage'))
const CarteiraPage = lazy(() => import('./pages/CarteiraPage'))

function RouteLoading() {
  return (
    <div style={{ minHeight: 240, display: 'grid', placeItems: 'center', color: '#008fc0' }} role="status" aria-label="Carregando tela">
      <LoaderCircle size={24} className="animate-spin-slow" />
    </div>
  )
}

// Logo do PraiaGo Ambulante
function LogoBar({ gpsStatus, foraDaArea, modoRevisao }: { gpsStatus: string; foraDaArea: boolean; modoRevisao: boolean }) {
  const isActive = gpsStatus === 'active' && !foraDaArea
  const isError = gpsStatus === 'error' || gpsStatus === 'denied'
  const statusLabel = modoRevisao
    ? 'Cenario de revisao'
    : foraDaArea
      ? 'Fora da area'
      : isActive
        ? 'Localizacao ativa'
        : isError
          ? 'Sem localizacao'
          : 'Localizando'
  const statusColor = modoRevisao ? '#6d28d9' : isActive ? '#148447' : foraDaArea || isError ? '#b54708' : '#617089'
  const statusBackground = modoRevisao ? '#f5f3ff' : isActive ? '#eef9f2' : foraDaArea || isError ? '#fff4e5' : '#edf1f5'
  const statusBorder = modoRevisao ? '#c4b5fd' : isActive ? '#cce9d8' : foraDaArea || isError ? '#f4d39f' : '#dce3ea'
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      minHeight: 66,
      padding: '8px 16px',
      // A folga do entalhe entra como padding DAQUI, e nao como espaco vazio
      // acima. Assim o fundo branco do cabecalho passa por baixo da barra de
      // status: relogio, bateria e sinal ficam legiveis em cima dele, em vez
      // de cair por cima do logo.
      //
      // Com `viewport-fit=cover` a pagina vai ate a borda de cima da tela, e
      // sem isto o iPhone desenha a barra de status por cima do conteudo. O
      // valor muda por aparelho — no iPhone com entalhe da ~47px, no SE da 20,
      // e no Android da 0 — entao nao da para chutar um numero fixo.
      paddingTop: 'calc(8px + env(safe-area-inset-top))',
      borderBottom: '1px solid #e7ecf1',
      background: 'rgba(255,255,255,0.96)',
      backdropFilter: 'blur(14px)',
      position: 'sticky', top: 0, zIndex: 60,
    }}>
      {/* Logo — mesma marca e mesmo recorte do app do cliente.
          O PNG e quadrado (1600x1600) com muita margem: a caixa de 140x59
          recorta so o brasao, e por isso a imagem e maior que o container. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div
          aria-label="PraiaGo"
          style={{ width: 116, height: 47, overflow: 'hidden', position: 'relative', flexShrink: 0 }}
        >
          <img
            src="/praiago-logo-transparent.png"
            alt="PraiaGo"
            style={{
              position: 'absolute', width: 194, height: 194, maxWidth: 'none',
              left: -48, top: -57, display: 'block',
            }}
          />
        </div>
        <span style={{ border: '1px solid #cce9d8', borderRadius: 999, background: '#eef9f2', color: '#148447', padding: '4px 7px', fontSize: 9, lineHeight: 1, fontWeight: 850, textTransform: 'uppercase' }}>
          Ambulante
        </span>
      </div>

      {/* GPS badge */}
      <motion.div animate={isActive ? { opacity: [0.7, 1, 0.7] } : {}} transition={{ repeat: Infinity, duration: 2 }} style={{
        display: 'flex', alignItems: 'center', gap: 6,
        maxWidth: 146,
        background: statusBackground,
        border: `1px solid ${statusBorder}`,
        borderRadius: 999, padding: '7px 9px',
        color: statusColor,
      }}>
        <LocateFixed size={14} aria-hidden="true" />
        <span style={{
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontSize: 10, fontWeight: 800,
        }}>
          {statusLabel}
        </span>
      </motion.div>
    </header>
  )
}

function GlobalOrderToast() {
  const navigate = useNavigate()
  const location = useLocation()
  const { latestOrder, dismissLatest } = useOrderNotifications()

  if (!latestOrder || location.pathname === '/pedidos') return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -18, scale: 0.96 }}
        style={{
          position: 'fixed',
          top: 92,
          left: 14,
          right: 14,
          zIndex: 9999,
          background: '#ffffff',
          border: '1px solid rgba(14,165,233,0.24)',
          borderRadius: 20,
          boxShadow: '0 18px 45px rgba(15,23,42,0.2)',
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ width: 46, height: 46, borderRadius: 16, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900 }}>
          R$
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>Novo pedido recebido</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {latestOrder.clienteNome} - R$ {latestOrder.total.toFixed(2).replace('.', ',')}
          </div>
        </div>
        <button
          onClick={() => { dismissLatest(); navigate('/pedidos') }}
          style={{ border: 0, borderRadius: 13, background: '#0ea5e9', color: '#fff', padding: '10px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }}
        >
          Ver
        </button>
        <button
          aria-label="Fechar aviso"
          onClick={dismissLatest}
          style={{ border: 0, borderRadius: 12, background: '#f1f5f9', color: '#64748b', width: 34, height: 34, fontSize: 18, cursor: 'pointer' }}
        >
          x
        </button>
      </motion.div>
    </AnimatePresence>
  )
}

function playAvisoSound() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
    if (!AudioContextCtor) return
    const ctx = new AudioContextCtor()
    const now = ctx.currentTime
    ;[740, 988].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, now + i * 0.16)
      gain.gain.exponentialRampToValueAtTime(0.2, now + i * 0.16 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.14)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now + i * 0.16)
      osc.stop(now + i * 0.16 + 0.16)
    })
    setTimeout(() => ctx.close(), 700)
  } catch {
    // Audio pode ficar bloqueado ate o primeiro toque do usuario.
  }
}

function GlobalAvisoToast() {
  const [aviso, setAviso] = useState<{ id?: string; titulo?: string; mensagem?: string; cupom_codigo?: string | null } | null>(null)

  useEffect(() => {
    const sessao = getSessao()

    const mostrar = (row: { id?: string; titulo?: string; mensagem?: string; cupom_codigo?: string | null }) => {
      setAviso(row)
      playAvisoSound()
      window.setTimeout(() => setAviso(current => current?.id === row.id ? null : current), 8000)
    }

    const channel = supabase
      .channel('avisos_ambulante')
      // Broadcast da equipe: promocao, comunicado.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'avisos' }, payload => {
        const row = payload.new as { id?: string; titulo?: string; mensagem?: string; publico?: string; cupom_codigo?: string | null }
        if (row.publico && row.publico !== 'ambulantes' && row.publico !== 'todos') return
        mostrar(row)
      })
      .subscribe()

    // Aviso dirigido a ESTE vendedor — hoje e o KYC aprovado ou recusado. E
    // um canal separado porque leva filtro por vendedor_id; junto no de cima,
    // o filtro valeria para os dois e o broadcast pararia de chegar.
    let pessoal: ReturnType<typeof supabase.channel> | null = null
    if (sessao?.id) {
      pessoal = supabase
        .channel(`notif_vendedor_${sessao.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notificacoes_vendedor', filter: `vendedor_id=eq.${sessao.id}` },
          payload => {
            const row = payload.new as { id?: string; titulo?: string; mensagem?: string }
            mostrar(row)
          },
        )
        .subscribe()
    }

    return () => {
      supabase.removeChannel(channel)
      if (pessoal) supabase.removeChannel(pessoal)
    }
  }, [])

  if (!aviso) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.96 }}
      style={{
        position: 'fixed',
        left: 14,
        right: 14,
        bottom: 96,
        zIndex: 9998,
        background: '#ffffff',
        border: '1px solid rgba(34,197,94,0.24)',
        borderRadius: 20,
        boxShadow: '0 18px 45px rgba(15,23,42,0.18)',
        padding: 14,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 15, background: 'linear-gradient(135deg,#22c55e,#0ea5e9)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>!</div>
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
// Ela substitui TODAS as rotas e a barra de baixo some junto, então quem cai
// aqui não tem para onde ir. Foi por isso que a Apple reprovou em 31/08/2026:
// "There was no option to return to the login screen once the registration
// process started" — o revisor criou conta, parou nesta tela e ficou preso.
//
// A saída é sair da conta. Não é um detalhe de conforto: sem ela, quem
// registrou no aparelho errado, ou quer entrar com outra conta, precisa
// desinstalar o app.
function KycLockedPanel() {
  const navigate = useNavigate()

  function sair() {
    logout()
    supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 18, padding: 18 }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: '#92400e', marginBottom: 6 }}>Verificação em análise</div>
        <p style={{ margin: 0, color: '#92400e', fontSize: 14, lineHeight: 1.5, fontWeight: 600 }}>
          Para vender na praia a gente precisa confirmar quem você é. Envie CPF,
          documento com foto, selfie e o local onde você atua no bloco acima.
          Enquanto a análise não termina, você não aparece no mapa e não
          consegue cadastrar produtos.
        </p>
        <p style={{ margin: '10px 0 0', color: '#92400e', fontSize: 13.5, lineHeight: 1.5, fontWeight: 600, opacity: .9 }}>
          A resposta chega neste mesmo aparelho. Você pode fechar o app — o
          envio não se perde.
        </p>
      </div>

      <button
        type="button"
        onClick={sair}
        style={{
          width: '100%', marginTop: 16, padding: '13px 0', borderRadius: 14,
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
  )
}

export default function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isPublic = PUBLIC_ROUTES.includes(location.pathname)
  const sessao = useSessao()
  const [kycLocked, setKycLocked] = useState(false)

  // GPS ativo em todo o app — transmite posição em tempo real
  const { status: gpsStatus, foraDaArea, modoRevisao } = useGPS()

  useEffect(() => {
    if (!sessao?.id || isPublic) return

    let ativo = true
    type PerfilGate = { status?: string; role?: string; verificado?: boolean | null; conta_demo?: boolean | null }
    const bloquearAcessoInvalido = (perfil?: PerfilGate | null, userId?: string) => {
      if (!ativo) return false
      if (perfil?.status !== 'banido' && perfil?.role === 'ambulante' && userId === sessao.id) return true
      logout()
      supabase.auth.signOut()
      navigate('/login', { replace: true })
      return false
    }
    const atualizarGate = (perfil?: PerfilGate | null, userId = sessao.id) => {
      if (!ativo) return
      if (!bloquearAcessoInvalido(perfil, userId)) return
      setContaDemo(perfil?.conta_demo === true)
      setKycLocked(perfil?.verificado !== true)
    }

    // Só derruba a sessão quando o servidor RESPONDE que ela não vale.
    //
    // A versão anterior tratava "não consegui falar com o servidor" como
    // "esse vendedor não vale": qualquer falha de rede caía no mesmo
    // `bloquearAcessoInvalido` que a resposta de conta banida. E isso rodava
    // a cada 10 SEGUNDOS — bastava o telefone perder a rede um instante, sair
    // do app, trocar de Wi-Fi para 4G, e o vendedor era deslogado no meio do
    // atendimento.
    //
    // Agora erro de rede não conclui nada: a sessão fica como está e a
    // próxima passagem tenta de novo. O bloqueio continua funcionando,
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
        .select('status,role,verificado,conta_demo')
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
    const channel = supabase.channel(`ambulante_kyc_gate_${sessao.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${sessao.id}` }, payload => atualizarGate(payload.new as PerfilGate))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'verificacoes', filter: `user_id=eq.${sessao.id}` }, () => checarStatus())
      .subscribe()
    // 10s era herança de quando isso derrubava a sessão e queria pegar o
    // bloqueio rápido. O realtime logo acima já avisa da mudança no perfil no
    // instante em que ela acontece, então esta ronda é só rede de segurança —
    // e a cada 10 segundos ela acordava o telefone o dia inteiro.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') checarStatus()
    }, 300000)

    return () => {
      ativo = false
      supabase.removeChannel(channel)
      window.clearInterval(timer)
    }
  }, [sessao?.id, isPublic, navigate])

  // Proteção de rota: sem sessão, vai para o login
  if (!sessao && !isPublic) return <Navigate to="/login" replace />

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f4f7fa',
      // Telas publicas (login, recuperar senha) nao tem o cabecalho que
      // absorve a folga do entalhe, entao a folga entra aqui. Nas outras
      // fica zero, senao a folga contaria duas vezes.
      paddingTop: isPublic ? 'env(safe-area-inset-top)' : 0,
    }}>
      <PasswordRecoveryHandler />
      {!isPublic && <LogoBar gpsStatus={gpsStatus} foraDaArea={foraDaArea} modoRevisao={modoRevisao} />}
      {!isPublic && <VerificationBar />}
      {/* O espaco reservado aqui embaixo repete a conta da propria barra, em
          vez de um numero solto: ela tem 70px de altura e flutua a
          `max(10px, env(safe-area-inset-bottom))` do fim da tela (veja
          BottomNav.tsx). Os 16px finais sao a folga para o ultimo item nao
          encostar nela.

          O numero fixo de antes (82px) dava 2px de sobra no Android — perto
          demais de esconder conteudo se a barra mudasse de altura. */}
      <main style={{
        flex: 1, overflowY: 'auto', position: 'relative',
        paddingBottom: isPublic
          ? 0
          : 'calc(70px + max(10px, env(safe-area-inset-bottom)) + 16px)',
      }}>
        {!isPublic && kycLocked ? (
          <KycLockedPanel />
        ) : (
          <Suspense fallback={<RouteLoading />}>
            <AnimatePresence mode="wait">
              <Routes location={location} key={location.pathname}>
                <Route path="/login"    element={<PageWrapper><LoginPage /></PageWrapper>} />
                <Route path="/"         element={<PageWrapper><DashboardPage /></PageWrapper>} />
                <Route path="/pedidos"  element={<PageWrapper><PedidosPage /></PageWrapper>} />
                <Route path="/vendas"   element={<PageWrapper><VendasPage /></PageWrapper>} />
                <Route path="/avaliacoes" element={<PageWrapper><AvaliacoesPage /></PageWrapper>} />
                <Route path="/cardapio" element={<PageWrapper><CardapioPage /></PageWrapper>} />
                <Route path="/zonas"    element={<PageWrapper><ZonasPage /></PageWrapper>} />
                <Route path="/perfil"   element={<PageWrapper><PerfilPage /></PageWrapper>} />
                <Route path="/carteira" element={<PageWrapper><CarteiraPage /></PageWrapper>} />
              </Routes>
            </AnimatePresence>
          </Suspense>
        )}
      </main>
      {!isPublic && !kycLocked && <BottomNav />}
      {!isPublic && !kycLocked && <AiChatbot plataforma="ambulante" />}
      {!isPublic && !kycLocked && <GlobalOrderToast />}
      {!isPublic && (
        <AnimatePresence>
          <GlobalAvisoToast />
        </AnimatePresence>
      )}
      {/* Fora da trava do kycLocked de proposito: o chamado de verificacao e
          exatamente o que tira o vendedor dessa trava. Esconde-lo ali seria
          trancar a porta e guardar a chave do lado de dentro. */}
      {!isPublic && <ChamadoKycPanel />}
      <DialogHost />
    </div>
  )
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      style={{ height: '100%' }}
    >
      {children}
    </motion.div>
  )
}
