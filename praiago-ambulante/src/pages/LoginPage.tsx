import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, ImagePlus, LoaderCircle, LogIn, MailCheck, ShieldCheck, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'
import { promptDialog } from '../lib/dialog'
import { logSecurityEvent } from '../lib/securityAudit'
import { origemDoCadastro } from '../lib/origemCadastro'
import { supabase } from '../lib/supabase'
import { BEACH_ZONES } from '../lib/praiagoZones'
import { SELLER_PHOTO_BUCKET } from '../lib/sellerPhotos'
import { SELLER_CATEGORIES, sellerCategory } from '../lib/sellerCategories'

const SIGNUP_STEPS = ['Banca', 'Praia', 'Fotos', 'Conta'] as const
type PhotoKind = 'perfil' | 'capa'

function validatePhoto(file: File | null) {
  if (!file) return 'Escolha uma imagem para continuar.'
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Use uma foto JPG, PNG ou WebP.'
  if (file.size > 5 * 1024 * 1024) return 'Cada foto deve ter no máximo 5 MB.'
  return null
}

function signupDraft(metadata: Record<string, unknown> | undefined) {
  if (metadata?.role !== 'ambulante') return null
  const nome = typeof metadata.nome === 'string' ? metadata.nome.trim() : ''
  const categoria = typeof metadata.categoria === 'string' ? metadata.categoria : ''
  const zona = typeof metadata.zona === 'string' ? metadata.zona : ''
  const category = sellerCategory(categoria)
  if (!nome || !category || !BEACH_ZONES.some(beach => beach.nome === zona)) return null
  return { nome, categoria, emoji: category.emoji, zona }
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  padding: '11px 13px',
  border: '1px solid var(--line)',
  borderRadius: 13,
  background: 'var(--surface-soft)',
  color: 'var(--ink)',
  outline: 0,
  fontSize: 14,
  fontWeight: 650,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: 'var(--muted)',
  fontSize: 11,
  lineHeight: 1.3,
  fontWeight: 850,
  textTransform: 'uppercase',
}

