import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
// O Admin usa somente a chave anon publica. Segredos como service_role ficam
// exclusivamente em Edge Functions/servidor, nunca no bundle do painel.
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const recoveryUrl = typeof window === 'undefined'
  ? ''
  : `${window.location.hash || ''}${window.location.search || ''}`
export const VEIO_DE_RECOVERY =
  /(?:^|[?&#])type=recovery(?:&|$)/.test(recoveryUrl)
  && /(?:^|[?&#])(?:access_token|token_hash|code)=/.test(recoveryUrl)

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'praiago-admin-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
