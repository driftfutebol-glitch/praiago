import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  HelpCircle,
  Loader2,
  LogOut,
  MapPin,
  PackageCheck,
  Star,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import SuportePanel from '../components/SuportePanel'
import { logout, useSessao } from '../lib/auth'
import { supabase } from '../lib/supabase'

type Profile = {
  nome: string | null
  categoria: string | null
  zona: string | null
  avaliacao_media: number | null
  total_avaliacoes: number | null
  horario_abre: string | null
  horario_fecha: string | null
  online: boolean | null
  verificado: boolean | null
}

type MonthStats = {
  completedOrders: number
  revenue: number
}

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export default function PerfilPage() {
  const navigate = useNavigate()
  const session = useSessao()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<MonthStats>({ completedOrders: 0, revenue: 0 })
  const [supportOpen, setSupportOpen] = useState(false)
  const [openingTime, setOpeningTime] = useState('')
  const [closingTime, setClosingTime] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [scheduleMessage, setScheduleMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    if (!session?.id) return
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [{ data: profileData }, { data: orders }] = await Promise.all([
      supabase
        .from('profiles')
        .select('nome,categoria,zona,avaliacao_media,total_avaliacoes,horario_abre,horario_fecha,online,verificado')
        .eq('id', session.id)
        .maybeSingle(),
      supabase
        .from('pedidos')
        .select('total,status')
        .eq('vendedor_id', session.id)
        .eq('status', 'entregue')
        .gte('created_at', monthStart.toISOString()),
    ])

    const nextProfile = (profileData || null) as Profile | null
    setProfile(nextProfile)
    setOpeningTime(nextProfile?.horario_abre || '')
    setClosingTime(nextProfile?.horario_fecha || '')
    setStats({
      completedOrders: orders?.length || 0,
      revenue: (orders || []).reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    })
  }, [session?.id])

  useEffect(() => {
    if (!session?.id) return
    void load()
    const channel = supabase
      .channel(`ambulante_perfil_${session.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${session.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `vendedor_id=eq.${session.id}` }, load)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [load, session?.id])

  async function saveSchedule() {
    if (!session?.id) return
    if ((openingTime && !closingTime) || (!openingTime && closingTime)) {
      setScheduleMessage({ text: 'Informe abertura e fechamento, ou deixe os dois vazios.', error: true })
      return
    }
    setSavingSchedule(true)
    const { error } = await supabase
      .from('profiles')
      .update({ horario_abre: openingTime || null, horario_fecha: closingTime || null })
      .eq('id', session.id)
    setSavingSchedule(false)
    setScheduleMessage(error
      ? { text: 'Não foi possível salvar o horário.', error: true }
      : { text: 'Horário atualizado para os clientes.', error: false })
    if (!error) void load()
  }

  function signOut() {
    logout()
    void supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const rating = Number(profile?.avaliacao_media) || 0
  const reviewCount = Number(profile?.total_avaliacoes) || 0
  const menuItems = [
    { icon: Wallet, title: 'Carteira', detail: 'Conta bancária, saldo e saques', action: () => navigate('/carteira') },
    { icon: TrendingUp, title: 'Vendas', detail: 'Resumo de pedidos entregues', action: () => navigate('/vendas') },
    { icon: Star, title: 'Avaliações', detail: 'Notas e comentários dos clientes', action: () => navigate('/avaliacoes') },
    { icon: HelpCircle, title: 'Suporte', detail: 'Atendimento da equipe PraiaGo', action: () => setSupportOpen(true) },
  ]

  return (
    <div className="page-shell">
      <section className="surface" style={{ marginBottom: 12, padding: 16, boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 54, height: 54, display: 'grid', placeItems: 'center', flex: '0 0 54px', borderRadius: 8, background: '#eaf6fa', color: '#008fc0' }}>
            <Store size={26} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, overflow: 'hidden', color: '#132238', fontSize: 20, fontWeight: 900, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.nome || session?.nome || 'Ambulante'}</h1>
            <div style={{ marginTop: 4, color: '#617089', fontSize: 12, fontWeight: 650 }}>{profile?.categoria || 'Categoria da banca não definida'}</div>
          </div>
          <span className="status-pill" style={{ color: profile?.verificado ? '#148447' : '#b54708', background: profile?.verificado ? '#eaf8ef' : '#fff4e5' }}>
            <CheckCircle2 size={13} />
            {profile?.verificado ? 'Aprovado' : 'Em análise'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, paddingTop: 12, borderTop: '1px solid #e7ecf1' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: rating > 0 ? '#9a6700' : '#718096', fontSize: 12, fontWeight: 800 }}>
            <Star size={15} fill={rating > 0 ? 'currentColor' : 'none'} />
            {rating > 0 ? rating.toFixed(1).replace('.', ',') : 'Sem nota'}
            <span style={{ color: '#8793a5', fontWeight: 650 }}>({reviewCount})</span>
          </div>
          <div style={{ width: 1, height: 16, background: '#dfe6ed' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, color: '#617089', fontSize: 12, fontWeight: 700 }}>
            <MapPin size={15} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.zona || 'Localização ainda não registrada'}</span>
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div className="surface" style={{ padding: 14, boxShadow: 'none' }}>
          <PackageCheck size={18} color="#008fc0" />
          <div style={{ marginTop: 9, color: '#132238', fontSize: 22, fontWeight: 900 }}>{stats.completedOrders}</div>
          <div style={{ color: '#617089', fontSize: 11, lineHeight: 1.3, fontWeight: 700 }}>Entregues no mês</div>
        </div>
        <div className="surface" style={{ padding: 14, boxShadow: 'none' }}>
          <TrendingUp size={18} color="#148447" />
          <div style={{ marginTop: 9, color: '#132238', fontSize: 18, fontWeight: 900 }}>{money(stats.revenue)}</div>
          <div style={{ color: '#617089', fontSize: 11, lineHeight: 1.3, fontWeight: 700 }}>Vendas brutas no mês</div>
        </div>
      </div>

      <section className="surface" style={{ marginBottom: 14, padding: 15, boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock3 size={18} color="#008fc0" />
          <div>
            <div style={{ color: '#132238', fontSize: 14, fontWeight: 900 }}>Horário de atendimento</div>
            <div style={{ marginTop: 2, color: '#617089', fontSize: 11, fontWeight: 600 }}>Fora deste período sua banca aparece fechada.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 13 }}>
          <label>
            <span className="field-label">Abre</span>
            <input type="time" value={openingTime} onChange={event => setOpeningTime(event.target.value)} style={{ width: '100%', minHeight: 44, marginTop: 6, padding: '0 10px', border: '1px solid #dfe6ed', borderRadius: 8, background: '#f8fafc', color: '#132238', fontWeight: 800 }} />
          </label>
          <label>
            <span className="field-label">Fecha</span>
            <input type="time" value={closingTime} onChange={event => setClosingTime(event.target.value)} style={{ width: '100%', minHeight: 44, marginTop: 6, padding: '0 10px', border: '1px solid #dfe6ed', borderRadius: 8, background: '#f8fafc', color: '#132238', fontWeight: 800 }} />
          </label>
        </div>

        {scheduleMessage && <div style={{ marginTop: 9, color: scheduleMessage.error ? '#b42335' : '#148447', fontSize: 11, fontWeight: 750 }}>{scheduleMessage.text}</div>}
        <button type="button" className="secondary-button" onClick={() => void saveSchedule()} disabled={savingSchedule} style={{ width: '100%', marginTop: 11 }}>
          {savingSchedule ? <Loader2 size={17} className="animate-spin-slow" /> : <Clock3 size={17} />}
          Salvar horário
        </button>
      </section>

      <section className="surface" style={{ marginBottom: 14, overflow: 'hidden', boxShadow: 'none' }}>
        {menuItems.map((item, index) => {
          const Icon = item.icon
          return (
            <button type="button" key={item.title} onClick={item.action} style={{ width: '100%', minHeight: 66, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px', border: 0, borderTop: index ? '1px solid #e7ecf1' : 0, background: '#fff', color: '#132238', textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', flex: '0 0 38px', borderRadius: 8, background: '#f2f5f7', color: '#526178' }}><Icon size={19} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 900 }}>{item.title}</span>
                <span style={{ display: 'block', marginTop: 2, color: '#718096', fontSize: 11, fontWeight: 600 }}>{item.detail}</span>
              </span>
              <ChevronRight size={17} color="#8793a5" />
            </button>
          )
        })}
      </section>

      <button type="button" className="danger-button" onClick={signOut} style={{ width: '100%' }}>
        <LogOut size={18} />
        Sair da conta
      </button>

      <AnimatePresence>
        {supportOpen && session && (
          <SuportePanel
            onClose={() => setSupportOpen(false)}
            usuarioId={session.id}
            usuarioNome={profile?.nome || session.nome || 'Ambulante'}
            usuarioEmail={session.email || ''}
            plataforma="ambulante"
          />
        )}
      </AnimatePresence>
    </div>
  )
}
