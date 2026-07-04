import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

const RECOVERY_KEY = 'praiago:password-recovery-handled'

export default function PasswordRecoveryHandler() {
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'PASSWORD_RECOVERY') return
      const tokenKey = session?.access_token ? `${RECOVERY_KEY}:${session.access_token.slice(0, 16)}` : RECOVERY_KEY
      if (sessionStorage.getItem(tokenKey)) return
      sessionStorage.setItem(tokenKey, 'true')

      const novaSenha = window.prompt('Digite a nova senha com pelo menos 6 caracteres:')
      if (!novaSenha || novaSenha.length < 6) {
        window.alert('A nova senha precisa ter ao menos 6 caracteres.')
        return
      }

      const { error } = await supabase.auth.updateUser({ password: novaSenha })
      window.alert(error ? `Nao foi possivel redefinir a senha: ${error.message}` : 'Senha redefinida com sucesso. Faca login novamente.')
      if (!error) await supabase.auth.signOut()
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return null
}
