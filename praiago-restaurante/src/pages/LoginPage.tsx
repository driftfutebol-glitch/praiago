import { useState } from 'react'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { login } from '../lib/auth'
import { motion } from 'framer-motion'

export default function LoginPage() {
  const [verSenha, setVerSenha] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)

  async function entrar() {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    setErro('')
    setLoading(true)

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha })
        if (error) {
          if (error.status === 429) throw new Error('Limite de tentativas excedido. Aguarde alguns minutos e tente novamente.')
          if (error.message.includes('Email not confirmed')) throw new Error('E-mail não confirmado! Verifique sua caixa de entrada.')
          if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.')
          throw new Error('Erro ao fazer login. Verifique seus dados e sua conexão.')
        }
        
        if (data.user) {
          login(data.user.id, email);
          navigate('/');
        }

      } else {
        const { data, error } = await supabase.auth.signUp({ 
          email, 
          password: senha,
          options: { data: { role: 'restaurante' } }
        })
        
        if (error) {
          if (error.status === 429) throw new Error('LIMITE EXCEDIDO (Erro 429). Para continuar testando, vá no painel Supabase -> Authentication -> Rate Limits -> e aumente o "Email Signups" para 1000.')
          throw new Error('Erro ao criar conta: ' + error.message)
        }
        
        if (data.user) {
          await supabase.from('profiles').insert({
            id: data.user.id,
            nome: email.split('@')[0],
            role: 'restaurante'
          })
        }

        if (data.session && data.user) {
          login(data.user.id, email);
          navigate('/');
          return;
        }

        if (data.user && !data.session) {
          setErro('Conta criada com sucesso! Enviamos um link de confirmação para o seu e-mail.')
          setIsLogin(true)
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
    <div style={{ minHeight: '100vh', background: '#020617', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative', overflow: 'hidden' }}>
      {/* Efeito luminoso de fundo */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: '80vw', height: '80vw', maxWidth: 800, maxHeight: 800,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.15) 0%, transparent 60%)',
        filter: 'blur(60px)', zIndex: 0, pointerEvents: 'none'
      }} />

      <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }} style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }} style={{
            width: 80, height: 80, borderRadius: 24, margin: '0 auto 20px',
            background: 'linear-gradient(135deg, rgba(249,115,22,0.2), rgba(234,88,12,0.05))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
            border: '1px solid rgba(249,115,22,0.4)',
            boxShadow: '0 10px 30px rgba(249,115,22,0.3), inset 0 0 20px rgba(249,115,22,0.1)',
            backdropFilter: 'blur(10px)'
          }}>
            <span style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.5))' }}>🍽️</span>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <div style={{ fontSize: 36, fontWeight: 900, color: '#f8fafc', textShadow: '0 0 30px rgba(255,255,255,0.1)', letterSpacing: -1 }}>PraiaGo</div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: '#f97316', textTransform: 'uppercase', marginTop: 8, textShadow: '0 0 10px rgba(249,115,22,0.5)' }}>Central do Restaurante</div>
          </motion.div>
        </div>

        <div className="glass-panel" style={{ borderRadius: 28, padding: '40px 32px', border: '1px solid rgba(249,115,22,0.2)', boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 0 20px rgba(249,115,22,0.05)' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', marginBottom: 8 }}>{isLogin ? 'Entrar no Sistema' : 'Criar Conta'}</h2>
          <p style={{ fontSize: 14, color: '#94a3b8', marginBottom: 32, fontWeight: 500 }}>{isLogin ? 'Acesse sua central para gerenciar seu negócio' : 'Crie sua conta de Restaurante e gerencie pedidos'}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label htmlFor="rest-email" style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: 8, letterSpacing: 1 }}>E-MAIL</label>
              <input id="rest-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="restaurante@exemplo.com" style={inputStyle} onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'} onBlur={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.1)'} />
            </div>
            <div>
              <label htmlFor="rest-senha" style={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', display: 'block', marginBottom: 8, letterSpacing: 1 }}>SENHA</label>
              <div style={{ position: 'relative' }}>
                <input id="rest-senha" type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} placeholder="••••••••" style={{ ...inputStyle, padding: '16px 48px 16px 20px' }} onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'} onBlur={(e) => e.target.style.border = '1px solid rgba(255,255,255,0.1)'} />
                <button aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
                  {verSenha ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {erro && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ fontSize: 13, color: erro.includes('sucesso') ? '#4ade80' : '#f87171', fontWeight: 600, background: erro.includes('sucesso') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: erro.includes('sucesso') ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)', padding: '10px 14px', borderRadius: 12 }}>{erro}</motion.div>}

            <motion.button disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={entrar} style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', borderRadius: 16, padding: '18px 0', color: '#fff', fontSize: 16, fontWeight: 900, letterSpacing: 1, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12, boxShadow: '0 8px 30px rgba(249,115,22,0.4)', textShadow: '0 1px 2px rgba(0,0,0,0.2)', opacity: loading ? 0.7 : 1 }}>
              <LogIn size={20} /> {loading ? 'AGUARDE...' : (isLogin ? 'ACESSAR PAINEL' : 'CADASTRAR')}
            </motion.button>
            
            <button onClick={() => { setIsLogin(!isLogin); setErro('') }} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: -4 }}>
              {isLogin ? 'Não tem conta? Crie uma aqui' : 'Já tem conta? Fazer Login'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '16px 20px', borderRadius: 16,
  border: '1px solid rgba(255,255,255,0.1)', fontSize: 16, outline: 'none',
  color: '#f8fafc', background: 'rgba(0,0,0,0.3)', boxSizing: 'border-box',
  transition: 'border 0.2s', fontFamily: 'inherit'
}
