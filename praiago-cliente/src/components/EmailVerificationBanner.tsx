import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'

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
    async function checkStatus() {
      const [{ data: authData }, { data: profile }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('profiles').select('email_verificado').eq('id', sessao!.id).maybeSingle(),
      ])
      if (!vivo) return
      setVerificado(Boolean(authData.user?.email_confirmed_at || profile?.email_verificado))
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
      texto: error ? error.message : `Mandamos a confirmacao para ${sessao.email}.`,
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
