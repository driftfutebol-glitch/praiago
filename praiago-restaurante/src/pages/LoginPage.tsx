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

  // Cadastro: dados reais do negócio
  const [nomePessoa, setNomePessoa] = useState('')
  const [nomeLoja, setNomeLoja] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [cnpjStatus, setCnpjStatus] = useState<'idle' | 'buscando' | 'ok' | 'invalido' | 'nao_encontrado'>('idle')
  const [razaoSocial, setRazaoSocial] = useState('')
  const [endereco, setEndereco] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [gpsMsg, setGpsMsg] = useState('')

  // Validação local dos dígitos verificadores do CNPJ
  function cnpjValido(v: string): boolean {
    const d = v.replace(/\D/g, '')
    if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
    const calc = (len: number) => {
      const pesos = len === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2]
      const soma = pesos.reduce((a, p, i) => a + p * Number(d[i]), 0)
      const r = soma % 11
      return r < 2 ? 0 : 11 - r
    }
    return calc(12) === Number(d[12]) && calc(13) === Number(d[13])
  }

  // Consulta pública (BrasilAPI) → preenche a razão social automaticamente
  async function buscarCNPJ() {
    const d = cnpj.replace(/\D/g, '')
    if (!d) { setCnpjStatus('idle'); return }
    if (!cnpjValido(d)) { setCnpjStatus('invalido'); setRazaoSocial(''); return }
    setCnpjStatus('buscando')
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`)
      if (!r.ok) throw new Error('nao encontrado')
      const j = await r.json()
      const nome = j.nome_fantasia || j.razao_social || ''
      setRazaoSocial(j.razao_social || '')
      if (nome && !nomeLoja) setNomeLoja(nome)
      setCnpjStatus('ok')
    } catch {
      setCnpjStatus('nao_encontrado') // CNPJ com dígitos ok, mas sem cadastro público → pede o nome manual
    }
  }

  function usarMinhaLocalizacao() {
    if (!navigator.geolocation) { setGpsMsg('GPS não disponível neste dispositivo.'); return }
    setGpsMsg('Buscando sua posição…')
    navigator.geolocation.getCurrentPosition(
      p => { setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsMsg('📍 Localização capturada!') },
      () => setGpsMsg('Não consegui pegar o GPS — preencha o endereço.'),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

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
        // validações do cadastro real
        if (!nomePessoa.trim()) throw new Error('Informe o seu nome.')
        if (cnpj.trim() && cnpjStatus === 'invalido') throw new Error('CNPJ inválido — confira os números.')
        if (!nomeLoja.trim()) throw new Error('Informe o nome do restaurante ou loja.')
        if (!endereco.trim() && !coords) throw new Error('Informe a localização da loja (endereço ou GPS).')

        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: { data: { role: 'restaurante', nome: nomeLoja.trim() } }
        })

        if (error) {
          if (error.status === 429) throw new Error('LIMITE EXCEDIDO (Erro 429). Para continuar testando, vá no painel Supabase -> Authentication -> Rate Limits -> e aumente o "Email Signups" para 1000.')
          throw new Error('Erro ao criar conta: ' + error.message)
        }

        if (data.user) {
          // o trigger já criou o profile — completamos com os dados do negócio
          await supabase.from('profiles').update({
            nome: nomeLoja.trim(),
            role: 'restaurante',
            cnpj: cnpj.replace(/\D/g, '') || null,
            razao_social: razaoSocial || nomePessoa.trim(),
            endereco: endereco.trim() || null,
            lat: coords?.lat ?? null,
            lng: coords?.lng ?? null,
          }).eq('id', data.user.id)
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
    <div style={{ minHeight: '100vh', background: '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, position: 'relative', overflow: 'hidden' }}>
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
            <div style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', textShadow: '0 0 30px rgba(0,0,0,0.08)', letterSpacing: -1 }}>PraiaGo</div>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: '#f97316', textTransform: 'uppercase', marginTop: 8, textShadow: '0 0 10px rgba(249,115,22,0.5)' }}>Central do Restaurante</div>
          </motion.div>
        </div>

        <div className="glass-panel" style={{ borderRadius: 28, padding: '40px 32px', border: '1px solid rgba(249,115,22,0.2)', boxShadow: '0 24px 48px rgba(0,0,0,0.4), inset 0 0 20px rgba(249,115,22,0.05)' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{isLogin ? 'Entrar no Sistema' : 'Criar Conta'}</h2>
          <p style={{ fontSize: 14, color: '#64748b', marginBottom: 32, fontWeight: 500 }}>{isLogin ? 'Acesse sua central para gerenciar seu negócio' : 'Crie sua conta de Restaurante e gerencie pedidos'}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {!isLogin && (
              <>
                <div>
                  <label htmlFor="rest-nome" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>SEU NOME</label>
                  <input id="rest-nome" value={nomePessoa} onChange={e => setNomePessoa(e.target.value)} placeholder="Maria da Silva" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="rest-cnpj" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>CNPJ (SE TIVER)</label>
                  <input id="rest-cnpj" value={cnpj} onChange={e => { setCnpj(e.target.value); setCnpjStatus('idle') }} onBlur={buscarCNPJ} placeholder="00.000.000/0000-00" style={inputStyle} />
                  {cnpjStatus === 'buscando' && <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 700, marginTop: 6 }}>Consultando CNPJ…</div>}
                  {cnpjStatus === 'ok' && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 700, marginTop: 6 }}>✓ CNPJ válido — {razaoSocial}</div>}
                  {cnpjStatus === 'invalido' && <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginTop: 6 }}>✕ CNPJ inválido, confira os números</div>}
                  {cnpjStatus === 'nao_encontrado' && <div style={{ fontSize: 12, color: '#d97706', fontWeight: 700, marginTop: 6 }}>CNPJ ok, mas não achei o cadastro — digite o nome da empresa abaixo</div>}
                </div>
                <div>
                  <label htmlFor="rest-loja" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>NOME DO RESTAURANTE / LOJA</label>
                  <input id="rest-loja" value={nomeLoja} onChange={e => setNomeLoja(e.target.value)} placeholder="Quiosque da Praia" style={inputStyle} />
                </div>
                <div>
                  <label htmlFor="rest-end" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>LOCALIZAÇÃO DA LOJA</label>
                  <input id="rest-end" value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Av. Presidente Castelo Branco, 1000 - Boqueirão" style={inputStyle} />
                  <button onClick={usarMinhaLocalizacao} style={{ marginTop: 8, background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)', borderRadius: 12, padding: '10px 14px', color: '#0284c7', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>
                    📍 Usar minha localização (GPS)
                  </button>
                  {gpsMsg && <div style={{ fontSize: 12, color: coords ? '#16a34a' : '#64748b', fontWeight: 700, marginTop: 6 }}>{gpsMsg}</div>}
                </div>
              </>
            )}
            <div>
              <label htmlFor="rest-email" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>E-MAIL</label>
              <input id="rest-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="restaurante@exemplo.com" style={inputStyle} onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'} onBlur={(e) => e.target.style.border = '1px solid rgba(0,0,0,0.08)'} />
            </div>
            <div>
              <label htmlFor="rest-senha" style={{ fontSize: 12, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 8, letterSpacing: 1 }}>SENHA</label>
              <div style={{ position: 'relative' }}>
                <input id="rest-senha" type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} placeholder="••••••••" style={{ ...inputStyle, padding: '16px 48px 16px 20px' }} onFocus={(e) => e.target.style.border = '1px solid rgba(249,115,22,0.5)'} onBlur={(e) => e.target.style.border = '1px solid rgba(0,0,0,0.08)'} />
                <button aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4 }}>
                  {verSenha ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {erro && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ fontSize: 13, color: erro.includes('sucesso') ? '#4ade80' : '#f87171', fontWeight: 600, background: erro.includes('sucesso') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: erro.includes('sucesso') ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)', padding: '10px 14px', borderRadius: 12 }}>{erro}</motion.div>}

            <motion.button disabled={loading} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={entrar} style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', borderRadius: 16, padding: '18px 0', color: '#fff', fontSize: 16, fontWeight: 900, letterSpacing: 1, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 12, boxShadow: '0 8px 30px rgba(249,115,22,0.4)', textShadow: '0 1px 2px rgba(0,0,0,0.2)', opacity: loading ? 0.7 : 1 }}>
              <LogIn size={20} /> {loading ? 'AGUARDE...' : (isLogin ? 'ACESSAR PAINEL' : 'CADASTRAR')}
            </motion.button>
            
            <button onClick={() => { setIsLogin(!isLogin); setErro('') }} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: -4 }}>
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
  border: '1px solid rgba(0,0,0,0.08)', fontSize: 16, outline: 'none',
  color: '#0f172a', background: '#ffffff', boxSizing: 'border-box',
  transition: 'border 0.2s', fontFamily: 'inherit'
}
