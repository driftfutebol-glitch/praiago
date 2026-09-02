import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'

// O Supabase devolve o motivo em ingles e em jargao: quem le "over_email_send
// _rate_limit" nao descobre que so precisa esperar. Sem isto o usuario aperta
// "reenviar" cinco vezes seguidas achando que nao funcionou — e cada toque
// gasta mais um do limite que ja estourou.
function motivoDoErro(mensagem: string): string {
  const m = mensagem.toLowerCase()
  const segundos = m.match(/after (\d+) seconds?/)
  if (segundos) return `Espere ${segundos[1]} segundos antes de pedir de novo.`
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Muitos e-mails pedidos agora. Espere alguns minutos e tente de novo.'
  }
  if (m.includes('already') && m.includes('confirm')) return 'Este e-mail ja esta confirmado.'
  if (m.includes('network') || m.includes('fetch')) return 'Sem conexao. Verifique a internet e tente de novo.'
  return mensagem
}

export default function EmailVerificationBanner() {
  const sessao = useStore(s => s.sessao)
  const [verificado, setVerificado] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessao?.id) {
      setVerificado(null)
      return
    }

    let vivo = true
    // Duas chamadas de rede. A versao anterior nao olhava os erros: qualquer
    // falha devolvia data nulo, o OR dava false, e o app acusava "confirme seu
    // e-mail" na cara de quem ja tinha confirmado. E isso rodava a cada 30s,
    // entao bastava um instante sem rede para a faixa amarela aparecer.
    //
    // Nao conseguir perguntar nao e a mesma coisa que a resposta ser nao: se as
    // duas falharem, o estado fica como esta e a proxima rodada tenta de novo.
    async function checkStatus() {
      const [auth, perfil] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('email_verificado').eq('id', sessao!.id).maybeSingle(),
      ])
      if (!vivo) return

      if (auth.data.user?.email_confirmed_at || perfil.data?.email_verificado) {
        setVerificado(true)
        return
      }
      // Chegou ate aqui sem confirmacao: so vale como "nao confirmado" se pelo
      // menos uma das duas respondeu de verdade.
      const auth_respondeu = !auth.error && auth.data.user !== null
      const perfil_respondeu = !perfil.error && perfil.data !== null
      if (auth_respondeu || perfil_respondeu) setVerificado(false)
    }
    checkStatus()
    const timer = window.setInterval(checkStatus, 30000)

    return () => {
      vivo = false
      window.clearInterval(timer)
    }
  }, [sessao?.id])

  async function reenviarVerificacao() {
    if (!sessao?.email) return
    setLoading(true)

    const { data: authData } = await supabase.auth.getUser()
    if (authData.user?.email_confirmed_at) {
      setVerificado(true)
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: sessao.email,
      options: { emailRedirectTo: `${window.location.origin}/perfil` },
    })

    useStore.getState().addNotif({
      titulo: error ? 'Nao foi possivel enviar' : 'E-mail enviado',
      texto: error
        ? motivoDoErro(error.message)
        : `Mandamos a confirmacao para ${sessao.email}. Pode levar alguns minutos — veja tambem o spam.`,
    })
    setLoading(false)
  }

  if (!sessao || verificado === null || verificado === true) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        style={{
          background: '#fffbeb',
          borderBottom: '1px solid #fde68a',
          padding: '12px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          zIndex: 50,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', maxWidth: 460 }}>
          <AlertCircle color="#d97706" size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#92400e', marginBottom: 2 }}>Confirme seu e-mail</div>
            <div style={{ fontSize: 12, color: '#a16207', lineHeight: 1.4, fontWeight: 650 }}>
              Enviamos um link para <b>{sessao.email}</b>. Voce precisa confirmar para fechar pedidos e usar cupons.
            </div>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={reenviarVerificacao}
          disabled={loading}
          style={{
            background: '#ffffff',
            border: '1px solid #fbbf24',
            color: '#92400e',
            padding: '9px 16px',
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 900,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            width: '100%',
            maxWidth: 460,
            justifyContent: 'center',
          }}
        >
          <Mail size={14} />
          {loading ? 'Enviando...' : 'Reenviar e-mail de confirmacao'}
        </motion.button>
      </motion.div>
    </AnimatePresence>
  )
}
