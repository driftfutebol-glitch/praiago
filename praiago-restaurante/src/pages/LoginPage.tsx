import { useState } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { login } from '../lib/auth'

export default function LoginPage() {
  const [verSenha, setVerSenha] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  function entrar() {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (senha.length < 4) { setErro('A senha precisa ter ao menos 4 caracteres.'); return }
    setErro('')
    login(email)
    navigate('/')
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ width: 64, height: 64, borderRadius: 18, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>🌴</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9' }}>PraiaGo</div>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, color: '#f97316', textTransform: 'uppercase', marginTop: 4 }}>Painel do Restaurante</div>
        </div>

        <div style={{ background: '#1e293b', borderRadius: 24, padding: 32, border: '1px solid #334155', boxShadow: '0 24px 48px rgba(0,0,0,0.3)' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>Entrar na conta</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>Acesse seu painel para gerenciar pedidos e cardápio</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label htmlFor="rest-email" style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>E-mail</label>
              <input id="rest-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="restaurante@exemplo.com" style={inputStyle} />
            </div>
            <div>
              <label htmlFor="rest-senha" style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: 6 }}>Senha</label>
              <div style={{ position: 'relative' }}>
                <input id="rest-senha" type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} placeholder="••••••••" style={{ ...inputStyle, padding: '13px 44px 13px 16px' }} />
                <button aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#475569' }}>
                  {verSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {erro && <div style={{ fontSize: 13, color: '#f87171', fontWeight: 600 }}>{erro}</div>}

            <button onClick={entrar} style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', border: 'none', borderRadius: 14, padding: '15px 0', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4, boxShadow: '0 8px 24px rgba(249,115,22,0.3)' }}>
              <LogIn size={18} /> Entrar no painel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '13px 16px', borderRadius: 12,
  border: '1.5px solid #334155', fontSize: 15, outline: 'none',
  color: '#f1f5f9', background: '#0f172a', boxSizing: 'border-box',
}
