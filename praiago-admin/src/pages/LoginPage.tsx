import { useState } from 'react'
import { ShieldCheck, Mail, LockKeyhole, Eye, EyeOff, ArrowRight, LayoutDashboard, Smartphone, Fingerprint } from 'lucide-react'
import { AdminBrand } from '../components/Sidebar'
import { supabase } from '../lib/supabase'
import { logSecurityEvent } from '../lib/securityAudit'

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [recuperando, setRecuperando] = useState(false)

  async function handleLogin() {
    if (busy) return
    setBusy(true)
    setErro('')
    try {
    const email = user.trim().toLowerCase()

    if (/^\S+@\S+\.\S+$/.test(email)) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (!error && data.user) {
        const { data: perfil } = await supabase.from('profiles').select('role,status,nome').eq('id', data.user.id).maybeSingle()
        if ((perfil?.role === 'admin' || perfil?.role === 'sysadmin') && perfil?.status !== 'banido') {
          await logSecurityEvent('login_success', email, { role: perfil.role })
          onLogin()
          return
        }
        await supabase.auth.signOut()
        await logSecurityEvent('access_denied', email, { reason: 'not_admin_or_banned', role: perfil?.role ?? null, status: perfil?.status ?? null })
        setErro('Esta conta não tem acesso administrativo. Entre com uma conta autorizada.')
        return
      }

      await logSecurityEvent('login_failed', email, { reason: error?.message || 'invalid_credentials', status: error?.status ?? null })
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      await logSecurityEvent('suspicious_activity', null, { reason: 'admin_login_invalid_identifier', identifier_length: user.length })
    }
    setErro('Não foi possível entrar. Confira seu e-mail e sua senha.')
    } catch { setErro('Não foi possível conectar agora. Tente novamente em alguns instantes.') }
    finally { setBusy(false) }
  }

  async function recuperarSenha() {
    const email = user.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErro('INFORME O E-MAIL DA CONTA ADMIN.')
      return
    }
    if (recuperando || busy) return
    setRecuperando(true)
    try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })
    setErro(error
      ? 'NAO FOI POSSIVEL ENVIAR AGORA. AGUARDE E TENTE NOVAMENTE.'
      : 'Se a conta existir, o link de recuperação foi enviado ao e-mail informado.')
    } catch { setErro('Não foi possível enviar agora. Aguarde e tente novamente.') }
    finally { setRecuperando(false) }
  }

  return <main className="admin-login">
    <section className="admin-login-story" aria-label="PraiaGo Admin">
      <AdminBrand />
      <h1>Uma operação.<br/><span>Mais controle.</span><br/>Menos esforço.</h1>
      <p>Seu espaço para acompanhar a PraiaGo, cuidar dos parceiros e transformar informação em decisões.</p>
      <div className="admin-login-features">
        <div><LayoutDashboard size={19}/>Visão da operação em um só lugar</div>
        <div><Smartphone size={19}/>O mesmo controle no celular e no computador</div>
        <div><Fingerprint size={19}/>Acesso protegido e ações auditadas</div>
      </div>
    </section>
    <section>
      <div className="admin-login-mobile-brand"><AdminBrand /></div>
      <div className="admin-login-card">
        <div className="admin-login-lock"><ShieldCheck size={27}/></div>
        <h2>Bem-vindo ao painel</h2>
        <p>Entre com sua conta administrativa para continuar.</p>
        <form onSubmit={event=>{event.preventDefault();void handleLogin()}}>
          <div><label htmlFor="admin-email">E-mail de acesso</label><div className="admin-login-field"><Mail size={18}/><input id="admin-email" type="email" autoComplete="username" required value={user} onChange={event=>setUser(event.target.value)} placeholder="Seu e-mail" disabled={busy}/></div></div>
          <div><label htmlFor="admin-password">Senha</label><div className="admin-login-field"><LockKeyhole size={18}/><input id="admin-password" type={showPassword?'text':'password'} autoComplete="current-password" required value={pass} onChange={event=>setPass(event.target.value)} placeholder="Sua senha" disabled={busy}/><button type="button" aria-label={showPassword?'Ocultar senha':'Mostrar senha'} aria-pressed={showPassword} onClick={()=>setShowPassword(value=>!value)}>{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></div>
          {erro&&<p className="admin-inline-warning" role="status">{erro}</p>}
          <button type="submit" className="admin-primary-button" disabled={busy||recuperando}>{busy?'Conferindo acesso…':'Entrar no painel'}{!busy&&<ArrowRight size={17}/>}</button>
        </form>
        <button className="admin-login-recovery" type="button" disabled={recuperando||busy} onClick={()=>void recuperarSenha()}>{recuperando?'Enviando recuperação…':'Esqueci minha senha'}</button>
        <div className="admin-login-note"><ShieldCheck size={16}/><span>Área restrita à equipe autorizada. Suas permissões são verificadas ao entrar.</span></div>
      </div>
    </section>
  </main>
}
