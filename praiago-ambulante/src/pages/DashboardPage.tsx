import { useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  CircleAlert,
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

      const [{ data: profile }, { data: orders }, { count: activeProducts }] = await Promise.all([
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

      setVerified(profile?.verificado === true)
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
    if (!podeAtender && online) setOnline(false)
  }, [online, podeAtender])

  useEffect(() => {
    try {
      localStorage.setItem(ONLINE_STORAGE, atendendo ? 'true' : 'false')
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
    void supabase.from('profiles').update(patch).eq('id', session.id)
  }, [atendendo, latitude, longitude, session?.id, zoneName])

  const locationStatus = modoRevisao
    ? { label: 'Cenario de revisao em Praia Grande', color: '#6d28d9', bg: '#f5f3ff', icon: CheckCircle2 }
    : foraDaArea
      ? { label: 'Fora da area atendida', color: '#b54708', bg: '#fff4e5', icon: CircleAlert }
      : status === 'active'
        ? { label: `Localizacao ativa em ${zoneName}`, color: '#148447', bg: '#eaf8ef', icon: CheckCircle2 }
    : status === 'denied' || status === 'error'
      ? { label: 'Localizacao precisa de atencao', color: '#b54708', bg: '#fff4e5', icon: CircleAlert }
      : { label: 'Buscando sua localizacao', color: '#526178', bg: '#edf1f5', icon: Navigation }
  const LocationIcon = locationStatus.icon

  const quickActions = [
    { label: 'Pedidos', detail: stats.openOrders ? `${stats.openOrders} aguardando acao` : 'Nenhum em andamento', icon: Package, color: '#008fc0', to: '/pedidos' },
    { label: 'Produtos', detail: `${stats.activeProducts} disponiveis`, icon: Store, color: '#8b5cf6', to: '/cardapio' },
    { label: 'Carteira', detail: 'Saldo e recebimentos', icon: Wallet, color: '#d97706', to: '/carteira' },
  ]

  return (
    <div className="page-shell">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="surface"
        style={{
          minHeight: 188,
          position: 'relative',
          overflow: 'hidden',
          marginBottom: 14,
          padding: 20,
          backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0.99) 0%, rgba(255,255,255,0.93) 48%, rgba(255,255,255,0.18) 100%), url(/images/ambulante-beach-header-v1.webp)',
          backgroundPosition: 'center, 67% center',
          backgroundSize: 'cover',
        }}
      >
        <div style={{ maxWidth: '72%', position: 'relative', zIndex: 1 }}>
          <div className="eyebrow">{getGreeting()}</div>
          <h1 style={{ margin: '5px 0 7px', color: '#132238', fontSize: 27, lineHeight: 1.08, fontWeight: 900 }}>
            {session?.nome || 'Sua operacao'}
          </h1>
          <p style={{ margin: 0, color: '#526178', fontSize: 13, lineHeight: 1.45, fontWeight: 650 }}>
            Controle pedidos, produtos e sua presenca na praia.
          </p>
        </div>

        <div style={{ position: 'absolute', left: 20, bottom: 18 }}>
          <span className="status-pill" style={{ color: locationStatus.color, background: locationStatus.bg }}>
            <LocationIcon size={14} />
            {locationStatus.label}
          </span>
        </div>
      </motion.section>

      {(foraDaArea || modoRevisao) && (
        <section role="status" className="surface" style={{ marginBottom: 14, padding: 14, borderColor: modoRevisao ? '#c4b5fd' : '#f4d39f', background: modoRevisao ? '#f5f3ff' : '#fffaf0', boxShadow: 'none' }}>
          <div style={{ color: modoRevisao ? '#6d28d9' : '#92400e', fontSize: 13, fontWeight: 900 }}>
            {modoRevisao ? 'Conta oficial de revisão' : 'Atendimento indisponível nesta localização'}
          </div>
          <div style={{ marginTop: 4, color: modoRevisao ? '#6d28d9' : '#92400e', fontSize: 12, lineHeight: 1.45, fontWeight: 650 }}>
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
        style={{ marginBottom: 14, padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{
            width: 45,
            height: 45,
            display: 'grid',
            placeItems: 'center',
            flex: '0 0 45px',
            borderRadius: 12,
            background: atendendo ? '#e9f8ef' : '#edf1f5',
            color: atendendo ? '#148447' : '#6a788e',
          }}>
            <Power size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: '#132238', fontSize: 15, fontWeight: 850 }}>
              {atendendo ? 'Voce esta atendendo' : 'Voce esta fora do radar'}
            </div>
            <div style={{ marginTop: 3, color: verified === false ? '#b54708' : '#617089', fontSize: 12, lineHeight: 1.35, fontWeight: 600 }}>
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
            aria-checked={atendendo}
            aria-label={atendendo ? 'Desativar atendimento' : 'Ativar atendimento'}
            disabled={!podeAtender}
            onClick={() => setOnline(current => !current)}
            style={{
              width: 54,
              height: 32,
              flex: '0 0 54px',
              position: 'relative',
              padding: 0,
              border: 0,
              borderRadius: 999,
              background: atendendo ? '#18a957' : '#cbd4df',
              cursor: podeAtender ? 'pointer' : 'not-allowed',
            }}
          >
            <span style={{
              width: 24,
              height: 24,
              position: 'absolute',
              top: 4,
              left: atendendo ? 26 : 4,
              borderRadius: '50%',
              background: '#fff',
              boxShadow: '0 2px 7px rgba(23,45,74,0.22)',
              transition: 'left 180ms ease',
            }} />
          </button>
        </div>
      </motion.section>

      <section style={{ marginBottom: 18 }}>
        <div className="section-label" style={{ marginBottom: 9 }}>Hoje</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="surface" style={{ padding: 15, boxShadow: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#008fc0' }}>
              <Package size={17} />
              <span style={{ fontSize: 11, fontWeight: 800 }}>Pedidos</span>
            </div>
            <div style={{ marginTop: 10, color: '#132238', fontSize: 25, lineHeight: 1, fontWeight: 900 }}>
              {loadingStats ? '-' : stats.ordersToday}
            </div>
          </div>
          <div className="surface" style={{ padding: 15, boxShadow: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#148447' }}>
              <Wallet size={17} />
              <span style={{ fontSize: 11, fontWeight: 800 }}>Vendas</span>
            </div>
            <div style={{ marginTop: 10, color: '#132238', fontSize: 21, lineHeight: 1, fontWeight: 900 }}>
              {loadingStats ? '-' : money(stats.revenueToday)}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="section-label" style={{ marginBottom: 9 }}>Acesso rapido</div>
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
                  minHeight: 68,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '11px 14px',
                  border: 0,
                  borderTop: index ? '1px solid #e7ecf1' : 0,
                  background: '#fff',
                  color: '#132238',
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
                  borderRadius: 10,
                  color: action.color,
                  background: `${action.color}12`,
                }}>
                  <Icon size={20} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 850 }}>{action.label}</span>
                  <span style={{ display: 'block', marginTop: 2, color: '#6a788e', fontSize: 12, fontWeight: 600 }}>{action.detail}</span>
                </span>
                <ChevronRight size={18} color="#8793a5" />
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
