import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../store/useStore'

export default function EmailVerificationBanner() {
  const sessao = useStore(s => s.sessao)
  const [verificado, setVerificado] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  // Checa no banco se o e-mail está verificado
  useEffect(() => {
    if (!sessao?.email) {
      setVerificado(null)
      return
    }

    async function checkStatus() {
      const { data } = await supabase
        .from('profiles')
        .select('email_verificado')
        .eq('email', sessao!.email)
        .maybeSingle()
      
      if (data) {
        setVerificado(data.email_verificado)
      }
    }
    checkStatus()

    // Ouve mudanças em tempo real no perfil
    const ch = supabase.channel('profile_changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `email=eq.${sessao.email}` }, (payload) => {
        if (payload.new && payload.new.email_verificado !== undefined) {
          setVerificado(payload.new.email_verificado)
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [sessao?.email])

  async function forcarVerificacao() {
    if (!sessao?.email) return
    setLoading(true)
    
    // Mock: Na vida real isso seria feito clicando no link do e-mail.
    // Aqui estamos simulando que o usuário clicou no link e o banco foi atualizado.
    await supabase.from('profiles').update({ email_verificado: true }).eq('email', sessao.email)
    
    setVerificado(true)
    setLoading(false)
  }

  // Se não estiver logado, ou se já estiver verificado, não mostra nada
  if (!sessao || verificado === null || verificado === true) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        style={{
          background: 'linear-gradient(90deg, rgba(245, 158, 11, 0.2), rgba(217, 119, 6, 0.2))',
          borderBottom: '1px solid rgba(245, 158, 11, 0.4)',
          padding: '12px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 4px 20px rgba(245, 158, 11, 0.1)',
          backdropFilter: 'blur(10px)',
          zIndex: 50,
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%' }}>
          <AlertCircle color="#f59e0b" size={20} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fcd34d', marginBottom: 2 }}>Verifique seu e-mail</div>
            <div style={{ fontSize: 12, color: 'rgba(252, 211, 77, 0.8)', lineHeight: 1.4 }}>
              Enviamos um link de confirmação para <b>{sessao.email}</b>. Você precisa confirmar para fazer pedidos.
            </div>
          </div>
        </div>
        
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={forcarVerificacao}
          disabled={loading}
          style={{
            background: 'rgba(245, 158, 11, 0.2)',
            border: '1px solid rgba(245, 158, 11, 0.5)',
            color: '#fcd34d',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 700,
            cursor: loading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            justifyContent: 'center'
          }}
        >
          {loading ? 'Verificando...' : (
            <>
              <CheckCircle2 size={14} />
              Simular clique no e-mail (Dev)
            </>
          )}
        </motion.button>
      </motion.div>
    </AnimatePresence>
  )
}
