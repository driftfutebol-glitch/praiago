import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Precisa ser lido ANTES de criar o client: com detectSessionInUrl o supabase-js
// consome e LIMPA a URL, e o evento que ele dispara costuma ser SIGNED_IN (nao
// PASSWORD_RECOVERY). Sem guardar essa marca aqui, o app perdia o sinal de que
// o usuario chegou pelo link de "redefinir senha" e caia direto no login.
export const VEIO_DE_RECOVERY =
  typeof window !== 'undefined' &&
  /type=recovery/.test(`${window.location.hash || ''}${window.location.search || ''}`)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'praiago-cliente-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
