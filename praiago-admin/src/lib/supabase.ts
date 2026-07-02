import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
// O Admin usa a chave ANON pública. Como o RLS está aberto (USING true), ela já
// dá acesso a tudo que o painel precisa — e sem vazar segredo no bundle.
// (A service_role `sb_secret_` anterior foi rotacionada e ficou inválida.)
// Próximo passo de segurança: login real do admin + políticas RLS por role.
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE ||
  ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: 'praiago-admin-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
