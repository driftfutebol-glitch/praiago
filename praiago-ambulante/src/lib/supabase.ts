import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Precisa ser lido ANTES de criar o client: com detectSessionInUrl o supabase-js
// consome e LIMPA a URL, e o evento que ele dispara costuma ser SIGNED_IN (nao
// PASSWORD_RECOVERY). Sem guardar essa marca aqui, o app perdia o sinal de que
// o usuario chegou pelo link de "redefinir senha" e caia direto no login.
const recoveryUrl = typeof window === 'undefined'
  ? ''
  : `${window.location.hash || ''}${window.location.search || ''}`
export const VEIO_DE_RECOVERY =
  /(?:^|[?&#])type=recovery(?:&|$)/.test(recoveryUrl)
  && /(?:^|[?&#])(?:access_token|token_hash|code)=/.test(recoveryUrl)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'praiago-ambulante-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