function isSuccessMessage(message: string) {
  const normalized = message.toLowerCase()
  return normalized.includes('enviamos') || normalized.includes('reenviamos') || normalized.includes('sucesso')
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<'entrar' | 'cadastro'>('entrar')
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [signupStep, setSignupStep] = useState(0)
  const [category, setCategory] = useState('')
  const [beach, setBeach] = useState('')
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null)
  const [coverPhoto, setCoverPhoto] = useState<File | null>(null)
  const [profilePreview, setProfilePreview] = useState<string | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [pendingSignupUserId, setPendingSignupUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!profilePhoto) { setProfilePreview(null); return }
    const url = URL.createObjectURL(profilePhoto)
    setProfilePreview(url)
    return () => URL.revokeObjectURL(url)
  }, [profilePhoto])

  useEffect(() => {
    if (!coverPhoto) { setCoverPreview(null); return }
    const url = URL.createObjectURL(coverPhoto)
    setCoverPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [coverPhoto])

  function validateStep(step: number) {
    if (step === 0) {
      if (!name.trim()) return 'Informe o nome da banca.'
      if (!sellerCategory(category)) return 'Selecione o que você vende na praia.'
    }
    if (step === 1 && !BEACH_ZONES.some(zone => zone.nome === beach)) return 'Selecione a praia principal de atuação.'
    if (step === 2) {
      if (validatePhoto(profilePhoto)) return 'Adicione uma foto de perfil em JPG, PNG ou WebP, com até 5 MB.'
      if (validatePhoto(coverPhoto)) return 'Adicione um banner em JPG, PNG ou WebP, com até 5 MB.'
    }
    return null
  }

  function nextStep() {
    const error = validateStep(signupStep)
    if (error) { setMessage(error); return }
    setMessage('')
    setSignupStep(step => Math.min(step + 1, SIGNUP_STEPS.length - 1))
  }

  function choosePhoto(kind: PhotoKind, file?: File) {
    if (!file) return
    const error = validatePhoto(file)
    if (error) { setMessage(error); return }
    setMessage('')
    if (kind === 'perfil') setProfilePhoto(file)
    else setCoverPhoto(file)
  }

  async function uploadSignupPhoto(userId: string, kind: PhotoKind, file: File) {
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/${kind}-${Date.now()}-${crypto.randomUUID()}.${ext}`
    const { error: uploadError } = await supabase.storage.from(SELLER_PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const field = kind === 'perfil' ? 'foto_perfil_path' : 'foto_capa_path'
    const { error: profileError } = await supabase.from('profiles').update({ [field]: path }).eq('id', userId)
    if (profileError) {
      await supabase.storage.from(SELLER_PHOTO_BUCKET).remove([path])
      throw profileError
    }
  }

  const normalizedEmail = () => email.trim().toLowerCase()

  async function requestPasswordReset() {
    const target = normalizedEmail()
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setMessage('Informe seu e-mail válido para redefinir a senha.')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(target, { redirectTo: window.location.origin })
    if (!error) await logSecurityEvent('password_reset_requested', target)
    setMessage(error
      ? 'Não foi possível enviar a redefinição agora. Tente novamente em instantes.'
      : 'Enviamos o e-mail de redefinição. Use o link ou o código recebido.')
  }

  async function confirmPasswordCode() {
    const target = normalizedEmail()
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setMessage('Informe seu e-mail válido para confirmar o código.')
      return
    }
    const code = await promptDialog({ title: 'Código do e-mail', message: 'Digite o código enviado para o seu e-mail.', placeholder: '000000' })
    if (!code?.trim()) return
    const newPassword = await promptDialog({ title: 'Nova senha', message: 'Use pelo menos 10 caracteres, com letras e números.', placeholder: 'Nova senha', secret: true })
    if (!newPassword || newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setMessage('Use pelo menos 10 caracteres, com letras e números.')
      return
    }

    const { error: otpError } = await supabase.auth.verifyOtp({ email: target, token: code.trim(), type: 'recovery' })
    if (otpError) {
      setMessage('Código inválido ou expirado. Peça um novo código.')
      return
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setMessage(error
      ? 'Não foi possível trocar a senha. Peça um novo código e tente novamente.'
      : 'Senha alterada com sucesso. Entre novamente.')
    if (!error) await supabase.auth.signOut()
  }

  async function resendVerification() {
    const target = normalizedEmail()
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setMessage('Informe seu e-mail válido para reenviar a verificação.')
      return
    }
    const { error } = await supabase.auth.resend({ type: 'signup', email: target })
    setMessage(error
      ? 'Não foi possível reenviar agora. Aguarde um minuto e tente novamente.'
      : 'Enviamos um novo e-mail de verificação.')
  }

  async function submit() {
    if (tab === 'cadastro') {
      for (let step = 0; step < SIGNUP_STEPS.length - 1; step++) {
        const error = validateStep(step)
        if (error) { setSignupStep(step); setMessage(error); return }
      }
    }
    const target = normalizedEmail()
    if (!/^\S+@\S+\.\S+$/.test(target)) {
      setMessage('Informe um e-mail válido.')
      return
    }
    if (password.length < 6) {
      setMessage('A senha precisa ter ao menos 6 caracteres.')
      return
    }
    if (tab === 'cadastro' && (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password))) {
      setMessage('Use pelo menos 10 caracteres, com letras e números.')
      return
    }
    if (tab === 'cadastro' && !acceptedTerms) {
      setMessage('Você precisa aceitar os Termos de Uso e a Política de Privacidade.')
      return
    }

    setMessage('')
    setLoading(true)

    try {
      if (tab === 'entrar') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: target, password })
        if (error) {
          await logSecurityEvent('login_failed', target, { status: error.status ?? null, message: error.message })
          if (error.status === 429) throw new Error('Limite de tentativas excedido. Aguarde alguns minutos e tente novamente.')
          if (error.message.includes('Email not confirmed')) throw new Error('E-mail não confirmado. Verifique sua caixa de entrada.')
          if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.')
          throw new Error('Não foi possível entrar. Verifique seus dados e sua conexão.')
        }

        if (data.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('status,ban_motivo,nome,role,conta_demo,categoria,foto_perfil_path,foto_capa_path')
            .eq('id', data.user.id)
            .maybeSingle()

          if (profile?.role !== 'ambulante') {
            await supabase.auth.signOut()
            await logSecurityEvent('access_denied', target, { reason: 'wrong_app_role', role: profile?.role ?? null })
            throw new Error('Esta conta não pertence ao aplicativo de ambulante.')
          }
          if (profile?.status === 'banido') {
            await supabase.auth.signOut()
            await logSecurityEvent('access_denied', target, { reason: 'banned', ban_motivo: profile.ban_motivo ?? null })
            throw new Error(`Conta bloqueada pelo suporte.${profile.ban_motivo ? ` Motivo: ${profile.ban_motivo}` : ''}`)
          }

          await logSecurityEvent('login_success', target, { user_id: data.user.id })
          login(data.user.id, target, profile?.nome || undefined, profile?.conta_demo === true)
          navigate(profile?.categoria && profile?.foto_perfil_path && profile?.foto_capa_path ? '/' : '/perfil')
        }
      } else {
        const { data, error } = await supabase.functions.invoke('cadastro', {
          body: {
            email: target,
            senha: password,
            metadata: { nome: name.trim(), role: 'ambulante', categoria: category, zona: beach },
            emailRedirectTo: `${window.location.origin}/`,
            origem: origemDoCadastro(),
          },
        })
        if (error) {
          let errorMessage = 'Erro ao criar conta. Tente novamente.'
          try {
            const body = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.()
            if (body?.error) errorMessage = body.error
          } catch {
            // Mantém a mensagem segura e genérica.
          }
          throw new Error(errorMessage)
        }
        const response = data as { error?: string; user_id?: string } | null
        if (response?.error) throw new Error(response.error)
        if (!response?.user_id) throw new Error('Não foi possível identificar a conta criada. Tente novamente.')
        await logSecurityEvent('signup_created', target, { email_confirmation_required: true })
        setPendingSignupUserId(response.user_id)
        setVerificationCode('')
        setVerificationEmail(target)
        setMessage('Enviamos um código de 6 dígitos. Confirme para enviar suas fotos.')
      }
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Erro inesperado.'
      if (errorMessage.includes('Failed to fetch')) errorMessage = 'Erro de conexão. Verifique sua internet.'
      if (errorMessage.includes('kfxpzjqktbcsxlqapkyv')) errorMessage = 'Erro interno do servidor. Tente novamente mais tarde.'
      setMessage(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  async function confirmSignup() {
    if (!verificationEmail || !pendingSignupUserId) return
    if (validatePhoto(profilePhoto) || validatePhoto(coverPhoto)) {
      setMessage('Selecione novamente a foto do perfil e o banner para concluir o cadastro.')
      return
    }
    setLoading(true)
    try {
      const { data: current } = await supabase.auth.getUser()
      let userId = current.user?.id
      if (userId !== pendingSignupUserId) {
        if (verificationCode.replace(/\D/g, '').length < 6) throw new Error('Digite o código de 6 dígitos enviado para o seu e-mail.')
        const { data, error } = await supabase.auth.verifyOtp({ email: verificationEmail, token: verificationCode.trim(), type: 'signup' })
        if (error || !data.user) throw new Error('Código inválido ou expirado. Confira ou toque em Reenviar.')
        userId = data.user.id
      }
      if (userId !== pendingSignupUserId) throw new Error('A conta confirmada não corresponde a este cadastro.')
      const draft = signupDraft({ role: 'ambulante', nome: name, categoria: category, zona: beach })
      if (!draft) throw new Error('Confira o nome, a categoria e a praia antes de concluir.')
      const { error: profileError } = await supabase.from('profiles').update(draft).eq('id', userId)
      if (profileError) throw new Error('E-mail confirmado, mas não foi possível salvar a banca. Tente novamente.')
      const { data: existing, error: readError } = await supabase.from('profiles')
        .select('role,status,conta_demo,foto_perfil_path,foto_capa_path').eq('id', userId).maybeSingle()
      if (readError || existing?.role !== 'ambulante' || existing?.status === 'banido') throw new Error('Esta conta não pode acessar o aplicativo de ambulante.')
      if (!existing.foto_perfil_path) await uploadSignupPhoto(userId, 'perfil', profilePhoto!)
      if (!existing.foto_capa_path) await uploadSignupPhoto(userId, 'capa', coverPhoto!)
      const { data: completed } = await supabase.from('profiles')
        .select('foto_perfil_path,foto_capa_path').eq('id', userId).maybeSingle()
      if (!completed?.foto_perfil_path || !completed?.foto_capa_path) throw new Error('Uma das fotos não foi salva. Tente enviar novamente.')
      login(userId, verificationEmail, name.trim(), existing.conta_demo === true)
      navigate('/')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  async function resendCode() {
    if (!verificationEmail) return
    const { error } = await supabase.auth.resend({ type: 'signup', email: verificationEmail })
    setMessage(error ? 'Não foi possível reenviar agora. Aguarde um minuto.' : 'Reenviamos o código para o seu e-mail.')
  }

  function photoPicker() {
    return <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.35fr)', gap: 10 }}>
      {([
        { kind: 'perfil' as const, title: 'Foto de perfil', file: profilePhoto, preview: profilePreview, ratio: '1 / 1' },
        { kind: 'capa' as const, title: 'Banner da banca', file: coverPhoto, preview: coverPreview, ratio: '16 / 9' },
      ]).map(item => <label key={item.kind} style={{ display: 'block', minWidth: 0, cursor: 'pointer' }}>
        <span style={labelStyle}>{item.title} *</span>
        <span style={{ display: 'grid', placeItems: 'center', overflow: 'hidden', aspectRatio: item.ratio, border: `1px ${item.file ? 'solid var(--success-line)' : 'dashed var(--line-strong)'}`, borderRadius: 14, background: 'var(--surface-soft)', color: 'var(--brand-blue)' }}>
          {item.preview ? <img src={item.preview} alt={`Prévia de ${item.title.toLowerCase()}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus size={26} />}
        </span>
        <span style={{ display: 'block', marginTop: 6, color: 'var(--brand-blue)', fontSize: 11, fontWeight: 800 }}>{item.file ? 'Trocar foto' : 'Escolher foto'}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => choosePhoto(item.kind, event.target.files?.[0])} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
      </label>)}
    </div>
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '30px 18px', backgroundImage: 'var(--login-art), url(/images/ambulante-beach-header-v1.webp)', backgroundPosition: 'center top', backgroundSize: 'cover', backgroundRepeat: 'no-repeat' }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, marginBottom: 18 }}>
          <div aria-label="PraiaGo" style={{ width: 150, height: 64, overflow: 'hidden', position: 'relative' }}>
            <img src="/praiago-logo-transparent.png" alt="PraiaGo" style={{ position: 'absolute', width: 238, height: 238, maxWidth: 'none', left: -58, top: -69, display: 'block' }} />
          </div>
          <span style={{ border: '1px solid var(--success-line)', borderRadius: 999, background: 'var(--surface-green)', color: 'var(--success)', padding: '6px 9px', fontSize: 9, fontWeight: 850, textTransform: 'uppercase' }}>Ambulante</span>
        </div>

        <section className="surface" style={{ padding: 24, borderRadius: 24, boxShadow: '0 18px 42px rgba(20,73,79,0.13)' }}>
          {verificationEmail ? (
            <div>
              <div style={{ width: 46, height: 46, display: 'grid', placeItems: 'center', marginBottom: 14, borderRadius: 8, background: 'var(--surface-blue)', color: 'var(--info)' }}><MailCheck size={23} /></div>
              <h1 style={{ margin: 0, color: 'var(--ink-strong)', fontSize: 22, fontWeight: 900 }}>Confirme seu e-mail</h1>
              <p style={{ margin: '6px 0 18px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>Digite o código enviado para <strong style={{ color: 'var(--ink)' }}>{verificationEmail}</strong>.</p>
              <input inputMode="numeric" autoFocus value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={event => { if (event.key === 'Enter') void confirmSignup() }} placeholder="000000" aria-label="Código de verificação" style={{ ...fieldStyle, textAlign: 'center', fontSize: 24, fontWeight: 900 }} />
              <div style={{ marginTop: 15 }}>{photoPicker()}</div>
              {message && <div style={{ marginTop: 10, color: isSuccessMessage(message) ? 'var(--success)' : 'var(--danger)', fontSize: 12, lineHeight: 1.4, fontWeight: 750 }}>{message}</div>}
              <button type="button" className="primary-button" disabled={loading} onClick={() => void confirmSignup()} style={{ width: '100%', marginTop: 14 }}>
                {loading ? <LoaderCircle size={18} className="animate-spin-slow" /> : <MailCheck size={18} />}
                Confirmar e concluir cadastro
              </button>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 13, marginTop: 10 }}>
                <button type="button" className="text-command" onClick={() => void resendCode()}>Reenviar</button>
                {/* Este botao sempre voltou para a tela de login -- so nao dizia
                    isso. Chamava-se "Trocar e-mail", que descreve o motivo mais
                    comum de voltar, nao o destino. Foi o que a Apple nao achou:
                    "no option to return to the login screen once the
                    registration process started". Agora o rotulo diz o destino,
                    e a linha abaixo cobre o motivo. */}
                <button type="button" className="text-command" onClick={() => { setVerificationEmail(null); setMessage(''); setTab('entrar') }} style={{ color: 'var(--muted)' }}>Voltar ao login</button>
              </div>
              <div style={{ marginTop: 8, textAlign: 'center', color: 'var(--muted)', fontSize: 11.5, lineHeight: 1.4, fontWeight: 650 }}>
                Errou o e-mail? Volte ao login e cadastre de novo.
              </div>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Acesso" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 20, padding: 4, borderRadius: 14, background: 'var(--surface-soft)' }}>
                {(['entrar', 'cadastro'] as const).map(item => (
                  <button type="button" role="tab" aria-selected={tab === item} key={item} onClick={() => { setTab(item); setMessage('') }} style={{ minHeight: 42, border: 0, borderRadius: 11, background: tab === item ? 'var(--surface)' : 'transparent', color: tab === item ? '#075e72' : 'var(--muted)', boxShadow: tab === item ? '0 3px 10px rgba(20,73,79,0.1)' : 'none', fontSize: 13, fontWeight: 850, cursor: 'pointer' }}>
                    {item === 'entrar' ? 'Entrar' : 'Criar conta'}
                  </button>
                ))}
              </div>

              <h1 style={{ margin: 0, color: 'var(--ink)', fontSize: 25, fontWeight: 900 }}>{tab === 'entrar' ? 'Sua banca começa aqui' : 'Cadastre sua banca'}</h1>
              <p style={{ margin: '6px 0 20px', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5, fontWeight: 600 }}>{tab === 'entrar' ? 'Pedidos, cardápio e recebimentos no mesmo lugar.' : 'A conta será analisada antes da publicação.'}</p>

              {tab === 'cadastro' && <div aria-label="Etapas do cadastro" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 19 }}>
                {SIGNUP_STEPS.map((step, index) => <div key={step} aria-current={signupStep === index ? 'step' : undefined} style={{ minWidth: 0 }}>
                  <div style={{ height: 5, borderRadius: 99, background: index <= signupStep ? '#087b79' : 'var(--line)' }} />
                  <span style={{ display: 'block', marginTop: 5, color: signupStep === index ? '#075e72' : '#738890', fontSize: 10, fontWeight: 850 }}>{step}</span>
                </div>)}
              </div>}

              <div style={{ display: 'grid', gap: 13 }}>
                {tab === 'cadastro' && signupStep === 0 && <>
                  <label>
                    <span style={labelStyle}>Nome da banca</span>
                    <input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Nome que o cliente verá" style={fieldStyle} />
                  </label>
                  <label>
                    <span style={labelStyle}>O que você vende principalmente? *</span>
                    <select value={category} onChange={event => setCategory(event.target.value)} style={fieldStyle}>
                      <option value="">Selecione sua especialidade</option>
                      {SELLER_CATEGORIES.map(item => <option key={item.label} value={item.label}>{item.emoji} {item.label}</option>)}
                    </select>
                  </label>
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>Essa especialidade aparecerá no seu perfil e na busca do Cliente. Seu cardápio poderá ter outras categorias.</p>
                </>}
                {tab === 'cadastro' && signupStep === 1 && <>
                  <label>
                    <span style={labelStyle}>Praia principal de atuação *</span>
                    <select value={beach} onChange={event => setBeach(event.target.value)} style={fieldStyle}>
                      <option value="">Selecione a praia</option>
                      {BEACH_ZONES.map(zone => <option key={zone.id} value={zone.nome}>{zone.nome}</option>)}
                    </select>
                  </label>
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>Atendimento na orla de Praia Grande. Quando você estiver online, o GPS mostrará sua posição e a zona atuais ao cliente.</p>
                </>}
                {tab === 'cadastro' && signupStep === 2 && <>
                  {photoPicker()}
                  <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>As duas fotos são obrigatórias. Use imagens reais da sua banca, em JPG, PNG ou WebP, com até 5 MB cada.</p>
                </>}
                {(tab === 'entrar' || signupStep === 3) && <label>
                  <span style={labelStyle}>E-mail</span>
                  <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" style={fieldStyle} />
                </label>}
                {(tab === 'entrar' || signupStep === 3) && <label>
                  <span style={labelStyle}>Senha</span>
                  <span style={{ display: 'block', position: 'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} autoComplete={tab === 'entrar' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void submit() }} placeholder="Sua senha" style={{ ...fieldStyle, paddingRight: 46 }} />
                    <button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(current => !current)} style={{ width: 38, height: 38, position: 'absolute', right: 4, top: 4, border: 0, background: 'transparent' }}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>}

                {tab === 'cadastro' && signupStep === 3 && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: 11, border: `1px solid ${acceptedTerms ? '#9ed2b4' : 'var(--line)'}`, borderRadius: 8, background: acceptedTerms ? 'var(--surface-green)' : 'var(--surface-soft)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} style={{ width: 17, height: 17, flexShrink: 0, marginTop: 1, accentColor: '#18a957' }} />
                    <span style={{ color: 'var(--muted)', fontSize: 11, lineHeight: 1.5, fontWeight: 600 }}>
                      Li e aceito os <a href="https://www.praiago.com.br/termos.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', fontWeight: 800 }}>Termos de Uso</a> e a <a href="https://www.praiago.com.br/privacidade.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--info)', fontWeight: 800 }}>Política de Privacidade</a>, incluindo o uso da localização durante o atendimento.
                    </span>
                  </label>
                )}

                {message && <div role="status" style={{ color: isSuccessMessage(message) ? 'var(--success)' : 'var(--danger)', fontSize: 12, lineHeight: 1.4, fontWeight: 750 }}>{message}</div>}

                {tab === 'cadastro' && signupStep > 0 && <button type="button" className="text-command" onClick={() => { setSignupStep(step => step - 1); setMessage('') }} style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: 6 }}><ChevronLeft size={15} /> Voltar uma etapa</button>}
                <button type="button" className="primary-button" disabled={loading} onClick={() => tab === 'cadastro' && signupStep < SIGNUP_STEPS.length - 1 ? nextStep() : void submit()} style={{ width: '100%' }}>
                  {loading ? <LoaderCircle size={18} className="animate-spin-slow" /> : tab === 'entrar' ? <LogIn size={18} /> : signupStep < SIGNUP_STEPS.length - 1 ? <ChevronRight size={18} /> : <UserPlus size={18} />}
                  {loading ? 'Aguarde' : tab === 'entrar' ? 'Entrar' : signupStep < SIGNUP_STEPS.length - 1 ? 'Continuar' : 'Criar conta'}
                </button>

                {tab === 'entrar' && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 3, flexWrap: 'wrap' }}>
                    <button type="button" className="text-command" onClick={() => void requestPasswordReset()}>Esqueci a senha</button>
                    <button type="button" className="text-command" onClick={() => void confirmPasswordCode()}>Tenho um código</button>
                    <button type="button" className="text-command" onClick={() => void resendVerification()}>Reenviar verificação</button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, color: 'var(--muted)', fontSize: 10, fontWeight: 700 }}>
          <ShieldCheck size={14} color="var(--success)" />
          Acesso protegido e cadastro sujeito à aprovação.
        </div>
      </div>
    </div>
  )
}
