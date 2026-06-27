import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
// ATENÇÃO: O Admin usa a ROLE secreta para acesso global. Nunca exponha isso na web pública!
const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE || ''

export const supabase = createClient(supabaseUrl, supabaseServiceKey)
