import { useState } from 'react'
import { Eye, EyeOff, LoaderCircle, LogIn, MailCheck, ShieldCheck, UserPlus } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'
import { promptDialog } from '../lib/dialog'
import { logSecurityEvent } from '../lib/securityAudit'
import { origemDoCadastro } from '../lib/origemCadastro'
import { supabase } from '../lib/supabase'

const fieldStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 46,
  padding: '11px 13px',
  border: '1px solid #dfe6ed',
  borderRadius: 8,
  background: '#f8fafc',
  color: '#132238',
  outline: 0,
  fontSize: 14,
  fontWeight: 650,
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: '#526178',
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
    if (tab === 'cadastro' && !name.trim()) {
      setMessage('Informe o nome da sua banca.')
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
            .select('status,ban_motivo,nome,role,conta_demo')
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
          navigate('/')
        }
      } else {
        const { data, error } = await supabase.functions.invoke('cadastro', {
          body: {
            email: target,
            senha: password,
            metadata: { nome: name, role: 'ambulante' },
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
        const response = data as { error?: string } | null
        if (response?.error) throw new Error(response.error)
        await logSecurityEvent('signup_created', target, { email_confirmation_required: true })
        setVerificationCode('')
        setVerificationEmail(target)
        setMessage('Enviamos um código de 6 dígitos para o seu e-mail.')
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
    if (!verificationEmail) return
    if (verificationCode.replace(/\D/g, '').length < 6) {
      setMessage('Digite o código de 6 dígitos enviado para o seu e-mail.')
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({ email: verificationEmail, token: verificationCode.trim(), type: 'signup' })
    setLoading(false)
    if (error) {
      setMessage('Código inválido ou expirado. Confira ou toque em Reenviar.')
      return
    }
    if (data.user) {
      const { data: profile } = await supabase.from('profiles').select('role,status,conta_demo').eq('id', data.user.id).maybeSingle()
      if (profile?.role !== 'ambulante' || profile?.status === 'banido') {
        await supabase.auth.signOut()
        setMessage('Esta conta não pode acessar o aplicativo de ambulante.')
        return
      }
      login(data.user.id, verificationEmail, name || undefined, profile?.conta_demo === true)
      navigate('/')
    }
  }

  async function resendCode() {
    if (!verificationEmail) return
    const { error } = await supabase.auth.resend({ type: 'signup', email: verificationEmail })
    setMessage(error ? 'Não foi possível reenviar agora. Aguarde um minuto.' : 'Reenviamos o código para o seu e-mail.')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '28px 18px', backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(244,247,250,0.96) 48%, #f4f7fa 100%), url(/images/ambulante-beach-header-v1.webp)', backgroundPosition: 'center top', backgroundSize: 'cover', backgroundRepeat: 'no-repeat' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, marginBottom: 18 }}>
          <div aria-label="PraiaGo" style={{ width: 150, height: 64, overflow: 'hidden', position: 'relative' }}>
            <img src="/praiago-logo-transparent.png" alt="PraiaGo" style={{ position: 'absolute', width: 238, height: 238, maxWidth: 'none', left: -58, top: -69, display: 'block' }} />
          </div>
          <span style={{ border: '1px solid #cce9d8', borderRadius: 999, background: 'rgba(238,249,242,0.94)', color: '#148447', padding: '6px 9px', fontSize: 9, fontWeight: 850, textTransform: 'uppercase' }}>Ambulante</span>
        </div>

        <section className="surface" style={{ padding: 20, boxShadow: '0 16px 36px rgba(23,45,74,0.13)' }}>
          {verificationEmail ? (
            <div>
              <div style={{ width: 46, height: 46, display: 'grid', placeItems: 'center', marginBottom: 14, borderRadius: 8, background: '#eaf6fa', color: '#008fc0' }}><MailCheck size={23} /></div>
              <h1 style={{ margin: 0, color: '#132238', fontSize: 22, fontWeight: 900 }}>Confirme seu e-mail</h1>
              <p style={{ margin: '6px 0 18px', color: '#617089', fontSize: 13, lineHeight: 1.45, fontWeight: 600 }}>Digite o código enviado para <strong style={{ color: '#40506a' }}>{verificationEmail}</strong>.</p>
              <input inputMode="numeric" autoFocus value={verificationCode} onChange={event => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={event => { if (event.key === 'Enter') void confirmSignup() }} placeholder="000000" aria-label="Código de verificação" style={{ ...fieldStyle, textAlign: 'center', fontSize: 24, fontWeight: 900 }} />
              {message && <div style={{ marginTop: 10, color: isSuccessMessage(message) ? '#148447' : '#b42335', fontSize: 12, lineHeight: 1.4, fontWeight: 750 }}>{message}</div>}
              <button type="button" className="primary-button" disabled={loading} onClick={() => void confirmSignup()} style={{ width: '100%', marginTop: 14 }}>
                {loading ? <LoaderCircle size={18} className="animate-spin-slow" /> : <MailCheck size={18} />}
                Confirmar código
              </button>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 13, marginTop: 10 }}>
                <button type="button" className="text-command" onClick={() => void resendCode()}>Reenviar</button>
                {/* Este botao sempre voltou para a tela de login -- so nao dizia
                    isso. Chamava-se "Trocar e-mail", que descreve o motivo mais
                    comum de voltar, nao o destino. Foi o que a Apple nao achou:
                    "no option to return to the login screen once the
                    registration process started". Agora o rotulo diz o destino,
                    e a linha abaixo cobre o motivo. */}
                <button type="button" className="text-command" onClick={() => { setVerificationEmail(null); setMessage('') }} style={{ color: '#617089' }}>Voltar ao login</button>
              </div>
              <div style={{ marginTop: 8, textAlign: 'center', color: '#8494ab', fontSize: 11.5, lineHeight: 1.4, fontWeight: 650 }}>
                Errou o e-mail? Volte ao login e cadastre de novo.
              </div>
            </div>
          ) : (
            <>
              <div role="tablist" aria-label="Acesso" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 18, padding: 4, borderRadius: 8, background: '#edf1f5' }}>
                {(['entrar', 'cadastro'] as const).map(item => (
                  <button type="button" role="tab" aria-selected={tab === item} key={item} onClick={() => { setTab(item); setMessage('') }} style={{ minHeight: 38, border: 0, borderRadius: 6, background: tab === item ? '#fff' : 'transparent', color: tab === item ? '#132238' : '#718096', boxShadow: tab === item ? '0 2px 7px rgba(23,45,74,0.09)' : 'none', fontSize: 12, fontWeight: 850, cursor: 'pointer' }}>
                    {item === 'entrar' ? 'Entrar' : 'Criar conta'}
                  </button>
                ))}
              </div>

              <h1 style={{ margin: 0, color: '#132238', fontSize: 22, fontWeight: 900 }}>{tab === 'entrar' ? 'Acesse sua operação' : 'Cadastre sua banca'}</h1>
              <p style={{ margin: '5px 0 18px', color: '#617089', fontSize: 12, lineHeight: 1.45, fontWeight: 600 }}>{tab === 'entrar' ? 'Gerencie produtos, pedidos e recebimentos.' : 'A conta será analisada antes da publicação.'}</p>

              <div style={{ display: 'grid', gap: 13 }}>
                {tab === 'cadastro' && (
                  <label>
                    <span style={labelStyle}>Nome da banca</span>
                    <input value={name} maxLength={80} onChange={event => setName(event.target.value)} placeholder="Nome que o cliente verá" style={fieldStyle} />
                  </label>
                )}
                <label>
                  <span style={labelStyle}>E-mail</span>
                  <input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="voce@exemplo.com" style={fieldStyle} />
                </label>
                <label>
                  <span style={labelStyle}>Senha</span>
                  <span style={{ display: 'block', position: 'relative' }}>
                    <input type={showPassword ? 'text' : 'password'} autoComplete={tab === 'entrar' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void submit() }} placeholder="Sua senha" style={{ ...fieldStyle, paddingRight: 46 }} />
                    <button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword(current => !current)} style={{ width: 38, height: 38, position: 'absolute', right: 4, top: 4, border: 0, background: 'transparent' }}>
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>

                {tab === 'cadastro' && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: 11, border: `1px solid ${acceptedTerms ? '#9ed2b4' : '#dfe6ed'}`, borderRadius: 8, background: acceptedTerms ? '#f5fbf7' : '#f8fafc', cursor: 'pointer' }}>
                    <input type="checkbox" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} style={{ width: 17, height: 17, flexShrink: 0, marginTop: 1, accentColor: '#18a957' }} />
                    <span style={{ color: '#526178', fontSize: 11, lineHeight: 1.5, fontWeight: 600 }}>
                      Li e aceito os <a href="https://www.praiago.com.br/termos.html" target="_blank" rel="noopener noreferrer" style={{ color: '#007fa6', fontWeight: 800 }}>Termos de Uso</a> e a <a href="https://www.praiago.com.br/privacidade.html" target="_blank" rel="noopener noreferrer" style={{ color: '#007fa6', fontWeight: 800 }}>Política de Privacidade</a>, incluindo o uso da localização durante o atendimento.
                    </span>
                  </label>
                )}

                {message && <div role="status" style={{ color: isSuccessMessage(message) ? '#148447' : '#b42335', fontSize: 12, lineHeight: 1.4, fontWeight: 750 }}>{message}</div>}

                <button type="button" className="primary-button" disabled={loading} onClick={() => void submit()} style={{ width: '100%' }}>
                  {loading ? <LoaderCircle size={18} className="animate-spin-slow" /> : tab === 'entrar' ? <LogIn size={18} /> : <UserPlus size={18} />}
                  {loading ? 'Aguarde' : tab === 'entrar' ? 'Entrar' : 'Criar conta'}
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

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, color: '#526178', fontSize: 10, fontWeight: 700 }}>
          <ShieldCheck size={14} color="#148447" />
          Acesso protegido e cadastro sujeito à aprovação.
        </div>
      </div>
    </div>
  )
}
