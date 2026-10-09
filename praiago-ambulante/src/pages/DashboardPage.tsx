import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  MapPin,
  Navigation,
  Package,
  Power,
  Store,
  Wallet,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ONLINE_EVENT, ONLINE_STORAGE, useGPS } from '../hooks/useGPS'
import { getSessao } from '../lib/auth'
import { getZone } from '../lib/praiagoZones'
import { TEXTO_AREA_ATENDIDA } from '../lib/serviceArea'
import { supabase } from '../lib/supabase'

type DashboardStats = {
  ordersToday: number
  revenueToday: number
  activeProducts: number
  openOrders: number
}

const initialStats: DashboardStats = {
  ordersToday: 0,
  revenueToday: 0,
  activeProducts: 0,
  openOrders: 0,
}

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { data, status, cidadeAtendida, foraDaArea, modoRevisao } = useGPS()
  const session = getSessao()
  const latitude = data?.lat
  const longitude = data?.lng
  const [online, setOnline] = useState(() => {
    try { return localStorage.getItem(ONLINE_STORAGE) === 'true' } catch { return false }
  })
  const [verified, setVerified] = useState<boolean | null>(null)
  const [stats, setStats] = useState<DashboardStats>(initialStats)
  const [loadingStats, setLoadingStats] = useState(true)
  const [radarError, setRadarError] = useState('')

  const zoneName = useMemo(() => {
    if (!data) return 'Aguardando localização'
    return getZone(data.lat, data.lng)?.nome || cidadeAtendida || 'Fora da área atendida'
  }, [cidadeAtendida, data])

  const podeAtender = verified === true
    && status === 'active'
    && typeof session?.contaDemo === 'boolean'
    && !foraDaArea
  const atendendo = online && podeAtender

  useEffect(() => {
    if (!session?.id) return

    let active = true
    const load = async () => {
      const start = new Date()
      start.setHours(0, 0, 0, 0)

      const [{ data: profile, error: profileError }, { data: orders }, { count: activeProducts }] = await Promise.all([
        supabase.from('profiles').select('verificado').eq('id', session.id).maybeSingle(),
        supabase
          .from('pedidos')
          .select('total,status')
          .eq('vendedor_id', session.id)
          .gte('created_at', start.toISOString()),
        supabase
          .from('produtos')
          .select('id', { count: 'exact', head: true })
          .eq('vendedor_id', session.id)
          .eq('ativo', true),
      ])

      if (!active) return
      const validOrders = (orders || []).filter(order => ![
        'aguardando_pagamento',
        'cancelado',
        'pagamento_recusado',
      ].includes(String(order.status)))

      // A temporary profile failure is not proof the approved account changed.
      if (!profileError) setVerified(profile?.verificado === true)
      setStats({
        ordersToday: validOrders.length,
        revenueToday: validOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
        activeProducts: activeProducts || 0,
        openOrders: validOrders.filter(order => order.status !== 'entregue').length,
      })
      setLoadingStats(false)
    }

    void load()
    const channel = supabase
      .channel(`ambulante_dashboard_${session.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${session.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'produtos', filter: `vendedor_id=eq.${session.id}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.id}` }, load)
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [session?.id])

  useEffect(() => {
    try {
      // Persist the user's power choice, not a temporary GPS/loading state.
      localStorage.setItem(ONLINE_STORAGE, online ? 'true' : 'false')
      window.dispatchEvent(new Event(ONLINE_EVENT))
    } catch {
      // The database update below is still the source of truth.
    }

    if (!session?.id) return
    const patch: Record<string, unknown> = { online: atendendo }
    if (atendendo && latitude !== undefined && longitude !== undefined) {
      patch.lat = latitude
      patch.lng = longitude
      patch.zona = zoneName
    }
    let active = true
    void supabase.from('profiles').update(patch).eq('id', session.id).then(({ error }) => {
      if (active) setRadarError(error ? 'Não foi possível confirmar o radar no servidor. Confira a conexão.' : '')
    })
    return () => { active = false }
  }, [online, atendendo, latitude, longitude, session?.id, zoneName])

  const locationStatus = modoRevisao
    ? { label: 'Cenario de revisao em Praia Grande', color: 'var(--purple)', bg: 'var(--surface-purple)', icon: CheckCircle2 }
    : foraDaArea
      ? { label: 'Fora da area atendida', color: 'var(--warning)', bg: 'var(--surface-amber)', icon: CircleAlert }
      : status === 'active'
        ? { label: `Localizacao ativa em ${zoneName}`, color: 'var(--success)', bg: 'var(--surface-green)', icon: CheckCircle2 }
    : status === 'denied' || status === 'error'
      ? { label: 'Localizacao precisa de atencao', color: 'var(--warning)', bg: 'var(--surface-amber)', icon: CircleAlert }
      : { label: 'Buscando sua localizacao', color: 'var(--muted)', bg: 'var(--surface-soft)', icon: Navigation }
  const LocationIcon = locationStatus.icon

  const quickActions = [
    { label: 'Pedidos', detail: stats.openOrders ? `${stats.openOrders} aguardando ação` : 'Nenhum em andamento', icon: Package, color: 'var(--brand-blue)', to: '/pedidos' },
    { label: 'Cardápio', detail: `${stats.activeProducts} ${stats.activeProducts === 1 ? 'produto disponível' : 'produtos disponíveis'}`, icon: Store, color: 'var(--brand-green)', to: '/cardapio' },
    { label: 'Carteira', detail: 'Saldo e recebimentos', icon: Wallet, color: 'var(--warning)', to: '/carteira' },
    { label: 'Mapa', detail: 'Sua posição e movimento', icon: MapPin, color: 'var(--purple)', to: '/zonas' },
    { label: 'Vendas', detail: 'Resumo e histórico', icon: ClipboardList, color: 'var(--warning)', to: '/vendas' },
  ]

  return (
    <div className="page-shell">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface"
        style={{
          minHeight: 215,
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 16,
          padding: 22,
          border: '1px solid rgba(13,114,118,.23)',
          boxShadow: '0 14px 34px rgba(7,101,113,.12)',
          backgroundImage: 'var(--dashboard-art), url(/images/ambulante-beach-header-v1.webp)',
          backgroundPosition: 'center, 67% center',
          backgroundSize: 'cover',
        }}
      >
        <div style={{ maxWidth: '76%', position: 'relative', zIndex: 1 }}>
          <div className="eyebrow">{getGreeting()}</div>
          <h1 style={{ margin: '8px 0 9px', color: 'var(--ink-strong)', fontSize: 'clamp(27px, 5vw, 36px)', lineHeight: 1.08, fontWeight: 900 }}>
            {session?.nome || 'Sua operacao'}
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, fontWeight: 650 }}>
            Sua operação na praia, em um só lugar.
          </p>
        </div>

        <div style={{ position: 'absolute', left: 22, right: 22, bottom: 18 }}>
          <span className="status-pill" style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', color: locationStatus.color, background: locationStatus.bg }}>
            <LocationIcon size={14} />
            {locationStatus.label}
          </span>
        </div>
      </motion.section>

      {(foraDaArea || modoRevisao) && (
        <section role="status" className="surface" style={{ marginBottom: 14, padding: 14, borderColor: modoRevisao ? 'var(--purple-line)' : 'var(--warning-line)', background: modoRevisao ? 'var(--surface-purple)' : 'var(--surface-amber)', boxShadow: 'none' }}>
          <div style={{ color: modoRevisao ? 'var(--purple)' : 'var(--warning)', fontSize: 13, fontWeight: 900 }}>
            {modoRevisao ? 'Conta oficial de revisão' : 'Atendimento indisponível nesta localização'}
          </div>
          <div style={{ marginTop: 4, color: modoRevisao ? 'var(--purple)' : 'var(--warning)', fontSize: 12, lineHeight: 1.45, fontWeight: 650 }}>
            {modoRevisao
              ? 'O aparelho está distante e usa um cenário demonstrativo em Praia Grande. Esta conta não aparece no radar dos clientes reais.'
              : `Para ficar online, esteja fisicamente em ${TEXTO_AREA_ATENDIDA}. Perfil, suporte e demais dados continuam acessíveis.`}
          </div>
        </section>
      )}

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04 }}
        className="surface"
        style={{ marginBottom: 20, padding: 18, borderColor: atendendo ? 'var(--success-line)' : 'var(--line)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{
            width: 45,
            height: 45,
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 45px',
            borderRadius: 15,
            background: atendendo ? 'var(--surface-green)' : 'var(--surface-soft)',
            color: atendendo ? 'var(--success)' : 'var(--muted)',
          }}>
            <Power size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--ink-strong)', fontSize: 15, fontWeight: 850 }}>
              {atendendo ? 'Radar ligado · atendendo' : online ? 'Radar ligado · aguardando localização válida' : 'Radar desligado'}
            </div>
            <div style={{ marginTop: 3, color: verified === false ? 'var(--warning)' : 'var(--muted)', fontSize: 12, lineHeight: 1.35, fontWeight: 600 }}>
              {foraDaArea
                ? `O radar funciona em ${TEXTO_AREA_ATENDIDA}.`
                : verified === false
                ? 'A verificacao precisa estar aprovada para ativar.'
                : atendendo
                  ? 'Clientes proximos podem encontrar seus produtos.'
                  : 'Ative quando estiver pronto para receber pedidos.'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={online}
            aria-label={online ? 'Desligar radar' : 'Ligar radar'}
            disabled={!podeAtender && !online}
            onClick={() => setOnline(current => !current)}
            style={{
              width: 54,
              height: 32,
              flex: '0 0 54px',
              position: 'relative',
              padding: 0,
              border: 0,
              borderRadius: 999,
              background: online ? '#18a957' : '#cbd4df',
              cursor: podeAtender || online ? 'pointer' : 'not-allowed',
            }}
          >
            <span style={{
              width: 24,
              height: 24,
              position: 'absolute',
              top: 4,
              left: online ? 26 : 4,
              borderRadius: '50%',
              background: 'var(--surface)',
              boxShadow: '0 2px 7px rgba(23,45,74,0.22)',
              transition: 'left 180ms ease',
            }} />
          </button>
        </div>
        {radarError && <p role="alert" style={{ color: 'var(--danger)', fontSize: 12, margin: '12px 0 0' }}>{radarError}</p>}
      </motion.section>

      <section style={{ marginBottom: 18 }}>
        <div className="section-label" style={{ marginBottom: 9 }}>Hoje</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="surface" style={{ padding: 17, boxShadow: 'none', background: 'var(--surface-blue)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand-blue)' }}>
              <Package size={17} />
              <span style={{ fontSize: 11, fontWeight: 800 }}>Pedidos</span>
            </div>
            <div style={{ marginTop: 10, color: 'var(--ink-strong)', fontSize: 25, lineHeight: 1, fontWeight: 900 }}>
              {loadingStats ? '-' : stats.ordersToday}
            </div>
          </div>
          <div className="surface" style={{ padding: 17, boxShadow: 'none', background: 'var(--surface-green)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--brand-green)' }}>
              <Wallet size={17} />
              <span style={{ fontSize: 11, fontWeight: 800 }}>Vendas</span>
            </div>
            <div style={{ marginTop: 10, color: 'var(--ink-strong)', fontSize: 21, lineHeight: 1, fontWeight: 900 }}>
              {loadingStats ? '-' : money(stats.revenueToday)}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="section-label" style={{ marginBottom: 9 }}>Acesso rápido</div>
        <div className="surface" style={{ overflow: 'hidden', boxShadow: 'none' }}>
          {quickActions.map((action, index) => {
            const Icon = action.icon
            return (
              <button
                type="button"
                key={action.label}
                onClick={() => navigate(action.to)}
                style={{
                  width: '100%',
                  minHeight: 72,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 16px',
                  border: 0,
                  borderTop: index ? '1px solid var(--line)' : 0,
                  background: 'var(--surface)',
                  color: 'var(--ink-strong)',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 40,
                  height: 40,
                  display: 'grid',
                  placeItems: 'center',
                  flex: '0 0 40px',
                  borderRadius: 13,
                  color: action.color,
                  background: `color-mix(in srgb, ${action.color} 10%, var(--surface))`,
                }}>
                  <Icon size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 850 }}>{action.label}</span>
                  <span style={{ display: 'block', marginTop: 2, color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>{action.detail}</span>
                </span>
                <ChevronRight size={18} color="var(--faint)" />
              </button>
            )
          })}
        </div>
      </section>

      {status === 'denied' || status === 'error' ? (
        <button
          type="button"
          className="secondary-button"
          onClick={() => window.location.reload()}
          style={{ width: '100%', marginTop: 14 }}
        >
          <MapPin size={17} />
          Tentar localizacao novamente
        </button>
      ) : null}
    </div>
  )
}
