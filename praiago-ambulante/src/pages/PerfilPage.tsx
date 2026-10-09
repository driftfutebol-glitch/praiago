import PushNotificationSetting from '../components/PushNotificationSetting'
import { disconnectPush } from '../lib/pushNotifications'
import VersaoDoApp from '../components/VersaoDoApp'
import { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2,
  ArrowUpRight,
  Camera,
  Circle,
  CircleAlert,
  HelpCircle,
  LayoutGrid,
  Loader2,
  LogOut,
  MapPin,
  Moon,
  PackageCheck,
  Phone,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Sun,
  Trash2,
  TrendingUp,
  Wallet,
  Waves,
} from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import SuportePanel from '../components/SuportePanel'
import SellerPhotoManager from '../components/SellerPhotoManager'
import TrocaNomeLoja from '../components/TrocaNomeLoja'
import { logout, useSessao } from '../lib/auth'
import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog'
import { supabase } from '../lib/supabase'
import { sellerPhotoUrl } from '../lib/sellerPhotos'
import { TEXTO_AREA_ATENDIDA } from '../lib/serviceArea'
import { SELLER_CATEGORIES, sellerCategory } from '../lib/sellerCategories'
import { useTheme } from '../lib/theme'

type Profile = {
  nome: string | null
  categoria: string | null
  zona: string | null
  telefone_comercial: string | null
  avaliacao_media: number | null
  total_avaliacoes: number | null
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
  const [businessPhone, setBusinessPhone] = useState('')
  const [savingPhone, setSavingPhone] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [phoneMessage, setPhoneMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [businessCategory, setBusinessCategory] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [categoryMessage, setCategoryMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'business' | 'preferences'>('overview')
  const darkMode = useTheme(state => state.darkMode)
  const setDarkMode = useTheme(state => state.setDarkMode)
  const [loadingProfile, setLoadingProfile] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [statsReady, setStatsReady] = useState(false)
  const [statsError, setStatsError] = useState(false)

  const load = useCallback(async () => {
    if (!session?.id) return
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const [{ data: profileData, error: profileError }, { data: orders, error: ordersError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('nome,categoria,zona,telefone_comercial,avaliacao_media,total_avaliacoes,online,verificado,foto_perfil_path,foto_capa_path')
        .eq('id', session.id)
        .maybeSingle(),
      supabase
        .from('pedidos')
        .select('total,status')
        .eq('vendedor_id', session.id)
        .eq('status', 'entregue')
        .gte('created_at', monthStart.toISOString()),
    ])

    setLoadError(Boolean(profileError || !profileData))
    setStatsError(Boolean(ordersError))
    setLoadingProfile(false)
    if (!profileError && profileData) {
      const nextProfile = profileData as Profile
      setProfile(nextProfile)
      setBusinessPhone(formatPhone(nextProfile.telefone_comercial || ''))
      setBusinessCategory(nextProfile.categoria || '')
    }
    if (!ordersError) {
      setStats({
        completedOrders: orders?.length || 0,
        revenue: (orders || []).reduce((sum, order) => sum + (Number(order.total) || 0), 0),
      })
      setStatsReady(true)
    }
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

  async function saveBusinessCategory() {
    if (!session?.id) return
    const selected = sellerCategory(businessCategory)
    if (!selected) { setCategoryMessage({ text: 'Selecione uma especialidade.', error: true }); return }
    setSavingCategory(true)
    const { error } = await supabase.from('profiles')
      .update({ categoria: selected.label, emoji: selected.emoji })
      .eq('id', session.id)
    setSavingCategory(false)
    if (error) { setCategoryMessage({ text: 'Não foi possível salvar a especialidade.', error: true }); return }
    setProfile(current => current ? { ...current, categoria: selected.label } : current)
    window.dispatchEvent(new CustomEvent('praiago:amb-category-change', { detail: selected }))
    setCategoryMessage({ text: 'Especialidade atualizada para os clientes.', error: false })
  }

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

  async function signOut() {
    await disconnectPush()
    logout()
    void supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  async function deleteAccount() {
    if (!session?.id || deletingAccount) return
    const continueDeletion = await confirmDialog({
      title: 'Excluir conta de ambulante?',
      message: 'Seu login, perfil, cardápio, fotos da banca e dados de verificação serão apagados. Pedidos, repasses e registros financeiros necessários ficam restritos. Saldo, estorno ou disputa pendente continuarão sendo tratados sem manter sua conta ativa.',
      confirmText: 'Continuar',
      cancelText: 'Cancelar',
      tone: 'danger',
    })
    if (!continueDeletion) return

    // Pede o e-mail em vez de uma palavra fixa: confirma a intencao e ja
    // entrega a equipe o dado que ela vai usar para localizar a conta.
    const emailInformado = await promptDialog({
      title: 'Confirme seu e-mail',
      message: 'Digite o e-mail da sua conta para registrarmos o pedido de exclusao. A equipe verifica saldo, repasses e disputas antes de concluir.',
      placeholder: session?.email || 'voce@exemplo.com',
      confirmText: 'Enviar pedido',
      cancelText: 'Cancelar',
      tone: 'danger',
    })
    if (!emailInformado || !emailInformado.trim()) return

    setDeletingAccount(true)
    try {
      const { data, error } = await supabase
        .from('solicitacoes_exclusao')
        .insert({
          user_id: session.id,
          email_informado: emailInformado.trim(),
          nome_informado: profile?.nome ?? null,
          // CPF nao e pedido no formulario; a equipe consulta pelo user_id.
          cpf_informado: null,
          papel_informado: 'ambulante',
        })
        .select('id')
        .single()

      // 23505 = ja existe pedido pendente. E a mesma solicitacao dele, entao
      // confirmamos em vez de tratar como falha.
      if (error && error.code === '23505') {
        await alertDialog({
          title: 'Pedido ja registrado',
          message: 'Voce ja tem um pedido de exclusao em analise. A equipe conclui em ate 30 dias.',
        })
        return
      }

      if (error || !data) {
        await alertDialog({
          title: 'Nao foi possivel registrar',
          message: 'Seu pedido nao foi enviado. Tente novamente. Se o erro continuar, fale com contato@praiago.com.br.',
          tone: 'danger',
        })
        return
      }

      await alertDialog({
        title: 'Pedido registrado',
        message: `Recebemos seu pedido. A equipe verifica saldo, repasses e disputas e conclui em ate 30 dias. Protocolo: ${data.id}.`,
        tone: 'success',
      })
    } catch (error) {
      console.error('Falha inesperada ao solicitar exclusao:', error)
      await alertDialog({
        title: 'Não foi possível confirmar',
        message: 'Não conseguimos confirmar o protocolo agora. Entre novamente para verificar antes de repetir a solicitação.',
        tone: 'danger',
      })
    } finally {
      setDeletingAccount(false)
    }
  }

  const rating = Number(profile?.avaliacao_media) || 0
  const reviewCount = Number(profile?.total_avaliacoes) || 0
  const profilePhoto = sellerPhotoUrl(profile?.foto_perfil_path)
  const coverPhoto = sellerPhotoUrl(profile?.foto_capa_path)
  const menuItems = [
    { icon: Store, title: 'Cardápio', detail: 'Produtos e categorias', action: () => navigate('/cardapio') },
    { icon: Wallet, title: 'Carteira', detail: 'Saldo e recebimentos', action: () => navigate('/carteira') },
    { icon: TrendingUp, title: 'Vendas', detail: 'Seu histórico de vendas', action: () => navigate('/vendas') },
    { icon: MapPin, title: 'Mapa', detail: 'Movimento na praia', action: () => navigate('/zonas') },
    { icon: Star, title: 'Avaliações', detail: 'O que os clientes dizem', action: () => navigate('/avaliacoes') },
    { icon: HelpCircle, title: 'Suporte', detail: 'Fale com nossa equipe', action: () => setSupportOpen(true) },
  ]

  const tabs = [
    { id: 'overview', label: 'Visão geral', icon: LayoutGrid },
    { id: 'business', label: 'Minha banca', icon: Store },
    { id: 'preferences', label: 'Preferências', icon: Settings2 },
  ] as const
  const checklist = [
    { label: 'Nome da banca', done: Boolean(profile?.nome) },
    { label: 'Especialidade definida', done: Boolean(profile?.categoria) },
    { label: 'Foto de perfil', done: Boolean(profilePhoto) },
    { label: 'Banner da vitrine', done: Boolean(coverPhoto) },
  ]
  const completeness = Math.round(checklist.filter(item => item.done).length / checklist.length * 100)
  const monthLabel = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div className="page-shell profile-page">
      <div className="profile-heading">
        <div><span className="eyebrow">Seu espaço PraiaGo</span><h1>Meu perfil</h1></div>
        <button type="button" role="switch" aria-label="Modo escuro" aria-checked={darkMode} className="icon-button profile-theme-shortcut" onClick={() => setDarkMode(!darkMode)} title={darkMode ? 'Usar tema claro' : 'Usar tema escuro'}>
          {darkMode ? <Moon size={21} /> : <Sun size={21} />}
        </button>
      </div>

      {loadError && <div className="profile-notice profile-error" role="alert"><CircleAlert size={17} /><span>Não conseguimos atualizar seu perfil. <button type="button" className="text-command" onClick={() => void load()}>Tentar novamente</button></span></div>}

      <section className="surface profile-vitrine" aria-label="Sua vitrine">
        <div className={`profile-cover${coverPhoto ? ' has-photo' : ''}`}>
          {coverPhoto && <img src={coverPhoto} alt="Banner da sua banca" />}
          <span className="profile-cover-label"><Waves size={16} /> SUA VITRINE NA PRAIA</span>
          {!coverPhoto && <span className="profile-cover-message">Sua banca.<br />Sua identidade.</span>}
          <button type="button" className="profile-edit-cover" onClick={() => setActiveTab('business')}><Camera size={15} /> Editar vitrine</button>
        </div>
        <div className="profile-identity">
          <div className="profile-identity-top">
            <div className="profile-avatar">{profilePhoto ? <img src={profilePhoto} alt={profile?.nome || 'Sua banca'} /> : <Store size={31} />}</div>
            {profile && <span className={`profile-verified${profile.verificado ? '' : ' is-pending'}`}><ShieldCheck size={13} /> {profile.verificado ? 'Cadastro aprovado' : 'Em análise'}</span>}
          </div>
          <h2 className="profile-name">{loadingProfile ? 'Carregando sua banca…' : profile?.nome || session?.nome || 'Minha banca'}</h2>
          <p className="profile-specialty">{profile?.categoria || 'Adicione a especialidade da sua banca'}</p>
          <div className="profile-meta">
            <span className="profile-rating"><Star size={14} fill={rating > 0 ? 'currentColor' : 'none'} />{rating > 0 ? rating.toFixed(1).replace('.', ',') : 'Sem avaliações'} {reviewCount > 0 && <small>({reviewCount})</small>}</span>
            <span><MapPin size={14} />{profile?.zona || 'Praia não informada'}</span>
          </div>
        </div>
      </section>

      <div className="profile-tabs" role="tablist" aria-label="Seções do perfil">
        {tabs.map(({ id, label, icon: Icon }, index) => <button key={id} id={`profile-tab-${id}`} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`profile-panel-${id}`} tabIndex={activeTab === id ? 0 : -1} className="profile-tab" onClick={() => setActiveTab(id)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
          setActiveTab(tabs[next].id)
          ;(event.currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus()
        }}><Icon size={16} />{label}</button>)}
      </div>

      {activeTab === 'overview' && <div className="profile-panel profile-columns" role="tabpanel" id="profile-panel-overview" aria-labelledby="profile-tab-overview">
        <div>
          <section className="surface profile-card">
            <div className="profile-card-heading"><h2>Seu mês na praia</h2><span>{monthLabel}</span></div>
            <div className="profile-metrics">
              <div className="profile-metric"><PackageCheck size={20} /><strong>{statsReady ? stats.completedOrders : '—'}</strong><span>Pedidos entregues</span></div>
              <div className="profile-metric"><TrendingUp size={20} /><strong>{statsReady ? money(stats.revenue) : '—'}</strong><span>Vendas brutas</span></div>
            </div>
            <p className="profile-metric-note">{statsError ? 'Não foi possível atualizar as vendas. Tente novamente em instantes.' : 'Somente pedidos entregues neste mês. O valor bruto não desconta taxas.'}</p>
          </section>
          <section className="surface profile-card">
            <div className="profile-card-heading"><h2>Para facilitar seu dia</h2><Sparkles size={17} color="var(--brand-blue)" /></div>
            <div className="profile-action-grid">{menuItems.map(({ icon: Icon, title, detail, action }) => <button type="button" className="profile-action" key={title} onClick={action}>
              <span className="profile-action-icon"><Icon size={18} /></span><span className="profile-action-text"><strong>{title}</strong><small>{detail}</small></span>
            </button>)}</div>
          </section>
        </div>
        <div>
          <section className="surface profile-card">
            <div className="profile-progress-heading"><h2>Sua vitrine</h2><strong>{loadingProfile || loadError ? '—' : `${completeness}%`}</strong></div>
            <p>{completeness === 100 ? 'Tudo pronto para apresentar sua banca aos clientes.' : 'Uma vitrine completa ajuda o cliente a reconhecer você na praia.'}</p>
            <div className="profile-progress-track" role="progressbar" aria-label="Preenchimento da vitrine" aria-valuenow={completeness} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${completeness}%` }} /></div>
            <ul className="profile-checklist">{checklist.map(({ label, done }) => <li key={label} className={done ? 'is-done' : undefined}>{done ? <CheckCircle2 size={16} /> : <Circle size={16} />}{label}</li>)}</ul>
            <button type="button" className="secondary-button" style={{ width: '100%' }} onClick={() => setActiveTab('business')}>{completeness === 100 ? 'Gerenciar minha vitrine' : 'Completar minha vitrine'}<ArrowUpRight size={17} /></button>
          </section>
          <section className="surface profile-card profile-radar">
            <div className="profile-radar-title"><span><Radio size={21} /></span><div><strong>Seu atendimento</strong><small>{profile ? profile.online ? 'Radar ligado' : 'Radar desligado' : 'Status indisponível'}</small></div></div>
            <p>Ligue o radar no Painel quando começar a atender. Ao parar, desligue. Não é necessário cadastrar horários.</p>
            <button type="button" className="secondary-button" onClick={() => navigate('/')}>Ir para o radar<ArrowUpRight size={17} /></button>
          </section>
          <section className="surface profile-card"><div className="profile-setting-row">
            <span className="profile-setting-icon">{darkMode ? <Moon size={21} /> : <Sun size={21} />}</span><div className="profile-setting-copy"><strong>Modo escuro</strong><p>{darkMode ? 'Azul profundo, conforto no fim do dia.' : 'Ative um visual mais confortável à noite.'}</p></div>
            <button type="button" className="profile-switch" role="switch" aria-label="Ativar modo escuro" aria-checked={darkMode} onClick={() => setDarkMode(!darkMode)}><span /></button>
          </div></section>
        </div>
      </div>}

      {activeTab === 'business' && <div className="profile-panel" role="tabpanel" id="profile-panel-business" aria-labelledby="profile-tab-business">
        {profile && (!profile.foto_perfil_path || !profile.foto_capa_path) && <div className="profile-notice" role="status"><CircleAlert size={17} /><span>Foto de perfil e banner são obrigatórios para sua vitrine. Complete as imagens antes de ligar o radar.</span></div>}
        <div className="profile-columns">
          <div className="profile-editors">
            {session?.id && profile && <SellerPhotoManager userId={session.id} profilePath={profile.foto_perfil_path || null} coverPath={profile.foto_capa_path || null} allowRemove={false} onChanged={({ profilePath, coverPath }) => setProfile(current => current ? { ...current, foto_perfil_path: profilePath, foto_capa_path: coverPath } : current)} />}
            <section className="surface profile-card">
              <h2>Especialidade da banca</h2><p>Aparece no perfil e na busca do Cliente. As abas e categorias dos produtos ficam no Cardápio.</p>
              <div className="profile-form"><label><span className="field-label">O que você vende na praia?</span>
                <select aria-label="Especialidade da banca" className="profile-input" value={businessCategory} onChange={event => { setBusinessCategory(event.target.value); setCategoryMessage(null) }}>
                  <option value="">Selecione a especialidade</option>
                  {businessCategory && !sellerCategory(businessCategory) && <option value={businessCategory}>{businessCategory} (atual)</option>}
                  {SELLER_CATEGORIES.map(item => <option key={item.label} value={item.label}>{item.emoji} {item.label}</option>)}
                </select>
              </label>
              {categoryMessage && <div role="status" className={`profile-feedback${categoryMessage.error ? ' is-error' : ''}`}>{categoryMessage.text}</div>}
              <button type="button" className="primary-button" onClick={() => void saveBusinessCategory()} disabled={savingCategory || !profile}>{savingCategory ? <Loader2 size={17} className="animate-spin-slow" /> : <Store size={17} />}Salvar especialidade</button></div>
            </section>
          </div>
          <div className="profile-editors">
            <section className="surface profile-card">
              <h2>Telefone comercial</h2><p>É por aqui que a equipe PraiaGo fala com você fora do app. Este contato é opcional.</p>
              <div className="profile-form"><label><span className="field-label">Telefone com DDD</span><input className="profile-input" value={businessPhone} onChange={event => { setBusinessPhone(formatPhone(event.target.value)); setPhoneMessage(null) }} inputMode="tel" autoComplete="tel-national" placeholder="(13) 99999-8888" /></label>
              {phoneMessage && <div role="status" className={`profile-feedback${phoneMessage.error ? ' is-error' : ''}`}>{phoneMessage.text}</div>}
              <button type="button" className="secondary-button" onClick={() => void saveBusinessPhone()} disabled={savingPhone || !profile}>{savingPhone ? <Loader2 size={17} className="animate-spin-slow" /> : <Phone size={17} />}Salvar telefone</button></div>
            </section>
            {session?.id && profile && <TrocaNomeLoja vendedorId={session.id} nomeAtual={profile.nome || session.nome || ''} onNomeAprovado={nomeNovo => setProfile(current => !current || current.nome === nomeNovo ? current : { ...current, nome: nomeNovo })} />}
          </div>
        </div>
      </div>}

      {activeTab === 'preferences' && <div className="profile-panel profile-columns" role="tabpanel" id="profile-panel-preferences" aria-labelledby="profile-tab-preferences">
        <div>
          <section className="surface profile-card" aria-label="Aparência do aplicativo">
            <div className="profile-setting-row"><span className="profile-setting-icon">{darkMode ? <Moon size={21} /> : <Sun size={21} />}</span><div className="profile-setting-copy"><strong>Aparência</strong><p>{darkMode ? 'Tema escuro ativado' : 'Tema claro ativado'} · salvo neste aparelho.</p></div><button type="button" className="profile-switch" role="switch" aria-label="Ativar modo escuro" aria-checked={darkMode} onClick={() => setDarkMode(!darkMode)}><span /></button></div>
            <div className="profile-theme-previews"><button type="button" className="profile-theme-preview" aria-pressed={!darkMode} onClick={() => setDarkMode(false)}><span className="profile-mini-screen" aria-hidden="true"><i /><i /></span>Tema claro</button><button type="button" className="profile-theme-preview" aria-pressed={darkMode} onClick={() => setDarkMode(true)}><span className="profile-mini-screen is-dark" aria-hidden="true"><i /><i /></span>Tema escuro</button></div>
          </section>
          <PushNotificationSetting />
          <section className="surface profile-card profile-coverage"><MapPin size={19} /><div><h2>Onde o PraiaGo opera</h2><p>Clientes de qualquer lugar veem sua banca. Para receber pedidos, é preciso estar atendendo dentro da área: {TEXTO_AREA_ATENDIDA} — SP, Brasil.</p></div></section>
        </div>
        <div>
          <section className="surface profile-card profile-account">
            <h2>Sua conta</h2><p>Cuide do acesso ao seu espaço de trabalho.</p>
            <div className="profile-account-row"><ShieldCheck size={17} /><span>{session?.email || 'Conta de ambulante'}</span></div>
            <button type="button" className="danger-button" onClick={() => void signOut()}><LogOut size={17} />Sair da conta</button>
            <button type="button" className="profile-delete" disabled={deletingAccount} onClick={() => void deleteAccount()}>{deletingAccount ? <Loader2 size={16} className="animate-spin-slow" /> : <Trash2 size={16} />}{deletingAccount ? 'Registrando solicitação…' : 'Solicitar exclusão da conta'}</button>
            <p className="profile-privacy">Veja quais dados são apagados ou preservados na <a href="https://www.praiago.com.br/excluir-conta.html" target="_blank" rel="noopener noreferrer">página de exclusão</a>.</p>
          </section>
          <section className="surface profile-card"><h2>Precisa de uma mão?</h2><p>A equipe PraiaGo ajuda com cadastro, atendimento e dúvidas do seu dia a dia.</p><button type="button" className="secondary-button" style={{ width: '100%' }} onClick={() => setSupportOpen(true)}><HelpCircle size={17} />Conversar com o suporte</button></section>
        </div>
      </div>}

      <VersaoDoApp />

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
