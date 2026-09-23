import VersaoDoApp from '../components/VersaoDoApp'
import { useCallback, useEffect, useState } from 'react'
import { Eye, EyeOff, LogIn, LogOut, User, Package, MapPin, ChevronRight, Bell, HelpCircle, Star, Shield, Mail, CheckCircle2, AlertCircle, Edit3, Loader2, Trash2, Ticket, Volume2, Sparkles, LockKeyhole } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import { supabase } from '../lib/supabase'
import { alertDialog, confirmDialog, promptDialog } from '../lib/dialog'
import { logSecurityEvent } from '../lib/securityAudit'
import { origemDoCadastro } from '../lib/origemCadastro'
import SuportePanel from '../components/SuportePanel'
import { AvatarPerfil } from '../components/FotoPerfilCliente'
import EditProfileDialog from '../components/EditProfileDialog'
import AppearanceSetting from '../components/AppearanceSetting'
import { usePreferences } from '../store/usePreferences'
import { apenasDigitosCpf, cpfMascarado, formatarCpf, validarCpf } from '../lib/cpf'
import { TEXTO_AREA_ATENDIDA, RAIO_PEDIDO_KM } from '../lib/serviceArea'

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
  foto_perfil_path?: string | null
}

function TelaLogada() {
  const navigate = useNavigate()
  const sessao = useStore(s => s.sessao)!
  const pedidos = useStore(s => s.pedidos)
  const favoritos = useStore(s => s.favoritos)
  const logout = useStore(s => s.logout)
  const [suporteAberto, setSuporteAberto] = useState(false)
  const [editando, setEditando] = useState(false)
  const preferences = usePreferences()
  const [verificacao, setVerificacao] = useState<VerificacaoCliente | null>(null)
  const [verificacaoErro, setVerificacaoErro] = useState(false)
  const [verificacaoCarregando, setVerificacaoCarregando] = useState(true)
  const [emailConfirmado, setEmailConfirmado] = useState(false)
  const [reenviandoEmail, setReenviandoEmail] = useState(false)
  const [excluindoConta, setExcluindoConta] = useState(false)
  // Fica em estado separado de `verificacao` porque o fluxo do CPF regrava
  // aquele objeto com um select menor — se a foto morasse lá, trocar o CPF
  // apagava o avatar da tela.
  const [fotoPath, setFotoPath] = useState<string | null>(null)

  const carregarVerificacao = useCallback(async () => {
    setVerificacaoCarregando(true)
    setVerificacaoErro(false)
    try {
    const [{ data: authData, error: authError }, { data: profile, error: profileError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('profiles').select('cpf,cpf_check_status,email_verificado,foto_perfil_path').eq('id', sessao.id).maybeSingle(),
    ])
    if (authError || profileError || !profile) throw new Error('Verificação indisponível')
    setVerificacao(profile as VerificacaoCliente | null)
    setFotoPath((profile as VerificacaoCliente | null)?.foto_perfil_path ?? null)
    setEmailConfirmado(Boolean(authData.user?.email_confirmed_at || profile?.email_verificado))
    } catch { setVerificacaoErro(true) }
    finally { setVerificacaoCarregando(false) }
  }, [sessao.id])

  useEffect(() => {
    carregarVerificacao()
  }, [carregarVerificacao])

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
      texto: error ? 'Não deu pra reenviar agora. Aguarde um minuto e tente de novo.' : `Confira sua caixa de entrada em ${sessao.email}.`,
    })
  }

  async function editarCpf() {
    if (!verificacao || verificacao?.cpf_check_status === 'aprovado') return
    const atual = formatarCpf(verificacao?.cpf || '')
    const novo = await promptDialog({
      title: 'Validar CPF',
      message: 'Digite seu CPF. A validação é automática se o número for válido.',
      placeholder: '000.000.000-00',
      defaultValue: atual,
      confirmText: 'Validar',
    })
    if (!novo) return
    if (!validarCpf(novo)) {
      useStore.getState().addNotif({ titulo: 'CPF inválido', texto: 'Confira os numeros e tente novamente.' })
      return
    }
    const { data, error } = await supabase
      .from('profiles')
      .update({ cpf: apenasDigitosCpf(novo) })
      .eq('id', sessao.id)
      .select('cpf,cpf_check_status,email_verificado')
      .maybeSingle()
    if (error) {
      const dup = (error as { code?: string }).code === '23505'
      useStore.getState().addNotif({ titulo: dup ? 'CPF já cadastrado' : 'Erro ao validar CPF', texto: dup ? 'Esse CPF já está em outra conta. Cada CPF só pode ter uma conta.' : 'Não deu pra validar agora. Confira o número e tente de novo.' })
      return
    }
    setVerificacao(data as VerificacaoCliente)
    useStore.getState().addNotif({ titulo: 'CPF confirmado', texto: 'CPF validado e vinculado definitivamente a esta conta.' })
  }

  const cpfOk = verificacao?.cpf_check_status === 'aprovado'

  async function excluirConta() {
    if (excluindoConta) return
    const continuar = await confirmDialog({
      title: 'Excluir conta permanentemente?',
      message: 'Seu login, perfil, foto, avaliações e dados pessoais serão apagados. Pedidos e registros financeiros que precisem ser mantidos por obrigação legal ficam restritos e desvinculados do seu perfil.',
      confirmText: 'Continuar',
      cancelText: 'Cancelar',
      tone: 'danger',
    })
    if (!continuar) return

    // Pede o e-mail em vez de uma palavra fixa: confirma a intencao e ja
    // entrega a equipe o dado que ela vai usar para localizar a conta.
    const emailInformado = await promptDialog({
      title: 'Confirme seu e-mail',
      message: 'Digite o e-mail da sua conta para registrarmos o pedido de exclusao.',
      placeholder: sessao.email || 'voce@exemplo.com',
      confirmText: 'Enviar pedido',
      cancelText: 'Cancelar',
      tone: 'danger',
    })
    if (!emailInformado || !emailInformado.trim()) return

    setExcluindoConta(true)
    try {
      const { data, error } = await supabase
        .from('solicitacoes_exclusao')
        .insert({
          user_id: sessao.id,
          email_informado: emailInformado.trim(),
          nome_informado: sessao.nome ?? null,
          cpf_informado: verificacao?.cpf ?? null,
          papel_informado: 'cliente',
        })
        .select('id')
        .single()

      // 23505 = ja existe pedido pendente. Nao e erro do usuario: e a mesma
      // solicitacao dele, entao confirmamos em vez de assustar.
      if (error && error.code === '23505') {
        await alertDialog({
          title: 'Pedido ja registrado',
          message: 'Voce ja tem um pedido de exclusao em analise. Nossa equipe vai concluir em ate 30 dias.',
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
        message: `Recebemos seu pedido de exclusao. Nossa equipe conclui em ate 30 dias e voce recebe um aviso por e-mail. Protocolo: ${data.id}.`,
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
      setExcluindoConta(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pg-page pg-profile">
      <section className="pg-profile-hero" aria-label="Seu perfil">
        <span className="pg-eyebrow">SEU CANTO NA PRAIA</span>
        <div className="pg-profile-identity">
          <AvatarPerfil path={fotoPath} tamanho={68}/>
          <div style={{ minWidth: 0, flex: 1 }}><h1 className="pg-profile-name" style={{ color: '#fff', margin: 0 }}>{sessao.nome || 'Meu perfil'}</h1><p className="pg-profile-email">{sessao.email}</p></div>
        </div>
        <button className="pg-profile-edit" onClick={() => setEditando(true)}><Edit3 size={15}/>Editar perfil e foto<ChevronRight size={15}/></button>
      </section>

      <div>
        <div className="pg-stats">
          {[
            { icon: Package, label: 'Meus pedidos', value: pedidos.length, route: '/pedidos' },
            { icon: Star, label: 'Favoritos', value: favoritos.length, route: '/?filtro=favoritos' },
          ].map(({ icon: Icon, label, value, route }) => (
            <button key={label} className="pg-card pg-stat" onClick={() => navigate(route)}><Icon size={23} color="var(--pg-ocean)"/><div><strong>{value}</strong><span>{label}</span></div></button>
          ))}
        </div>

        <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pg-card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 38, height: 38, borderRadius: 14, background: 'linear-gradient(135deg,#0ea5e9,#22c55e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={19} color="#fff" />
            </div>
            <div>
              <h2 className="pg-section-title" style={{ marginBottom: 2 }}>Sua conta, protegida</h2>
              <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--pg-muted)', marginTop: 2, lineHeight: 1.35 }}>E-mail confirmado + CPF válido libera checkout e cupons.</div>
            </div>
          </div>

          {verificacaoCarregando && <p className="pg-caption" role="status">Conferindo sua conta…</p>}
          {verificacaoErro && <div role="status" className="pg-feedback pg-feedback-error">Não foi possível conferir sua conta agora. Suas verificações anteriores não foram alteradas.<button className="pg-button" style={{ marginTop: 10, width: '100%' }} onClick={() => void carregarVerificacao()}>Tentar novamente</button></div>}
          <div style={{ display: verificacao && !verificacaoErro ? 'grid' : 'none', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: emailConfirmado ? 'var(--pg-success-bg)' : 'var(--pg-warning-bg)', border: `1px solid ${emailConfirmado ? 'var(--pg-line)' : 'var(--pg-line)'}`, borderRadius: 16, padding: 12 }}>
              {emailConfirmado ? <CheckCircle2 size={20} color="var(--pg-success)" /> : <AlertCircle size={20} color="var(--pg-warning)" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--pg-ink)' }}>E-mail</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: emailConfirmado ? 'var(--pg-success)' : 'var(--pg-warning)', marginTop: 2 }}>
                  {emailConfirmado ? 'E-mail confirmado' : `Pendente em ${sessao.email}`}
                </div>
              </div>
              {!emailConfirmado && (
                <button type="button" disabled={reenviandoEmail} onClick={reenviarEmailConfirmacao} style={{ border: 0, background: 'var(--pg-surface)', color: 'var(--pg-warning)', borderRadius: 12, padding: '9px 11px', fontSize: 11.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: reenviandoEmail ? 'wait' : 'pointer' }}>
                  <Mail size={13} /> {reenviandoEmail ? 'Enviando' : 'Enviar'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: cpfOk ? 'var(--pg-success-bg)' : 'var(--pg-warning-bg)', border: `1px solid ${cpfOk ? 'var(--pg-line)' : 'var(--pg-line)'}`, borderRadius: 16, padding: 12 }}>
              {cpfOk ? <CheckCircle2 size={20} color="var(--pg-success)" /> : <AlertCircle size={20} color="var(--pg-warning)" />}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--pg-ink)' }}>CPF</div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: cpfOk ? 'var(--pg-success)' : 'var(--pg-warning)', marginTop: 2 }}>
                  {cpfOk ? `${cpfMascarado(verificacao?.cpf || '')} validado` : 'Informe um CPF válido para fazer pedido'}
                </div>
              </div>
              {!cpfOk && (
                <button type="button" onClick={editarCpf} style={{ border: 0, background: 'var(--pg-surface)', color: 'var(--pg-warning)', borderRadius: 12, padding: '9px 11px', fontSize: 11.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <Edit3 size={13} /> Validar
                </button>
              )}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pg-card" style={{ marginBottom: 20 }}>
          <h2 className="pg-section-title">Últimos pedidos</h2>
          {pedidos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--pg-muted)', fontSize: 14, fontWeight: 500 }}>Você ainda não fez pedidos.</div>
          ) : pedidos.slice(0, 3).map((p, i) => (
            <div key={p.id} style={{ paddingTop: i > 0 ? 16 : 0, marginTop: i > 0 ? 16 : 0, borderTop: i > 0 ? '1px solid var(--pg-line)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--pg-ink)' }}>{p.vendedorNome}</div>
                <div style={{ fontSize: 13, color: 'var(--pg-muted)', marginTop: 4, fontWeight: 500 }}>{p.itens.map(it => `${it.qtd}x ${it.nome}`).join(', ')}</div>
                <div style={{ fontSize: 11, color: 'var(--pg-muted)', marginTop: 6, fontWeight: 600 }}>{fmtData(p.data)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 15, fontWeight: 850, color: 'var(--pg-ocean-dark)', whiteSpace: 'nowrap' }}>{p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
                <motion.button whileTap={{ scale: 0.98 }} onClick={() => navigate(`/pedir?v=${p.vendedorId}`)} className="pg-button pg-button-soft" style={{ fontSize: 11, padding: 8, marginTop: 6 }}>Ver loja</motion.button>
              </div>
            </div>
          ))}
        </motion.div>

        <section className="pg-profile-section"><h2 className="pg-section-title">Tudo à mão</h2><div className="pg-card pg-menu">
          {[
            { icon: Ticket, label: 'Meus cupons', description: 'Ofertas disponíveis e condições', onClick: () => navigate('/?painel=cupons') },
            { icon: MapPin, label: 'Explorar outra região', description: 'Sem alterar o GPS usado nos pedidos', onClick: () => navigate('/?painel=regiao') },
            { icon: Bell, label: 'Notificações', description: 'Acompanhe as novidades e seus pedidos', onClick: () => navigate('/?painel=notificacoes') },
            { icon: HelpCircle, label: 'Ajuda e suporte', description: 'Fale com a equipe PraiaGo', onClick: () => setSuporteAberto(true) },
          ].map(({ icon: Icon, label, description, onClick }) => (
            <button key={label} onClick={onClick} className="pg-menu-row"><span className="pg-menu-icon"><Icon size={19}/></span><span className="pg-menu-copy">{label}<small>{description}</small></span><ChevronRight size={17}/></button>
          ))}
          <a className="pg-menu-row" href="https://www.praiago.com.br/privacidade.html" target="_blank" rel="noopener noreferrer"><span className="pg-menu-icon"><Shield size={19}/></span><span className="pg-menu-copy">Privacidade e seus dados<small>Saiba como suas informações são tratadas</small></span><ChevronRight size={17}/></a>
        </div></section>
        <section className="pg-profile-section"><h2 className="pg-section-title">Seu jeito de usar</h2><div className="pg-card pg-menu">
          <AppearanceSetting />
          <div className="pg-menu-row"><span className="pg-menu-icon"><Volume2 size={19}/></span><span className="pg-menu-copy" id="sound-label">Sons de avisos<small>Não altera as notificações do celular</small></span><button role="switch" aria-labelledby="sound-label" aria-checked={preferences.notificationSounds} className="pg-toggle" onClick={() => preferences.setNotificationSounds(!preferences.notificationSounds)}/></div>
          <div className="pg-menu-row"><span className="pg-menu-icon"><Sparkles size={19}/></span><span className="pg-menu-copy" id="motion-label">Reduzir movimento<small>Transições mais discretas neste aparelho</small></span><button role="switch" aria-labelledby="motion-label" aria-checked={preferences.reducedMotion} className="pg-toggle" onClick={() => preferences.setReducedMotion(!preferences.reducedMotion)}/></div>
        </div></section>

        <motion.button whileTap={{ scale: 0.96 }} onClick={async () => { await supabase.auth.signOut(); logout() }} style={{ width: '100%', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 20, padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, boxShadow: '0 4px 15px rgba(239,68,68,0.1)' }}>
          <LogOut size={20} color="var(--pg-danger)" />
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--pg-danger)' }}>Sair da conta</span>
        </motion.button>

          {/* AREA_ATENDIDA_INFO — a Apple pede que a cobertura fique clara no app */}
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 14, background: 'var(--pg-brand-soft)', border: '1px solid var(--pg-line)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 900, color: 'var(--pg-ocean-dark)', marginBottom: 4 }}>
              Onde o PraiaGo entrega
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.5, fontWeight: 600, color: 'var(--pg-muted)' }}>
              Você vê todos os ambulantes e restaurantes de qualquer lugar do mundo.
              Para fechar um pedido é preciso estar a até {RAIO_PEDIDO_KM} km da loja.
              Hoje entregamos em {TEXTO_AREA_ATENDIDA} — SP, Brasil.
            </div>
          </div>

        <button type="button" disabled={excluindoConta} onClick={() => void excluirConta()} style={{ width: '100%', marginTop: 12, padding: '14px 18px', border: 0, background: 'transparent', color: 'var(--pg-danger)', fontSize: 13, fontWeight: 850, cursor: excluindoConta ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, opacity: excluindoConta ? 0.65 : 1 }}>
          {excluindoConta ? <Loader2 size={17} className="animate-spin-slow" /> : <Trash2 size={17} />}
          {excluindoConta ? 'Processando exclusão…' : 'Excluir minha conta'}
        </button>
        <div style={{ marginTop: 4, textAlign: 'center', color: 'var(--pg-muted)', fontSize: 11.5, lineHeight: 1.45 }}>
          Veja quais dados são apagados ou preservados na <a href="https://www.praiago.com.br/excluir-conta.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pg-ocean)', fontWeight: 800 }}>página de exclusão</a>.
        </div>
      </div>

      {/* O número da versão do pacote, para quem testa conseguir dizer em qual
          está. Sem isto, "já corrigi" e "continua igual" não têm árbitro. */}
      <VersaoDoApp />
      {editando && <EditProfileDialog photo={fotoPath} onPhotoChange={setFotoPath} onClose={() => setEditando(false)}/>}

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
  const [codigoEnvio, setCodigoEnvio] = useState<string | null>(null)  // e-mail aguardando código de verificação
  const [codigo, setCodigo] = useState('')
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  // Aceite obrigatorio no cadastro (exigencia da Play Store + LGPD)
  const [aceitouTermos, setAceitouTermos] = useState(false)

  function emailNormalizado() {
    return email.trim().toLowerCase()
  }

  async function enviarResetSenha() {
    const alvo = emailNormalizado()
    if (!/^\S+@\S+\.\S+$/.test(alvo)) { setErro('Informe seu e-mail válido para redefinir a senha.'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(alvo, { redirectTo: `${window.location.origin}/perfil` })
    if (!error) await logSecurityEvent('password_reset_requested', alvo)
    setErro(error ? 'Não foi possível enviar a redefinição agora. Tente de novo em instantes.' : 'Enviamos o e-mail de redefinição. Use o link ou o código recebido.')
  }

  async function confirmarCodigoSenha() {
    const alvo = emailNormalizado()
    if (!/^\S+@\S+\.\S+$/.test(alvo)) { setErro('Informe seu e-mail válido para confirmar o código.'); return }
    const codigo = await promptDialog({ title: 'Código do e-mail', message: 'Digite o código que enviamos para o seu e-mail.', placeholder: '000000' })
    if (!codigo?.trim()) return
    const novaSenha = await promptDialog({ title: 'Nova senha', message: 'Use pelo menos 10 caracteres, com letras e numeros.', placeholder: 'Nova senha', secret: true })
    if (!novaSenha || novaSenha.length < 10 || !/[A-Za-z]/.test(novaSenha) || !/\d/.test(novaSenha)) { setErro('Use pelo menos 10 caracteres, com letras e numeros.'); return }

    const { error: otpError } = await supabase.auth.verifyOtp({ email: alvo, token: codigo.trim(), type: 'recovery' })
    if (otpError) { setErro('Código inválido ou expirado. Peça um novo código.'); return }
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    setErro(error ? 'Não foi possível trocar a senha. Peça um novo código e tente de novo.' : 'Senha alterada com sucesso. Entre novamente.')
    if (!error) await supabase.auth.signOut()
  }

  async function reenviarVerificacao() {
    const alvo = emailNormalizado()
    if (!/^\S+@\S+\.\S+$/.test(alvo)) { setErro('Informe seu e-mail válido para reenviar a verificação.'); return }
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: alvo,
      options: { emailRedirectTo: `${window.location.origin}/perfil` },
    })
    setErro(error ? 'Não foi possível reenviar agora. Aguarde um minuto e tente de novo.' : 'Enviamos um novo e-mail de verificação.')
  }

  if (sessao) return <TelaLogada />

  async function entrar() {
    if (loading) return
    if (!/^\S+@\S+\.\S+$/.test(emailNormalizado())) { setErro('Informe um e-mail válido.'); return }
    if (senha.length < 6) { setErro('A senha precisa ter ao menos 6 caracteres.'); return }
    if (tab === 'cadastro' && (senha.length < 10 || !/[A-Za-z]/.test(senha) || !/\d/.test(senha))) { setErro('Use pelo menos 10 caracteres, com letras e numeros.'); return }
    if (tab === 'cadastro' && !nome.trim()) { setErro('Informe seu nome.'); return }
    if (tab === 'cadastro' && !validarCpf(cpf)) { setErro('Informe um CPF válido para liberar pedidos e o cupom de boas-vindas.'); return }
    if (tab === 'cadastro' && !aceitouTermos) { setErro('Você precisa aceitar os Termos de Uso e a Política de Privacidade.'); return }
    setErro('')
    setLoading(true)

    try {
      const alvo = emailNormalizado()
      if (tab === 'entrar') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: alvo, password: senha })
        if (error) {
          await logSecurityEvent('login_failed', alvo, { status: error.status ?? null, message: error.message })
          if (error.status === 429) throw new Error('Limite de tentativas excedido! Aguarde alguns minutos.')
          if (error.message.includes('Email not confirmed')) throw new Error('E-mail não confirmado. Confira sua caixa de entrada (e o spam) e use o código que enviamos.')
          if (error.message.includes('Invalid login credentials')) throw new Error('E-mail ou senha incorretos.')
          // Nunca repassar a mensagem crua: ela vem em ingles e pode expor
          // detalhe tecnico do servico de autenticacao para o cliente.
          throw new Error('Não foi possível entrar. Confira seus dados e sua conexão.')
        }
        
        const { data: profile } = await supabase
          .from('profiles')
          .select('nome,telefone,status,ban_motivo,role,conta_demo')
          .eq('id', data.user?.id || '')
          .maybeSingle()

        if (data.user) {
          if (profile?.role !== 'cliente') {
            await supabase.auth.signOut()
            await logSecurityEvent('access_denied', alvo, { reason: 'wrong_app_role', role: profile?.role ?? null })
            throw new Error('Esta conta não pertence ao aplicativo de cliente.')
          }
          if (profile?.status === 'banido') {
            await supabase.auth.signOut()
            await logSecurityEvent('access_denied', alvo, { reason: 'banned', ban_motivo: profile.ban_motivo ?? null })
            throw new Error(`Conta bloqueada pelo suporte.${profile.ban_motivo ? ` Motivo: ${profile.ban_motivo}` : ''}`)
          }
          await logSecurityEvent('login_success', alvo, { user_id: data.user.id })
          useStore.getState().login(data.user.id, alvo, profile?.nome || 'Cliente PraiaGo', profile?.telefone || '', profile?.conta_demo === true)
        }
      } else {
        // Cadastro passa pela edge function 'cadastro' (regra de 1 conta por IP).
        const { data, error } = await supabase.functions.invoke('cadastro', {
          body: {
            email: alvo, senha,
            metadata: { nome, role: 'cliente', cpf: apenasDigitosCpf(cpf) },
            emailRedirectTo: `${window.location.origin}/perfil`,
            origem: origemDoCadastro(),
          },
        })
        if (error) {
          let msg = 'Erro ao criar conta. Tente novamente.'
          try { const p = await (error as { context?: { json?: () => Promise<{ error?: string }> } }).context?.json?.(); if (p?.error) msg = p.error } catch { /* usa msg padrão */ }
          throw new Error(msg)
        }
        const resp = data as { error?: string } | null
        if (resp?.error) throw new Error(resp.error)
        await logSecurityEvent('signup_created', alvo, { email_confirmation_required: true })
        // Vai pra tela de código: enviamos um código de 6 dígitos no e-mail.
        setCodigo('')
        setCodigoEnvio(alvo)
        setErro('Enviamos um código de 6 dígitos pro seu e-mail. Digite abaixo pra ativar. 📧')
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

  async function confirmarCadastro() {
    if (!codigoEnvio || loading) return
    if (codigo.replace(/\D/g, '').length < 6) { setErro('Digite o código de 6 dígitos que enviamos no e-mail.'); return }
    setLoading(true)
    const { data, error } = await supabase.auth.verifyOtp({ email: codigoEnvio, token: codigo.trim(), type: 'signup' })
    setLoading(false)
    if (error) { setErro('Código inválido ou expirado. Confira ou toque em Reenviar.'); return }
    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role,status,conta_demo')
        .eq('id', data.user.id)
        .maybeSingle()
      if (profile?.role !== 'cliente' || profile?.status === 'banido') {
        await supabase.auth.signOut()
        setErro('Esta conta não pode acessar o aplicativo de cliente.')
        return
      }
      await logSecurityEvent('login_success', codigoEnvio, { via: 'signup_otp' })
      useStore.getState().login(data.user.id, codigoEnvio, nome || (data.user.user_metadata?.nome as string) || '', undefined, profile?.conta_demo === true)
      setCodigoEnvio(null); setErro('')
    }
  }
  async function reenviarCodigo() {
    if (!codigoEnvio) return
    const { error } = await supabase.auth.resend({ type: 'signup', email: codigoEnvio })
    setErro(error ? 'Não deu pra reenviar agora. Aguarde um minuto.' : 'Reenviamos o código pro seu e-mail. 📧')
  }

  return (
    <div className="pg-auth">
      <div className="pg-auth-intro"><span className="pg-eyebrow">MAIS PRAIA, MENOS PREOCUPAÇÃO</span><h1>{codigoEnvio ? 'Só falta confirmar.' : tab === 'entrar' ? <>Seu dia de praia<br/>começa aqui.</> : <>Um perfil.<br/>Muitas descobertas.</>}</h1><p>{tab === 'entrar' ? 'Entre para pedir, salvar seus favoritos e aproveitar cada momento.' : 'Crie sua conta para encontrar os sabores da praia e acompanhar seus pedidos.'}</p></div>
      <motion.div initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="pg-auth-card">
        <div className="pg-auth-appearance"><AppearanceSetting /></div>
        {codigoEnvio ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 42, marginBottom: 6 }}>📧</div>
              <h2 style={{ fontSize: 20, fontWeight: 900, color: 'var(--pg-ink)', margin: 0 }}>Confirme seu e-mail</h2>
              <p style={{ fontSize: 13.5, color: 'var(--pg-muted)', fontWeight: 600, marginTop: 6 }}>Enviamos um código de 6 dígitos pra <b style={{ color: 'var(--pg-ink)' }}>{codigoEnvio}</b></p>
            </div>
            <input aria-label="Código de confirmação" autoComplete="one-time-code" inputMode="numeric" autoFocus value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={e => e.key === 'Enter' && confirmarCadastro()} placeholder="000000" style={{ ...inputStyle, textAlign: 'center', fontSize: 30, fontWeight: 900, letterSpacing: 12, fontFamily: 'monospace' }} />
            {erro && <div role="alert" className={`pg-feedback ${erro.includes('inválido') || erro.includes('Não') ? 'pg-feedback-error' : ''}`}>{erro}</div>}
            <motion.button disabled={loading} whileTap={{ scale: 0.98 }} onClick={confirmarCadastro} className="pg-button pg-button-primary">{loading ? 'Confirmando…' : 'Confirmar código'}</motion.button>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              <button type="button" onClick={reenviarCodigo} style={{ background: 'none', border: 0, color: 'var(--pg-success)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Reenviar código</button>
              <button type="button" onClick={() => { setCodigoEnvio(null); setErro('') }} style={{ background: 'none', border: 0, color: 'var(--pg-muted)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>Trocar e-mail</button>
            </div>
          </div>
        ) : (<>
        <div className="pg-auth-tabs" aria-label="Acesso à conta">
          {(['entrar', 'cadastro'] as const).map(t => (
            <button type="button" key={t} disabled={loading} aria-pressed={tab === t} onClick={() => { setTab(t); setErro('') }} className="pg-auth-tab">
              {t === 'entrar' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        <form noValidate onSubmit={e => { e.preventDefault(); void entrar() }} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AnimatePresence mode="popLayout">
            {tab === 'cadastro' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <label htmlFor="cli-nome" style={{ fontSize: 13, fontWeight: 700, color: 'var(--pg-muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome Completo</label>
                <input id="cli-nome" autoComplete="name" maxLength={80} value={nome} onChange={e => setNome(e.target.value)} placeholder="Como gosta de ser chamado" style={inputStyle} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="popLayout">
            {tab === 'cadastro' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <label htmlFor="cli-cpf" style={{ fontSize: 13, fontWeight: 700, color: 'var(--pg-muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>CPF</label>
                <input id="cli-cpf" inputMode="numeric" value={cpf} onChange={e => setCpf(formatarCpf(e.target.value))} placeholder="000.000.000-00" style={inputStyle} />
                <div style={{ fontSize: 11.5, color: 'var(--pg-success)', fontWeight: 650, marginTop: 8 }}>CPF válido + e-mail confirmado libera 20% na primeira compra.</div>
              </motion.div>
            )}
          </AnimatePresence>

          <div>
            <label htmlFor="cli-email" style={{ fontSize: 13, fontWeight: 700, color: 'var(--pg-muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>E-mail</label>
            <input id="cli-email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@exemplo.com" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="cli-senha" style={{ fontSize: 13, fontWeight: 700, color: 'var(--pg-muted)', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Senha</label>
            <div style={{ position: 'relative' }}>
              <input id="cli-senha" autoComplete={tab === 'cadastro' ? 'new-password' : 'current-password'} type={verSenha ? 'text' : 'password'} value={senha} onChange={e => setSenha(e.target.value)} placeholder={tab === 'cadastro' ? 'Crie uma senha segura' : 'Sua senha'} style={{ ...inputStyle, padding: '14px 52px 14px 16px' }} />
              <button type="button" aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setVerSenha(!verSenha)} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--pg-muted)', width: 44, height: 44, display: 'grid', placeItems: 'center' }}>
                {verSenha ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {tab === 'cadastro' && <p className="pg-caption" style={{ marginTop: 7 }}>Pelo menos 10 caracteres, com letras e números.</p>}
          </div>

          {tab === 'cadastro' && (
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', background: 'var(--pg-surface-alt)', border: `1.5px solid ${aceitouTermos ? '#22c55e' : 'var(--pg-line)'}`, borderRadius: 14, padding: '12px 14px', transition: 'border-color .2s' }}>
              <input type="checkbox" checked={aceitouTermos} onChange={e => setAceitouTermos(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#22c55e', marginTop: 1, flexShrink: 0, cursor: 'pointer' }} />
              <span style={{ fontSize: 12.5, color: 'var(--pg-muted)', fontWeight: 600, lineHeight: 1.5 }}>
                Li e aceito os <a href="https://www.praiago.com.br/termos.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pg-ocean)', fontWeight: 800 }}>Termos de Uso</a> e a <a href="https://www.praiago.com.br/privacidade.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pg-ocean)', fontWeight: 800 }}>Política de Privacidade</a> — incluindo o uso da minha <strong>localização (GPS)</strong> durante os pedidos e o tratamento de nome, e-mail, CPF e dados de pagamento.
              </span>
            </label>
          )}

          <AnimatePresence>
            {erro && (
              <motion.div role="alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`pg-feedback ${/^(Enviamos|Reenviamos|Senha alterada)/.test(erro) ? '' : 'pg-feedback-error'}`}>
                {erro}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button type="submit" disabled={loading} whileTap={{ scale: 0.98 }} className="pg-button pg-button-primary">
            {loading ? <Loader2 size={19} className="animate-spin-slow"/> : tab === 'entrar' ? <LogIn size={19} /> : <User size={19} />}
            {loading ? 'Aguarde…' : (tab === 'entrar' ? 'Entrar na minha conta' : 'Criar minha conta')}
          </motion.button>
          {tab === 'entrar' && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: -2 }}>
              <button type="button" onClick={enviarResetSenha} style={{ background: 'none', border: 0, color: 'var(--pg-ocean)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Esqueci minha senha</button>
              <button type="button" onClick={confirmarCodigoSenha} style={{ background: 'none', border: 0, color: 'var(--pg-ocean)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Tenho código</button>
              <button type="button" disabled={loading} onClick={reenviarVerificacao} style={{ background: 'none', border: 0, color: 'var(--pg-success)', fontSize: 12, fontWeight: 750, minHeight: 36, cursor: 'pointer' }}>Reenviar verificação</button>
            </div>
          )}
        </form>
        </>)}
      </motion.div>
      <p className="pg-auth-note"><LockKeyhole size={15} style={{ flexShrink: 0 }}/>Seus dados protegidos. Seus favoritos sempre por perto.</p>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '14px 16px', borderRadius: 13,
  border: '1px solid var(--pg-line)', fontSize: 16,
  color: 'var(--pg-ink)', background: 'var(--pg-input)', boxSizing: 'border-box',
  transition: 'border-color 0.2s', fontWeight: 500,
}
