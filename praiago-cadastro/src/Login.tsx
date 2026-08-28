import { useState } from 'react'
import { LogIn, AlertCircle } from 'lucide-react'
import { supabase } from './supabase'

// Login da EQUIPE. Aceita a mesma conta que já entra no painel admin — não
// criamos usuário novo pra isso, senão vira mais uma senha pra alguém perder.
// Quem realmente decide se pode cadastrar é o servidor: a edge function
// `cadastro-assistido` recusa quem não for admin/sysadmin. Aqui é só a porta.

export default function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password: senha,
    })
    if (error) {
      setErro('E-mail ou senha incorretos.')
      setEntrando(false)
    }
    // Deu certo: o onAuthStateChange do App troca a tela sozinho.
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <form
        onSubmit={entrar}
        style={{
          width: '100%', maxWidth: 380, background: '#fff', borderRadius: 22, padding: 28,
          border: '1px solid #e2e8f0', boxShadow: '0 20px 50px -24px rgba(15,23,42,0.35)',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.6, color: '#0284c7', textAlign: 'center' }}>
          PRAIAGO
        </div>
        <h1 style={{ margin: '6px 0 4px', fontSize: 24, fontWeight: 900, letterSpacing: -0.6, textAlign: 'center' }}>
          Cadastramento
        </h1>
        <p style={{ margin: '0 0 22px', fontSize: 13, color: '#64748b', textAlign: 'center', fontWeight: 600 }}>
          Ferramenta da equipe · uso interno
        </p>

        <label style={rotulo}>E-MAIL DA EQUIPE</label>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          autoComplete="username" required style={campo} placeholder="voce@praiago.com.br"
        />

        <label style={{ ...rotulo, marginTop: 14 }}>SENHA</label>
        <input
          type="password" value={senha} onChange={e => setSenha(e.target.value)}
          autoComplete="current-password" required style={campo}
        />

        {erro && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14, padding: '10px 12px', borderRadius: 12, background: '#fef2f2', color: '#b91c1c', fontSize: 13, fontWeight: 700 }}>
            <AlertCircle size={16} /> {erro}
          </div>
        )}

        <button
          type="submit" disabled={entrando}
          style={{
            width: '100%', marginTop: 20, padding: '14px 0', borderRadius: 14, border: 'none',
            background: 'linear-gradient(100deg,#0284c7,#16a34a)', color: '#fff',
            fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <LogIn size={18} /> {entrando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

const rotulo: React.CSSProperties = {
  display: 'block', fontSize: 10.5, fontWeight: 900, letterSpacing: 0.8, color: '#64748b', marginBottom: 6,
}

const campo: React.CSSProperties = {
  width: '100%', height: 48, padding: '0 14px', borderRadius: 13,
  border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 600,
}
