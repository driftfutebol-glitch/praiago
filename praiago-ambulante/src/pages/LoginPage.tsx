import { useEffect, useState } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { login } from '../lib/auth'

export default function LoginPage() {
  const [tab, setTab] = useState<'entrar' | 'cadastro'>('entrar')
  const [verSenha, setVerSenha] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (event) => {
      if (event !== 'PASSWORD_RECOVERY') return
      const novaSenha = window.prompt('Digite a nova senha com pelo menos 6 caracteres:')
      if (!novaSenha || novaSenha.length < 6) {
        setErro('A nova senha precisa ter ao menos 6 caracteres.')
        return
      }
      const { error } = await supabase.auth.updateUser({ password: novaSenha })
      setErro(error ? `Nao foi possivel redefinir a senha: ${error.message}` : 'Senha redefinida com sucesso. Faca login novamente.')
    })
    return () => data.subscription.unsubscribe()
  }, [])

  function emailNormalizado() {
    return email.trim().toLowerCase()
  }

  async function enviarResetSenha() {
    const alvo = emailNormalizado()
    if (!/^\S+@\S+\.\S+$/.test(alvo)) { setErro('Informe seu e-mail valido para redefinir a senha.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(alvo, { redirectTo: window.location.origin })
    setErro(error ? `Nao foi possivel enviar redefinicao: ${error.message}` : 'Enviamos o link de redefinicao para seu e-mail.')
  }

  async function reenviarVerificacao() {
    const alvo = emailNormalizado()
    if (!/^\S+@\S+\.\S+$/.test(alvo)) { setErro('Informe seu e-mail valido para reenviar a verificacao.'); return }
    const { error } = await supabase.auth.resend({ type: 'signup', email: alvo })
    setErro(error ? `Nao foi possivel reenviar verificacao: ${error.message}` : 'Enviamos um novo e-mail de verificacao.')
  }

  async function submit() {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    if (tab === 'cadastro' && !nome.trim()) { setErro('Informe o nome da sua banca.'); return }
    setErro('')
    setLoading(true)

    try {
      if (tab === 'entrar') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) {
          if (error.status === 429) throw new Error('Limite de tentativas excedido. Aguarde alguns minutos e tente novamente.')
          if (error.message.includes('Email not confirmed')) throw new Error('E-mail não confirmado! Verifique sua caixa de entrada.')
          if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.')
          throw new Error('Erro ao fazer login. Verifique seus dados e sua conexão.')
        }
        
        if (data.user) {
          const { data: perfil } = await supabase
            .from('profiles')
            .select('status,ban_motivo,nome')
            .eq('id', data.user.id)
            .maybeSingle()

          if (perfil?.status === 'banido') {
            await supabase.auth.signOut()
            throw new Error(`Conta bloqueada pelo suporte.${perfil.ban_motivo ? ` Motivo: ${perfil.ban_motivo}` : ''}`)
          }

          login(data.user.id, email, perfil?.nome || undefined);
          navigate('/');
        }

      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { nome, role: 'ambulante' } }
        })
        if (error) {
          if (error.status === 429) throw new Error('Limite de e-mails do Supabase (429). Para testar: Authentication → Providers → Email → desligue "Confirm email". Ou aumente os Rate Limits.')
          throw new Error(error.message)
        }

        if (data.session && data.user) {
          login(data.user.id, email);
          navigate('/')
          return
        }

        if (data.user && !data.session) {
          setErro('Conta criada! Enviamos um link de confirmação para o seu e-mail.')
          setTab('entrar')
          setLoading(false)
          return
        }
      }
    } catch (err: any) {
      let msg = err.message || 'Erro inesperado.'
      if (msg.includes('Failed to fetch')) msg = 'Erro de conexão. Verifique sua internet.'
      if (msg.includes('kfxpzjqktbcsxlqapkyv')) msg = 'Erro interno do servidor. Tente novamente mais tarde.'
      setErro(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#f1f5f9',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '32px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🌴</div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>PraiaGo</div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: '#0ea5e9', textTransform: 'uppercase' }}>Ambulante</div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 24, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 12, padding: 4, marginBottom: 24 }}>
          {(['entrar', 'cadastro'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setErro('') }} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, border: 'none',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
              background: tab === t ? '#fff' : 'transparent',
              color: tab === t ? '#0f172a' : '#94a3b8',
              boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.2s',
            }}>{t === 'entrar' ? 'Entrar' : 'Criar conta'}</button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
          {tab === 'entrar' ? 'Bem-vindo de volta. Entre para acompanhar seus pedidos.' : 'Crie sua conta para começar a vender na praia.'}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {tab === 'cadastro' && (
            <div>
              <label htmlFor="amb-nome" style={labelStyle}>Nome da banca</label>
              <input id="amb-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome da sua banca" style={inputStyle} />
            </div>
          )}
          <div>
            <label htmlFor="amb-email" style={labelStyle}>E-mail</label>
            <input id="amb-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="amb-senha" style={labelStyle}>Senha</label>
            <div style={{ position: 'relative' }}>
              <input id="amb-senha" type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="••••••••" style={{ ...inputStyle, padding: '13px 44px 13px 16px' }} />
              <button aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {erro && <div style={{ fontSize: 13, color: erro.includes('sucesso') ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{erro}</div>}

          <button disabled={loading} onClick={submit} style={{ background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 14, padding: '15px 0', color: '#fff', fontSize: 16, fontWeight: 700, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, opacity: loading ? 0.7 : 1 }}>
            <LogIn size={18} />
            {loading ? 'AGUARDE...' : (tab === 'entrar' ? 'Entrar' : 'Criar conta')}
          </button>
          {tab === 'entrar' && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: -4 }}>
              <button type="button" onClick={enviarResetSenha} style={{ background: 'none', border: 0, color: '#0284c7', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Esqueci minha senha</button>
              <button type="button" onClick={reenviarVerificacao} style={{ background: 'none', border: 0, color: '#16a34a', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Reenviar verificacao</button>
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#64748b', marginTop: 24, textAlign: 'center', maxWidth: 300 }}>
        Vender no PraiaGo exige cadastro aprovado pela equipe — a conta é só o primeiro passo.
      </p>
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '13px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0', fontSize: 15, outline: 'none', color: '#0f172a', background: '#f8fafc', boxSizing: 'border-box' }
