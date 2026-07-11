import { useEffect, useState } from 'react'
import { Eye, EyeOff, LogIn, LogOut, User, Package, MapPin, ChevronRight, Bell, HelpCircle, Star, Shield, Mail, CheckCircle2, AlertCircle, Edit3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { promptDialog } from '../lib/dialog'
import { logSecurityEvent } from '../lib/securityAudit'
import SuportePanel from '../components/SuportePanel'
import { apenasDigitosCpf, formatarCpf, validarCpf } from '../lib/cpf'

function fmtData(ts: number) {
  const diff = Date.now() - ts
  if (diff < 86_400_000) return 'Hoje'
  if (diff < 172_800_000) return 'Ontem'
  return new Date(ts).toLocaleDateString('pt-BR')
}

type VerificacaoCliente = {
  cpf?: string | null
  cpf_check_status?: string | null
  email_verificado?: boolean | null
}

function TelaLogada() {
  const navigate = useNavigate()
  const sessao = useStore(s => s.sessao)!
  const pedidos = useStore(s => s.pedidos)
  const favoritos = useStore(s => s.favoritos)
  const logout = useStore(s => s.logout)
  const [suporteAberto, setSuporteAberto] = useState(false)
  const [verificacao, setVerificacao] = useState<VerificacaoCliente | null>(null)
  const [emailConfirmado, setEmailConfirmado] = useState(false)
  const [reenviandoEmail, setReenviandoEmail] = useState(false)

  async function carregarVerificacao() {
    const [{ data: authData }, { data: profile }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('cpf,cpf_check_status,email_verificado').eq('id', sessao.id).maybeSingle(),
    ])
    setVerificacao(profile as VerificacaoCliente | null)
    setEmailConfirmado(Boolean(authData.user?.email_confirmed_at || profile?.email_verificado))
  }

  useEffect(() => {
    carregarVerificacao()
  }, [sessao.id])

  async function reenviarEmailConfirmacao() {
    setReenviandoEmail(true)
    const { data: authData } = await supabase.auth.getUser()
    if (authData.user?.email_confirmed_at) {
      setEmailConfirmado(true)
      setReenviandoEmail(false)
      return
    }
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: sessao.email,
      options: { emailRedirectTo: `${window.location.origin}/perfil` },
    })
    setReenviandoEmail(false)
    useStore.getState().addNotif({
      titulo: error ? 'Falha no envio' : 'E-mail enviado',
      texto: error ? error.message : `Confira sua caixa de entrada em ${sessao.email}.`,
    })
  }

  async function editarCpf() {
    const atual = formatarCpf(verificacao?.cpf || '')
    const novo = await promptDialog({
      title: 'Validar CPF',
      message: 'Digite o CPF do cliente. O banco aprova automaticamente se o numero for valido.',
      placeholder: '000.000.000-00',
      defaultValue: atual,
      confirmText: 'Validar',
    })
    if (!novo) return
    if (!validarCpf(novo)) {
      useStore.getState().addNotif({ titulo: 'CPF invalido', texto: 'Confira os numeros e tente novamente.' })
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ cpf: apenasDigitosCpf(novo) })
      .eq('id', sessao.id)
      .select('cpf,cpf_check_status,email_verificado')
      .maybeSingle()
    if (error) {
      useStore.getState().addNotif({ titulo: 'Erro ao validar CPF', texto: error.message })
      return
    }
    setVerificacao(data as VerificacaoCliente)
    useStore.getState().addNotif({ titulo: 'CPF atualizado', texto: 'Validacao do CPF conferida pelo PraiaGo.' })
  }

  const cpfOk = verificacao?.cpf_check_status === 'aprovado'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100vh', background: '#ffffff', paddingBottom: 24 }}>
      <div style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)', padding: '32px 20px 48px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', filter: 'blur(30px)' }} />
        
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ display: 'flex', alignItems: 'center', gap: 16, position: 'relative' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, border: '3px solid rgba(255,255,255,0.6)', boxShadow: '0 8px 32px rgba(0,0,0,0.2)', backdropFilter: 'blur(10px)' }}>👤</div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', textTransform: 'capitalize', letterSpacing: -0.5 }}>{sessao.nome}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{sessao.email}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <MapPin size={14} color="rgba(255,255,255,0.9)" />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: 600 }}>Praia Grande, SP</span>
            </div>
          </div>
        </motion.div>
      </div>

      <div style={{ padding: '0 20px', marginTop: -24, position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {[
            { icon: Package, label: 'Pedidos', value: String(pedidos.length), color: '#0ea5e9' },
            { icon: Star, label: 'Favoritos', value: String(favoritos.length), color: '#fbbf24' },
          ].map(({ icon: Icon, label, value, color }, i) => (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }} key={label} className="glass-panel" style={{ borderRadius: 20, padding: 20, textAlign: 'center', border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
              <Icon size={24} color={color} style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 26, fontWeight: 900, color: '#0f172a' }}>{value}</div>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.16 }} className="glass-panel" style={{ borderRadius: 22, padding: 18, border: '1px solid rgba(0,0,0,0.05)', marginBottom: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.22)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 14, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={19} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>Verificacao para pedidos</div>
              <div style={{ fontSize: 12, fontWeight: 650, color: '#64748b', marginTop: 2 }}>E-mail confirmado + CPF valido libera checkout e cupons.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: emailConfirmado ? '#ecfdf5' : '#fffbeb', border: `1px solid ${emailConfirmado ? '#bbf7d0' : '#fde68a'}`, borderRadius: 16, padding: 12 }}>
              {emailConfirmado ? <CheckCircle2 size={20} color="#16a34a" /> : <AlertCircle size={20} color="#d97706" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>E-mail</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: emailConfirmado ? '#15803d' : '#a16207', marginTop: 2 }}>
                  {emailConfirmado ? 'Confirmado no Supabase Auth' : `Pendente em ${sessao.email}`}
                </div>
              </div>
              {!emailConfirmado && (
                <button type="button" disabled={reenviandoEmail} onClick={reenviarEmailConfirmacao} style={{ border: 0, background: '#fff', color: '#92400e', borderRadius: 12, padding: '9px 11px', fontSize: 11.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: reenviandoEmail ? 'wait' : 'pointer' }}>
                  <Mail size={13} /> {reenviandoEmail ? 'Enviando' : 'Enviar'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: cpfOk ? '#ecfdf5' : '#fff7ed', border: `1px solid ${cpfOk ? '#bbf7d0' : '#fed7aa'}`, borderRadius: 16, padding: 12 }}>
              {cpfOk ? <CheckCircle2 size={20} color="#16a34a" /> : <AlertCircle size={20} color="#ea580c" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a' }}>CPF</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: cpfOk ? '#15803d' : '#c2410c', marginTop: 2 }}>
                  {cpfOk ? `${formatarCpf(verificacao?.cpf || '')} validado` : 'Informe um CPF valido para fazer pedido'}
                </div>
              </div>
              <button type="button" onClick={editarCpf} style={{ border: 0, background: '#fff', color: cpfOk ? '#15803d' : '#c2410c', borderRadius: 12, padding: '9px 11px', fontSize: 11.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <Edit3 size={13} /> {cpfOk ? 'Trocar' : 'Validar'}
              </button>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="glass-panel" style={{ borderRadius: 20, padding: '20px', border: '1px solid rgba(0,0,0,0.05)', marginBottom: 20, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>Pedidos Recentes</div>
          {pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: '#64748b', fontSize: 14, fontWeight: 500 }}>Você ainda não fez pedidos.</div>
          ) : pedidos.slice(0, 5).map((p, i) => (
            <div key={p.id} style={{ paddingTop: i > 0 ? 16 : 0, marginTop: i > 0 ? 16 : 0, borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{p.vendedorNome}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, fontWeight: 500 }}>{p.itens.map(it => `${it.qtd}x ${it.nome}`).join(', ')}</div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6, fontWeight: 600 }}>{fmtData(p.data)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: '#4ade80' }}>R$ {p.total}</div>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => navigate(`/pedir?v=${p.vendedorId}`)} style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', marginTop: 6, cursor: 'pointer', background: 'rgba(56,189,248,0.1)', border: 'none', padding: '6px 12px', borderRadius: 8 }}>Pedir de novo</motion.button>
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="glass-panel" style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.05)', marginBottom: 24, boxShadow: '0 10px 30px rgba(0,0,0,0.3)' }}>
          {[
            { icon: Bell, label: 'Notificações', onClick: () => navigate('/') },
            { icon: HelpCircle, label: 'Ajuda e Suporte', onClick: () => setSuporteAberto(true) },
          ].map(({ icon: Icon, label, onClick }, i) => (
            <motion.button whileHover={{ background: 'rgba(0,0,0,0.05)' }} whileTap={{ scale: 0.98 }} key={label} onClick={onClick} style={{ width: '100%', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, padding: '18px 20px', borderTop: i > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none' }}>
              <Icon size={20} color="#94a3b8" />
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#0f172a', textAlign: 'left' }}>{label}</span>
              <ChevronRight size={18} color="#64748b" />
            </motion.button>
          ))}
        </motion.div>

        <motion.button whileTap={{ scale: 0.96 }} onClick={async () => { await supabase.auth.signOut(); logout() }} style={{ width: '100%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: '0 4px 15px rgba(239,68,68,0.1)' }}>
          <LogOut size={20} color="#f87171" />
          <span style={{ fontSize: 15, fontWeight: 800, color: '#f87171' }}>Sair da conta</span>
        </motion.button>
      </div>

      <AnimatePresence>
        {suporteAberto && (
          <SuportePanel
            onClose={() => setSuporteAberto(false)}
            usuarioId={sessao.id}
            usuarioNome={sessao.nome || 'Cliente PraiaGo'}
            usuarioEmail={sessao.email || ''}
            plataforma="cliente"
          />
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function PerfilPage() {
  const sessao = useStore(s => s.sessao)
  const [tab, setTab] = useState<'entrar' | 'cadastro'>('entrar')
  const [verSenha, setVerSenha] = useState(false)
  const [email, setEmail] = useState('')
  const [nome, setNome] = useState('')
  const [cpf, setCpf] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)

  function emailNormalizado() {
    return email.trim().toLowerCase()
  }

  async function enviarResetSenha() {
    const alvo = emailNormalizado()
    if (!/^\S+@\S+\.\S+$/.test(alvo)) { setErro('Informe seu e-mail valido para redefinir a senha.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(alvo, { redirectTo: `${window.location.origin}/perfil` })
    if (!error) await logSecurityEvent('password_reset_requested', alvo)
    setErro(error ? `Nao foi possivel enviar redefinicao: ${error.message}` : 'Enviamos o e-mail de redefinicao. Use o link ou o codigo recebido.')
  }

  async function confirmarCodigoSenha() {
    const alvo = emailNormalizado()
    if (!/^\S+@\S+\.\S+$/.test(alvo)) { setErro('Informe seu e-mail valido para confirmar o codigo.'); return }
    const codigo = await promptDialog({ title: 'Código do e-mail', message: 'Digite o código que enviamos para o seu e-mail.', placeholder: '000000' })
    if (!codigo?.trim()) return
    const novaSenha = await promptDialog({ title: 'Nova senha', message: 'Crie uma senha com pelo menos 6 caracteres.', placeholder: 'Nova senha', secret: true })
    if (!novaSenha || novaSenha.length < 6) { setErro('A nova senha precisa ter ao menos 6 caracteres.'); return }

    const { error: otpError } = await supabase.auth.verifyOtp({ email: alvo, token: codigo.trim(), type: 'recovery' })
    if (otpError) { setErro(`Codigo invalido ou expirado: ${otpError.message}`); return }
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setErro(error ? `Nao foi possivel trocar a senha: ${error.message}` : 'Senha alterada com sucesso. Entre novamente.')
    if (!error) await supabase.auth.signOut()
  }

  async function reenviarVerificacao() {
    const alvo = emailNormalizado()
    if (!/^\S+@\S+\.\S+$/.test(alvo)) { setErro('Informe seu e-mail valido para reenviar a verificacao.'); return }
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: alvo,
      options: { emailRedirectTo: `${window.location.origin}/perfil` },
    })
    setErro(error ? `Nao foi possivel reenviar verificacao: ${error.message}` : 'Enviamos um novo e-mail de verificacao.')
  }

  if (sessao) return <TelaLogada />

  async function entrar() {
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErro('Informe um e-mail válido.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    if (tab === 'cadastro' && !nome.trim()) { setErro('Informe seu nome.'); return }
    if (tab === 'cadastro' && !validarCpf(cpf)) { setErro('Informe um CPF valido para liberar pedidos e o cupom de boas-vindas.'); return }
    setErro('')
    setLoading(true)

    try {
      const alvo = emailNormalizado()
      if (tab === 'entrar') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: alvo, password: senha })
        if (error) {
          await logSecurityEvent('login_failed', alvo, { status: error.status ?? null, message: error.message })
          if (error.status === 429) throw new Error('Limite de tentativas excedido! Aguarde alguns minutos.')
          if (error.message.includes('Email not confirmed')) throw new Error('E-mail não confirmado! Por favor, confirme seu e-mail ou desative a confirmação no painel do Supabase.')
          if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.')
          throw new Error(error.message)
        }
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome,status,ban_motivo')
          .eq('email', email.trim().toLowerCase())
          .maybeSingle()

        if (data.user) {
          if (profile?.status === 'banido') {
            await supabase.auth.signOut()
            await logSecurityEvent('access_denied', alvo, { reason: 'banned', ban_motivo: profile.ban_motivo ?? null })
            throw new Error(`Conta bloqueada pelo suporte.${profile.ban_motivo ? ` Motivo: ${profile.ban_motivo}` : ''}`)
          }
          await logSecurityEvent('login_success', alvo, { user_id: data.user.id })
          useStore.getState().login(data.user.id, alvo, profile?.nome || 'Cliente PraiaGo')
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: alvo,
          password: senha,
          options: {
            emailRedirectTo: `${window.location.origin}/perfil`,
            data: { nome, role: 'cliente', cpf: apenasDigitosCpf(cpf) },
          }
        })
        if (error) {
          if (error.status === 429) throw new Error('Limite de e-mails excedido. Aguarde alguns minutos e tente novamente.')
          throw new Error('Erro ao criar conta: ' + error.message)
        }
        
        if (data.session && data.user) {
          await logSecurityEvent('signup_created', alvo, { user_id: data.user.id })
          useStore.getState().login(data.user.id, alvo, nome)
          return
        }

        if (data.user && !data.session) {
          await logSecurityEvent('signup_created', alvo, { user_id: data.user.id, email_confirmation_required: true })
          setErro('Conta criada! Enviamos um link de confirmação para o seu e-mail.')
          setTab('entrar')
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
    <div style={{ minHeight: '100vh', background: '#ffffff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 40 }}>
        <div className="neon-border" style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, boxShadow: '0 10px 25px rgba(34,197,94,0.4)' }}>🌴</div>
        <div>
          <div className="beach-gradient-text" style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1 }}>PraiaGo</div>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 3, color: '#4ade80', textTransform: 'uppercase' }}>Cliente</div>
        </div>
      </motion.div>

      <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="glass-panel" style={{ borderRadius: 28, padding: 32, width: '100%', maxWidth: 400, border: '1px solid rgba(0,0,0,0.05)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', background: '#eef2f7', borderRadius: 16, padding: 6, marginBottom: 32, position: 'relative' }}>
          {(['entrar', 'cadastro'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setErro('') }} style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 800, cursor: 'pointer', background: 'transparent', color: tab === t ? '#fff' : '#64748b', position: 'relative', zIndex: 2, transition: 'color 0.2s' }}>
              {t === 'entrar' ? 'Entrar' : 'Criar conta'}
              {tab === t && (
                <motion.div layoutId="loginTab" style={{ position: 'absolute', inset: 0, background: '#f8fafc', borderRadius: 12, zIndex: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }} />
              )}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <AnimatePresence mode="popLayout">
            {tab === 'cadastro' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <label htmlFor="cli-nome" style={{ fontSize: 13, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome Completo</label>
                <input id="cli-nome" value={nome} onChange={e => setNome(e.target.value)} placeholder="Como gosta de ser chamado" style={inputStyle} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout">
            {tab === 'cadastro' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <label htmlFor="cli-cpf" style={{ fontSize: 13, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>CPF</label>
                <input id="cli-cpf" inputMode="numeric" value={cpf} onChange={e => setCpf(formatarCpf(e.target.value))} placeholder="000.000.000-00" style={inputStyle} />
                <div style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 800, marginTop: 8 }}>CPF valido + e-mail confirmado libera 20% na primeira compra.</div>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label htmlFor="cli-email" style={{ fontSize: 13, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>E-mail</label>
            <input id="cli-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="cli-senha" style={{ fontSize: 13, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Senha</label>
            <div style={{ position: 'relative' }}>
              <input id="cli-senha" type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} onKeyDown={e => e.key === 'Enter' && entrar()} placeholder="••••••••" style={{ ...inputStyle, padding: '16px 48px 16px 18px' }} />
              <button aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                {verSenha ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          <AnimatePresence>
            {erro && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} style={{ fontSize: 14, color: erro.includes('criada') ? '#4ade80' : '#f87171', fontWeight: 600, padding: '12px 16px', background: erro.includes('criada') ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: 12, border: erro.includes('criada') ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(239,68,68,0.2)' }}>
                {erro}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button disabled={loading} whileTap={{ scale: 0.95 }} onClick={entrar} className="neon-border" style={{ background: 'linear-gradient(135deg, #0ea5e9, #22c55e)', border: 'none', borderRadius: 16, padding: '16px 0', color: '#fff', fontSize: 16, fontWeight: 900, cursor: loading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8, boxShadow: '0 8px 20px rgba(34,197,94,0.3)', opacity: loading ? 0.7 : 1 }}>
            {tab === 'entrar' ? <LogIn size={20} /> : <User size={20} />}
            {loading ? 'AGUARDE...' : (tab === 'entrar' ? 'Acessar Conta' : 'Criar Conta')}
          </motion.button>
          {tab === 'entrar' && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: -2 }}>
              <button type="button" onClick={enviarResetSenha} style={{ background: 'none', border: 0, color: '#0284c7', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Esqueci minha senha</button>
              <button type="button" onClick={confirmarCodigoSenha} style={{ background: 'none', border: 0, color: '#7c3aed', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Tenho codigo</button>
              <button type="button" onClick={reenviarVerificacao} style={{ background: 'none', border: 0, color: '#16a34a', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Reenviar verificacao</button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '16px 18px', borderRadius: 14,
  border: '1px solid rgba(0,0,0,0.08)', fontSize: 15, outline: 'none',
  color: '#0f172a', background: '#eef2f7', boxSizing: 'border-box',
  transition: 'border-color 0.2s', fontWeight: 500,
}
