import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Loader2,
  LogOut,
  MapPin,
  PackageCheck,
  Phone,
  Star,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import SuportePanel from '../components/SuportePanel'
import SellerPhotoManager from '../components/SellerPhotoManager'
import TrocaNomeLoja from '../components/TrocaNomeLoja'
import EditorHorarios from '../components/EditorHorarios'
import { logout, useSessao } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { sellerPhotoUrl } from '../lib/sellerPhotos'

type Profile = {
  nome: string | null
  categoria: string | null
  zona: string | null
  telefone_comercial: string | null
  avaliacao_media: number | null
  total_avaliacoes: number | null
  horario_abre: string | null
  horario_fecha: string | null
  /** Grade por dia da semana. Null = banca ainda no formato antigo. */
  horarios: unknown
  online: boolean | null
  verificado: boolean | null
  foto_perfil_path: string | null
  foto_capa_path: string | null
}

type MonthStats = {
  completedOrders: number
  revenue: number
}

const money = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const onlyDigits = (value: string) => String(value ?? '').replace(/\D/g, '')

/** Mascara so pra leitura; no banco vai o telefone em digitos puros. */
function formatPhone(value: string) {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export default function PerfilPage() {
  const navigate = useNavigate()
  const session = useSessao()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<MonthStats>({ completedOrders: 0, revenue: 0 })
  const [supportOpen, setSupportOpen] = useState(false)
  // Grade por dia da semana (jsonb). Null = banca ainda no formato antigo.
  const [horariosPerfil, setHorariosPerfil] = useState<unknown>(null)
  const [openingTime, setOpeningTime] = useState('')
  const [closingTime, setClosingTime] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [phoneMessage, setPhoneMessage] = useState<{ text: string; error: boolean } | null>(null)

  const load = useCallback(async () => {
    if (!session?.id) return
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [{ data: profileData }, { data: orders }] = await Promise.all([
      supabase
        .from('profiles')
        .select('nome,categoria,zona,telefone_comercial,avaliacao_media,total_avaliacoes,horario_abre,horario_fecha,horarios,online,verificado,foto_perfil_path,foto_capa_path')
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
    setHorariosPerfil(nextProfile?.horarios ?? null)
    setBusinessPhone(formatPhone(nextProfile?.telefone_comercial || ''))
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

  // O antigo `saveSchedule` (um par abre/fecha pra semana toda) saiu junto com
  // a UI dele: quem grava horário agora é o EditorHorarios, que salva a grade
  // por dia E mantém os campos antigos preenchidos por compatibilidade.

  // O telefone comercial nunca teve onde ser preenchido: o cadastro nao pede e
  // o painel so exibia. Sem edicao aqui a coluna ficava nula pra sempre.
  async function saveBusinessPhone() {
    if (!session?.id) return
    const digits = onlyDigits(businessPhone)
    if (digits && (digits.length < 10 || digits.length > 11)) {
      setPhoneMessage({ text: 'Informe o telefone com DDD (ex: 13 99999-8888).', error: true })
      return
    }
    setSavingPhone(true)
    const { error } = await supabase
      .from('profiles')
      .update({ telefone_comercial: digits || null })
      .eq('id', session.id)
    setSavingPhone(false)
    setPhoneMessage(error
      ? { text: 'Não foi possível salvar o telefone.', error: true }
      : { text: digits ? 'Telefone salvo.' : 'Telefone removido.', error: false })
    if (!error) void load()
  }

  function signOut() {
    logout()
    void supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const rating = Number(profile?.avaliacao_media) || 0
  const reviewCount = Number(profile?.total_avaliacoes) || 0
  const profilePhoto = sellerPhotoUrl(profile?.foto_perfil_path)
  const coverPhoto = sellerPhotoUrl(profile?.foto_capa_path)
  const menuItems = [
    { icon: Wallet, title: 'Carteira', detail: 'Conta bancária, saldo e saques', action: () => navigate('/carteira') },
    { icon: TrendingUp, title: 'Vendas', detail: 'Resumo de pedidos entregues', action: () => navigate('/vendas') },
    { icon: Star, title: 'Avaliações', detail: 'Notas e comentários dos clientes', action: () => navigate('/avaliacoes') },
    { icon: HelpCircle, title: 'Suporte', detail: 'Atendimento da equipe PraiaGo', action: () => setSupportOpen(true) },
  ]

  return (
    <div className="page-shell">
      <section className="surface" style={{ marginBottom: 12, padding: 16, boxShadow: 'none', position: 'relative', overflow: 'hidden' }}>
        {coverPhoto && <img src={coverPhoto} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.12 }} />}
        <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 54, height: 54, display: 'grid', placeItems: 'center', flex: '0 0 54px', overflow: 'hidden', borderRadius: 8, background: '#eaf6fa', color: '#008fc0' }}>
            {profilePhoto
              ? <img src={profilePhoto} alt={profile?.nome || 'Ambulante'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Store size={26} />}
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
        </div>
      </section>

      {session?.id && (
        <SellerPhotoManager
          userId={session.id}
          profilePath={profile?.foto_perfil_path || null}
          coverPath={profile?.foto_capa_path || null}
          onChanged={({ profilePath, coverPath }) => setProfile(current => current ? { ...current, foto_perfil_path: profilePath, foto_capa_path: coverPath } : current)}
        />
      )}

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

      {session?.id && (
        <TrocaNomeLoja
          vendedorId={session.id}
          nomeAtual={profile?.nome || session.nome || ''}
          onNomeAprovado={nomeNovo => setProfile(current => (
            !current || current.nome === nomeNovo ? current : { ...current, nome: nomeNovo }
          ))}
        />
      )}

      <section className="surface" style={{ marginBottom: 14, padding: 15, boxShadow: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={18} color="#008fc0" />
          <div>
            <div style={{ color: '#132238', fontSize: 14, fontWeight: 900 }}>Telefone comercial</div>
            <div style={{ marginTop: 2, color: '#617089', fontSize: 11, fontWeight: 600 }}>É por aqui que a equipe PraiaGo fala com você fora do app.</div>
          </div>
        </div>

        <label style={{ display: 'block', marginTop: 13 }}>
          <span className="field-label">Telefone com DDD</span>
          <input
            value={businessPhone}
            onChange={event => { setBusinessPhone(formatPhone(event.target.value)); setPhoneMessage(null) }}
            inputMode="tel"
            placeholder="(13) 99999-8888"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, marginTop: 6, padding: '0 10px', border: '1px solid #dfe6ed', borderRadius: 8, background: '#f8fafc', color: '#132238', fontWeight: 800 }}
          />
        </label>

        {phoneMessage && <div style={{ marginTop: 9, color: phoneMessage.error ? '#b42335' : '#148447', fontSize: 11, fontWeight: 750 }}>{phoneMessage.text}</div>}
        <button type="button" className="secondary-button" onClick={() => void saveBusinessPhone()} disabled={savingPhone} style={{ width: '100%', marginTop: 11 }}>
          {savingPhone ? <Loader2 size={17} className="animate-spin-slow" /> : <Phone size={17} />}
          Salvar telefone
        </button>
      </section>

      {/* Horário POR DIA DA SEMANA. Antes era um par abre/fecha só, igual pra
          semana inteira — não dava pra fechar na segunda, abrir mais cedo no
          sábado nem marcar 24 horas. O editor grava a grade nova e mantém os
          campos antigos preenchidos, pra quem não atualizou o app não ver a
          banca como "sem horário". */}
      {session?.id && (
        <EditorHorarios
          userId={session.id}
          horariosIniciais={horariosPerfil}
          abreAntigo={openingTime}
          fechaAntigo={closingTime}
          accent="#008fc0"
        />
      )}

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
